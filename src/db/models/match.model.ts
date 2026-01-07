/**
 * Match/Deduplication Data Models
 *
 * Defines structures for person matching and conflict resolution.
 */

import { PersonNode } from './person.model';

// ============================================================================
// MATCH RESULT TYPES
// ============================================================================

/**
 * PersonMatch - Result of matching algorithm
 */
export interface PersonMatch {
  candidateId: string;
  candidate: PersonNode;
  confidence: number;                  // 0-1 overall match confidence
  matchedOn: MatchedField[];           // Fields that matched
  conflictingFields: ConflictingField[]; // Fields that conflict
  matchAlgorithm: string;              // Which algorithm found this
  matchReason: string;                 // Human-readable explanation
}

/**
 * MatchedField - A field that matched between two persons
 */
export interface MatchedField {
  field: string;                       // "name", "birthDate", "parents", etc.
  similarity: number;                  // 0-1 similarity score for this field
  value1: any;                         // Value from person 1
  value2: any;                         // Value from person 2
}

/**
 * ConflictingField - A field with conflicting values
 */
export interface ConflictingField {
  field: string;
  value1: any;
  value2: any;
  reconcilable: boolean;               // Can this conflict be resolved?
  resolution?: string;                 // Suggested resolution
}

// ============================================================================
// MATCHING CRITERIA
// ============================================================================

/**
 * MatchCriteria - Input for finding matches
 */
export interface MatchCriteria {
  person: PersonNode;
  useAllData: boolean;                 // Use all fields vs just core vitals
  minConfidence?: number;              // Minimum confidence to return (default 0.5)
  maxResults?: number;                 // Maximum matches to return (default 10)
  excludePersonIds?: string[];         // Persons to exclude from results
}

/**
 * MatchLevel - Different matching strategies
 */
export enum MatchLevel {
  EXACT_NAME_BIRTH = 1,                // Level 1: Exact name + birth year (±2)
  EXACT_NAME_DEATH = 2,                // Level 2: Exact name + death year (±2) - NEW
  PARENT_BASED = 3,                    // Level 3: Parent names + birth location
  FAMILY_CONTEXT = 4,                  // Level 4: Siblings, children context
  FUZZY_COMPREHENSIVE = 5,             // Level 5: Fuzzy matching on all data
}

/**
 * MatchConfig - Configuration for matching algorithm
 */
export interface MatchConfig {
  // Confidence thresholds
  autoMergeThreshold: number;          // Auto-merge above this (default 0.9)
  suggestThreshold: number;            // Suggest review above this (default 0.7)
  rejectThreshold: number;             // Reject below this (default 0.5)

  // Field weights for scoring
  weights: {
    name: number;                      // Default 0.25
    birthDate: number;                 // Default 0.15
    birthPlace: number;                // Default 0.10
    deathDate: number;                 // Default 0.15
    deathPlace: number;                // Default 0.05
    parents: number;                   // Default 0.15
    siblings: number;                  // Default 0.05
    sourceReliability: number;         // Default 0.05
    dataCompleteness: number;          // Default 0.05
  };

  // Tolerances
  birthYearTolerance: number;          // Default ±2 years
  deathYearTolerance: number;          // Default ±2 years
  nameFuzzyThreshold: number;          // Minimum name similarity (default 0.8)
}

/**
 * Default match configuration
 */
export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  autoMergeThreshold: 0.9,
  suggestThreshold: 0.7,
  rejectThreshold: 0.5,

  weights: {
    name: 0.25,
    birthDate: 0.15,
    birthPlace: 0.10,
    deathDate: 0.15,
    deathPlace: 0.05,
    parents: 0.15,
    siblings: 0.05,
    sourceReliability: 0.05,
    dataCompleteness: 0.05,
  },

  birthYearTolerance: 2,
  deathYearTolerance: 2,
  nameFuzzyThreshold: 0.8,
};

// ============================================================================
// MERGE TYPES
// ============================================================================

/**
 * MergeRequest - Request to merge two persons
 */
export interface MergeRequest {
  primaryPersonId: string;             // Person to keep
  secondaryPersonId: string;           // Person to merge into primary
  mergeStrategy: MergeStrategy;
  fieldResolutions?: FieldResolution[];// Manual field choices
}

/**
 * MergeStrategy - How to handle conflicts during merge
 */
export enum MergeStrategy {
  PREFER_PRIMARY = 'prefer-primary',   // Keep primary's values
  PREFER_SECONDARY = 'prefer-secondary', // Keep secondary's values
  PREFER_COMPLETE = 'prefer-complete', // Keep whichever has more data
  PREFER_RELIABLE = 'prefer-reliable', // Keep from more reliable source
  MANUAL = 'manual',                   // Use fieldResolutions
}

/**
 * FieldResolution - Manual resolution for a specific field
 */
export interface FieldResolution {
  field: string;
  useFromPersonId: string;             // Which person's value to use
  customValue?: any;                   // Or specify a custom value
}

/**
 * MergeResult - Result of merge operation
 */
export interface MergeResult {
  success: boolean;
  mergedPerson: PersonNode;
  deletedPersonId: string;
  fieldsFromPrimary: string[];
  fieldsFromSecondary: string[];
  conflictsResolved: ConflictingField[];
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

/**
 * ConfidenceFactors - Factors that affect confidence score
 */
export interface ConfidenceFactors {
  nameMatch: number;                   // 0-1
  birthDateMatch: number;              // 0-1
  birthPlaceMatch: number;             // 0-1
  deathDateMatch: number;              // 0-1 (NEW: death date as positive match)
  deathPlaceMatch: number;             // 0-1 (NEW: death place as positive match)
  parentMatch: number;                 // 0-1
  siblingMatch: number;                // 0-1
  spouseMatch: number;                 // 0-1
  sourceReliability: number;           // 0-1
  dataCompleteness: number;            // 0-1
  conflictPenalty: number;             // 0-1 (higher = more conflicts)
}

/**
 * Calculate overall confidence from factors
 */
export function calculateOverallConfidence(
  factors: ConfidenceFactors,
  config: MatchConfig = DEFAULT_MATCH_CONFIG
): number {
  const { weights } = config;

  let score = 0;
  score += factors.nameMatch * weights.name;
  score += factors.birthDateMatch * weights.birthDate;
  score += factors.birthPlaceMatch * weights.birthPlace;
  score += factors.deathDateMatch * weights.deathDate;     // NEW: death date scoring
  score += factors.deathPlaceMatch * weights.deathPlace;   // NEW: death place scoring
  score += factors.parentMatch * weights.parents;
  score += factors.siblingMatch * weights.siblings;
  score += factors.sourceReliability * weights.sourceReliability;
  score += factors.dataCompleteness * weights.dataCompleteness;

  // Apply conflict penalty
  score = score * (1 - factors.conflictPenalty);

  // Clamp to 0-1
  return Math.max(0, Math.min(1, score));
}

// ============================================================================
// MATCH STATUS TRACKING
// ============================================================================

/**
 * MatchStatus - Status of a potential match
 */
export enum MatchStatus {
  SUGGESTED = 'suggested',             // Algorithm found match, needs review
  CONFIRMED = 'confirmed',             // User confirmed match
  REJECTED = 'rejected',               // User rejected match
  AUTO_MERGED = 'auto-merged',         // System auto-merged (high confidence)
}

/**
 * MatchRecord - Stored match relationship data
 */
export interface MatchRecord {
  personId1: string;
  personId2: string;
  confidence: number;
  matchedOn: string[];
  matchedAt: Date;
  status: MatchStatus;
  reviewedBy?: string;                 // "algorithm" or user ID
  reviewedAt?: Date;
  notes?: string;
}
