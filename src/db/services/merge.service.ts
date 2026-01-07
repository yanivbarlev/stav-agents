/**
 * Merge Service
 *
 * Handles merging of duplicate persons.
 * Combines data from multiple sources intelligently.
 */

import { neo4jConnection } from '../neo4j-connection';
import { PersonRepository, personRepository } from '../repositories/person.repository';
import { PersonNode, Person, PersonUpdateInput } from '../models/person.model';
import { MergeStrategy, MergeResult } from '../models/match.model';

// ============================================================================
// MERGE SERVICE CLASS
// ============================================================================

export class MergeService {
  private repo: PersonRepository;

  constructor(repo: PersonRepository = personRepository) {
    this.repo = repo;
  }

  // ==========================================================================
  // MERGE OPERATIONS
  // ==========================================================================

  /**
   * Merge two persons into one
   *
   * @param primaryId Person to keep
   * @param secondaryId Person to merge into primary
   * @param strategy How to handle conflicts (default: prefer-complete)
   * @returns Merge result with combined person
   */
  async mergePersons(
    primaryId: string,
    secondaryId: string,
    strategy: MergeStrategy = MergeStrategy.PREFER_COMPLETE
  ): Promise<MergeResult> {
    const primary = await this.repo.getPersonWithRelationships(primaryId);
    const secondary = await this.repo.getPersonWithRelationships(secondaryId);

    if (!primary || !secondary) {
      throw new Error(`Cannot merge: person not found (primary: ${!!primary}, secondary: ${!!secondary})`);
    }

    console.log(`[MergeService] Merging ${secondary.primaryName} into ${primary.primaryName}`);

    // Step 1: Merge person data
    const mergedData = this.mergePersonData(primary, secondary, strategy);

    // Step 2: Update primary with merged data
    await this.repo.updatePerson(primaryId, mergedData.updates);

    // Step 3: Add name variants from secondary
    await this.repo.addNameVariants(
      primaryId,
      secondary.firstNames,
      secondary.lastNames
    );

    // Step 4: Transfer relationships from secondary to primary
    await this.transferRelationships(primaryId, secondaryId);

    // Step 5: Transfer sources from secondary to primary
    await this.transferSources(primaryId, secondaryId);

    // Step 6: Create SAME_AS relationship
    await this.repo.createSameAsRelationship(
      primaryId,
      secondaryId,
      0.95,
      mergedData.fieldsFromBoth
    );

    // Step 7: Mark secondary as merged
    await this.repo.markAsMerged(secondaryId, primaryId);

    // Get updated primary
    const mergedPerson = await this.repo.findById(primaryId);

    return {
      success: true,
      mergedPerson: mergedPerson!,
      deletedPersonId: secondaryId,
      fieldsFromPrimary: mergedData.fieldsFromPrimary,
      fieldsFromSecondary: mergedData.fieldsFromSecondary,
      conflictsResolved: mergedData.conflicts,
    };
  }

  // ==========================================================================
  // DATA MERGING
  // ==========================================================================

  /**
   * Merge person data based on strategy
   */
  private mergePersonData(
    primary: Person,
    secondary: Person,
    strategy: MergeStrategy
  ): {
    updates: PersonUpdateInput;
    fieldsFromPrimary: string[];
    fieldsFromSecondary: string[];
    fieldsFromBoth: string[];
    conflicts: Array<{ field: string; value1: any; value2: any; reconcilable: boolean }>;
  } {
    const updates: PersonUpdateInput = {};
    const fieldsFromPrimary: string[] = [];
    const fieldsFromSecondary: string[] = [];
    const fieldsFromBoth: string[] = [];
    const conflicts: Array<{ field: string; value1: any; value2: any; reconcilable: boolean }> = [];

    // Merge each field
    const fieldConfigs: Array<{
      field: keyof PersonUpdateInput;
      primaryValue: any;
      secondaryValue: any;
    }> = [
      { field: 'primaryName', primaryValue: primary.primaryName, secondaryValue: secondary.primaryName },
      { field: 'birthDateText', primaryValue: primary.birthDateText, secondaryValue: secondary.birthDateText },
      { field: 'birthPlace', primaryValue: primary.birthPlace, secondaryValue: secondary.birthPlace },
      { field: 'deathDateText', primaryValue: primary.deathDateText, secondaryValue: secondary.deathDateText },
      { field: 'deathPlace', primaryValue: primary.deathPlace, secondaryValue: secondary.deathPlace },
      { field: 'sex', primaryValue: primary.sex, secondaryValue: secondary.sex },
      { field: 'hebrewFirstName', primaryValue: primary.hebrewFirstName, secondaryValue: secondary.hebrewFirstName },
      { field: 'hebrewLastName', primaryValue: primary.hebrewLastName, secondaryValue: secondary.hebrewLastName },
    ];

    for (const { field, primaryValue, secondaryValue } of fieldConfigs) {
      const result = this.mergeField(
        field,
        primaryValue,
        secondaryValue,
        strategy
      );

      if (result.value !== undefined) {
        (updates as any)[field] = result.value;
      }

      if (result.source === 'primary') {
        fieldsFromPrimary.push(field);
      } else if (result.source === 'secondary') {
        fieldsFromSecondary.push(field);
      } else if (result.source === 'both') {
        fieldsFromBoth.push(field);
      }

      if (result.conflict) {
        conflicts.push(result.conflict);
      }
    }

    // Merge notes (concatenate)
    if (primary.notes || secondary.notes) {
      const notes: string[] = [];
      if (primary.notes) notes.push(primary.notes);
      if (secondary.notes) notes.push(`[Merged from ${secondary.primaryName}] ${secondary.notes}`);
      updates.notes = notes.join('\n\n');
      fieldsFromBoth.push('notes');
    }

    // Increase confidence if both sources agree
    const agreement = fieldsFromBoth.length / fieldConfigs.length;
    updates.confidence = Math.min(1, primary.confidence + (agreement * 0.1));

    return { updates, fieldsFromPrimary, fieldsFromSecondary, fieldsFromBoth, conflicts };
  }

  /**
   * Merge a single field based on strategy
   */
  private mergeField(
    field: string,
    primaryValue: any,
    secondaryValue: any,
    strategy: MergeStrategy
  ): {
    value: any;
    source: 'primary' | 'secondary' | 'both' | 'none';
    conflict?: { field: string; value1: any; value2: any; reconcilable: boolean };
  } {
    // If only one has a value, use it
    if (primaryValue && !secondaryValue) {
      return { value: primaryValue, source: 'primary' };
    }

    if (!primaryValue && secondaryValue) {
      return { value: secondaryValue, source: 'secondary' };
    }

    if (!primaryValue && !secondaryValue) {
      return { value: undefined, source: 'none' };
    }

    // Both have values - check if they match
    if (this.valuesMatch(primaryValue, secondaryValue)) {
      return { value: primaryValue, source: 'both' };
    }

    // Values conflict - resolve based on strategy
    const conflict = {
      field,
      value1: primaryValue,
      value2: secondaryValue,
      reconcilable: true,
    };

    switch (strategy) {
      case MergeStrategy.PREFER_PRIMARY:
        return { value: primaryValue, source: 'primary', conflict };

      case MergeStrategy.PREFER_SECONDARY:
        return { value: secondaryValue, source: 'secondary', conflict };

      case MergeStrategy.PREFER_COMPLETE:
        // Prefer the longer/more complete value
        const primary_len = String(primaryValue).length;
        const secondary_len = String(secondaryValue).length;

        if (primary_len >= secondary_len) {
          return { value: primaryValue, source: 'primary', conflict };
        } else {
          return { value: secondaryValue, source: 'secondary', conflict };
        }

      case MergeStrategy.PREFER_RELIABLE:
        // For now, prefer primary (would need source reliability info)
        return { value: primaryValue, source: 'primary', conflict };

      default:
        return { value: primaryValue, source: 'primary', conflict };
    }
  }

  /**
   * Check if two values match (with some tolerance)
   */
  private valuesMatch(value1: any, value2: any): boolean {
    if (value1 === value2) return true;

    // String comparison (case-insensitive)
    if (typeof value1 === 'string' && typeof value2 === 'string') {
      return value1.toLowerCase().trim() === value2.toLowerCase().trim();
    }

    return false;
  }

  // ==========================================================================
  // RELATIONSHIP TRANSFER
  // ==========================================================================

  /**
   * Transfer all relationships from secondary to primary
   */
  private async transferRelationships(
    primaryId: string,
    secondaryId: string
  ): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      // Transfer PARENT_OF relationships
      await session.run(`
        MATCH (secondary:Person {personId: $secondaryId})-[r:PARENT_OF]->(child:Person)
        MATCH (primary:Person {personId: $primaryId})
        MERGE (primary)-[newRel:PARENT_OF]->(child)
        SET newRel = r
        DELETE r
      `, { primaryId, secondaryId });

      // Transfer CHILD_OF relationships
      await session.run(`
        MATCH (secondary:Person {personId: $secondaryId})-[r:CHILD_OF]->(parent:Person)
        MATCH (primary:Person {personId: $primaryId})
        MERGE (primary)-[newRel:CHILD_OF]->(parent)
        SET newRel = r
        DELETE r
      `, { primaryId, secondaryId });

      // Transfer SIBLING_OF relationships
      await session.run(`
        MATCH (secondary:Person {personId: $secondaryId})-[r:SIBLING_OF]-(sibling:Person)
        WHERE sibling.personId <> $primaryId
        MATCH (primary:Person {personId: $primaryId})
        MERGE (primary)-[newRel:SIBLING_OF]-(sibling)
        SET newRel = r
        DELETE r
      `, { primaryId, secondaryId });

      // Transfer SPOUSE_OF relationships
      await session.run(`
        MATCH (secondary:Person {personId: $secondaryId})-[r:SPOUSE_OF]-(spouse:Person)
        WHERE spouse.personId <> $primaryId
        MATCH (primary:Person {personId: $primaryId})
        MERGE (primary)-[newRel:SPOUSE_OF]-(spouse)
        SET newRel = r
        DELETE r
      `, { primaryId, secondaryId });

      // Remove any self-referential relationships
      await session.run(`
        MATCH (p:Person {personId: $primaryId})-[r]->(p)
        DELETE r
      `, { primaryId });

    } finally {
      await session.close();
    }
  }

  /**
   * Transfer source links from secondary to primary
   */
  private async transferSources(
    primaryId: string,
    secondaryId: string
  ): Promise<void> {
    const session = neo4jConnection.getSession();

    try {
      await session.run(`
        MATCH (secondary:Person {personId: $secondaryId})-[r:EXTRACTED_FROM]->(source:Source)
        MATCH (primary:Person {personId: $primaryId})
        MERGE (primary)-[newRel:EXTRACTED_FROM]->(source)
        SET newRel.extractedAt = r.extractedAt,
            newRel.confidence = r.confidence,
            newRel.isPrimary = false
        DELETE r
      `, { primaryId, secondaryId });

    } finally {
      await session.close();
    }
  }
}

// Export singleton instance
export const mergeService = new MergeService();
