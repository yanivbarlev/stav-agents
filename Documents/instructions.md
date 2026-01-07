Project: Heir Search System - FamilySearch Tool
Build a TypeScript tool that searches FamilySearch.org for potential heir candidates. This is the first component of a larger heir search system.
Tech stack:

Playwright MCP (already installed) for browser automation
Neo4j MCP (already installed) for storing candidates
TypeScript

Tool requirements:

Function: searchFamilySearch

typescriptinterface SearchInput {
  firstName: string;
  lastName: string;
  birthYear?: number;      // approximate
  birthYearRange?: number; // +/- years (default 5)
  deathYear?: number;
  location?: string;       // state or country
  spouseName?: string;     // for filtering results
  siblingNames?: string[]; // for filtering results
}

interface Candidate {
  id: string;              // FamilySearch person ID
  fullName: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  spouses: string[];
  parents: string[];
  children: string[];
  siblings: string[];
  sourceUrl: string;
  rawData: object;         // full extracted data
}

Extraction flow:

Navigate to FamilySearch.org/search/record/results
Enter search parameters
Extract all result rows (handle pagination if >20 results)
For promising matches, click into detail page to get family relationships
Return structured Candidate objects


Neo4j storage:

Create Person nodes with properties
Create SPOUSE_OF, PARENT_OF, CHILD_OF, SIBLING_OF relationships
Tag with source: "familysearch" and timestamp


Start with a working proof of concept:

Search for a test name
Extract first 5 results
Store in Neo4j
Verify relationships are created




Step-by-Step Task List
Phase 1: FamilySearch Tool (this week)
#TaskDeliverable1Explore FamilySearch search page manuallyDocument URL structure, form fields, result selectors2Build basic Playwright navigationScript that performs a search and returns HTML3Build result list extractorParse search results into candidate stubs4Build detail page extractorExtract full family relationships from person page5Design Neo4j schemaCypher to create nodes/relationships6Integrate Neo4j storageStore candidates and relationships7Add spouse/sibling filteringScore/flag candidates matching optional filters8Handle paginationExtract all results, not just first page9Test with 3 real casesValidate end-to-end
Phase 2: Additional Sources (next)
#Task10Google obituary search tool11FindAGrave search tool12Ancestry.com tool (requires auth handling)13MyHeritage tool (requires auth handling)
Phase 3: Scoring & Orchestration (later)
#Task14Candidate scoring algorithm15Heir group ranking16Case management workflow17Report generation


Neo4j Schema for Heir Search
cypher// =====================
// NODE TYPES
// =====================

// Person - central entity
// Labels: Person, and optionally Decedent or Heir
(:Person {
  id: string,              // UUID we generate
  fsId: string,            // FamilySearch ID (nullable)
  ancestryId: string,      // Ancestry ID (nullable)
  myheritageId: string,    // MyHeritage ID (nullable)
  
  fullName: string,
  firstName: string,
  lastName: string,
  maidenName: string,      // nullable
  
  birthDate: string,       // ISO format or partial "1945" or "Jan 1945"
  birthYear: integer,      // extracted for easy querying
  birthPlace: string,
  
  deathDate: string,
  deathYear: integer,
  deathPlace: string,
  
  isDeceased: boolean,
  isDecedent: boolean,     // the asset owner we're searching FROM
  
  lastKnownLocation: string,
  
  createdAt: datetime,
  updatedAt: datetime
})

// Case - groups a search investigation  
(:Case {
  id: string,
  name: string,            // "John Smith - Ohio 2024"
  status: string,          // "active", "resolved", "archived"
  notes: string,
  createdAt: datetime,
  updatedAt: datetime
})

// Source - tracks where data came from
(:Source {
  id: string,
  type: string,            // "familysearch", "ancestry", "obituary", "findagrave"
  url: string,
  extractedAt: datetime,
  rawData: string          // JSON blob of original extracted data
})

// =====================
// RELATIONSHIPS
// =====================

// Family relationships
(:Person)-[:PARENT_OF]->(:Person)
(:Person)-[:CHILD_OF]->(:Person)
(:Person)-[:SPOUSE_OF {marriageDate: string, divorceDate: string}]->(:Person)
(:Person)-[:SIBLING_OF]->(:Person)

// Case linkage
(:Case)-[:HAS_DECEDENT]->(:Person)
(:Case)-[:HAS_CANDIDATE {score: float, notes: string}]->(:Person)

// Provenance tracking
(:Person)-[:SOURCED_FROM {confidence: float}]->(:Source)

// =====================
// INDEXES (run once on setup)
// =====================

CREATE INDEX person_name IF NOT EXISTS FOR (p:Person) ON (p.lastName, p.firstName);
CREATE INDEX person_fsid IF NOT EXISTS FOR (p:Person) ON (p.fsId);
CREATE INDEX person_birth IF NOT EXISTS FOR (p:Person) ON (p.birthYear);
CREATE INDEX case_status IF NOT EXISTS FOR (c:Case) ON (c.status);

// =====================
// EXAMPLE QUERIES
// =====================

// Find all living descendants of a decedent
MATCH (d:Person {isDecedent: true})-[:PARENT_OF*1..5]->(heir:Person)
WHERE heir.isDeceased = false OR heir.isDeceased IS NULL
RETURN heir;

// Find candidates with matching spouse name
MATCH (c:Person)-[:SPOUSE_OF]-(spouse:Person)
WHERE c.lastName = "Smith" AND spouse.firstName CONTAINS "Mary"
RETURN c, spouse;

// Get full family tree for a person
MATCH (p:Person {id: $personId})-[r:PARENT_OF|CHILD_OF|SPOUSE_OF|SIBLING_OF*1..3]-(relative:Person)
RETURN p, r, relative;
Important conventions:

Always create bidirectional family relationships (if A PARENT_OF B, also create B CHILD_OF A)
SIBLING_OF should be bidirectional
SPOUSE_OF is undirected (either direction works)
Every Person must link to at least one Source
Use confidence scores on SOURCED_FROM when data quality varies


IMPORTANT: Hebrew Name Handling
Input names are in Hebrew and must be transliterated to English with multiple possible spellings.
Example:

Hebrew input: קיטלין
Possible English variants: Kathleen, Kaitlyn, Caitlin, Katelyn, Kaitlin, Caitlyn, Kaytlin, etc.

Required approach:

Add generateNameVariants function:

typescriptinterface NameInput {
  hebrewName: string;        // Original Hebrew: "קיטלין"
  knownEnglishSpelling?: string;  // If we have a hint
}

interface NameVariants {
  hebrew: string;
  variants: string[];        // ["Kathleen", "Kaitlyn", "Caitlin", ...]
  primaryVariant: string;    // Best guess for initial search
}

Variant generation strategy:

Use Claude/LLM to generate 5-10 likely English spellings from Hebrew
Consider phonetic patterns (ק→K/C/Q, י→I/Y/E, etc.)
Include common American spellings of the name


Search strategy:

Search FamilySearch for top 3-5 variants
Merge and deduplicate results by fsId
Store which variant matched


Update Neo4j schema - add to Person node:

cypher(:Person {
  // ... existing fields ...
  hebrewName: string,        // Original Hebrew input
  searchedVariants: [string], // Which spellings we searched
  matchedVariant: string     // Which spelling found this person
})

Scoring boost:

Candidates matching multiple spelling variants = higher confidence
Candidates with family members also matching Hebrew inputs = higher confidence


## Deduplication Strategy (Critical)

FamilySearch often returns multiple records for the same person from different sources (census records, death records, etc.). These have **different FamilySearch IDs** but represent the same individual.

### Client-Side Deduplication (Extension)

The Chrome extension deduplicates search results before display using two methods:

1. **FamilySearch ID (`fsId`)** - Same exact record appearing in multiple search tabs
2. **Name + Birth Year + Death Year** - Different records for same person

```javascript
// Generate unique key for name-based dedup
const nameKey = `${name.toLowerCase()}|${birthYear}|${deathYear}`;
```

Example: Two records "Larry S Lev" with different fsIds but same birth/death years will be merged.

### Server-Side Deduplication (Neo4j)

The PersonService uses pre-save deduplication with two-pass matching:

1. **First Pass: Exact Name Matches** - Lower threshold (70%) for records with identical `primaryName`
2. **Second Pass: Similar Names** - Higher threshold (75%) for fuzzy name matches

```typescript
// Priority: exact name matches first, then similar names
const EXACT_NAME_THRESHOLD = 0.70;
const PRESAVE_DEDUP_THRESHOLD = 0.75;
```

**Key Insight**: Missing birth dates can lower confidence scores significantly (77.8% vs 84.9%). Exact name matching compensates for this by using a lower threshold.

### Why Two Levels of Deduplication?

| Level | Where | Deduplicates By | Purpose |
|-------|-------|-----------------|---------|
| Extension | Before display | name + birth/death years | Clean UI, fewer results to review |
| Server | Before save | name similarity + dates | Prevent duplicate Person nodes in Neo4j |

Both are necessary because:
- Extension handles FamilySearch's multiple records per person
- Server handles variant searches (e.g., "Larry" vs "Lari") finding same person


Also Update the SearchParams Interface
typescriptinterface SearchParams {
  // Change from:
  // firstName: string;
  // lastName: string;
  
  // To:
  firstNameHebrew?: string;
  lastNameHebrew?: string;
  firstNameEnglish?: string;   // If already known
  lastNameEnglish?: string;    // If already known
  
  // ... rest stays the same
}