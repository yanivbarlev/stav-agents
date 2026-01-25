/**
 * Matching Service
 *
 * Multi-level person matching algorithm for deduplication.
 * Uses name similarity, dates, and family relationships.
 */

import { neo4jConnection } from '../neo4j-connection';
import { PersonRepository, personRepository } from '../repositories/person.repository';
import { PersonNode } from '../models/person.model';
import { nodeToPersonNode, withSession } from '../utils/neo4j-utils';
import {
  PersonMatch,
  MatchedField,
  ConflictingField,
  MatchCriteria,
  MatchLevel,
  MatchConfig,
  DEFAULT_MATCH_CONFIG,
  ConfidenceFactors,
  calculateOverallConfidence,
} from '../models/match.model';
import {
  calculateNameSimilarity,
  calculateFullNameSimilarity,
  levenshteinSimilarity,
} from '../utils/name-utils';
import {
  calculateDateSimilarity,
  extractYearFromDate,
} from '../utils/date-utils';

// ============================================================================
// MATCHING SERVICE CLASS
// ============================================================================

export class MatchingService {
  private repo: PersonRepository;
  private config: MatchConfig;

  constructor(
    repo: PersonRepository = personRepository,
    config: MatchConfig = DEFAULT_MATCH_CONFIG
  ) {
    this.repo = repo;
    this.config = config;
  }

  // ==========================================================================
  // MAIN MATCHING METHOD
  // ==========================================================================

  /**
   * Find potential matches for a person
   *
   * Uses multi-level matching:
   * 1. Exact name + birth year (±2)
   * 2. Exact name + death year (±2) - finds records with same death date
   * 3. Parent names + birth location
   * 4. Sibling/children context
   * 5. Fuzzy comprehensive matching
   */
  async findMatches(criteria: MatchCriteria): Promise<PersonMatch[]> {
    const { person, useAllData, minConfidence = 0.5, maxResults = 10 } = criteria;
    const excludeIds = new Set(criteria.excludePersonIds || []);
    excludeIds.add(person.personId); // Always exclude self

    const allMatches: PersonMatch[] = [];

    // Level 1: Exact name + birth year
    const level1Matches = await this.matchByNameAndBirth(person, excludeIds);
    allMatches.push(...level1Matches);

    // Level 2: Exact name + death year (critical for records with same death date)
    const level2Matches = await this.matchByNameAndDeath(person, excludeIds);
    allMatches.push(...level2Matches);

    // Level 3 & 4: Parent-based and family context (if useAllData)
    if (useAllData) {
      const level3Matches = await this.matchByParents(person, excludeIds);
      allMatches.push(...level3Matches);

      const level4Matches = await this.matchByFamilyContext(person, excludeIds);
      allMatches.push(...level4Matches);
    }

    // Deduplicate and merge scores
    const mergedMatches = this.mergeMatches(allMatches);

    // Filter by minimum confidence
    const filteredMatches = mergedMatches.filter(m => m.confidence >= minConfidence);

    // Sort by confidence and limit
    filteredMatches.sort((a, b) => b.confidence - a.confidence);

    return filteredMatches.slice(0, maxResults);
  }

  // ==========================================================================
  // LEVEL 1: NAME + BIRTH YEAR MATCHING
  // ==========================================================================

  /**
   * Find matches by name and birth year
   * Confidence: 0.8-1.0
   */
  private async matchByNameAndBirth(
    person: PersonNode,
    excludeIds: Set<string>
  ): Promise<PersonMatch[]> {
    const matches: PersonMatch[] = [];

    // Extract first/last names
    const firstName = person.firstNames[0] || '';
    const lastName = person.lastNames[0] || '';

    if (!firstName && !lastName) return matches;

    // Get birth year
    const birthYear = extractYearFromDate(person.birthDateText);

    // Query for potential matches
    let candidates: PersonNode[];

    if (birthYear) {
      candidates = await this.repo.findByNameAndBirthYear(
        firstName,
        lastName,
        birthYear,
        this.config.birthYearTolerance
      );
    } else {
      // No birth year - just match by name
      candidates = await this.repo.searchPersons({
        firstName,
        lastName,
        limit: 50,
      });
    }

    for (const candidate of candidates) {
      if (excludeIds.has(candidate.personId)) continue;

      const match = this.calculateMatch(person, candidate, MatchLevel.EXACT_NAME_BIRTH);
      if (match.confidence >= this.config.rejectThreshold) {
        matches.push(match);
      }
    }

    return matches;
  }

  // ==========================================================================
  // LEVEL 2: NAME + DEATH YEAR MATCHING
  // ==========================================================================

  /**
   * Find matches by name and death year
   * Critical for records that have same death date but different/missing birth dates
   * Confidence: 0.8-1.0
   */
  private async matchByNameAndDeath(
    person: PersonNode,
    excludeIds: Set<string>
  ): Promise<PersonMatch[]> {
    const matches: PersonMatch[] = [];

    // Extract first/last names
    const firstName = person.firstNames[0] || '';
    const lastName = person.lastNames[0] || '';

    if (!firstName && !lastName) return matches;

    // Get death year
    const deathYear = extractYearFromDate(person.deathDateText);

    // Only run this matching if we have a death year
    if (!deathYear) return matches;

    // Query for potential matches by death year
    const candidates = await this.repo.findByNameAndDeathYear(
      firstName,
      lastName,
      deathYear,
      this.config.deathYearTolerance
    );

    for (const candidate of candidates) {
      if (excludeIds.has(candidate.personId)) continue;

      const match = this.calculateMatch(person, candidate, MatchLevel.EXACT_NAME_DEATH);
      if (match.confidence >= this.config.rejectThreshold) {
        matches.push(match);
      }
    }

    return matches;
  }

  // ==========================================================================
  // LEVEL 3: PARENT-BASED MATCHING
  // ==========================================================================

  /**
   * Find matches by parent names and birth location
   * Confidence: 0.75-0.95
   */
  private async matchByParents(
    person: PersonNode,
    excludeIds: Set<string>
  ): Promise<PersonMatch[]> {
    const parents = await this.repo.getParents(person.personId);
    if (parents.length === 0) return [];

    const parentNames = parents.map(p => p.person.primaryName.toLowerCase());

    return withSession(async (session) => {
      const query = `
        MATCH (p:Person)-[:CHILD_OF]->(parent:Person)
        WHERE (p.merged IS NULL OR p.merged = false)
          AND p.personId <> $personId
          AND toLower(parent.primaryName) IN $parentNames
        RETURN DISTINCT p
        LIMIT 50
      `;

      const result = await session.run(query, {
        personId: person.personId,
        parentNames,
      });

      const matches: PersonMatch[] = [];

      for (const record of result.records) {
        const candidate = nodeToPersonNode(record.get('p'));

        if (excludeIds.has(candidate.personId)) continue;

        const match = await this.calculateMatchWithParents(
          person,
          candidate,
          parents.map(p => p.person)
        );

        if (match.confidence >= this.config.rejectThreshold) {
          matches.push(match);
        }
      }

      return matches;
    });
  }

  // ==========================================================================
  // LEVEL 3: FAMILY CONTEXT MATCHING
  // ==========================================================================

  /**
   * Find matches by sibling and children overlap
   * Confidence: 0.6-0.85
   */
  private async matchByFamilyContext(
    person: PersonNode,
    excludeIds: Set<string>
  ): Promise<PersonMatch[]> {
    const siblings = await this.repo.getSiblings(person.personId);
    if (siblings.length === 0) return [];

    const siblingIds = siblings.map(s => s.person.personId);

    return withSession(async (session) => {
      const query = `
        MATCH (p:Person)-[:SIBLING_OF]-(sibling:Person)
        WHERE (p.merged IS NULL OR p.merged = false)
          AND p.personId <> $personId
          AND sibling.personId IN $siblingIds
        RETURN DISTINCT p, count(sibling) as sharedSiblings
        ORDER BY sharedSiblings DESC
        LIMIT 20
      `;

      const result = await session.run(query, {
        personId: person.personId,
        siblingIds,
      });

      const matches: PersonMatch[] = [];

      for (const record of result.records) {
        const candidate = nodeToPersonNode(record.get('p'));
        const sharedSiblings = record.get('sharedSiblings').toNumber();

        if (excludeIds.has(candidate.personId)) continue;

        const match = this.calculateMatch(person, candidate, MatchLevel.FAMILY_CONTEXT);

        const siblingBoost = Math.min(0.2, sharedSiblings * 0.05);
        match.confidence = Math.min(1, match.confidence + siblingBoost);

        if (match.confidence >= this.config.rejectThreshold) {
          matches.push(match);
        }
      }

      return matches;
    });
  }

  // ==========================================================================
  // MATCH CALCULATION
  // ==========================================================================

  /**
   * Calculate match between two persons
   */
  private calculateMatch(
    person1: PersonNode,
    person2: PersonNode,
    level: MatchLevel
  ): PersonMatch {
    const matchedFields: MatchedField[] = [];
    const conflictingFields: ConflictingField[] = [];

    // Calculate name similarity
    const nameSimilarity = calculateFullNameSimilarity(
      person1.primaryName,
      person2.primaryName
    );

    matchedFields.push({
      field: 'name',
      similarity: nameSimilarity,
      value1: person1.primaryName,
      value2: person2.primaryName,
    });

    // Calculate birth date similarity
    const birthSimilarity = calculateDateSimilarity(
      person1.birthDateText,
      person2.birthDateText,
      this.config.birthYearTolerance
    );

    if (person1.birthDateText || person2.birthDateText) {
      matchedFields.push({
        field: 'birthDate',
        similarity: birthSimilarity,
        value1: person1.birthDateText,
        value2: person2.birthDateText,
      });
    }

    // Calculate birth place similarity
    // If both empty = no conflict (1.0), if one empty = neutral (0.5)
    let birthPlaceSimilarity = (!person1.birthPlace && !person2.birthPlace) ? 1.0 : 0.5;
    if (person1.birthPlace && person2.birthPlace) {
      birthPlaceSimilarity = levenshteinSimilarity(
        person1.birthPlace.toLowerCase(),
        person2.birthPlace.toLowerCase()
      );

      matchedFields.push({
        field: 'birthPlace',
        similarity: birthPlaceSimilarity,
        value1: person1.birthPlace,
        value2: person2.birthPlace,
      });
    }

    // Calculate death date similarity (POSITIVE matching factor)
    // Note: calculateDateSimilarity returns 1.0 when both are empty (no conflict)
    const deathSimilarity = calculateDateSimilarity(
      person1.deathDateText,
      person2.deathDateText,
      this.config.deathYearTolerance
    );

    // Only add to matchedFields if at least one has a death date
    if (person1.deathDateText || person2.deathDateText) {
      matchedFields.push({
        field: 'deathDate',
        similarity: deathSimilarity,
        value1: person1.deathDateText,
        value2: person2.deathDateText,
      });
    }

    // Calculate death place similarity
    // If both empty = no conflict (1.0), if one empty = neutral (0.5)
    let deathPlaceSimilarity = (!person1.deathPlace && !person2.deathPlace) ? 1.0 : 0.5;
    if (person1.deathPlace && person2.deathPlace) {
      deathPlaceSimilarity = levenshteinSimilarity(
        person1.deathPlace.toLowerCase(),
        person2.deathPlace.toLowerCase()
      );

      matchedFields.push({
        field: 'deathPlace',
        similarity: deathPlaceSimilarity,
        value1: person1.deathPlace,
        value2: person2.deathPlace,
      });
    }

    // Check for conflicts
    // Sex conflict
    if (person1.sex && person2.sex && person1.sex !== person2.sex) {
      conflictingFields.push({
        field: 'sex',
        value1: person1.sex,
        value2: person2.sex,
        reconcilable: false,
      });
    }

    // Death date conflict (only if dates are very different)
    if (person1.deathDateText && person2.deathDateText && deathSimilarity < 0.3) {
      conflictingFields.push({
        field: 'deathDate',
        value1: person1.deathDateText,
        value2: person2.deathDateText,
        reconcilable: true,
      });
    }

    // Calculate confidence factors
    const factors: ConfidenceFactors = {
      nameMatch: nameSimilarity,
      birthDateMatch: birthSimilarity,
      birthPlaceMatch: birthPlaceSimilarity,
      deathDateMatch: deathSimilarity,       // NEW: death date as positive factor
      deathPlaceMatch: deathPlaceSimilarity, // NEW: death place as positive factor
      parentMatch: 0.5, // Will be updated in parent-based matching
      siblingMatch: 0.5,
      spouseMatch: 0.5,
      sourceReliability: 0.8,
      dataCompleteness: this.calculateDataCompleteness(person1, person2),
      conflictPenalty: conflictingFields.filter(c => !c.reconcilable).length * 0.3,
    };

    const confidence = calculateOverallConfidence(factors, this.config);

    return {
      candidateId: person2.personId,
      candidate: person2,
      confidence,
      matchedOn: matchedFields,
      conflictingFields,
      matchAlgorithm: `Level${level}`,
      matchReason: this.getMatchReason(level, matchedFields),
    };
  }

  /**
   * Public method to calculate match confidence between two persons
   * Used by PersonService for pre-save duplicate detection
   */
  public calculateMatchConfidence(
    person1: PersonNode,
    person2: PersonNode
  ): PersonMatch {
    return this.calculateMatch(person1, person2, MatchLevel.EXACT_NAME_BIRTH);
  }

  /**
   * Calculate match with parent comparison
   */
  private async calculateMatchWithParents(
    person1: PersonNode,
    person2: PersonNode,
    person1Parents: PersonNode[]
  ): Promise<PersonMatch> {
    // Start with basic match
    const match = this.calculateMatch(person1, person2, MatchLevel.PARENT_BASED);

    // Get person2's parents
    const person2Parents = await this.repo.getParents(person2.personId);
    const person2ParentNodes = person2Parents.map(p => p.person);

    // Calculate parent similarity
    let parentSimilarity = 0;

    for (const p1Parent of person1Parents) {
      for (const p2Parent of person2ParentNodes) {
        const similarity = calculateFullNameSimilarity(
          p1Parent.primaryName,
          p2Parent.primaryName
        );

        if (similarity > parentSimilarity) {
          parentSimilarity = similarity;
        }
      }
    }

    if (parentSimilarity > 0.7) {
      match.matchedOn.push({
        field: 'parents',
        similarity: parentSimilarity,
        value1: person1Parents.map(p => p.primaryName),
        value2: person2ParentNodes.map(p => p.primaryName),
      });

      // Boost confidence for matching parents
      match.confidence = Math.min(1, match.confidence + parentSimilarity * 0.2);
    }

    return match;
  }

  /**
   * Calculate data completeness score
   */
  private calculateDataCompleteness(person1: PersonNode, person2: PersonNode): number {
    const fields = [
      'primaryName',
      'birthDateText',
      'birthPlace',
      'deathDateText',
      'deathPlace',
      'sex',
    ];

    let complete1 = 0;
    let complete2 = 0;

    for (const field of fields) {
      if ((person1 as any)[field]) complete1++;
      if ((person2 as any)[field]) complete2++;
    }

    return ((complete1 + complete2) / (fields.length * 2));
  }

  /**
   * Get human-readable match reason
   */
  private getMatchReason(level: MatchLevel, matchedFields: MatchedField[]): string {
    const strongMatches = matchedFields
      .filter(f => f.similarity > 0.8)
      .map(f => f.field);

    switch (level) {
      case MatchLevel.EXACT_NAME_BIRTH:
        return `Matching name and birth year (${strongMatches.join(', ')})`;
      case MatchLevel.EXACT_NAME_DEATH:
        return `Matching name and death year (${strongMatches.join(', ')})`;
      case MatchLevel.PARENT_BASED:
        return `Matching parents and birth info (${strongMatches.join(', ')})`;
      case MatchLevel.FAMILY_CONTEXT:
        return `Shared family members (${strongMatches.join(', ')})`;
      case MatchLevel.FUZZY_COMPREHENSIVE:
        return `Fuzzy matching across all fields (${strongMatches.join(', ')})`;
      default:
        return `Match on ${strongMatches.join(', ')}`;
    }
  }

  // ==========================================================================
  // MERGE HELPER
  // ==========================================================================

  /**
   * Merge duplicate matches for same candidate
   */
  private mergeMatches(matches: PersonMatch[]): PersonMatch[] {
    const merged = new Map<string, PersonMatch>();

    for (const match of matches) {
      const existing = merged.get(match.candidateId);

      if (!existing) {
        merged.set(match.candidateId, match);
      } else {
        // Keep the higher confidence match but combine matched fields
        if (match.confidence > existing.confidence) {
          merged.set(match.candidateId, {
            ...match,
            matchedOn: this.mergeMatchedFields(existing.matchedOn, match.matchedOn),
          });
        } else {
          existing.matchedOn = this.mergeMatchedFields(existing.matchedOn, match.matchedOn);
        }
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Merge matched fields from multiple matches
   */
  private mergeMatchedFields(
    fields1: MatchedField[],
    fields2: MatchedField[]
  ): MatchedField[] {
    const merged = new Map<string, MatchedField>();

    for (const field of [...fields1, ...fields2]) {
      const existing = merged.get(field.field);

      if (!existing || field.similarity > existing.similarity) {
        merged.set(field.field, field);
      }
    }

    return Array.from(merged.values());
  }

}

// Export singleton instance
export const matchingService = new MatchingService();
