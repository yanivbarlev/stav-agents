// ============================================================================
// GENEALOGY DATABASE SCHEMA - Initial Migration
// Run this in Neo4j Browser or via migration runner
// ============================================================================

// --- CONSTRAINTS (Unique IDs) ---

// Person nodes - unique by internal ID
CREATE CONSTRAINT person_id IF NOT EXISTS FOR (p:Person) REQUIRE p.personId IS UNIQUE;

// Source nodes - unique by internal ID
CREATE CONSTRAINT source_id IF NOT EXISTS FOR (s:Source) REQUIRE s.sourceId IS UNIQUE;

// Event nodes - unique by internal ID
CREATE CONSTRAINT event_id IF NOT EXISTS FOR (e:Event) REQUIRE e.eventId IS UNIQUE;


// --- INDEXES (Query Performance) ---

// Person indexes
CREATE INDEX person_primary_name IF NOT EXISTS FOR (p:Person) ON (p.primaryName);
CREATE INDEX person_birth_text IF NOT EXISTS FOR (p:Person) ON (p.birthDateText);
CREATE INDEX person_hebrew_first IF NOT EXISTS FOR (p:Person) ON (p.hebrewFirstName);
CREATE INDEX person_hebrew_last IF NOT EXISTS FOR (p:Person) ON (p.hebrewLastName);

// Source indexes - for finding existing extractions
CREATE INDEX source_external IF NOT EXISTS FOR (s:Source) ON (s.sourceName, s.externalId);
CREATE INDEX source_name IF NOT EXISTS FOR (s:Source) ON (s.sourceName);

// Event indexes
CREATE INDEX event_type IF NOT EXISTS FOR (e:Event) ON (e.eventType);
CREATE INDEX event_date IF NOT EXISTS FOR (e:Event) ON (e.dateText);


// --- FULL-TEXT INDEXES (Name Search) ---

// Full-text search on person names for fuzzy matching
// Note: Run these separately as they may fail if already exist
// CREATE FULLTEXT INDEX person_names IF NOT EXISTS FOR (p:Person) ON EACH [p.primaryName];


// ============================================================================
// SCHEMA DOCUMENTATION
// ============================================================================

// PERSON NODE PROPERTIES:
// - personId: String (UUID) - Primary key
// - primaryName: String - Display name (e.g., "John Smith")
// - firstNames: [String] - All known first names
// - lastNames: [String] - All known last names
// - hebrewFirstName: String - Hebrew first name if available
// - hebrewLastName: String - Hebrew last name if available
// - birthDateText: String - Birth date as text (handles "About 1920", etc.)
// - birthPlace: String - Birth location
// - deathDateText: String - Death date as text
// - deathPlace: String - Death location
// - sex: String - "Male", "Female", "Unknown"
// - createdAt: DateTime - When record was created
// - updatedAt: DateTime - Last update time
// - confidence: Float - Overall confidence score (0-1)
// - notes: String - Research notes
// - merged: Boolean - True if merged into another person
// - mergedInto: String - personId this was merged into

// SOURCE NODE PROPERTIES:
// - sourceId: String (UUID) - Primary key
// - sourceName: String - "FamilySearch", "MyHeritage", etc.
// - sourceUrl: String - Direct URL to record
// - externalId: String - Source-specific ID (fsId, etc.)
// - collectionName: String - Collection name
// - recordType: String - "birth", "death", "census", etc.
// - extractedAt: DateTime - When data was extracted
// - dataQuality: String - "high", "medium", "low"
// - reliability: Float - Reliability score (0-1)
// - rawData: String - JSON of original extracted data

// RELATIONSHIP TYPES:
// (Person)-[:EXTRACTED_FROM {extractedAt, confidence, isPrimary}]->(Source)
// (Person)-[:PARENT_OF {confidence, biological, adoptive, sourceIds}]->(Person)
// (Person)-[:CHILD_OF {confidence, biological, adoptive, sourceIds}]->(Person)
// (Person)-[:SIBLING_OF {confidence, full, sourceIds}]->(Person)
// (Person)-[:SPOUSE_OF {confidence, marriageDate, marriagePlace, divorceDate, sourceIds}]->(Person)
// (Person)-[:SAME_AS {confidence, matchedOn, matchedAt, status}]->(Person)
// (Person)-[:POSSIBLY_SAME_AS {confidence, matchedOn, matchedAt, conflictingData}]->(Person)
