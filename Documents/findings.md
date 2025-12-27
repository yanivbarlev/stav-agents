# Research Findings

## Task 1: FamilySearch Search Page Exploration

**Date**: 2025-12-26
**Objective**: Explore FamilySearch search page structure to understand how to extract person data and family relationships

---

### Authentication Requirements
- **Requires login**: FamilySearch redirects to `https://ident.familysearch.org/en/identity/login/` before showing search results
- Must be signed in to access any search result data
- Multiple auth methods available: Google, Facebook, Apple, Church Account, or username/password

### Authentication Solution (Playwright)
**Implemented**: Persistent Chrome profile authentication

**Setup**:
- Chrome profile location (Windows): `C:\Users\User\AppData\Local\Google\Chrome\User Data\Default`
- Playwright config: `playwright-auth-setup.js`
- Copied profile location: `./chrome-profile-copy/`

**How It Works**:
1. User logs into FamilySearch in Chrome browser (one-time)
2. Close Chrome and run `npm run setup`
3. Script copies Chrome profile (including `Network/Cookies` file) to project directory
4. Playwright uses copied profile for all subsequent runs
5. User can reopen Chrome - Playwright uses independent copy

**Key Files Copied**:
- `Network/Cookies` - Authentication cookies (4.2MB, locked when Chrome is running)
- `Local Storage` - Session data
- `Session Storage` - Temporary session data
- `IndexedDB` - Structured data storage
- `Preferences` - Browser preferences
- `Web Data` - Form autofill and saved data

**Usage**:
```javascript
const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');
const context = await createAuthenticatedBrowserFromCopy();
const page = await context.newPage();
// Now authenticated!
```

**Important Notes**:
- Chrome locks profile files while running - must close Chrome for initial setup
- After setup, Chrome can run normally - Playwright uses the copied profile
- If authentication expires, run `npm run setup:clean` to refresh
- Profile copy is in `.gitignore` - never commit (contains sensitive cookies)

**Tested Working URLs** (all require authentication):
- Family Tree Search: `https://www.familysearch.org/en/search/tree/name`
- Historic Records: `https://www.familysearch.org/en/search/record/results?q.anyDate.from=1950&q.birthLikePlace=indiana&q.givenName=larry&q.surname=bird`
- Tree Search Results: `https://www.familysearch.org/en/search/tree/results?[params]`
- Memories (not yet active): `https://www.familysearch.org/en/memories/find`

**Note**: Some URLs may redirect if user hasn't set up their family tree. Use the search URLs above to bypass this.

---

### Search Results Page Structure

**URL Pattern**:
```
https://www.familysearch.org/en/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950
```

**Results Display**:
- Results shown in a `<table>` element with rowgroups
- Total count displayed in heading: "Historical Record Search Results (2,276,116)"
- Default: 20 results per page
- Configurable options: 10, 20, 50, or 100 results per page

**Each Search Result Row Contains**:
1. **"More" button** (first cell) - for additional actions
2. **Name cell** with:
   - Person's name as clickable `<link>` element
   - Name wrapped in `<strong>` tag
   - "Principal" label indicating main person in record
   - Collection name (e.g., "Texas, Birth Index, 1903-1997")
   - "View record details" link with icon
3. **Events and Relationships cell** with:
   - Event type (e.g., "Birth") in `<strong>` tag
   - Event date in `<generic>` element (e.g., "2 April 1945")
   - Event location in `<generic>` element (e.g., "Wichita, Texas")
   - Parents section with `<strong>` "Parents" label
   - Parents' names as comma-separated text

**Example Search Result Row**:
```
Name: John Wesley Smith
Collection: Texas, Birth Index, 1903-1997
Birth: 2 April 1945
Location: Wichita, Texas
Parents: William Russell Smith, Mary Ann Archer
```

---

### Detail Page URL Pattern

**Format**: `/ark:/61903/1:1:{UNIQUE_ID}?lang=en`

**Examples**:
- `/ark:/61903/1:1:VDPH-2YD?lang=en` (John Wesley Smith)
- `/ark:/61903/1:1:VDPH-2YZ?lang=en` (William Russell Smith - father)
- `/ark:/61903/1:1:VDPH-2Y8?lang=en` (Mary Ann Archer - mother)

**Behavior**: Links open in new tab by default

---

### Pagination Mechanism

**Type**: Page number navigation with Previous/Next buttons

**Elements**:
- Previous button: `button "Go to previous Page. Currently on Page X of Y"` (disabled on page 1)
- Current page input: `spinbutton "Enter Page number"` with current page value
- Page indicator: Text showing "Page {current} of {total}" (e.g., "Page 1 of 245")
- Next button: `button "Go to next Page. Currently on Page X of Y"`
- Results per page selector: `combobox "Results per page:"` with options [10, 20, 50, 100]

**Total Results**: 2,276,116 results across 245 pages (at 20 results/page)

---

### Detail Page Structure

**Page Title Format**: `{Name}, "{Collection Name}"`
**Example**: `John Wesley Smith, "Texas, Birth Index, 1903-1997"`

#### Main Person Details Table

**Selector**: `table` with caption `"{Name} person details"`

**Fields Available** (as table rows):
- Name
- Sex (Male/Female)
- Father's Name (as clickable link)
- Father's Sex
- Mother's Name (as clickable link)
- Mother's Sex
- Event Type (e.g., "Birth")
- Event Date (e.g., "02 Apr 1945")
- Event Place (e.g., "Wichita, Texas")
- Event Place (Original) - standardized vs original location

**Table Structure**:
```
<table>
  <caption>{Name} person details</caption>
  <rowgroup>
    <row>
      <rowheader>Field Name</rowheader>
      <cell><strong>Field Value</strong></cell>
    </row>
    ...
  </rowgroup>
</table>
```

#### Family Relationships Section

**Heading**: `"{Name}'s Parents and Siblings"` (level 3)

**Structure**: Table with expandable rows for each family member

**Parent Row (Collapsed)**:
- `<rowheader>`: Contains parent's name as link and relationship label ("Father"/"Mother")
- Sex cell: Shows "M" or "F"
- Expand button cell: `button "Click to expand this section"`

**Parent Row (Expanded)**:
- Reveals nested table with parent's details
- Table caption: `"{Parent Name} person details"`
- Shows parent's Name and Sex fields
- Button changes to: `button "Click to collapse this section"`

**Parent Link URLs**: Same ARK format as detail pages (`/ark:/61903/1:1:{ID}?lang=en`)

**Example Family Structure**:
```
Parents and Siblings Section:
├── William Russell Smith (Father, M) [/ark:/61903/1:1:VDPH-2YZ]
│   └── Expandable details: Name, Sex
└── Mary Ann Archer (Mother, F) [/ark:/61903/1:1:VDPH-2Y8]
    └── Expandable details: Name, Sex
```

---

### Additional Page Features

**Actions Available**:
- Save button
- Edit button (disabled - likely requires special permissions)
- Share button

**Related Sections**:
- Document Information (expandable)
- Collection Information with link to collection and wiki
- Cite This Record (with copy button)
- Tree section (to attach record to family tree)
- "Is {Name} your relative?" section
- Similar Records section

---

### Key Selectors for Extraction

#### Search Results Page

| Element | Selector/Pattern |
|---------|------------------|
| Results table | `table` in main content area |
| Result rows | `row` elements in `rowgroup` (skip header row) |
| Person name | `link` within `heading` level 2 |
| Person URL | Extract `href` attribute from name link |
| Collection name | Text after "Principal" label in heading |
| Birth date | `generic` element after `strong "Birth"` |
| Birth location | Second `generic` element in birth section |
| Parents names | Text after `strong "Parents"` |

#### Detail Page

| Element | Selector/Pattern |
|---------|------------------|
| Main table | `table` with caption ending in "person details" |
| Field rows | `row` elements with `rowheader` and `cell` pairs |
| Field name | Text in `rowheader` |
| Field value | `strong` element inside `cell` |
| Parents section | Heading containing "Parents and Siblings" |
| Parent rows | Rows containing relationship labels ("Father"/"Mother") |
| Parent name | `link` text in `rowheader` |
| Parent URL | `href` attribute from parent name link |
| Parent relationship | Text after parent name link ("Father"/"Mother") |
| Parent sex | Cell text following `rowheader` (M/F) |

---

### Recommended Extraction Strategy

1. **Authenticate**: Handle FamilySearch login (required before any data access)

2. **Search Results Extraction**:
   - Navigate to search URL with query parameters
   - Extract all person links from table rows (20 per page)
   - Store: name, collection, birth date, birth location, parents, detail URL
   - Handle pagination: iterate through all pages or limit to N pages

3. **Detail Page Extraction**:
   - Visit each person's detail URL (`/ark:/61903/1:1:{ID}`)
   - Parse main person details table
   - Extract all available fields (name, sex, dates, locations, etc.)

4. **Family Relationship Extraction**:
   - Locate "Parents and Siblings" section
   - Extract parent rows (typically 2: father and mother)
   - For each parent:
     - Extract: name, relationship, sex, detail URL
     - Store URL for recursive processing

5. **Recursive Family Tree Building**:
   - Maintain queue of person URLs to visit
   - For each person URL:
     - Extract person details
     - Extract parent URLs
     - Add parent URLs to queue
   - Track visited URLs to avoid duplicates
   - Implement depth limit or stopping criteria

6. **Data Storage**:
   - Store in graph structure (nodes = persons, edges = relationships)
   - Each person node: {id, name, sex, birth_date, birth_place, ...}
   - Each relationship edge: {person_id, parent_id, relationship_type}

---

### Important Notes

- **Rate Limiting**: Consider adding delays between requests to avoid overloading server
- **Session Management**: Maintain authenticated session throughout extraction
- **Error Handling**: Some records may have missing fields or broken links
- **Infinite Recursion**: Use depth limit when following parent chains
- **Tab Management**: Links open in new tabs - may need to handle tab switching
- **Data Completeness**: Not all records have complete parent information

---

### Technical Observations

- Page uses accessibility-focused snapshot structure
- Elements identified by `ref` attributes for interaction
- Console shows some Apollo GraphQL errors (can be ignored)
- Page uses React/modern JavaScript framework
- Some records have "attached tree person" indicating integration with family trees
- Parent records can be clicked to navigate recursively up the family tree
