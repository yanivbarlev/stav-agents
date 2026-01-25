# CLAUDE.md - Heir Search System

This file provides context for Claude Code when working in this repository.

## Project Overview

This is an **Heir Search System** - a tool for genealogical research that extracts records from multiple genealogy sources to help locate potential heirs. The system consists of:

1. **Chrome Extension** - Searches FamilySearch, MyHeritage, and Ancestry, extracts person records, handles Hebrew name variants
2. **Express API Server** - Generates name variants (Hebrew → English), manages Neo4j database
3. **Neo4j Graph Database** - Stores persons and family relationships

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Chrome Extension   │────▶│  Express Server     │────▶│  Neo4j Database     │
│  (popup + content)  │     │  (localhost:3002)   │     │  (cloud hosted)     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │                           │
         │                           ▼
         │                  ┌─────────────────────┐
         │                  │  Groq API (LLM)     │
         │                  │  Name transliteration│
         │                  └─────────────────────┘
         ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  FamilySearch.org   │     │  MyHeritage.com     │     │  Ancestry.com       │
│  (search results)   │     │  (search results)   │     │  (search results)   │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

## Key Directories

```
stav-agents/
├── src/
│   ├── server.ts              # Express API server (main entry point)
│   ├── db/
│   │   ├── neo4j-connection.ts    # Neo4j driver setup
│   │   ├── models/                # TypeScript interfaces
│   │   ├── services/
│   │   │   ├── person.service.ts  # CRUD + deduplication logic
│   │   │   ├── matching.service.ts # Duplicate detection algorithm
│   │   │   └── merge.service.ts    # Merge duplicate persons
│   │   ├── repositories/          # Raw Neo4j queries
│   │   └── utils/                 # Name/date parsing utilities
│   └── tools/                     # Test scripts
├── extension/
│   ├── manifest.json              # Chrome extension manifest (v3)
│   ├── popup/
│   │   ├── popup.js               # Main popup controller
│   │   ├── popup.html/.css        # UI
│   │   ├── services/
│   │   │   ├── SearchOrchestrator.js  # Multi-tab search + deduplication
│   │   │   ├── BackendAPI.js          # HTTP calls to Express server
│   │   │   └── ChromeExtensionAPI.js  # Chrome API wrapper
│   │   ├── components/            # UI components
│   │   ├── state/                 # State management
│   │   └── utils/                 # URL builders, helpers
│   ├── content/
│   │   ├── familysearch.js        # Content script for FamilySearch extraction
│   │   ├── myheritage.js          # Content script for MyHeritage extraction
│   │   └── ancestry.js            # Content script for Ancestry extraction
│   └── background/
│       └── background.js          # Service worker
└── Documents/
    └── instructions.md            # Detailed project requirements
```

## Common Commands

```bash
# Start the API server (required for extension to work)
npm run server

# Run FamilySearch extraction tests
npm run test:familysearch

# Test Hebrew name variant generation
npm run test:hebrew
```

## Configuration - IMPORTANT

**Backend URL is defined in ONE place only:** `extension/config.js`

```javascript
export const CONFIG = {
  BACKEND_URL: 'http://localhost:3002',  // <-- Change port here only!
  ...
};
```

- Server port: `src/server.ts` uses `PORT` env var, defaults to 3002
- Extension: `BackendAPI.js` imports from `config.js`
- **NEVER hardcode URLs** in popup.js or other files

## Key Technical Concepts

### 1. Hebrew Name Handling

Input names are in Hebrew and must be transliterated to English with multiple spellings:
- Hebrew: קיטלין → English variants: Kathleen, Kaitlyn, Caitlin, Katelyn...
- The Groq API (LLM) generates 5-10 likely English spellings
- Extension searches FamilySearch for top variants in parallel

### 2. Deduplication Strategy (Critical)

FamilySearch returns multiple records for the same person (census, death records, etc.) with **different FamilySearch IDs**. Deduplication happens at two levels:

| Level | Where | Deduplicates By | Thresholds |
|-------|-------|-----------------|------------|
| Extension | Before display | `name\|birthYear\|deathYear` | Exact match |
| Server | Before save | Name similarity + dates | 70% exact name, 75% similar |

**Important**: The server uses two-pass matching:
1. **First pass**: Exact name matches (lower threshold: 70%)
2. **Second pass**: Similar names (higher threshold: 75%)

This is because missing birth dates can lower confidence significantly (77.8% vs 84.9%).

### 3. Neo4j Schema

```cypher
// Core node
(:Person {
  personId: string,      // UUID we generate
  fsId: string,          // FamilySearch ID
  primaryName: string,   // Display name
  firstNames: [string],  // All known first names
  lastNames: [string],   // All known last names
  hebrewFirstName: string,
  hebrewLastName: string,
  birthDateText: string,
  birthYear: integer,
  birthPlace: string,
  deathDateText: string,
  deathYear: integer,
  deathPlace: string,
  sex: string
})

// Relationships
(:Person)-[:PARENT_OF]->(:Person)
(:Person)-[:CHILD_OF]->(:Person)
(:Person)-[:SPOUSE_OF]->(:Person)
(:Person)-[:SIBLING_OF]->(:Person)
(:Person)-[:SOURCED_FROM]->(:Source)
```

## Environment Variables

Required in `.env`:
```
GROQ_API=your_groq_api_key
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
NEO4J_DATABASE=neo4j
PORT=3002
```

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check with Neo4j status |
| `/api/variants` | POST | Generate English variants from Hebrew name |
| `/api/persons` | POST | Save extracted persons to Neo4j |
| `/api/persons` | GET | Search saved persons |
| `/api/persons/:id` | GET | Get person with relationships |
| `/api/persons/:id/family` | GET | Get immediate family |
| `/api/matching/find` | POST | Find potential duplicates |
| `/api/matching/merge` | POST | Merge duplicate persons |
| `/api/matching/deduplicate` | POST | Run bulk deduplication |
| `/api/stats` | GET | Database statistics |

## Development Notes

### Testing Deduplication

To test if deduplication is working:
1. Start server: `npm run server`
2. Use extension to search for a name with variants (e.g., "Larry" / "Lari" + "Lev")
3. Check server logs for `[PersonService] Found duplicate match:` messages
4. Verify in extension popup that same person appears once, not multiple times

### Common Issues

1. **Port 3002 already in use**: Kill old process with `taskkill //F //PID <pid>` (Windows)
2. **Extension not extracting**: Reload extension, ensure content script injected
3. **Low confidence matches**: Check if birth dates are missing in source records

### Code Conventions

- TypeScript for server code, JavaScript for extension
- Services layer handles business logic, repositories handle database queries
- Extension uses modular architecture: SearchOrchestrator → ChromeExtensionAPI/BackendAPI

## Workflow

1. User enters Hebrew name in extension popup
2. Extension calls `/api/variants` to get English spellings
3. User selects which variants to search
4. Extension opens multiple FamilySearch tabs (one per variant combination)
5. Content script extracts results from each tab
6. SearchOrchestrator deduplicates results client-side
7. User reviews results and clicks "Save to Database"
8. Server deduplicates against existing records before saving
9. Neo4j stores persons and family relationships

## Data Enrichment Architecture

The enrichment system fetches detailed data from source URLs (FamilySearch, MyHeritage) and merges it into person records.

### Enrichment Data Flow

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  detail.html    │────▶│  detail.js       │────▶│ EnrichmentService│────▶│ Content Scripts │
│  (UI display)   │     │  (render logic)  │     │ (orchestration)  │     │ (data extraction)│
└─────────────────┘     └──────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
                                                          ▼
                                                 ┌─────────────────┐
                                                 │  /api/analyze-  │
                                                 │  person (AI)    │
                                                 └─────────────────┘
```

### Key Files for Enrichment

| File | Purpose | When to Modify |
|------|---------|----------------|
| `extension/content/myheritage.js` | Extracts data from MyHeritage pages | Adding new fields from MyHeritage |
| `extension/content/familysearch.js` | Extracts data from FamilySearch pages | Adding new fields from FamilySearch |
| `extension/content/ancestry.js` | Extracts data from Ancestry pages | Adding new fields from Ancestry |
| `extension/popup/services/EnrichmentService.js` | Merges data from multiple sources | Adding new fields to merge logic |
| `extension/detail.html` | UI structure for enriched profile | Adding new display sections |
| `extension/detail.js` | Renders enriched data to UI | Adding render functions for new fields |
| `extension/detail.css` | Styling for enriched profile | Styling new sections |
| `src/server.ts` | AI analysis endpoint | Modifying AI prompts |

### Current Enrichment Fields

**Identity Fields:**
- birthDate, birthPlace, deathDate, deathPlace, sex
- nationality, lastResidence, maritalStatus, occupation

**Immigration/Travel Fields:**
- arrivalDate, departurePort, shipName

**Array Fields:**
- addresses (with year and source)
- occupations (with year and source)

**Family Fields:**
- parents, spouses, children, siblings, relatives

### Lessons Learned - Data Enrichment Checklist

When adding new data sources or fields, follow this checklist to avoid back-and-forth iterations:

#### 1. Content Script Extraction (FIRST)
- [ ] Add extraction logic in the relevant content script (`myheritage.js` or `familysearch.js`)
- [ ] Handle both Hebrew AND English labels (MyHeritage uses Hebrew: `אזרחות`, `מקצוע`, etc.)
- [ ] Extract `rawPageText` for AI analysis fallback
- [ ] Test extraction by logging to console before proceeding
- [ ] Return new fields in the `familyData` object from `extractFamilyFromDetailPage`

**Common Hebrew Labels (MyHeritage):**
```javascript
// Identity
'אזרחות' / 'Nationality'     → nationality
'מקום מגורים' / 'Residence'  → lastResidence
'מצב משפחתי' / 'Marital'     → maritalStatus
'מקצוע' / 'Occupation'       → occupation
'בן/בת זוג' / 'Spouse'       → spouse

// Immigration
'הגעה' / 'Arrival'           → arrivalDate
'עזיבה' / 'Departure'        → departurePort
'אניה' / 'Ship'              → shipName

// Relatives
'קרוב משפחה' / 'Relative'    → relatives[]
```

#### 2. EnrichmentService Merging (SECOND)
- [ ] Update `_mergeEnrichmentResults()` to merge new fields
- [ ] Use `this._mergeField()` for single-value fields with conflict handling
- [ ] Use `this._mergeFamily()` for array fields (family members)
- [ ] Add array merging logic for non-family arrays (addresses, occupations)

**Example - Adding a new field:**
```javascript
// In _mergeEnrichmentResults():
this._mergeField(merged, 'newFieldName', data.newFieldName, sourceName);

// For arrays:
if (data.newArray && data.newArray.length > 0) {
  merged.newArray = merged.newArray || [];
  for (const item of data.newArray) {
    // Deduplication logic...
    merged.newArray.push({ ...item, source: sourceName });
  }
}
```

#### 3. UI Display (THIRD)
- [ ] Add HTML structure in `detail.html` (info-rows, cards, lists)
- [ ] Add render function in `detail.js`
- [ ] Call render function from `renderAll()`
- [ ] Add CSS styles in `detail.css` (colors, spacing, responsive)
- [ ] Handle empty state (hide section if no data)

**Pattern for conditional sections:**
```javascript
function renderNewSection(person) {
  const card = document.getElementById('new-section-card');
  if (!person.newField) {
    card.classList.add('hidden');
    return;
  }
  card.classList.remove('hidden');
  // Render content...
}
```

#### 4. Server/API (IF NEEDED)
- [ ] Add/update API endpoint in `server.ts`
- [ ] **RESTART SERVER** after changes (`taskkill` old process, `npm run server`)
- [ ] Test endpoint with curl before testing in extension

#### 5. Testing
- [ ] Reload Chrome extension after changes
- [ ] Test with a person that has the new data type
- [ ] Check browser console for extraction logs
- [ ] Verify data appears in UI after enrichment

### Common Pitfalls to Avoid

1. **Forgetting to update EnrichmentService**: Content script extracts data but it's not merged into the person object. Always update `_mergeEnrichmentResults()`.

2. **Only updating popup hover, not detail page**: The popup hover (`PopupUI.js`) and detail page (`detail.html`/`detail.js`) are SEPARATE. Update both if needed.

3. **Not restarting server**: New API endpoints or changes to `server.ts` require server restart.

4. **Hebrew text patterns**: MyHeritage uses Hebrew labels. Always include Hebrew alternatives in regex patterns.

5. **Missing CSS for new sections**: New HTML sections need corresponding CSS for colors and layout.

6. **Not handling empty/missing data**: Always check if data exists before rendering, and hide sections gracefully.

### Supported Data Sources

Currently integrated sources:
- **FamilySearch** (familysearch.org) - Free genealogy records
- **MyHeritage** (myheritage.com/myheritage.co.il) - Requires paid account
- **Ancestry** (ancestry.com) - Requires paid account

### Adding a New Data Source

To add a new genealogy source:
1. Create new content script: `extension/content/[source].js`
2. Add to `manifest.json`:
   - Add URL to `host_permissions`
   - Add content_scripts entry with URL pattern
3. Implement message handlers: `ping`, `checkLogin`, `extractResults`, `extractFamilyFromDetailPage`
4. Update `extension/popup/utils/urlBuilder.js`:
   - Add source to `SOURCES` constant
   - Create `build[Source]SearchUrl()` function
   - Update `buildSearchUrlPermutations()` and `buildMultiSourceSearchUrls()`
5. Update `extension/popup/utils/contentScriptInjector.js`: Add URL detection in `getScriptPathForUrl()`
6. Update `extension/popup/services/SearchOrchestrator.js`: Add source detection and ID handling
7. Update `extension/popup/services/EnrichmentService.js`: Add source URL detection
8. Test extraction independently before integrating
