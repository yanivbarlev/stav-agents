# Ancestry.com Integration Plan

**Date:** January 25, 2026
**Scope:** Full integration (Search + Detail Pages + Enrichment)
**Target:** ancestry.com (US domain)
**Auth:** Paid account available for testing

---

## Overview

Add Ancestry.com as a third data source alongside FamilySearch and MyHeritage. This plan follows the existing architecture and the guidelines in `adding-source-guidelines.md`.

---

## Phase 1: Research & Analysis (Before Coding)

### 1.1 Analyze Ancestry.com Structure

**Tasks:**
1. Log into Ancestry.com and analyze:
   - Search results page URL pattern
   - Search query parameters (name, birth year, death year, location)
   - Individual record page URL pattern
   - DOM structure for extracting results
   - DOM structure for detail/record pages

2. Document findings:
   - Search URL format
   - CSS selectors for result cards
   - CSS selectors for person details
   - How Ancestry IDs are structured

**Deliverable:** Document with URL patterns and CSS selectors

### 1.2 Check for Anti-Bot Protection

**Potential issues:**
- CAPTCHA challenges
- Rate limiting
- Session token requirements
- Cloudflare/Incapsula protection (like FamilySearch had)

**Mitigation strategies:**
- Use logged-in browser session (content script runs in user's authenticated context)
- Add delays between requests
- Respect robots.txt where applicable

---

## Phase 2: Manifest & Configuration Updates

### 2.1 Update manifest.json

Add Ancestry content script and host permissions:

```json
{
  "host_permissions": [
    "https://www.familysearch.org/*",
    "https://www.myheritage.com/*",
    "https://www.myheritage.co.il/*",
    "https://www.ancestry.com/*",      // ADD
    "http://localhost/*"
  ],

  "content_scripts": [
    // ... existing scripts ...
    {
      "matches": ["https://www.ancestry.com/*"],
      "js": ["content/ancestry.js"],
      "run_at": "document_idle"
    }
  ]
}
```

### 2.2 Update extension/config.js

Add Ancestry source constant:

```javascript
export const CONFIG = {
  BACKEND_URL: 'http://localhost:3002',
  SOURCES: {
    FAMILYSEARCH: 'FamilySearch',
    MYHERITAGE: 'MyHeritage',
    ANCESTRY: 'Ancestry'  // ADD
  }
};
```

---

## Phase 3: URL Builder

### 3.1 Create Ancestry URL Builder

**File:** `extension/popup/utils/urlBuilder.js`

Add function to build Ancestry search URLs:

```javascript
export function buildAncestrySearchUrl(params) {
  // Research needed: Ancestry's actual search URL structure
  // Example structure (to be verified):
  const baseUrl = 'https://www.ancestry.com/search/';
  const searchParams = new URLSearchParams();

  if (params.firstName) searchParams.set('name', params.firstName);
  if (params.lastName) searchParams.set('name_x', params.lastName);
  if (params.birthYear) {
    searchParams.set('birth', params.birthYear);
    searchParams.set('birth_x', '1-5'); // +/- 5 years
  }
  if (params.deathYear) {
    searchParams.set('death', params.deathYear);
    searchParams.set('death_x', '1-5');
  }

  return `${baseUrl}?${searchParams.toString()}`;
}
```

### 3.2 Update buildMultiSourceSearchUrls()

Add Ancestry to the multi-source URL builder:

```javascript
export function buildMultiSourceSearchUrls(variants, options = {}) {
  const urls = [];

  if (options.includeFamilySearch !== false) {
    urls.push(...buildSearchUrlPermutations(variants, 'FamilySearch'));
  }
  if (options.includeMyHeritage !== false) {
    urls.push(...buildSearchUrlPermutations(variants, 'MyHeritage'));
  }
  if (options.includeAncestry !== false) {  // ADD
    urls.push(...buildSearchUrlPermutations(variants, 'Ancestry'));
  }

  return urls;
}
```

---

## Phase 4: Content Script

### 4.1 Create extension/content/ancestry.js

**Structure (based on existing patterns):**

```javascript
// extension/content/ancestry.js

console.log('[Ancestry] Content script loaded');

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Ancestry] Received message:', message.action);

  switch (message.action) {
    case 'ping':
      sendResponse({ success: true, source: 'ancestry' });
      return true;

    case 'checkLogin':
      sendResponse({ loggedIn: checkLoginStatus() });
      return true;

    case 'extractResults':
      extractSearchResults().then(sendResponse);
      return true; // async

    case 'extractFamilyFromDetailPage':
      extractDetailPage().then(sendResponse);
      return true; // async
  }
});

function checkLoginStatus() {
  // TODO: Find selector for logged-in indicator
  // Example: Look for user menu, avatar, or sign-out link
  return document.querySelector('[data-testid="user-menu"]') !== null;
}

async function extractSearchResults() {
  const results = [];

  // TODO: Find correct selector for result cards
  const cards = document.querySelectorAll('.searchResult, [data-testid="result-card"]');

  for (const card of cards) {
    const result = {
      ancestryId: extractAncestryId(card),
      fullName: extractText(card, '.name, [data-testid="name"]'),
      birthDate: extractText(card, '.birth, [data-testid="birth"]'),
      birthPlace: extractText(card, '.birthPlace'),
      deathDate: extractText(card, '.death, [data-testid="death"]'),
      deathPlace: extractText(card, '.deathPlace'),
      sourceUrl: extractLink(card),
      collectionName: extractText(card, '.collection'),
      source: 'Ancestry',
      extractedAt: new Date().toISOString()
    };

    if (result.fullName) {
      results.push(result);
    }
  }

  return { results, source: 'Ancestry' };
}

async function extractDetailPage() {
  // TODO: Extract detailed family information
  const familyData = {
    // Identity
    fullName: extractText(document, 'h1, .personName'),
    birthDate: null,
    birthPlace: null,
    deathDate: null,
    deathPlace: null,

    // Family
    parents: [],
    spouses: [],
    children: [],
    siblings: [],

    // Additional
    rawPageText: document.body.innerText.slice(0, 10000),
    source: 'Ancestry'
  };

  return { familyData };
}

// Helper functions
function extractText(parent, selector) {
  const el = parent.querySelector(selector);
  return el ? el.textContent.trim() : null;
}

function extractLink(card) {
  const link = card.querySelector('a[href*="/person/"], a[href*="/tree/"]');
  return link ? link.href : null;
}

function extractAncestryId(card) {
  const link = card.querySelector('a[href]');
  if (link) {
    // TODO: Parse Ancestry's ID format from URL
    const match = link.href.match(/person\/(\d+)|tree\/\d+\/person\/(\d+)/);
    return match ? (match[1] || match[2]) : null;
  }
  return null;
}
```

---

## Phase 5: SearchOrchestrator Integration

### 5.1 Update Tab Handling

The SearchOrchestrator already handles multiple sources. Updates needed:

1. **Add Ancestry to source detection:**
```javascript
_getSourceFromUrl(url) {
  if (url.includes('familysearch.org')) return 'FamilySearch';
  if (url.includes('myheritage.com') || url.includes('myheritage.co.il')) return 'MyHeritage';
  if (url.includes('ancestry.com')) return 'Ancestry';  // ADD
  return 'Unknown';
}
```

2. **Add Ancestry ID to deduplication:**
```javascript
// In _deduplicateResults or similar
if (result.ancestryId) {
  const key = `ancestry-${result.ancestryId}`;
  // ... dedup logic
}
```

3. **Add source tag handling:**
```javascript
// Support new combinations: "FS+AN", "MH+AN", "FS+MH+AN"
```

---

## Phase 6: EnrichmentService Integration

### 6.1 Update Source Detection

**File:** `extension/popup/services/EnrichmentService.js`

```javascript
_getSourceFromUrl(url) {
  if (url.includes('familysearch.org')) return 'FamilySearch';
  if (url.includes('myheritage.com')) return 'MyHeritage';
  if (url.includes('ancestry.com')) return 'Ancestry';  // ADD
  return null;
}
```

### 6.2 Update Content Script Injection

Ensure `contentScriptInjector.js` knows about Ancestry:

```javascript
const SOURCE_SCRIPTS = {
  'familysearch.org': 'content/familysearch.js',
  'myheritage.com': 'content/myheritage.js',
  'ancestry.com': 'content/ancestry.js'  // ADD
};
```

---

## Phase 7: Testing Strategy

### 7.1 Unit Testing (Manual)

1. **Content Script Injection:**
   - Open Ancestry.com search page
   - Check console for "[Ancestry] Content script loaded"
   - Test ping response

2. **Search Extraction:**
   - Perform a search on Ancestry
   - Send `extractResults` message
   - Verify results array is populated

3. **Detail Page Extraction:**
   - Open a person detail page
   - Send `extractFamilyFromDetailPage` message
   - Verify family data extraction

### 7.2 Integration Testing

1. **Multi-Source Search:**
   - Enter Hebrew name in extension
   - Enable all three sources
   - Verify Ancestry tabs open and extract

2. **Cross-Source Deduplication:**
   - Search for same person across sources
   - Verify deduplication merges correctly
   - Check sourceTag shows all sources (e.g., "FS+MH+AN")

3. **Enrichment:**
   - Click "Enrich" on a result with Ancestry source
   - Verify family data is extracted and merged

---

## Phase 8: Implementation Order

### Step-by-Step Execution:

| Step | Task | Estimated Effort |
|------|------|------------------|
| 1 | Research Ancestry DOM structure (browser inspection) | Discovery |
| 2 | Update manifest.json with Ancestry permissions | 5 min |
| 3 | Create basic ancestry.js with ping handler | 15 min |
| 4 | Test content script loads | 5 min |
| 5 | Implement extractSearchResults() | 30 min |
| 6 | Add Ancestry URL builder | 20 min |
| 7 | Update SearchOrchestrator source detection | 10 min |
| 8 | Test search flow end-to-end | 15 min |
| 9 | Implement extractDetailPage() | 30 min |
| 10 | Update EnrichmentService | 15 min |
| 11 | Full integration testing | 20 min |
| 12 | Fix issues and polish | Variable |

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Ancestry has bot protection | High - blocks extraction | Use authenticated session, add delays |
| DOM structure changes | Medium - breaks selectors | Use multiple fallback selectors, test regularly |
| Different URL structure than expected | Low - delays implementation | Research thoroughly in Phase 1 |
| Rate limiting | Medium - slows searches | Add configurable delays between requests |
| Session expiration | Low - requires re-login | Detect and prompt user |

---

## Success Criteria

- [ ] Ancestry appears as option in search sources
- [ ] Search results extract correctly from Ancestry
- [ ] Results deduplicate with FS and MH records
- [ ] Detail page extraction works for family data
- [ ] Enrichment merges Ancestry data correctly
- [ ] Source tag shows "AN" or combinations (FS+AN, etc.)
- [ ] No console errors during normal operation

---

## Notes from Previous Attempts

Based on conversation history:
- Ancestry integration was previously attempted
- Issue was with results not showing in the app
- SearchOrchestrator.js had content script injection issues
- **Lesson:** Test content script injection early and thoroughly

---

## Implementation Checklist

Mark each step with ~~strikethrough~~ when complete.

### Phase 1: Research
- [ ] 1.1 Open Ancestry.com and log in
- [ ] 1.2 Document search page URL pattern
- [ ] 1.3 Document search query parameters
- [ ] 1.4 Document result card CSS selectors
- [ ] 1.5 Document detail page URL pattern
- [ ] 1.6 Document detail page CSS selectors for family data
- [ ] 1.7 Identify Ancestry ID format in URLs

### Phase 2: Manifest & Config
- [ ] 2.1 Add `https://www.ancestry.com/*` to host_permissions in manifest.json
- [ ] 2.2 Add ancestry.js content script entry to manifest.json
- [ ] 2.3 Reload extension and verify no errors

### Phase 3: Content Script (Basic)
- [ ] 3.1 Create `extension/content/ancestry.js` with console.log
- [ ] 3.2 Add ping message handler
- [ ] 3.3 Add checkLogin handler
- [ ] 3.4 Reload extension
- [ ] 3.5 Open Ancestry.com, verify "[Ancestry] Content script loaded" in console
- [ ] 3.6 Test ping from extension DevTools

### Phase 4: URL Builder
- [ ] 4.1 Add ANCESTRY to SOURCES in urlBuilder.js
- [ ] 4.2 Create buildAncestrySearchUrl() function
- [ ] 4.3 Update buildSearchUrlPermutations() to handle Ancestry
- [ ] 4.4 Update buildMultiSourceSearchUrls() to include Ancestry
- [ ] 4.5 Test URL generation manually

### Phase 5: Search Results Extraction
- [ ] 5.1 Implement extractSearchResults() in ancestry.js
- [ ] 5.2 Extract: ancestryId, fullName, birthDate, birthPlace, deathDate, deathPlace
- [ ] 5.3 Extract: sourceUrl, collectionName
- [ ] 5.4 Test extraction on Ancestry search results page
- [ ] 5.5 Verify results array is populated correctly

### Phase 6: SearchOrchestrator Integration
- [ ] 6.1 Add Ancestry to _getSourceFromUrl()
- [ ] 6.2 Add ancestryId to deduplication logic
- [ ] 6.3 Update source tag generation (AN, FS+AN, MH+AN, FS+MH+AN)
- [ ] 6.4 Test multi-source search with Ancestry enabled
- [ ] 6.5 Verify Ancestry results appear in popup

### Phase 7: Detail Page Extraction
- [ ] 7.1 Implement extractFamilyFromDetailPage() in ancestry.js
- [ ] 7.2 Extract parents array
- [ ] 7.3 Extract spouses array
- [ ] 7.4 Extract children array
- [ ] 7.5 Extract siblings array (if available)
- [ ] 7.6 Extract rawPageText for AI analysis
- [ ] 7.7 Test on Ancestry person detail page

### Phase 8: EnrichmentService Integration
- [ ] 8.1 Update _getSourceFromUrl() in EnrichmentService.js
- [ ] 8.2 Update contentScriptInjector.js with Ancestry script path
- [ ] 8.3 Test enrichment flow with Ancestry source
- [ ] 8.4 Verify family data merges correctly

### Phase 9: Final Testing
- [ ] 9.1 Test Hebrew name search across all 3 sources
- [ ] 9.2 Verify cross-source deduplication works
- [ ] 9.3 Verify source tags display correctly (FS+MH+AN)
- [ ] 9.4 Test enrichment from Ancestry detail page
- [ ] 9.5 Check for console errors
- [ ] 9.6 Test with multiple different searches

### Phase 10: Cleanup & Commit
- [ ] 10.1 Remove debug console.logs (keep essential ones)
- [ ] 10.2 Update CLAUDE.md with Ancestry documentation
- [ ] 10.3 Commit changes with descriptive message
- [ ] 10.4 Mark this plan as COMPLETE

---

## Progress Tracking

**Current Phase:** Not started
**Blockers:** None
**Last Updated:** -

---

## Completion Criteria

All boxes checked above, plus:
- [ ] Ancestry search returns results
- [ ] Results deduplicate correctly with FS and MH
- [ ] Detail page enrichment works
- [ ] No console errors in normal operation
- [ ] Code committed to repository

---

## Next Steps

1. **Approve this plan** - Review and confirm approach
2. **Phase 1 Research** - I'll inspect Ancestry.com DOM structure using browser
3. **Begin Implementation** - Start with manifest and basic content script
