/**
 * Person Data Models
 *
 * Defines the data structures for persons stored in Neo4j.
 * Supports multi-source genealogy data with relationship tracking.
 */

// ============================================================================
// CORE NODE TYPES
// ============================================================================

/**
 * PersonNode - Core database representation of a person
 * Maps directly to Neo4j Person node properties
 */
export interface PersonNode {
  // Identity
  personId: string;                    // UUID - primary key
  primaryName: string;                 // Display name "John Smith"
  firstNames: string[];                // All known first names
  lastNames: string[];                 // All known last names

  // Hebrew names (for Jewish genealogy)
  hebrewFirstName?: string;
  hebrewLastName?: string;

  // Vital statistics
  birthDateText?: string;              // "1920", "About 1920", "1920-1925"
  birthPlace?: string;
  deathDateText?: string;
  deathPlace?: string;
  sex?: 'Male' | 'Female' | 'Unknown';

  // Metadata
  createdAt: Date;
  updatedAt: Date;
  confidence: number;                  // 0-1 overall confidence score
  notes?: string;                      // Research notes

  // Merge tracking
  merged?: boolean;                    // True if merged into another
  mergedInto?: string;                 // personId this was merged into
}

/**
 * Person - Full person with all relationships (for API responses)
 */
export interface Person extends PersonNode {
  sources: SourceExtraction[];
  parents: PersonRelation[];
  children: PersonRelation[];
  siblings: PersonRelation[];
  spouses: SpouseRelation[];
  possibleMatches?: PossibleMatch[];
}

// ============================================================================
// RELATIONSHIP TYPES
// ============================================================================

/**
 * PersonRelation - Basic family relationship
 */
export interface PersonRelation {
  person: PersonNode;
  relationship: 'PARENT_OF' | 'CHILD_OF' | 'SIBLING_OF';
  confidence: number;
  biological?: boolean;
  adoptive?: boolean;
  birthOrder?: number;                 // For children/siblings
  sourceIds: string[];
}

/**
 * SpouseRelation - Marriage relationship with additional data
 */
export interface SpouseRelation {
  person: PersonNode;
  marriageDate?: string;
  marriagePlace?: string;
  divorceDate?: string;
  endDate?: string;
  endReason?: 'divorce' | 'death' | 'unknown';
  confidence: number;
  sourceIds: string[];
}

/**
 * PossibleMatch - Potential duplicate person
 */
export interface PossibleMatch {
  candidateId: string;
  candidate: PersonNode;
  confidence: number;
  matchedOn: string[];                 // ["name", "birthDate", "parents"]
  matchedAt: Date;
  status: 'suggested' | 'confirmed' | 'rejected';
}

// ============================================================================
// SOURCE TRACKING
// ============================================================================

/**
 * SourceExtraction - Tracks which sources provided data
 */
export interface SourceExtraction {
  sourceId: string;                    // UUID
  sourceName: string;                  // "FamilySearch", "MyHeritage", etc.
  sourceUrl: string;                   // Direct URL to record
  externalId: string;                  // fsId, myHeritageId, etc.
  collectionName: string;              // Collection name
  recordType: string;                  // "birth", "death", "census", etc.
  extractedAt: Date;
  dataQuality: 'high' | 'medium' | 'low';
  reliability: number;                 // 0-1
  isPrimary: boolean;                  // Primary source for this person
  rawData: any;                        // Original ExtractedPerson object
}

// ============================================================================
// INPUT TYPES (for creating/updating)
// ============================================================================

/**
 * PersonCreateInput - Input for creating a new person
 */
export interface PersonCreateInput {
  firstName: string;
  lastName: string;
  hebrewFirstName?: string;
  hebrewLastName?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  sex?: string;
  notes?: string;
}

/**
 * PersonUpdateInput - Input for updating an existing person
 */
export interface PersonUpdateInput {
  primaryName?: string;
  firstNames?: string[];
  lastNames?: string[];
  hebrewFirstName?: string;
  hebrewLastName?: string;
  birthDateText?: string;
  birthPlace?: string;
  deathDateText?: string;
  deathPlace?: string;
  sex?: 'Male' | 'Female' | 'Unknown';
  confidence?: number;
  notes?: string;
}

/**
 * PersonSearchParams - Parameters for searching persons
 */
export interface PersonSearchParams {
  name?: string;
  firstName?: string;
  lastName?: string;
  hebrewFirstName?: string;
  hebrewLastName?: string;
  birthYear?: number;
  birthYearRange?: number;             // Default ±2
  birthPlace?: string;
  limit?: number;                      // Default 50
  offset?: number;                     // For pagination
  includeMatched?: boolean;            // Include merged persons
}

// ============================================================================
// RELATIONSHIP INPUTS
// ============================================================================

/**
 * RelationshipInput - Input for creating family relationships
 */
export interface RelationshipInput {
  fromPersonId: string;
  toPersonId: string;
  relationshipType: 'PARENT_OF' | 'CHILD_OF' | 'SIBLING_OF' | 'SPOUSE_OF';
  confidence: number;
  sourceIds: string[];
  // Spouse-specific
  marriageDate?: string;
  marriagePlace?: string;
  // Parent/Child specific
  biological?: boolean;
  adoptive?: boolean;
}

// ============================================================================
// BULK OPERATION TYPES
// ============================================================================

/**
 * BulkSaveResult - Result of bulk save operation
 */
export interface BulkSaveResult {
  saved: number;                       // New persons created
  updated: number;                     // Existing persons updated
  matched: number;                     // Auto-merged matches
  errors: number;                      // Failed operations
  persons: PersonNode[];               // All saved/updated persons
}

/**
 * ExtractedPersonInput - Mapped from familysearch.ts ExtractedPerson
 * Used for saving extraction results to database
 */
export interface ExtractedPersonInput {
  // Required
  fsId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  sourceUrl: string;
  collectionName: string;

  // Optional
  hebrewFirstName?: string;
  hebrewLastName?: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  sex?: string;
  searchedVariants?: string[];
  matchedVariant?: string;
  extractedAt: string;

  // Relationships
  parents?: Array<{
    name: string;
    fsId: string;
    relationship: 'Father' | 'Mother';
    sex: string;
  }>;

  children?: Array<{
    name: string;
    fsId: string;
    sex?: string;
    birthDate?: string;
  }>;

  siblings?: Array<{
    name: string;
    fsId: string;
    sex?: string;
    relationship: 'Brother' | 'Sister' | 'Sibling';
  }>;

  spouses?: Array<{
    name: string;
    fsId: string;
    marriageDate?: string;
    marriagePlace?: string;
  }>;

  // Extended events
  events?: Array<{
    eventType: string;
    date?: string;
    place?: string;
    description?: string;
  }>;
}
