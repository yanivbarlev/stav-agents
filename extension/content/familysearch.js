// FamilySearch Hebrew Name Search - Content Script
// Runs on FamilySearch pages to perform searches and extract data

console.log('[FS Extension] Content script loaded on:', window.location.href);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FS Extension] Received message:', message);

  if (message.action === 'ping') {
    sendResponse({ status: 'ready' });
    return false;
  }

  if (message.action === 'search') {
    performSearch(message.params)
      .then(results => sendResponse(results))
      .catch(error => sendResponse({ error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'extractResults') {
    try {
      const results = extractCurrentPageResults();
      sendResponse({ persons: results });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return false;
  }

  if (message.action === 'checkLogin') {
    const isLoggedIn = checkLoginStatus();
    sendResponse({ isLoggedIn });
    return false;
  }
});

/**
 * Check if user is logged into FamilySearch
 */
function checkLoginStatus() {
  // Look for sign-in button
  const signInBtn = document.querySelector('[data-testid="signIn"]') ||
                    document.querySelector('a[href*="signin"]');

  // Check for sign-in button by text content
  const buttons = Array.from(document.querySelectorAll('button'));
  const signInByText = buttons.find(b =>
    b.textContent && b.textContent.toLowerCase().includes('sign in')
  );

  // Look for user menu
  const userMenu = document.querySelector('[data-testid="userMenu"]') ||
                   document.querySelector('.user-menu') ||
                   document.querySelector('[aria-label*="user"]');

  // If there's a user menu but no sign-in button, likely logged in
  return !signInBtn && !signInByText || !!userMenu;
}

/**
 * Delay helper with random variance
 */
function delay(ms) {
  const variance = ms * 0.2;
  const actualDelay = ms + (Math.random() * variance * 2 - variance);
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Extract FamilySearch ID from ARK URL
 */
function extractFsIdFromUrl(url) {
  const match = url.match(/\/ark:\/\d+\/\d+:\d+:([^?&#]+)/);
  if (match && match[1]) {
    return match[1];
  }
  const parts = url.split('/');
  const lastPart = parts[parts.length - 1].split('?')[0];
  return lastPart || 'UNKNOWN';
}

/**
 * Build search URL from parameters
 */
function buildSearchUrl(firstName, lastName, params) {
  const baseUrl = 'https://www.familysearch.org/en/search/record/results';
  const queryParams = new URLSearchParams();

  if (firstName) {
    queryParams.append('q.givenName', firstName);
  }
  if (lastName) {
    queryParams.append('q.surname', lastName);
  }
  if (params.birthYear) {
    const range = params.yearRange || 5;
    queryParams.append('q.birthLikeDate.from', String(params.birthYear - range));
    queryParams.append('q.birthLikeDate.to', String(params.birthYear + range));
  }

  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Extract person stubs from current search results page
 */
function extractCurrentPageResults() {
  console.log('[FS Extract] Starting extraction on:', window.location.href);
  const persons = [];

  // Try multiple possible selectors for results
  let rows = document.querySelectorAll('table tbody tr');
  console.log('[FS Extract] Found table tbody tr rows:', rows.length);

  if (rows.length === 0) {
    // Try alternative selector
    rows = document.querySelectorAll('[data-testid="search-result-row"]');
    console.log('[FS Extract] Found data-testid rows:', rows.length);
  }

  if (rows.length === 0) {
    // Try finding any results container
    rows = document.querySelectorAll('.search-result, .result-item, article');
    console.log('[FS Extract] Found generic result rows:', rows.length);
  }

  console.log('[FS Extract] Processing', rows.length, 'rows');

  rows.forEach((row, index) => {
    try {
      console.log(`[FS Extract] Processing row ${index + 1}`);
      const nameLink = row.querySelector('h2 strong a');
      console.log(`[FS Extract] Row ${index + 1} nameLink:`, nameLink);
      if (!nameLink) return;

      const name = nameLink.textContent?.trim() || '';
      const url = nameLink.href || '';
      const fsId = extractFsIdFromUrl(url);

      // Get collection name
      const collectionElem = row.querySelector('h2 generic:nth-of-type(2)');
      const collectionName = collectionElem?.textContent?.trim() || '';

      // Get birth info
      let birthDate = '';
      let birthPlace = '';

      const birthSection = row.querySelector('td:last-child');
      if (birthSection) {
        const birthStrong = Array.from(birthSection.querySelectorAll('strong'))
          .find(s => s.textContent?.includes('Birth'));

        if (birthStrong) {
          const birthContainer = birthStrong.parentElement;
          const generics = birthContainer?.querySelectorAll('generic');

          if (generics && generics.length >= 2) {
            birthDate = generics[0]?.textContent?.trim() || '';
            birthPlace = generics[1]?.textContent?.trim() || '';
          }
        }
      }

      // Get death info
      let deathDate = '';
      let deathPlace = '';

      if (birthSection) {
        const deathStrong = Array.from(birthSection.querySelectorAll('strong'))
          .find(s => s.textContent?.includes('Death'));

        if (deathStrong) {
          const deathContainer = deathStrong.parentElement;
          const generics = deathContainer?.querySelectorAll('generic');

          if (generics && generics.length >= 2) {
            deathDate = generics[0]?.textContent?.trim() || '';
            deathPlace = generics[1]?.textContent?.trim() || '';
          }
        }
      }

      // Get parents
      const parentsSection = Array.from(row.querySelectorAll('strong'))
        .find(s => s.textContent?.includes('Parents'));
      const parentsText = parentsSection?.parentElement?.textContent
        ?.replace('Parents', '').trim() || '';

      // Parse name into first and last
      const nameParts = name.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const person = {
        fsId,
        fullName: name,
        firstName,
        lastName,
        birthDate,
        birthPlace,
        deathDate,
        deathPlace,
        sourceUrl: url,
        collectionName,
        parents: parentsText ? [{ name: parentsText, relationship: 'Parents' }] : [],
        extractedAt: new Date().toISOString()
      };

      console.log(`[FS Extract] Successfully extracted:`, person);
      persons.push(person);
    } catch (err) {
      console.error('[FS Extract] Error extracting row:', err);
    }
  });

  console.log(`[FS Extract] FINAL: Extracted ${persons.length} persons from page`);
  console.log('[FS Extract] Returning persons:', persons);
  return persons;
}

/**
 * Wait for search results to load
 */
async function waitForResults(timeout = 15000) {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    // Check for results table
    const table = document.querySelector('table tbody tr');
    if (table) {
      await delay(500); // Extra wait for rendering
      return true;
    }

    // Check for "no results" message
    const noResults = document.querySelector('[data-testid="no-results"]') ||
                      document.body.textContent?.includes('No results found');
    if (noResults) {
      return false;
    }

    await delay(500);
  }

  return false;
}

/**
 * Navigate to next page of results
 * @returns true if navigated, false if no more pages
 */
async function goToNextPage() {
  // Find next button by aria-label or text content
  const nextButton = document.querySelector('button[aria-label*="next"]') ||
                     Array.from(document.querySelectorAll('button'))
                       .find(b => {
                         const text = b.textContent?.toLowerCase() || '';
                         return text.includes('next') || text.includes('go to next');
                       });

  if (!nextButton) {
    console.log('[FS Extension] No next button found');
    return false;
  }

  const isDisabled = nextButton.disabled ||
                     nextButton.getAttribute('aria-disabled') === 'true';

  if (isDisabled) {
    console.log('[FS Extension] Next button is disabled');
    return false;
  }

  nextButton.click();
  await delay(3000);
  await waitForResults();
  return true;
}

/**
 * Perform search for a single name variant
 */
async function searchVariant(firstName, lastName, params) {
  const url = buildSearchUrl(firstName, lastName, params);
  console.log(`[FS Extension] Searching: ${firstName} ${lastName}`);
  console.log(`[FS Extension] URL: ${url}`);

  // Navigate to search URL
  window.location.href = url;

  // Wait for navigation and results
  await new Promise(resolve => {
    const checkInterval = setInterval(() => {
      if (document.readyState === 'complete') {
        clearInterval(checkInterval);
        resolve();
      }
    }, 100);
  });

  await delay(2000);
  const hasResults = await waitForResults();

  if (!hasResults) {
    console.log(`[FS Extension] No results for: ${firstName} ${lastName}`);
    return [];
  }

  // Extract results from all pages (up to maxResults)
  const allPersons = [];
  const maxResults = params.maxResults || 20;
  let pageNum = 1;

  while (allPersons.length < maxResults) {
    const pagePersons = extractCurrentPageResults();
    console.log(`[FS Extension] Page ${pageNum}: Found ${pagePersons.length} results`);

    for (const person of pagePersons) {
      if (allPersons.length >= maxResults) break;
      person.matchedVariant = `${firstName} ${lastName}`;
      allPersons.push(person);
    }

    if (allPersons.length >= maxResults) break;

    // Try to go to next page
    const hasMore = await goToNextPage();
    if (!hasMore) break;

    pageNum++;
  }

  console.log(`[FS Extension] Total for "${firstName} ${lastName}": ${allPersons.length}`);
  return allPersons;
}

/**
 * Main search function - called from popup
 * Searches multiple variant combinations and deduplicates results
 */
async function performSearch(params) {
  console.log('[FS Extension] Starting search with params:', params);

  const { firstNameVariants, lastNameVariants, birthYear, yearRange, maxResults } = params;

  // Check login status
  if (!checkLoginStatus()) {
    console.warn('[FS Extension] User may not be logged in');
  }

  // Create search combinations (limit to top 3 each to avoid too many searches)
  const firstNames = (firstNameVariants || ['']).slice(0, 3);
  const lastNames = (lastNameVariants || ['']).slice(0, 3);

  const combinations = [];
  for (const firstName of firstNames) {
    for (const lastName of lastNames) {
      if (firstName || lastName) {
        combinations.push({ firstName, lastName });
      }
    }
  }

  console.log(`[FS Extension] Will search ${combinations.length} combinations`);

  // Since we can't do true parallel searches in the same tab,
  // we'll search sequentially but collect all results
  const allResults = [];
  const seenIds = new Set();

  for (let i = 0; i < combinations.length; i++) {
    const { firstName, lastName } = combinations[i];

    try {
      // For the first search, we're already on the page
      // For subsequent searches, we need to navigate
      if (i > 0) {
        await delay(2000); // Rate limiting between searches
      }

      const persons = await searchVariant(firstName, lastName, {
        birthYear,
        yearRange,
        maxResults: Math.ceil(maxResults / combinations.length)
      });

      // Deduplicate by fsId
      for (const person of persons) {
        if (!seenIds.has(person.fsId)) {
          seenIds.add(person.fsId);
          person.searchedVariants = combinations.map(c => `${c.firstName} ${c.lastName}`);
          allResults.push(person);

          if (allResults.length >= maxResults) break;
        }
      }

      if (allResults.length >= maxResults) break;

    } catch (error) {
      console.error(`[FS Extension] Error searching "${firstName} ${lastName}":`, error);
    }
  }

  console.log(`[FS Extension] Search complete. Total unique results: ${allResults.length}`);

  return {
    persons: allResults.slice(0, maxResults),
    totalSearched: combinations.length,
    timestamp: new Date().toISOString()
  };
}

// Notify that content script is ready
console.log('[FS Extension] Content script ready');
