/**
 * Person Repository
 *
 * Data access layer for Person nodes in Neo4j.
 * Handles CRUD operations and relationship management.
 */

import { v4 as uuidv4 } from 'uuid';
import neo4j from 'neo4j-driver';
import { neo4jConnection } from '../neo4j-connection';
import { nodeToPersonNode, withSession } from '../utils/neo4j-utils';
import {
  PersonNode,
  Person,
  PersonCreateInput,
  PersonUpdateInput,
  PersonSearchParams,
  SourceExtraction,
  PersonRelation,
  SpouseRelation,
} from '../models/person.model';

// ============================================================================
// PERSON REPOSITORY CLASS
// ============================================================================

export class PersonRepository {

  // ==========================================================================
  // CREATE OPERATIONS
  // ==========================================================================

  /**
   * Create a new person node
   */
  async createPerson(input: PersonCreateInput): Promise<PersonNode> {
    return withSession(async (session) => {
      const personId = uuidv4();
      const now = new Date().toISOString();
      const primaryName = `${input.firstName} ${input.lastName}`.trim();

      const query = `
        CREATE (p:Person {
          personId: $personId,
          primaryName: $primaryName,
          firstNames: $firstNames,
          lastNames: $lastNames,
          hebrewFirstName: $hebrewFirstName,
          hebrewLastName: $hebrewLastName,
          birthDateText: $birthDateText,
          birthPlace: $birthPlace,
          deathDateText: $deathDateText,
          deathPlace: $deathPlace,
          sex: $sex,
          createdAt: datetime($createdAt),
          updatedAt: datetime($updatedAt),
          confidence: $confidence,
          notes: $notes,
          merged: false
        })
        RETURN p
      `;

      const result = await session.run(query, {
        personId,
        primaryName,
        firstNames: [input.firstName].filter(Boolean),
        lastNames: [input.lastName].filter(Boolean),
        hebrewFirstName: input.hebrewFirstName || null,
        hebrewLastName: input.hebrewLastName || null,
        birthDateText: input.birthDate || null,
        birthPlace: input.birthPlace || null,
        deathDateText: input.deathDate || null,
        deathPlace: input.deathPlace || null,
        sex: this.normalizeSex(input.sex),
        createdAt: now,
        updatedAt: now,
        confidence: 0.7,
        notes: input.notes || null,
      });

      return nodeToPersonNode(result.records[0].get('p'));
    });
  }

  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * Find person by internal ID
   */
  async findById(personId: string): Promise<PersonNode | null> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})
        WHERE p.merged IS NULL OR p.merged = false
        RETURN p
      `;

      const result = await session.run(query, { personId });

      if (result.records.length === 0) {
        return null;
      }

      return nodeToPersonNode(result.records[0].get('p'));
    });
  }

  /**
   * Find person by external source ID (e.g., FamilySearch ID)
   */
  async findByExternalId(sourceName: string, externalId: string): Promise<PersonNode | null> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person)-[:EXTRACTED_FROM]->(s:Source {sourceName: $sourceName, externalId: $externalId})
        WHERE p.merged IS NULL OR p.merged = false
        RETURN p
        LIMIT 1
      `;

      const result = await session.run(query, { sourceName, externalId });

      if (result.records.length === 0) {
        return null;
      }

      return nodeToPersonNode(result.records[0].get('p'));
    });
  }

  /**
   * Get person with all relationships (full Person object)
   */
  async getPersonWithRelationships(personId: string): Promise<Person | null> {
    const personNode = await this.findById(personId);
    if (!personNode) return null;

    const [sources, parents, children, siblings, spouses] = await Promise.all([
      this.getPersonSources(personId),
      this.getParents(personId),
      this.getChildren(personId),
      this.getSiblings(personId),
      this.getSpouses(personId),
    ]);

    return {
      ...personNode,
      sources,
      parents,
      children,
      siblings,
      spouses,
    };
  }

  /**
   * Search for persons by various criteria
   */
  async searchPersons(params: PersonSearchParams): Promise<PersonNode[]> {
    return withSession(async (session) => {
      const conditions: string[] = ['(p.merged IS NULL OR p.merged = false)'];
      const queryParams: any = {};

      if (params.name) {
        conditions.push('(p.primaryName CONTAINS $name OR ANY(fn IN p.firstNames WHERE fn CONTAINS $name) OR ANY(ln IN p.lastNames WHERE ln CONTAINS $name))');
        queryParams.name = params.name;
      }

      if (params.firstName) {
        conditions.push('ANY(fn IN p.firstNames WHERE toLower(fn) CONTAINS toLower($firstName))');
        queryParams.firstName = params.firstName;
      }

      if (params.lastName) {
        conditions.push('ANY(ln IN p.lastNames WHERE toLower(ln) CONTAINS toLower($lastName))');
        queryParams.lastName = params.lastName;
      }

      if (params.hebrewFirstName) {
        conditions.push('p.hebrewFirstName = $hebrewFirstName');
        queryParams.hebrewFirstName = params.hebrewFirstName;
      }

      if (params.hebrewLastName) {
        conditions.push('p.hebrewLastName = $hebrewLastName');
        queryParams.hebrewLastName = params.hebrewLastName;
      }

      if (params.birthYear) {
        conditions.push('p.birthDateText CONTAINS toString($birthYear)');
        queryParams.birthYear = params.birthYear;
      }

      if (params.birthPlace) {
        conditions.push('toLower(p.birthPlace) CONTAINS toLower($birthPlace)');
        queryParams.birthPlace = params.birthPlace;
      }

      queryParams.limit = neo4j.int(params.limit || 50);
      queryParams.offset = neo4j.int(params.offset || 0);

      const query = `
        MATCH (p:Person)
        WHERE ${conditions.join(' AND ')}
        RETURN p
        ORDER BY p.primaryName
        SKIP $offset
        LIMIT $limit
      `;

      const result = await session.run(query, queryParams);
      return result.records.map(record => nodeToPersonNode(record.get('p')));
    });
  }

  /**
   * Find persons by name and birth year (for matching)
   */
  async findByNameAndBirthYear(
    firstName: string,
    lastName: string,
    birthYear: number,
    yearTolerance: number = 2
  ): Promise<PersonNode[]> {
    return withSession(async (session) => {
      const yearStrings = this.buildYearRange(birthYear, yearTolerance);

      const query = `
        MATCH (p:Person)
        WHERE (p.merged IS NULL OR p.merged = false)
          AND (
            ANY(fn IN p.firstNames WHERE toLower(fn) = toLower($firstName))
            OR toLower(p.hebrewFirstName) = toLower($firstName)
          )
          AND (
            ANY(ln IN p.lastNames WHERE toLower(ln) = toLower($lastName))
            OR toLower(p.hebrewLastName) = toLower($lastName)
          )
          AND ANY(yearStr IN $yearStrings WHERE p.birthDateText CONTAINS yearStr)
        RETURN p
        LIMIT 50
      `;

      const result = await session.run(query, { firstName, lastName, yearStrings });
      return result.records.map(record => nodeToPersonNode(record.get('p')));
    });
  }

  /**
   * Find persons by name and death year (for matching records with same death date)
   */
  async findByNameAndDeathYear(
    firstName: string,
    lastName: string,
    deathYear: number,
    yearTolerance: number = 2
  ): Promise<PersonNode[]> {
    return withSession(async (session) => {
      const yearStrings = this.buildYearRange(deathYear, yearTolerance);

      const query = `
        MATCH (p:Person)
        WHERE (p.merged IS NULL OR p.merged = false)
          AND (
            ANY(fn IN p.firstNames WHERE toLower(fn) = toLower($firstName))
            OR toLower(p.hebrewFirstName) = toLower($firstName)
          )
          AND (
            ANY(ln IN p.lastNames WHERE toLower(ln) = toLower($lastName))
            OR toLower(p.hebrewLastName) = toLower($lastName)
          )
          AND ANY(yearStr IN $yearStrings WHERE p.deathDateText CONTAINS yearStr)
        RETURN p
        LIMIT 50
      `;

      const result = await session.run(query, { firstName, lastName, yearStrings });
      return result.records.map(record => nodeToPersonNode(record.get('p')));
    });
  }

  /**
   * Build an array of year strings within a tolerance range
   */
  private buildYearRange(centerYear: number, tolerance: number): string[] {
    const years: string[] = [];
    for (let y = centerYear - tolerance; y <= centerYear + tolerance; y++) {
      years.push(String(y));
    }
    return years;
  }

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update an existing person
   */
  async updatePerson(personId: string, updates: PersonUpdateInput): Promise<PersonNode | null> {
    return withSession(async (session) => {
      const setClauses: string[] = ['p.updatedAt = datetime()'];
      const queryParams: any = { personId };

      const fieldMappings: Array<[keyof PersonUpdateInput, string]> = [
        ['primaryName', 'p.primaryName = $primaryName'],
        ['firstNames', 'p.firstNames = $firstNames'],
        ['lastNames', 'p.lastNames = $lastNames'],
        ['hebrewFirstName', 'p.hebrewFirstName = $hebrewFirstName'],
        ['hebrewLastName', 'p.hebrewLastName = $hebrewLastName'],
        ['birthDateText', 'p.birthDateText = $birthDateText'],
        ['birthPlace', 'p.birthPlace = $birthPlace'],
        ['deathDateText', 'p.deathDateText = $deathDateText'],
        ['deathPlace', 'p.deathPlace = $deathPlace'],
        ['sex', 'p.sex = $sex'],
        ['confidence', 'p.confidence = $confidence'],
        ['notes', 'p.notes = $notes'],
      ];

      for (const [field, clause] of fieldMappings) {
        if (updates[field] !== undefined) {
          setClauses.push(clause);
          queryParams[field] = updates[field];
        }
      }

      const query = `
        MATCH (p:Person {personId: $personId})
        SET ${setClauses.join(', ')}
        RETURN p
      `;

      const result = await session.run(query, queryParams);

      if (result.records.length === 0) {
        return null;
      }

      return nodeToPersonNode(result.records[0].get('p'));
    });
  }

  /**
   * Add name variants to a person
   */
  async addNameVariants(personId: string, firstNames: string[], lastNames: string[]): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})
        SET p.firstNames = [x IN (p.firstNames + $firstNames) | x],
            p.lastNames = [x IN (p.lastNames + $lastNames) | x],
            p.updatedAt = datetime()
      `;

      await session.run(query, {
        personId,
        firstNames: [...new Set(firstNames)],
        lastNames: [...new Set(lastNames)],
      });
    });
  }

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Mark a person as merged (soft delete)
   */
  async markAsMerged(personId: string, mergedIntoId: string): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})
        SET p.merged = true,
            p.mergedInto = $mergedIntoId,
            p.updatedAt = datetime()
      `;

      await session.run(query, { personId, mergedIntoId });
    });
  }

  /**
   * Hard delete a person (use with caution)
   */
  async deletePerson(personId: string): Promise<boolean> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})
        DETACH DELETE p
        RETURN count(p) as deleted
      `;

      const result = await session.run(query, { personId });
      return result.records[0].get('deleted').toNumber() > 0;
    });
  }

  // ==========================================================================
  // SOURCE OPERATIONS
  // ==========================================================================

  /**
   * Link a person to a source (create EXTRACTED_FROM relationship)
   */
  async linkToSource(personId: string, source: SourceExtraction): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})
        MERGE (s:Source {sourceId: $sourceId})
        ON CREATE SET
          s.sourceName = $sourceName,
          s.sourceUrl = $sourceUrl,
          s.externalId = $externalId,
          s.collectionName = $collectionName,
          s.recordType = $recordType,
          s.extractedAt = datetime($extractedAt),
          s.dataQuality = $dataQuality,
          s.reliability = $reliability,
          s.rawData = $rawData
        MERGE (p)-[r:EXTRACTED_FROM]->(s)
        SET r.extractedAt = datetime($extractedAt),
            r.confidence = $reliability,
            r.isPrimary = $isPrimary
      `;

      await session.run(query, {
        personId,
        sourceId: source.sourceId,
        sourceName: source.sourceName,
        sourceUrl: source.sourceUrl,
        externalId: source.externalId,
        collectionName: source.collectionName,
        recordType: source.recordType,
        extractedAt: source.extractedAt.toISOString(),
        dataQuality: source.dataQuality,
        reliability: source.reliability,
        rawData: JSON.stringify(source.rawData),
        isPrimary: source.isPrimary,
      });
    });
  }

  /**
   * Get all sources for a person
   */
  async getPersonSources(personId: string): Promise<SourceExtraction[]> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:EXTRACTED_FROM]->(s:Source)
        RETURN s, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => {
        const s = record.get('s').properties;
        const r = record.get('r').properties;

        return {
          sourceId: s.sourceId,
          sourceName: s.sourceName,
          sourceUrl: s.sourceUrl,
          externalId: s.externalId,
          collectionName: s.collectionName,
          recordType: s.recordType,
          extractedAt: new Date(s.extractedAt),
          dataQuality: s.dataQuality,
          reliability: s.reliability,
          isPrimary: r.isPrimary || false,
          rawData: s.rawData ? JSON.parse(s.rawData) : null,
        };
      });
    });
  }

  // ==========================================================================
  // RELATIONSHIP OPERATIONS
  // ==========================================================================

  /**
   * Create parent-child relationship
   */
  async createParentChildRelationship(
    parentId: string,
    childId: string,
    confidence: number,
    sourceIds: string[]
  ): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (parent:Person {personId: $parentId})
        MATCH (child:Person {personId: $childId})
        MERGE (parent)-[r1:PARENT_OF]->(child)
        SET r1.confidence = $confidence,
            r1.biological = true,
            r1.sourceIds = $sourceIds
        MERGE (child)-[r2:CHILD_OF]->(parent)
        SET r2.confidence = $confidence,
            r2.biological = true,
            r2.sourceIds = $sourceIds
      `;

      await session.run(query, { parentId, childId, confidence, sourceIds });
    });
  }

  /**
   * Create sibling relationship
   */
  async createSiblingRelationship(
    person1Id: string,
    person2Id: string,
    confidence: number,
    sourceIds: string[]
  ): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p1:Person {personId: $person1Id})
        MATCH (p2:Person {personId: $person2Id})
        MERGE (p1)-[r:SIBLING_OF]-(p2)
        SET r.confidence = $confidence,
            r.full = true,
            r.sourceIds = $sourceIds
      `;

      await session.run(query, { person1Id, person2Id, confidence, sourceIds });
    });
  }

  /**
   * Create spouse relationship
   */
  async createSpouseRelationship(
    spouse1Id: string,
    spouse2Id: string,
    marriageDate: string | undefined,
    confidence: number,
    sourceIds: string[]
  ): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (s1:Person {personId: $spouse1Id})
        MATCH (s2:Person {personId: $spouse2Id})
        MERGE (s1)-[r:SPOUSE_OF]-(s2)
        SET r.confidence = $confidence,
            r.marriageDate = $marriageDate,
            r.sourceIds = $sourceIds
      `;

      await session.run(query, {
        spouse1Id,
        spouse2Id,
        marriageDate: marriageDate || null,
        confidence,
        sourceIds,
      });
    });
  }

  /**
   * Get parents of a person
   */
  async getParents(personId: string): Promise<PersonRelation[]> {
    return this.getRelatedPersons(personId, 'CHILD_OF', 'parent', 'CHILD_OF');
  }

  /**
   * Get children of a person
   */
  async getChildren(personId: string): Promise<PersonRelation[]> {
    return this.getRelatedPersons(personId, 'PARENT_OF', 'child', 'PARENT_OF');
  }

  /**
   * Get siblings of a person
   */
  async getSiblings(personId: string): Promise<PersonRelation[]> {
    return this.getRelatedPersons(personId, 'SIBLING_OF', 'sibling', 'SIBLING_OF', true);
  }

  /**
   * Get spouses of a person
   */
  async getSpouses(personId: string): Promise<SpouseRelation[]> {
    return withSession(async (session) => {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:SPOUSE_OF]-(spouse:Person)
        WHERE spouse.merged IS NULL OR spouse.merged = false
        RETURN spouse, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: nodeToPersonNode(record.get('spouse')),
        marriageDate: record.get('r').properties.marriageDate,
        marriagePlace: record.get('r').properties.marriagePlace,
        divorceDate: record.get('r').properties.divorceDate,
        confidence: record.get('r').properties.confidence || 0.8,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));
    });
  }

  /**
   * Generic helper to get related persons by relationship type
   */
  private async getRelatedPersons(
    personId: string,
    relationshipType: string,
    targetAlias: string,
    resultRelationship: 'CHILD_OF' | 'PARENT_OF' | 'SIBLING_OF',
    bidirectional: boolean = false
  ): Promise<PersonRelation[]> {
    return withSession(async (session) => {
      const direction = bidirectional ? '-' : '->';
      const query = `
        MATCH (p:Person {personId: $personId})-[r:${relationshipType}]${direction}(${targetAlias}:Person)
        WHERE ${targetAlias}.merged IS NULL OR ${targetAlias}.merged = false
        RETURN ${targetAlias}, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: nodeToPersonNode(record.get(targetAlias)),
        relationship: resultRelationship,
        confidence: record.get('r').properties.confidence || 0.8,
        biological: record.get('r').properties.biological,
        adoptive: record.get('r').properties.adoptive,
        birthOrder: record.get('r').properties.birthOrder,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));
    });
  }

  // ==========================================================================
  // MATCH RELATIONSHIP OPERATIONS
  // ==========================================================================

  /**
   * Create a possible match relationship (for review)
   */
  async createPossibleMatch(
    personId1: string,
    personId2: string,
    confidence: number,
    matchedOn: string[]
  ): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p1:Person {personId: $personId1})
        MATCH (p2:Person {personId: $personId2})
        MERGE (p1)-[r:POSSIBLY_SAME_AS]-(p2)
        SET r.confidence = $confidence,
            r.matchedOn = $matchedOn,
            r.matchedAt = datetime(),
            r.status = 'suggested'
      `;

      await session.run(query, { personId1, personId2, confidence, matchedOn });
    });
  }

  /**
   * Create a confirmed same-as relationship (after merge)
   */
  async createSameAsRelationship(
    primaryId: string,
    secondaryId: string,
    confidence: number,
    matchedOn: string[]
  ): Promise<void> {
    return withSession(async (session) => {
      const query = `
        MATCH (p1:Person {personId: $primaryId})
        MATCH (p2:Person {personId: $secondaryId})
        MERGE (p1)-[r:SAME_AS]->(p2)
        SET r.confidence = $confidence,
            r.matchedOn = $matchedOn,
            r.matchedAt = datetime(),
            r.status = 'confirmed'
      `;

      await session.run(query, { primaryId, secondaryId, confidence, matchedOn });
    });
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Normalize sex value
   */
  private normalizeSex(sex?: string): 'Male' | 'Female' | 'Unknown' | null {
    if (!sex) return null;

    const normalized = sex.toLowerCase().trim();

    if (normalized === 'male' || normalized === 'm') return 'Male';
    if (normalized === 'female' || normalized === 'f') return 'Female';

    return 'Unknown';
  }
}

// Export singleton instance
export const personRepository = new PersonRepository();
