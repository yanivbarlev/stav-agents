/**
 * Person Repository
 *
 * Data access layer for Person nodes in Neo4j.
 * Handles CRUD operations and relationship management.
 */

import { v4 as uuidv4 } from 'uuid';
import neo4j from 'neo4j-driver';
import { neo4jConnection } from '../neo4j-connection';
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
    const session = neo4jConnection.getSession();

    try {
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
        confidence: 0.7, // Default confidence
        notes: input.notes || null,
      });

      return this.nodeToPersonNode(result.records[0].get('p'));

    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // READ OPERATIONS
  // ==========================================================================

  /**
   * Find person by internal ID
   */
  async findById(personId: string): Promise<PersonNode | null> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})
        WHERE p.merged IS NULL OR p.merged = false
        RETURN p
      `;

      const result = await session.run(query, { personId });

      if (result.records.length === 0) {
        return null;
      }

      return this.nodeToPersonNode(result.records[0].get('p'));

    } finally {
      await session.close();
    }
  }

  /**
   * Find person by external source ID (e.g., FamilySearch ID)
   */
  async findByExternalId(sourceName: string, externalId: string): Promise<PersonNode | null> {
    const session = neo4jConnection.getSession();

    try {
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

      return this.nodeToPersonNode(result.records[0].get('p'));

    } finally {
      await session.close();
    }
  }

  /**
   * Get person with all relationships (full Person object)
   */
  async getPersonWithRelationships(personId: string): Promise<Person | null> {
    const session = neo4jConnection.getSession();

    try {
      // Get person node
      const personNode = await this.findById(personId);
      if (!personNode) return null;

      // Get all relationships in parallel queries
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

    } finally {
      await session.close();
    }
  }

  /**
   * Search for persons by various criteria
   */
  async searchPersons(params: PersonSearchParams): Promise<PersonNode[]> {
    const session = neo4jConnection.getSession();

    try {
      const conditions: string[] = ['(p.merged IS NULL OR p.merged = false)'];
      const queryParams: any = {};

      // Name search
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

      // Hebrew name search
      if (params.hebrewFirstName) {
        conditions.push('p.hebrewFirstName = $hebrewFirstName');
        queryParams.hebrewFirstName = params.hebrewFirstName;
      }

      if (params.hebrewLastName) {
        conditions.push('p.hebrewLastName = $hebrewLastName');
        queryParams.hebrewLastName = params.hebrewLastName;
      }

      // Birth year search
      if (params.birthYear) {
        const range = params.birthYearRange || 2;
        conditions.push('p.birthDateText CONTAINS toString($birthYear)');
        queryParams.birthYear = params.birthYear;
        // Note: For more precise range matching, would need to parse dates
      }

      // Birth place search
      if (params.birthPlace) {
        conditions.push('toLower(p.birthPlace) CONTAINS toLower($birthPlace)');
        queryParams.birthPlace = params.birthPlace;
      }

      const limit = neo4j.int(params.limit || 50);
      const offset = neo4j.int(params.offset || 0);
      queryParams.limit = limit;
      queryParams.offset = offset;

      const query = `
        MATCH (p:Person)
        WHERE ${conditions.join(' AND ')}
        RETURN p
        ORDER BY p.primaryName
        SKIP $offset
        LIMIT $limit
      `;

      const result = await session.run(query, queryParams);

      return result.records.map(record => this.nodeToPersonNode(record.get('p')));

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
      // Build year range pattern
      const yearStrings = [];
      for (let y = birthYear - yearTolerance; y <= birthYear + yearTolerance; y++) {
        yearStrings.push(String(y));
      }

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

      const result = await session.run(query, {
        firstName,
        lastName,
        yearStrings,
      });

      return result.records.map(record => this.nodeToPersonNode(record.get('p')));

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
      // Build year range pattern
      const yearStrings = [];
      for (let y = deathYear - yearTolerance; y <= deathYear + yearTolerance; y++) {
        yearStrings.push(String(y));
      }

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

      const result = await session.run(query, {
        firstName,
        lastName,
        yearStrings,
      });

      return result.records.map(record => this.nodeToPersonNode(record.get('p')));

    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // UPDATE OPERATIONS
  // ==========================================================================

  /**
   * Update an existing person
   */
  async updatePerson(personId: string, updates: PersonUpdateInput): Promise<PersonNode | null> {
    const session = neo4jConnection.getSession();

    try {
      const setClauses: string[] = ['p.updatedAt = datetime()'];
      const queryParams: any = { personId };

      if (updates.primaryName !== undefined) {
        setClauses.push('p.primaryName = $primaryName');
        queryParams.primaryName = updates.primaryName;
      }

      if (updates.firstNames !== undefined) {
        setClauses.push('p.firstNames = $firstNames');
        queryParams.firstNames = updates.firstNames;
      }

      if (updates.lastNames !== undefined) {
        setClauses.push('p.lastNames = $lastNames');
        queryParams.lastNames = updates.lastNames;
      }

      if (updates.hebrewFirstName !== undefined) {
        setClauses.push('p.hebrewFirstName = $hebrewFirstName');
        queryParams.hebrewFirstName = updates.hebrewFirstName;
      }

      if (updates.hebrewLastName !== undefined) {
        setClauses.push('p.hebrewLastName = $hebrewLastName');
        queryParams.hebrewLastName = updates.hebrewLastName;
      }

      if (updates.birthDateText !== undefined) {
        setClauses.push('p.birthDateText = $birthDateText');
        queryParams.birthDateText = updates.birthDateText;
      }

      if (updates.birthPlace !== undefined) {
        setClauses.push('p.birthPlace = $birthPlace');
        queryParams.birthPlace = updates.birthPlace;
      }

      if (updates.deathDateText !== undefined) {
        setClauses.push('p.deathDateText = $deathDateText');
        queryParams.deathDateText = updates.deathDateText;
      }

      if (updates.deathPlace !== undefined) {
        setClauses.push('p.deathPlace = $deathPlace');
        queryParams.deathPlace = updates.deathPlace;
      }

      if (updates.sex !== undefined) {
        setClauses.push('p.sex = $sex');
        queryParams.sex = updates.sex;
      }

      if (updates.confidence !== undefined) {
        setClauses.push('p.confidence = $confidence');
        queryParams.confidence = updates.confidence;
      }

      if (updates.notes !== undefined) {
        setClauses.push('p.notes = $notes');
        queryParams.notes = updates.notes;
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

      return this.nodeToPersonNode(result.records[0].get('p'));

    } finally {
      await session.close();
    }
  }

  /**
   * Add name variants to a person
   */
  async addNameVariants(personId: string, firstNames: string[], lastNames: string[]): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})
        SET p.firstNames = [x IN (p.firstNames + $firstNames) | x],
            p.lastNames = [x IN (p.lastNames + $lastNames) | x],
            p.updatedAt = datetime()
      `;

      // Remove duplicates in the arrays
      await session.run(query, {
        personId,
        firstNames: [...new Set(firstNames)],
        lastNames: [...new Set(lastNames)],
      });

    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // DELETE OPERATIONS
  // ==========================================================================

  /**
   * Mark a person as merged (soft delete)
   */
  async markAsMerged(personId: string, mergedIntoId: string): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})
        SET p.merged = true,
            p.mergedInto = $mergedIntoId,
            p.updatedAt = datetime()
      `;

      await session.run(query, { personId, mergedIntoId });

    } finally {
      await session.close();
    }
  }

  /**
   * Hard delete a person (use with caution)
   */
  async deletePerson(personId: string): Promise<boolean> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})
        DETACH DELETE p
        RETURN count(p) as deleted
      `;

      const result = await session.run(query, { personId });
      const deleted = result.records[0].get('deleted').toNumber();

      return deleted > 0;

    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // SOURCE OPERATIONS
  // ==========================================================================

  /**
   * Link a person to a source (create EXTRACTED_FROM relationship)
   */
  async linkToSource(personId: string, source: SourceExtraction): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
  }

  /**
   * Get all sources for a person
   */
  async getPersonSources(personId: string): Promise<SourceExtraction[]> {
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p1:Person {personId: $person1Id})
        MATCH (p2:Person {personId: $person2Id})
        MERGE (p1)-[r:SIBLING_OF]-(p2)
        SET r.confidence = $confidence,
            r.full = true,
            r.sourceIds = $sourceIds
      `;

      await session.run(query, { person1Id, person2Id, confidence, sourceIds });

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
  }

  /**
   * Get parents of a person
   */
  async getParents(personId: string): Promise<PersonRelation[]> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:CHILD_OF]->(parent:Person)
        WHERE parent.merged IS NULL OR parent.merged = false
        RETURN parent, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: this.nodeToPersonNode(record.get('parent')),
        relationship: 'CHILD_OF' as const,
        confidence: record.get('r').properties.confidence || 0.8,
        biological: record.get('r').properties.biological,
        adoptive: record.get('r').properties.adoptive,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));

    } finally {
      await session.close();
    }
  }

  /**
   * Get children of a person
   */
  async getChildren(personId: string): Promise<PersonRelation[]> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:PARENT_OF]->(child:Person)
        WHERE child.merged IS NULL OR child.merged = false
        RETURN child, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: this.nodeToPersonNode(record.get('child')),
        relationship: 'PARENT_OF' as const,
        confidence: record.get('r').properties.confidence || 0.8,
        biological: record.get('r').properties.biological,
        adoptive: record.get('r').properties.adoptive,
        birthOrder: record.get('r').properties.birthOrder,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));

    } finally {
      await session.close();
    }
  }

  /**
   * Get siblings of a person
   */
  async getSiblings(personId: string): Promise<PersonRelation[]> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:SIBLING_OF]-(sibling:Person)
        WHERE sibling.merged IS NULL OR sibling.merged = false
        RETURN sibling, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: this.nodeToPersonNode(record.get('sibling')),
        relationship: 'SIBLING_OF' as const,
        confidence: record.get('r').properties.confidence || 0.8,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));

    } finally {
      await session.close();
    }
  }

  /**
   * Get spouses of a person
   */
  async getSpouses(personId: string): Promise<SpouseRelation[]> {
    const session = neo4jConnection.getSession();

    try {
      const query = `
        MATCH (p:Person {personId: $personId})-[r:SPOUSE_OF]-(spouse:Person)
        WHERE spouse.merged IS NULL OR spouse.merged = false
        RETURN spouse, r
      `;

      const result = await session.run(query, { personId });

      return result.records.map(record => ({
        person: this.nodeToPersonNode(record.get('spouse')),
        marriageDate: record.get('r').properties.marriageDate,
        marriagePlace: record.get('r').properties.marriagePlace,
        divorceDate: record.get('r').properties.divorceDate,
        confidence: record.get('r').properties.confidence || 0.8,
        sourceIds: record.get('r').properties.sourceIds || [],
      }));

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
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
    const session = neo4jConnection.getSession();

    try {
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

    } finally {
      await session.close();
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Convert Neo4j node to PersonNode interface
   */
  private nodeToPersonNode(node: any): PersonNode {
    const props = node.properties;

    return {
      personId: props.personId,
      primaryName: props.primaryName,
      firstNames: props.firstNames || [],
      lastNames: props.lastNames || [],
      hebrewFirstName: props.hebrewFirstName || undefined,
      hebrewLastName: props.hebrewLastName || undefined,
      birthDateText: props.birthDateText || undefined,
      birthPlace: props.birthPlace || undefined,
      deathDateText: props.deathDateText || undefined,
      deathPlace: props.deathPlace || undefined,
      sex: props.sex || undefined,
      createdAt: props.createdAt ? new Date(props.createdAt) : new Date(),
      updatedAt: props.updatedAt ? new Date(props.updatedAt) : new Date(),
      confidence: typeof props.confidence === 'number' ? props.confidence : 0.7,
      notes: props.notes || undefined,
      merged: props.merged || false,
      mergedInto: props.mergedInto || undefined,
    };
  }

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
