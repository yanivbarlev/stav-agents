/**
 * Person Service
 *
 * Business logic layer for person operations.
 * Handles saving extracted persons, relationships, and matching.
 */

import { v4 as uuidv4 } from 'uuid';
import { PersonRepository, personRepository } from '../repositories/person.repository';
import { MatchingService, matchingService } from './matching.service';
import { MergeService, mergeService } from './merge.service';
import {
  PersonNode,
  Person,
  PersonCreateInput,
  PersonSearchParams,
  SourceExtraction,
  BulkSaveResult,
  ExtractedPersonInput,
} from '../models/person.model';
import { DEFAULT_MATCH_CONFIG } from '../models/match.model';

// ============================================================================
// PERSON SERVICE CLASS
// ============================================================================

export class PersonService {
  private repo: PersonRepository;
  private matcher: MatchingService;
  private merger: MergeService;

  constructor(
    repo: PersonRepository = personRepository,
    matcher: MatchingService = matchingService,
    merger: MergeService = mergeService
  ) {
    this.repo = repo;
    this.matcher = matcher;
    this.merger = merger;
  }

  // ==========================================================================
  // BULK SAVE OPERATIONS
  // ==========================================================================

  /**
   * Save multiple extracted persons to the database
   * Handles deduplication, matching, and auto-merging
   *
   * @param extractedPersons Array of ExtractedPerson objects from scraping
   * @param sourceName Source name (e.g., "FamilySearch")
   * @returns Summary of save operation
   */
  async saveBulkExtractedPersons(
    extractedPersons: ExtractedPersonInput[],
    sourceName: string
  ): Promise<BulkSaveResult> {
    const result: BulkSaveResult = {
      saved: 0,
      updated: 0,
      matched: 0,
      errors: 0,
      persons: [],
    };

    // Map to track created persons by their external ID
    const createdPersons = new Map<string, PersonNode>();

    console.log(`\n[PersonService] Saving ${extractedPersons.length} persons from ${sourceName}...`);

    // Phase 1: Create or update persons
    for (const extracted of extractedPersons) {
      try {
        const personNode = await this.saveExtractedPerson(extracted, sourceName);

        if (personNode) {
          createdPersons.set(extracted.fsId, personNode);

          // Check if this was a new person or update
          // For now, we count all as saved
          result.saved++;
          result.persons.push(personNode);
        }

      } catch (error) {
        console.error(`[PersonService] Error saving ${extracted.fullName}:`, error);
        result.errors++;
      }
    }

    console.log(`[PersonService] Phase 1 complete: ${result.saved} persons saved`);

    // Phase 2: Create relationships
    console.log(`[PersonService] Creating relationships...`);

    for (const extracted of extractedPersons) {
      try {
        const personNode = createdPersons.get(extracted.fsId);
        if (!personNode) continue;

        await this.createRelationshipsForPerson(
          personNode.personId,
          extracted,
          sourceName,
          createdPersons
        );

      } catch (error) {
        console.error(`[PersonService] Error creating relationships for ${extracted.fullName}:`, error);
      }
    }

    // Phase 3: Run matching and auto-merge
    console.log(`[PersonService] Running matching algorithm...`);

    for (const personNode of result.persons) {
      try {
        const mergeCount = await this.runMatchingForPerson(personNode);
        result.matched += mergeCount;
      } catch (error) {
        console.error(`[PersonService] Error matching ${personNode.primaryName}:`, error);
      }
    }

    console.log(`[PersonService] Complete: ${result.saved} saved, ${result.matched} merged, ${result.errors} errors`);

    return result;
  }

  /**
   * Save a single extracted person
   * Checks for duplicates BEFORE creating to prevent duplicate entries
   */
  async saveExtractedPerson(
    extracted: ExtractedPersonInput,
    sourceName: string
  ): Promise<PersonNode | null> {
    // Check if person already exists by external ID (same source record)
    const existing = await this.repo.findByExternalId(sourceName, extracted.fsId);

    if (existing) {
      console.log(`  [PersonService] Person already exists by fsId: ${extracted.fullName} (${extracted.fsId})`);

      // Update with any new information
      await this.updatePersonFromExtraction(existing.personId, extracted);

      // Add new source if not already linked
      await this.ensureSourceLinked(existing.personId, extracted, sourceName);

      return existing;
    }

    // NEW: Check for duplicate by name BEFORE creating
    // This prevents creating duplicates when different source records refer to the same person
    const duplicateMatch = await this.findDuplicateBeforeSave(extracted);

    if (duplicateMatch) {
      console.log(`  [PersonService] Found duplicate match: ${extracted.fullName} → ${duplicateMatch.primaryName} (${(duplicateMatch.confidence * 100).toFixed(1)}%)`);

      // Update the existing person with new information
      await this.updatePersonFromExtraction(duplicateMatch.personId, extracted);

      // Link this source to the existing person
      await this.linkPersonToSource(duplicateMatch.personId, extracted, sourceName);

      return duplicateMatch;
    }

    // Create new person (no duplicate found)
    console.log(`  [PersonService] Creating new person: ${extracted.fullName}`);

    const personInput: PersonCreateInput = {
      firstName: extracted.firstName,
      lastName: extracted.lastName,
      hebrewFirstName: extracted.hebrewFirstName,
      hebrewLastName: extracted.hebrewLastName,
      birthDate: extracted.birthDate,
      birthPlace: extracted.birthPlace,
      deathDate: extracted.deathDate,
      deathPlace: extracted.deathPlace,
      sex: extracted.sex,
    };

    const personNode = await this.repo.createPerson(personInput);

    // Link to source
    await this.linkPersonToSource(personNode.personId, extracted, sourceName);

    return personNode;
  }

  /**
   * Check for duplicate person BEFORE saving
   * Returns the existing person if a high-confidence match is found
   */
  private async findDuplicateBeforeSave(
    extracted: ExtractedPersonInput
  ): Promise<PersonNode | null> {
    // Search for existing persons with similar name
    const candidates = await this.repo.searchPersons({
      firstName: extracted.firstName,
      lastName: extracted.lastName,
      limit: 20,
    });

    if (candidates.length === 0) return null;

    // Check each candidate for match
    // Use a lower threshold (0.75) but require matching primary name for extra safety
    // This handles cases where birth dates are missing
    const PRESAVE_DEDUP_THRESHOLD = 0.75;
    const EXACT_NAME_THRESHOLD = 0.70; // Even lower for exact name matches

    // Create temp person once for all comparisons
    const tempPerson: PersonNode = {
      personId: 'temp',
      primaryName: extracted.fullName,
      firstNames: [extracted.firstName],
      lastNames: [extracted.lastName],
      hebrewFirstName: extracted.hebrewFirstName,
      hebrewLastName: extracted.hebrewLastName,
      birthDateText: extracted.birthDate,
      birthPlace: extracted.birthPlace,
      deathDateText: extracted.deathDate,
      deathPlace: extracted.deathPlace,
      sex: extracted.sex as 'Male' | 'Female' | 'Unknown' | undefined,
      merged: false,
      confidence: 0.7,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const inputName = extracted.fullName.toLowerCase().trim();

    // FIRST PASS: Check for exact name matches (highest priority)
    for (const candidate of candidates) {
      const candidateName = candidate.primaryName.toLowerCase().trim();
      const isExactNameMatch = inputName === candidateName;

      if (isExactNameMatch) {
        const matchResult = this.matcher.calculateMatchConfidence(tempPerson, candidate);

        if (matchResult.confidence >= EXACT_NAME_THRESHOLD) {
          (candidate as any).confidence = matchResult.confidence;
          return candidate;
        }
      }
    }

    // SECOND PASS: Check non-exact matches if no exact match found
    for (const candidate of candidates) {
      const candidateName = candidate.primaryName.toLowerCase().trim();
      const isExactNameMatch = inputName === candidateName;

      if (!isExactNameMatch) {
        const matchResult = this.matcher.calculateMatchConfidence(tempPerson, candidate);

        if (matchResult.confidence >= PRESAVE_DEDUP_THRESHOLD) {
          (candidate as any).confidence = matchResult.confidence;
          return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Update existing person with new extraction data
   */
  private async updatePersonFromExtraction(
    personId: string,
    extracted: ExtractedPersonInput
  ): Promise<void> {
    // Add name variants
    const firstNames = [extracted.firstName];
    const lastNames = [extracted.lastName];

    if (extracted.hebrewFirstName) firstNames.push(extracted.hebrewFirstName);
    if (extracted.hebrewLastName) lastNames.push(extracted.hebrewLastName);

    await this.repo.addNameVariants(personId, firstNames, lastNames);
  }

  /**
   * Link person to source
   */
  private async linkPersonToSource(
    personId: string,
    extracted: ExtractedPersonInput,
    sourceName: string
  ): Promise<void> {
    const source: SourceExtraction = {
      sourceId: uuidv4(),
      sourceName,
      sourceUrl: extracted.sourceUrl,
      externalId: extracted.fsId,
      collectionName: extracted.collectionName,
      recordType: this.inferRecordType(extracted),
      extractedAt: new Date(extracted.extractedAt),
      dataQuality: 'high',
      reliability: 0.9,
      isPrimary: true,
      rawData: extracted,
    };

    await this.repo.linkToSource(personId, source);
  }

  /**
   * Ensure source is linked (for updates)
   */
  private async ensureSourceLinked(
    personId: string,
    extracted: ExtractedPersonInput,
    sourceName: string
  ): Promise<void> {
    const existingSources = await this.repo.getPersonSources(personId);

    const alreadyLinked = existingSources.some(
      s => s.sourceName === sourceName && s.externalId === extracted.fsId
    );

    if (!alreadyLinked) {
      const source: SourceExtraction = {
        sourceId: uuidv4(),
        sourceName,
        sourceUrl: extracted.sourceUrl,
        externalId: extracted.fsId,
        collectionName: extracted.collectionName,
        recordType: this.inferRecordType(extracted),
        extractedAt: new Date(extracted.extractedAt),
        dataQuality: 'high',
        reliability: 0.9,
        isPrimary: false,
        rawData: extracted,
      };

      await this.repo.linkToSource(personId, source);
    }
  }

  /**
   * Infer record type from extracted data
   */
  private inferRecordType(extracted: ExtractedPersonInput): string {
    const collection = (extracted.collectionName || '').toLowerCase();

    if (collection.includes('birth')) return 'birth';
    if (collection.includes('death')) return 'death';
    if (collection.includes('marriage')) return 'marriage';
    if (collection.includes('census')) return 'census';
    if (collection.includes('immigration')) return 'immigration';
    if (collection.includes('military')) return 'military';

    return 'other';
  }

  // ==========================================================================
  // RELATIONSHIP CREATION
  // ==========================================================================

  /**
   * Create relationships for a person based on extracted data
   */
  private async createRelationshipsForPerson(
    personId: string,
    extracted: ExtractedPersonInput,
    sourceName: string,
    createdPersons: Map<string, PersonNode>
  ): Promise<void> {
    // Create parent relationships
    if (extracted.parents) {
      for (const parent of extracted.parents) {
        await this.createParentRelationship(personId, parent, sourceName, createdPersons);
      }
    }

    // Create child relationships
    if (extracted.children) {
      for (const child of extracted.children) {
        await this.createChildRelationship(personId, child, sourceName, createdPersons);
      }
    }

    // Create sibling relationships
    if (extracted.siblings) {
      for (const sibling of extracted.siblings) {
        await this.createSiblingRelationship(personId, sibling, sourceName, createdPersons);
      }
    }

    // Create spouse relationships
    if (extracted.spouses) {
      for (const spouse of extracted.spouses) {
        await this.createSpouseRelationship(personId, spouse, sourceName, createdPersons);
      }
    }
  }

  /**
   * Create or find parent and link
   */
  private async createParentRelationship(
    childId: string,
    parent: { name: string; fsId: string; relationship: 'Father' | 'Mother'; sex: string },
    sourceName: string,
    createdPersons: Map<string, PersonNode>
  ): Promise<void> {
    // Try to find parent in already created persons
    let parentNode = createdPersons.get(parent.fsId);

    // If not found, try to find by external ID
    if (!parentNode) {
      parentNode = await this.repo.findByExternalId(sourceName, parent.fsId) || undefined;
    }

    // If still not found, create a stub person for the parent
    if (!parentNode) {
      const nameParts = parent.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      parentNode = await this.repo.createPerson({
        firstName,
        lastName,
        sex: parent.sex,
      });

      // Create a minimal source link
      const source: SourceExtraction = {
        sourceId: uuidv4(),
        sourceName,
        sourceUrl: '',
        externalId: parent.fsId,
        collectionName: 'Referenced',
        recordType: 'reference',
        extractedAt: new Date(),
        dataQuality: 'low',
        reliability: 0.5,
        isPrimary: false,
        rawData: parent,
      };

      await this.repo.linkToSource(parentNode.personId, source);
      createdPersons.set(parent.fsId, parentNode);
    }

    // Create the relationship
    await this.repo.createParentChildRelationship(
      parentNode.personId,
      childId,
      0.9,
      [sourceName]
    );
  }

  /**
   * Create or find child and link
   */
  private async createChildRelationship(
    parentId: string,
    child: { name: string; fsId: string; sex?: string; birthDate?: string },
    sourceName: string,
    createdPersons: Map<string, PersonNode>
  ): Promise<void> {
    let childNode = createdPersons.get(child.fsId);

    if (!childNode) {
      childNode = await this.repo.findByExternalId(sourceName, child.fsId) || undefined;
    }

    if (!childNode) {
      const nameParts = child.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      childNode = await this.repo.createPerson({
        firstName,
        lastName,
        sex: child.sex,
        birthDate: child.birthDate,
      });

      const source: SourceExtraction = {
        sourceId: uuidv4(),
        sourceName,
        sourceUrl: '',
        externalId: child.fsId,
        collectionName: 'Referenced',
        recordType: 'reference',
        extractedAt: new Date(),
        dataQuality: 'low',
        reliability: 0.5,
        isPrimary: false,
        rawData: child,
      };

      await this.repo.linkToSource(childNode.personId, source);
      createdPersons.set(child.fsId, childNode);
    }

    await this.repo.createParentChildRelationship(
      parentId,
      childNode.personId,
      0.9,
      [sourceName]
    );
  }

  /**
   * Create or find sibling and link
   */
  private async createSiblingRelationship(
    personId: string,
    sibling: { name: string; fsId: string; sex?: string; relationship: string },
    sourceName: string,
    createdPersons: Map<string, PersonNode>
  ): Promise<void> {
    let siblingNode = createdPersons.get(sibling.fsId);

    if (!siblingNode) {
      siblingNode = await this.repo.findByExternalId(sourceName, sibling.fsId) || undefined;
    }

    if (!siblingNode) {
      const nameParts = sibling.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      siblingNode = await this.repo.createPerson({
        firstName,
        lastName,
        sex: sibling.sex,
      });

      const source: SourceExtraction = {
        sourceId: uuidv4(),
        sourceName,
        sourceUrl: '',
        externalId: sibling.fsId,
        collectionName: 'Referenced',
        recordType: 'reference',
        extractedAt: new Date(),
        dataQuality: 'low',
        reliability: 0.5,
        isPrimary: false,
        rawData: sibling,
      };

      await this.repo.linkToSource(siblingNode.personId, source);
      createdPersons.set(sibling.fsId, siblingNode);
    }

    await this.repo.createSiblingRelationship(
      personId,
      siblingNode.personId,
      0.9,
      [sourceName]
    );
  }

  /**
   * Create or find spouse and link
   */
  private async createSpouseRelationship(
    personId: string,
    spouse: { name: string; fsId: string; marriageDate?: string; marriagePlace?: string },
    sourceName: string,
    createdPersons: Map<string, PersonNode>
  ): Promise<void> {
    let spouseNode = createdPersons.get(spouse.fsId);

    if (!spouseNode) {
      spouseNode = await this.repo.findByExternalId(sourceName, spouse.fsId) || undefined;
    }

    if (!spouseNode) {
      const nameParts = spouse.name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      spouseNode = await this.repo.createPerson({
        firstName,
        lastName,
      });

      const source: SourceExtraction = {
        sourceId: uuidv4(),
        sourceName,
        sourceUrl: '',
        externalId: spouse.fsId,
        collectionName: 'Referenced',
        recordType: 'reference',
        extractedAt: new Date(),
        dataQuality: 'low',
        reliability: 0.5,
        isPrimary: false,
        rawData: spouse,
      };

      await this.repo.linkToSource(spouseNode.personId, source);
      createdPersons.set(spouse.fsId, spouseNode);
    }

    await this.repo.createSpouseRelationship(
      personId,
      spouseNode.personId,
      spouse.marriageDate,
      0.9,
      [sourceName]
    );
  }

  // ==========================================================================
  // MATCHING INTEGRATION
  // ==========================================================================

  /**
   * Run matching for a person and auto-merge high confidence matches
   *
   * @returns Number of auto-merges performed
   */
  private async runMatchingForPerson(person: PersonNode): Promise<number> {
    let mergeCount = 0;

    try {
      // Find matches
      const matches = await this.matcher.findMatches({
        person,
        useAllData: true,
        minConfidence: DEFAULT_MATCH_CONFIG.suggestThreshold,
      });

      if (matches.length === 0) return 0;

      // Auto-merge high confidence matches
      const autoMergeThreshold = DEFAULT_MATCH_CONFIG.autoMergeThreshold;

      for (const match of matches) {
        // Skip if this is the same person
        if (match.candidateId === person.personId) continue;

        if (match.confidence >= autoMergeThreshold) {
          console.log(`  [PersonService] Auto-merging: ${person.primaryName} ↔ ${match.candidate.primaryName} (${(match.confidence * 100).toFixed(1)}%)`);

          try {
            await this.merger.mergePersons(match.candidateId, person.personId);
            mergeCount++;
          } catch (error) {
            console.error(`  [PersonService] Merge failed:`, error);
          }
        } else if (match.confidence >= DEFAULT_MATCH_CONFIG.suggestThreshold) {
          // Create possible match for review
          console.log(`  [PersonService] Suggested match: ${person.primaryName} ↔ ${match.candidate.primaryName} (${(match.confidence * 100).toFixed(1)}%)`);

          await this.repo.createPossibleMatch(
            person.personId,
            match.candidateId,
            match.confidence,
            match.matchedOn.map(f => f.field)
          );
        }
      }

    } catch (error) {
      console.error(`[PersonService] Error matching ${person.primaryName}:`, error);
    }

    return mergeCount;
  }

  // ==========================================================================
  // QUERY OPERATIONS
  // ==========================================================================

  /**
   * Get a person by ID with all relationships
   */
  async getPersonById(personId: string): Promise<Person | null> {
    return this.repo.getPersonWithRelationships(personId);
  }

  /**
   * Search for persons
   */
  async searchPersons(params: PersonSearchParams): Promise<PersonNode[]> {
    return this.repo.searchPersons(params);
  }

  /**
   * Get immediate family of a person
   */
  async getFamily(personId: string): Promise<{
    person: PersonNode;
    parents: PersonNode[];
    children: PersonNode[];
    siblings: PersonNode[];
    spouses: PersonNode[];
  } | null> {
    const person = await this.repo.findById(personId);
    if (!person) return null;

    const [parents, children, siblings, spouses] = await Promise.all([
      this.repo.getParents(personId),
      this.repo.getChildren(personId),
      this.repo.getSiblings(personId),
      this.repo.getSpouses(personId),
    ]);

    return {
      person,
      parents: parents.map(r => r.person),
      children: children.map(r => r.person),
      siblings: siblings.map(r => r.person),
      spouses: spouses.map(r => r.person),
    };
  }
}

// Export singleton instance
export const personService = new PersonService();
