# Adding a New Data Source - Comprehensive Guide

This document provides step-by-step instructions for integrating a new genealogical data source into the Heir Search System. Follow this guide to ensure consistent integration with the existing architecture.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Phase 1: Source Analysis](#phase-1-source-analysis)
4. [Phase 2: Content Script Development](#phase-2-content-script-development)
5. [Phase 3: Integration with EnrichmentService](#phase-3-integration-with-enrichmentservice)
6. [Phase 4: UI Display Updates](#phase-4-ui-display-updates)
7. [Phase 5: Testing & Verification](#phase-5-testing--verification)
8. [Code Templates](#code-templates)
9. [Field Reference](#field-reference)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Current Data Flow

```
User clicks "Enrich"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  EnrichmentService.enrichPerson()                               │
│  - Extracts source URLs from person.sources[]                   │
│  - Determines source type from URL                              │
│  - Opens background tab for each source                         │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  Content Script (per source)                                    │
│  - familysearch.js for familysearch.org                         │
│  - myheritage.js for myheritage.com/.co.il                      │
│  - [NEW] yoursource.js for yoursource.com                       │
│                                                                 │
│  Handles message: { action: 'extractFamilyFromDetailPage' }     │
│  Returns: { familyData: { ... extracted fields ... } }          │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  EnrichmentService._mergeEnrichmentResults()                    │
│  - Merges data from all sources                                 │
│  - Handles field conflicts (stores alternatives)                │
│  - Deduplicates family members                                  │
│  - Saves to chrome.storage.local                                │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│  detail.js render functions                                     │
│  - renderIdentity(), renderFamily(), renderImmigration(), etc.  │
│  - Displays merged data in detail.html                          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `extension/manifest.json` | Declares content scripts and URL patterns |
| `extension/content/*.js` | Content scripts for each data source |
| `extension/popup/services/EnrichmentService.js` | Orchestrates enrichment, merges data |
| `extension/popup/utils/contentScriptInjector.js` | Ensures content scripts are loaded |
| `extension/detail.html` | UI structure for enriched profile |
| `extension/detail.js` | Renders enriched data to UI |
| `extension/detail.css` | Styling for enriched profile |

---

## Prerequisites

Before adding a new source, ensure you understand:

1. **The source website structure** - How data is organized on the page
2. **URL patterns** - How to identify source URLs (for manifest.json)
3. **Authentication requirements** - Does the source require login?
4. **Language considerations** - Hebrew, English, or both?
5. **Rate limiting** - Does the source have anti-bot protections?

---

## Phase 1: Source Analysis

### Step 1.1: Identify URL Patterns

Visit the source website and note the URL patterns for:
- Search results pages
- Individual record/person detail pages

**Example patterns:**
```
FamilySearch: https://www.familysearch.org/ark:/61903/1:1:*
MyHeritage:   https://www.myheritage.com/research/record-*
              https://www.myheritage.co.il/research/record-*
Genealogy.IL: https://genealogy.org.il/AID/*
```

### Step 1.2: Analyze Page Structure

Open browser DevTools (F12) on a detail page and identify:

1. **Container elements** for person data
2. **Label patterns** (Hebrew and/or English)
3. **Data structure** (tables, divs, spans)
4. **Dynamic content** (SPA rendering delays)

Document the CSS selectors or XPath for each field:

```markdown
## [Source Name] Page Structure

### Person Name
- Selector: `.person-name h1` or `[data-testid="name"]`
- Example: "Isaac Sobiborski"

### Birth Date
- Label: "Birth" / "לידה"
- Selector: `.fact-row:contains("Birth") .fact-value`
- Example: "1885"

### Family Members
- Container: `.family-section`
- Parent selector: `.parent-item`
- Spouse selector: `.spouse-item`
```

### Step 1.3: Test Manual Extraction

In browser console, test your selectors:

```javascript
// Test name extraction
document.querySelector('.person-name')?.textContent

// Test birth date
document.querySelector('[data-fact="birth"]')?.textContent

// Test family members
document.querySelectorAll('.family-member').forEach(el => console.log(el.textContent))
```

---

## Phase 2: Content Script Development

### Step 2.1: Create Content Script File

Create `extension/content/[sourcename].js`:

```javascript
/**
 * [Source Name] Content Script
 * Extracts person and family data from [source] detail pages
 */

(function() {
  'use strict';

  console.log('[SourceName] Content script loaded');

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('[SourceName] Received message:', request.action);

    if (request.action === 'extractFamilyFromDetailPage') {
      try {
        const familyData = extractFamilyData();
        console.log('[SourceName] Extracted data:', familyData);
        sendResponse({ familyData });
      } catch (error) {
        console.error('[SourceName] Extraction error:', error);
        sendResponse({ error: error.message });
      }
      return true; // Keep channel open for async response
    }

    // Ping to check if content script is loaded
    if (request.action === 'ping') {
      sendResponse({ status: 'ready', source: 'SourceName' });
      return true;
    }
  });

  /**
   * Main extraction function
   */
  function extractFamilyData() {
    const data = {
      // Identity fields
      fullName: extractName(),
      birthDate: extractField('birth', 'date'),
      birthPlace: extractField('birth', 'place'),
      deathDate: extractField('death', 'date'),
      deathPlace: extractField('death', 'place'),
      sex: extractSex(),

      // Additional identity fields
      nationality: extractField('nationality'),
      lastResidence: extractField('residence'),
      maritalStatus: extractField('marital'),
      occupation: extractField('occupation'),

      // Immigration fields (if applicable)
      arrivalDate: extractField('arrival'),
      departurePort: extractField('departure'),
      shipName: extractField('ship'),

      // Family members
      parents: extractFamilyMembers('parent'),
      spouses: extractFamilyMembers('spouse'),
      children: extractFamilyMembers('child'),
      siblings: extractFamilyMembers('sibling'),
      relatives: extractRelatives(),

      // Arrays
      addresses: extractAddresses(),
      occupations: extractOccupations(),

      // Raw text for AI analysis fallback
      rawPageText: document.body.innerText.substring(0, 10000),
      rawRecord: extractRawRecord()
    };

    return data;
  }

  /**
   * Extract person's name
   */
  function extractName() {
    // Implement based on source structure
    const nameEl = document.querySelector('.person-name, h1.name, [data-testid="name"]');
    return nameEl?.textContent?.trim() || null;
  }

  /**
   * Extract a specific field by label
   * @param {string} fieldType - Type of field (birth, death, etc.)
   * @param {string} subType - Sub-type (date, place) - optional
   */
  function extractField(fieldType, subType = null) {
    // Define label patterns for this source (Hebrew + English)
    const labelPatterns = {
      birth: {
        date: /(?:birth|born|לידה|נולד).*?(?:date|תאריך)?/i,
        place: /(?:birth|born|לידה|נולד).*?(?:place|מקום)/i
      },
      death: {
        date: /(?:death|died|פטירה|נפטר).*?(?:date|תאריך)?/i,
        place: /(?:death|died|פטירה|נפטר).*?(?:place|מקום)/i
      },
      nationality: /(?:nationality|citizenship|אזרחות|לאום)/i,
      residence: /(?:residence|address|מגורים|כתובת)/i,
      marital: /(?:marital|married|מצב משפחתי)/i,
      occupation: /(?:occupation|profession|מקצוע|עיסוק)/i,
      arrival: /(?:arrival|arrived|הגעה)/i,
      departure: /(?:departure|port|עזיבה|נמל)/i,
      ship: /(?:ship|vessel|אניה|ספינה)/i
    };

    const pattern = subType ? labelPatterns[fieldType]?.[subType] : labelPatterns[fieldType];
    if (!pattern) return null;

    // Method 1: Look in structured data rows
    const rows = document.querySelectorAll('.fact-row, .data-row, tr, .info-item');
    for (const row of rows) {
      const text = row.textContent;
      if (pattern.test(text)) {
        // Extract value (adjust selector based on source structure)
        const valueEl = row.querySelector('.value, .fact-value, td:last-child, .info-value');
        if (valueEl) return valueEl.textContent.trim();

        // Fallback: split by colon or tab
        const match = text.match(/[:|\t]\s*(.+)/);
        if (match) return match[1].trim();
      }
    }

    // Method 2: Regex on full page text
    const pageText = document.body.innerText;
    const textMatch = pageText.match(new RegExp(pattern.source + '[:\\s]+([^\\n\\t]+)', 'i'));
    if (textMatch) return textMatch[1].trim();

    return null;
  }

  /**
   * Extract sex/gender
   */
  function extractSex() {
    const text = document.body.innerText.toLowerCase();

    // Check explicit labels
    const sexMatch = text.match(/(?:sex|gender|מין)[:\s]+([^\n\t]+)/i);
    if (sexMatch) {
      const value = sexMatch[1].toLowerCase();
      if (value.includes('male') || value.includes('זכר')) return 'Male';
      if (value.includes('female') || value.includes('נקבה')) return 'Female';
    }

    // Infer from relationship labels
    if (text.includes('husband') || text.includes('בעל') || text.includes('father') || text.includes('אב')) {
      return 'Male';
    }
    if (text.includes('wife') || text.includes('אישה') || text.includes('mother') || text.includes('אם')) {
      return 'Female';
    }

    return null;
  }

  /**
   * Extract family members of a specific type
   * @param {string} memberType - parent, spouse, child, sibling
   */
  function extractFamilyMembers(memberType) {
    const members = [];

    // Define section selectors and labels for this source
    const sectionConfig = {
      parent: {
        selectors: ['.parents-section', '.parent-list', '[data-section="parents"]'],
        labels: /(?:parent|father|mother|אב|אם|הורים)/i
      },
      spouse: {
        selectors: ['.spouse-section', '.spouse-list', '[data-section="spouses"]'],
        labels: /(?:spouse|husband|wife|בן זוג|בת זוג|בעל|אישה)/i
      },
      child: {
        selectors: ['.children-section', '.child-list', '[data-section="children"]'],
        labels: /(?:child|son|daughter|ילד|בן|בת|ילדים)/i
      },
      sibling: {
        selectors: ['.siblings-section', '.sibling-list', '[data-section="siblings"]'],
        labels: /(?:sibling|brother|sister|אח|אחות|אחים)/i
      }
    };

    const config = sectionConfig[memberType];
    if (!config) return members;

    // Try structured sections first
    for (const selector of config.selectors) {
      const section = document.querySelector(selector);
      if (section) {
        const items = section.querySelectorAll('.member, .person-link, li, a[href*="person"]');
        items.forEach(item => {
          const name = item.textContent?.trim();
          if (name && name.length > 1) {
            members.push({
              name: name,
              relationship: memberType
            });
          }
        });
        if (members.length > 0) return members;
      }
    }

    // Fallback: Parse from text using labels
    const pageText = document.body.innerText;
    const regex = new RegExp(config.labels.source + '[:\\s]+([^\\n]+)', 'gi');
    let match;
    while ((match = regex.exec(pageText)) !== null) {
      const name = match[1].trim();
      if (name && name.length > 1 && !members.some(m => m.name === name)) {
        members.push({
          name: name,
          relationship: memberType
        });
      }
    }

    return members;
  }

  /**
   * Extract relatives (cousins, extended family)
   */
  function extractRelatives() {
    const relatives = [];
    const pageText = document.body.innerText;

    // Patterns for relative mentions with relationship type
    const patterns = [
      /(?:relative|קרוב משפחה)[:\s]+([^,\n]+?)(?:\s*[-–]\s*|\s*\()?(\w+)?/gi,
      /(?:cousin|דוד|דודה)[:\s]+([^\n]+)/gi,
      /(?:uncle|aunt|nephew|niece)[:\s]+([^\n]+)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(pageText)) !== null) {
        const name = match[1].trim();
        const relType = match[2]?.trim() || 'relative';

        if (name && name.length > 1 && !relatives.some(r => r.name === name)) {
          relatives.push({
            name: name,
            relationship: relType
          });
        }
      }
    }

    return relatives;
  }

  /**
   * Extract addresses with years
   */
  function extractAddresses() {
    const addresses = [];
    const pageText = document.body.innerText;

    // Look for address patterns
    const patterns = [
      /(?:address|residence|מגורים|כתובת)[:\s]+([^,\n]+?)(?:\s*\((\d{4})\))?/gi,
      /(\d{4})[:\s]+([^,\n]+(?:street|st\.|ave|road|רחוב)[^,\n]*)/gi
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(pageText)) !== null) {
        const address = match[1]?.trim() || match[2]?.trim();
        const year = match[2]?.match(/\d{4}/)?.[0] || match[1]?.match(/\d{4}/)?.[0];

        if (address && !addresses.some(a => a.address === address)) {
          addresses.push({
            address: address,
            year: year || null
          });
        }
      }
    }

    return addresses;
  }

  /**
   * Extract occupations with years
   */
  function extractOccupations() {
    const occupations = [];
    const pageText = document.body.innerText;

    const pattern = /(?:occupation|profession|מקצוע|עיסוק)[:\s]+([^,\n]+?)(?:\s*\((\d{4})\))?/gi;
    let match;
    while ((match = pattern.exec(pageText)) !== null) {
      const occupation = match[1].trim();
      const year = match[2] || null;

      if (occupation && !occupations.some(o => o.occupation === occupation)) {
        occupations.push({
          occupation: occupation,
          year: year
        });
      }
    }

    return occupations;
  }

  /**
   * Extract raw record text (for displaying original record)
   */
  function extractRawRecord() {
    // Look for a "raw record" or "original text" section
    const rawSection = document.querySelector('.raw-record, .original-text, .record-text');
    if (rawSection) {
      return rawSection.textContent.trim();
    }

    // Fallback: extract main content area
    const mainContent = document.querySelector('main, .content, .record-content');
    if (mainContent) {
      return mainContent.textContent.substring(0, 2000).trim();
    }

    return null;
  }

})();
```

### Step 2.2: Update manifest.json

Add the content script declaration:

```json
{
  "content_scripts": [
    {
      "matches": [
        "https://www.familysearch.org/*"
      ],
      "js": ["content/familysearch.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://www.myheritage.com/*",
        "https://www.myheritage.co.il/*"
      ],
      "js": ["content/myheritage.js"],
      "run_at": "document_idle"
    },
    {
      "matches": [
        "https://genealogy.org.il/*"
      ],
      "js": ["content/genealogy-il.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### Step 2.3: Test Content Script Independently

1. Reload extension in `chrome://extensions`
2. Navigate to a detail page on the new source
3. Open DevTools Console (F12)
4. Verify "[SourceName] Content script loaded" appears
5. Test extraction manually:

```javascript
// In browser console
chrome.runtime.sendMessage({action: 'extractFamilyFromDetailPage'}, response => {
  console.log('Extracted data:', response);
});
```

---

## Phase 3: Integration with EnrichmentService

### Step 3.1: Update URL Detection

In `extension/popup/services/EnrichmentService.js`, update `_fetchFromSource()`:

```javascript
async _fetchFromSource(source) {
  // Determine which content script to use based on URL
  const isFamilySearch = source.url.includes('familysearch.org');
  const isMyHeritage = source.url.includes('myheritage.com') || source.url.includes('myheritage.co.il');
  const isGenealogyIL = source.url.includes('genealogy.org.il');  // NEW

  if (!isFamilySearch && !isMyHeritage && !isGenealogyIL) {  // UPDATED
    throw new Error(`Unsupported source URL: ${source.url}`);
  }

  // ... rest of the method
}
```

### Step 3.2: Verify Merge Logic

Ensure `_mergeEnrichmentResults()` handles all fields your content script extracts. The existing implementation should handle standard fields, but verify:

```javascript
// In _mergeEnrichmentResults():

// Single-value fields (automatically handled by _mergeField)
this._mergeField(merged, 'nationality', data.nationality, sourceName);
this._mergeField(merged, 'lastResidence', data.lastResidence, sourceName);
// ... etc

// Array fields (verify these are being merged)
merged.relatives = this._mergeFamily(merged.relatives, data.relatives, sourceName, 'relative');

// Custom arrays (add if your source has unique array fields)
if (data.customArray && data.customArray.length > 0) {
  merged.customArray = merged.customArray || [];
  for (const item of data.customArray) {
    // Add deduplication logic
    merged.customArray.push({ ...item, source: sourceName });
  }
}
```

### Step 3.3: Add Source Tag Support (Optional)

If you want a distinct visual tag for the new source, update the source tag logic:

```javascript
// In SearchOrchestrator or wherever source tags are generated
function getSourceTag(sources) {
  const hasFS = sources.some(s => s.url?.includes('familysearch.org'));
  const hasMH = sources.some(s => s.url?.includes('myheritage.com'));
  const hasGIL = sources.some(s => s.url?.includes('genealogy.org.il'));

  if (hasFS && hasMH && hasGIL) return 'ALL';
  if (hasFS && hasMH) return 'FS+MH';
  if (hasFS && hasGIL) return 'FS+GIL';
  // ... etc
}
```

---

## Phase 4: UI Display Updates

### Step 4.1: Verify Existing Fields Display

The existing `detail.html` and `detail.js` should already display standard fields. Verify by checking:

- `renderIdentity()` - handles birthDate, deathDate, nationality, etc.
- `renderFamily()` - handles parents, spouses, children, siblings, relatives
- `renderImmigration()` - handles arrivalDate, departurePort, shipName
- `renderAddresses()` - handles addresses array
- `renderOccupations()` - handles occupations array

### Step 4.2: Add Source-Specific Sections (If Needed)

If your source has unique data types, add new sections:

**detail.html:**
```html
<!-- Custom Section for New Source -->
<section id="custom-section-card" class="card card-custom full-width hidden">
  <div class="card-header">
    <h2>Custom Data</h2>
    <div class="card-accent custom-color"></div>
  </div>
  <div class="card-body" id="custom-section-content">
    <p class="empty-state">No custom data found</p>
  </div>
</section>
```

**detail.js:**
```javascript
// Add to renderAll()
function renderAll(person) {
  // ... existing renders
  renderCustomSection(person);  // NEW
}

// New render function
function renderCustomSection(person) {
  const card = document.getElementById('custom-section-card');
  const container = document.getElementById('custom-section-content');

  if (!person.customData || person.customData.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  container.innerHTML = person.customData.map(item => `
    <div class="custom-item">
      <span class="custom-text">${item.value}</span>
      ${item.source ? `<span class="source-indicator">${item.source}</span>` : ''}
    </div>
  `).join('');
}
```

**detail.css:**
```css
.card-accent.custom-color {
  background: linear-gradient(90deg, #your-color-1, #your-color-2);
}

.custom-item {
  padding: 10px 14px;
  margin-bottom: 8px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  border-left: 3px solid #your-color;
}
```

---

## Phase 5: Testing & Verification

### Step 5.1: Unit Test Content Script

Create a test file or use browser console:

```javascript
// Test extraction on a known record
const testUrl = 'https://genealogy.org.il/AID/some-record-id';

// Manual test in browser console after navigating to the URL:
chrome.runtime.sendMessage({action: 'extractFamilyFromDetailPage'}, response => {
  console.log('=== Extraction Test Results ===');
  console.log('Full Name:', response.familyData?.fullName);
  console.log('Birth:', response.familyData?.birthDate, response.familyData?.birthPlace);
  console.log('Death:', response.familyData?.deathDate, response.familyData?.deathPlace);
  console.log('Parents:', response.familyData?.parents);
  console.log('Spouses:', response.familyData?.spouses);
  console.log('Children:', response.familyData?.children);
  console.log('Raw text length:', response.familyData?.rawPageText?.length);
});
```

### Step 5.2: Integration Test

1. Find a person in your existing search results that has a record in the new source
2. Manually add the new source URL to the person's sources array:

```javascript
// In browser console on popup
const data = await chrome.storage.local.get(['currentDetailPerson']);
const person = data.currentDetailPerson;
person.sources.push({
  id: 'test-source-id',
  name: 'Genealogy.IL',
  url: 'https://genealogy.org.il/AID/test-record',
  collection: 'Test Collection',
  enriched: false
});
await chrome.storage.local.set({ currentDetailPerson: person });
```

3. Open detail page and click "Enrich from Sources"
4. Verify data appears correctly

### Step 5.3: End-to-End Test Checklist

- [ ] Content script loads on source pages (check console)
- [ ] Extraction returns valid data structure
- [ ] EnrichmentService recognizes new source URLs
- [ ] Data merges correctly with existing data
- [ ] Conflicts create alternatives (not overwrite)
- [ ] Family members deduplicate properly
- [ ] UI displays all extracted fields
- [ ] Empty sections are hidden gracefully
- [ ] Source indicators show correct source name

---

## Code Templates

### Minimal Content Script Template

```javascript
/**
 * [Source Name] Content Script - Minimal Version
 */
(function() {
  'use strict';

  console.log('[SourceName] Content script loaded');

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractFamilyFromDetailPage') {
      const data = {
        fullName: document.querySelector('YOUR_NAME_SELECTOR')?.textContent?.trim(),
        birthDate: extractByLabel(/birth|לידה/i),
        birthPlace: null,
        deathDate: extractByLabel(/death|פטירה/i),
        deathPlace: null,
        sex: null,
        parents: [],
        spouses: [],
        children: [],
        siblings: [],
        relatives: [],
        rawPageText: document.body.innerText.substring(0, 10000)
      };
      sendResponse({ familyData: data });
      return true;
    }
    if (request.action === 'ping') {
      sendResponse({ status: 'ready' });
      return true;
    }
  });

  function extractByLabel(labelPattern) {
    const text = document.body.innerText;
    const match = text.match(new RegExp(labelPattern.source + '[:\\s]+([^\\n]+)', 'i'));
    return match ? match[1].trim() : null;
  }
})();
```

### Manifest Entry Template

```json
{
  "matches": ["https://your-source.com/*"],
  "js": ["content/your-source.js"],
  "run_at": "document_idle"
}
```

---

## Field Reference

### Standard Fields (Always Include)

| Field | Type | Description |
|-------|------|-------------|
| `fullName` | string | Person's full name |
| `birthDate` | string | Birth date (any format) |
| `birthPlace` | string | Birth location |
| `deathDate` | string | Death date |
| `deathPlace` | string | Death location |
| `sex` | string | "Male" or "Female" |
| `parents` | array | Array of {name, relationship} |
| `spouses` | array | Array of {name, relationship} |
| `children` | array | Array of {name, relationship} |
| `siblings` | array | Array of {name, relationship} |
| `rawPageText` | string | First 10K chars for AI fallback |

### Extended Fields (Include If Available)

| Field | Type | Description |
|-------|------|-------------|
| `nationality` | string | Nationality/citizenship |
| `lastResidence` | string | Last known residence |
| `maritalStatus` | string | Married/Single/Widowed |
| `occupation` | string | Primary occupation |
| `arrivalDate` | string | Immigration arrival date |
| `departurePort` | string | Port of departure |
| `shipName` | string | Ship name for immigration |
| `relatives` | array | Extended family (cousins, etc.) |
| `addresses` | array | {address, year} objects |
| `occupations` | array | {occupation, year} objects |
| `rawRecord` | string | Original record text if available |

---

## Troubleshooting

### Content Script Not Loading

1. Check manifest.json URL pattern matches the page
2. Reload extension after manifest changes
3. Check for JavaScript errors in DevTools
4. Verify `run_at` timing (try `document_end` if data loads dynamically)

### Extraction Returns Empty

1. Page may use dynamic rendering - add delay:
   ```javascript
   await new Promise(resolve => setTimeout(resolve, 2000));
   ```
2. Check if content is in iframes
3. Verify selectors match current page structure
4. Test selectors manually in DevTools

### Data Not Appearing in UI

1. Check EnrichmentService console logs
2. Verify `_mergeEnrichmentResults()` handles your fields
3. Check chrome.storage.local for merged data
4. Verify render function is called in `renderAll()`

### Duplicates in Family Lists

1. Check `_mergeFamily()` deduplication logic
2. Ensure name normalization is consistent
3. Verify sourceRefs are being added correctly

### Hebrew Text Not Matching

1. Use regex with both Hebrew and English alternatives
2. Handle RTL text direction
3. Check for hidden Unicode characters
4. Use `.normalize('NFC')` for text comparison

---

## Summary Checklist

When adding a new data source, complete these steps in order:

### Phase 1: Analysis
- [ ] Document URL patterns
- [ ] Map page structure and selectors
- [ ] Test selectors in DevTools

### Phase 2: Content Script
- [ ] Create `extension/content/[source].js`
- [ ] Implement `extractFamilyFromDetailPage` handler
- [ ] Handle Hebrew + English labels
- [ ] Include `rawPageText` for AI fallback
- [ ] Update `manifest.json` with URL patterns
- [ ] Test extraction independently

### Phase 3: Integration
- [ ] Update `EnrichmentService._fetchFromSource()` URL detection
- [ ] Verify `_mergeEnrichmentResults()` handles all fields
- [ ] Add source tag support (optional)

### Phase 4: UI
- [ ] Verify existing fields display correctly
- [ ] Add custom sections if needed (HTML + JS + CSS)
- [ ] Handle empty states

### Phase 5: Testing
- [ ] Unit test content script
- [ ] Integration test enrichment flow
- [ ] End-to-end test with real data
- [ ] Verify deduplication works
