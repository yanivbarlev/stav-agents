import { BrowserContext, Page } from 'playwright';
import { createAuthenticatedBrowserFromCopy } from '../../playwright-auth-setup';

/**
 * FamilySearch Extraction Tool
 *
 * Extracts person data and family relationships from FamilySearch
 * using authenticated Playwright sessions.
 */

// ============================================================================
// INTERFACES
// ============================================================================

export interface SearchParams {
  firstName: string;
  lastName: string;
  birthYear?: number;
  birthYearRange?: number;  // default ±5 years
  deathYear?: number;
  location?: string;
  maxResults?: number;      // default 50
}

export interface ExtractedPerson {
  fsId: string;             // from ARK URL, e.g., "VDPH-2YD"
  fullName: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  birthPlace?: string;
  deathDate?: string;
  deathPlace?: string;
  sex?: string;
  sourceUrl: string;
  collectionName: string;
  parents: Array<{
    name: string;
    fsId: string;
    relationship: "Father" | "Mother";
    sex: string;
  }>;
  extractedAt: string;      // ISO timestamp
}

interface PersonStub {
  name: string;
  url: string;
  fsId: string;
  collectionName: string;
  birthDate?: string;
  birthPlace?: string;
  parents?: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract FamilySearch ID from ARK URL
 * @param url - ARK URL like "/ark:/61903/1:1:VDPH-2YD" or full URL
 * @returns FamilySearch ID like "VDPH-2YD"
 */
export function extractFsIdFromUrl(url: string): string {
  // Match pattern: /ark:/61903/1:1:ID or just the last part
  const match = url.match(/\/ark:\/\d+\/\d+:\d+:([^?&#]+)/);
  if (match && match[1]) {
    return match[1];
  }

  // Fallback: try to extract last meaningful segment
  const parts = url.split('/');
  const lastPart = parts[parts.length - 1].split('?')[0];
  return lastPart || 'UNKNOWN';
}

/**
 * Build FamilySearch search URL from parameters
 */
function buildSearchUrl(params: SearchParams): string {
  const baseUrl = 'https://www.familysearch.org/en/search/record/results';
  const queryParams = new URLSearchParams();

  // Name parameters
  if (params.firstName) {
    queryParams.append('q.givenName', params.firstName);
  }
  if (params.lastName) {
    queryParams.append('q.surname', params.lastName);
  }

  // Birth year with range
  if (params.birthYear) {
    const range = params.birthYearRange || 5;
    queryParams.append('q.birthLikeDate.from', String(params.birthYear - range));
    queryParams.append('q.birthLikeDate.to', String(params.birthYear + range));
  }

  // Death year
  if (params.deathYear) {
    queryParams.append('q.deathLikeDate.from', String(params.deathYear - 2));
    queryParams.append('q.deathLikeDate.to', String(params.deathYear + 2));
  }

  // Location
  if (params.location) {
    queryParams.append('q.birthLikePlace', params.location);
  }

  return `${baseUrl}?${queryParams.toString()}`;
}

/**
 * Delay execution for rate limiting with human-like randomness
 */
async function delay(ms: number): Promise<void> {
  // Add ±20% randomness to appear more human
  const variance = ms * 0.2;
  const actualDelay = ms + (Math.random() * variance * 2 - variance);
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

/**
 * Setup anti-detection measures on a page
 */
async function setupAntiDetection(page: Page): Promise<void> {
  // Set realistic HTTP headers
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1'
  });

  // Mask navigator.webdriver and other automation indicators
  await page.addInitScript(() => {
    // Remove webdriver property
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });

    // Add realistic plugins
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5]
    });

    // Set realistic languages
    Object.defineProperty(navigator, 'languages', {
      get: () => ['en-US', 'en']
    });

    // Mock chrome property
    (window as any).chrome = {
      runtime: {}
    };
  });
}

/**
 * Safe text extraction from page element
 */
async function safeTextContent(page: Page, selector: string): Promise<string | null> {
  try {
    const element = await page.$(selector);
    if (element) {
      return await element.textContent();
    }
  } catch (error) {
    // Element not found
  }
  return null;
}

// ============================================================================
// MAIN EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Search FamilySearch and extract person stubs from results
 *
 * @param params - Search parameters
 * @returns Array of person stubs with basic info and detail URLs
 */
export async function searchFamilySearch(params: SearchParams): Promise<ExtractedPerson[]> {
  const maxResults = params.maxResults || 50;
  const searchUrl = buildSearchUrl(params);

  console.log('\n=== FamilySearch Search ===');
  console.log(`Search URL: ${searchUrl}`);
  console.log(`Max results: ${maxResults}`);

  const context = await createAuthenticatedBrowserFromCopy(false);
  const page = await context.newPage();

  // Setup anti-detection measures
  await setupAntiDetection(page);

  try {
    // Navigate to search results
    console.log('Navigating to search results...');
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(3000); // Increased from 2s to 3s

    // Extract person stubs from current page
    const personStubs: PersonStub[] = [];
    let currentPage = 1;
    let totalExtracted = 0;

    while (totalExtracted < maxResults) {
      console.log(`\nExtracting from page ${currentPage}...`);

      // Wait for results table
      try {
        await page.waitForSelector('table tbody tr', { timeout: 10000 });
      } catch (error) {
        console.log('No results found or timeout waiting for table');
        break;
      }

      // Extract person stubs from current page
      const pageStubs = await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('table tbody tr'));

        return rows.map(row => {
          // Extract name and URL
          const nameLink = row.querySelector('h2 strong a') as HTMLAnchorElement;
          if (!nameLink) return null;

          const name = nameLink.textContent?.trim() || '';
          const url = nameLink.href || '';

          // Extract collection name
          const collectionElem = row.querySelector('h2 generic:nth-of-type(2)');
          const collectionName = collectionElem?.textContent?.trim() || '';

          // Extract birth info
          const birthSection = row.querySelector('td:last-child');
          let birthDate = '';
          let birthPlace = '';

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

          // Extract parents
          const parentsSection = Array.from(row.querySelectorAll('strong'))
            .find(s => s.textContent?.includes('Parents'));
          const parents = parentsSection?.parentElement?.textContent
            ?.replace('Parents', '').trim() || '';

          return {
            name,
            url,
            collectionName,
            birthDate,
            birthPlace,
            parents
          };
        }).filter(Boolean);
      });

      // Add valid stubs
      for (const stub of pageStubs) {
        if (stub && stub.url) {
          personStubs.push({
            ...stub,
            fsId: extractFsIdFromUrl(stub.url)
          });
          totalExtracted++;

          if (totalExtracted >= maxResults) {
            break;
          }
        }
      }

      console.log(`Extracted ${pageStubs.length} results from page ${currentPage} (total: ${totalExtracted})`);

      // Check if we need to go to next page
      if (totalExtracted < maxResults) {
        // Try to click next button
        const nextButton = await page.$('button:has-text("Go to next Page")');
        const isDisabled = nextButton ? await nextButton.getAttribute('disabled') : true;

        if (nextButton && !isDisabled) {
          console.log('Moving to next page...');
          await nextButton.click();
          await delay(4000); // Increased from 2s to 4s for more human-like behavior
          await page.waitForLoadState('networkidle');
          currentPage++;
        } else {
          console.log('No more pages available');
          break;
        }
      } else {
        break;
      }
    }

    console.log(`\nTotal person stubs extracted: ${personStubs.length}`);

    // Now extract full details for each person
    console.log('\n=== Extracting Full Person Details ===');
    const extractedPersons: ExtractedPerson[] = [];

    for (let i = 0; i < personStubs.length; i++) {
      const stub = personStubs[i];
      console.log(`\nExtracting details for ${i + 1}/${personStubs.length}: ${stub.name}`);

      try {
        const person = await extractPersonDetails(stub.url, context);
        extractedPersons.push(person);
        console.log(`✓ Successfully extracted ${person.fullName} (${person.fsId})`);
      } catch (error) {
        console.error(`✗ Failed to extract ${stub.name}:`, error instanceof Error ? error.message : error);
      }

      // Rate limiting - increased delay for anti-detection
      if (i < personStubs.length - 1) {
        await delay(3000); // Increased from 1.5s to 3s
      }
    }

    console.log(`\n=== Extraction Complete ===`);
    console.log(`Successfully extracted ${extractedPersons.length} out of ${personStubs.length} persons`);

    return extractedPersons;

  } finally {
    await context.close();
  }
}

/**
 * Extract full person details from a detail page
 *
 * @param detailUrl - ARK detail page URL
 * @param context - Optional existing browser context (for reuse)
 * @returns Complete ExtractedPerson object
 */
export async function extractPersonDetails(
  detailUrl: string,
  context?: BrowserContext
): Promise<ExtractedPerson> {
  const shouldCloseContext = !context;
  const browserContext = context || await createAuthenticatedBrowserFromCopy(false);
  const page = await browserContext.newPage();

  // Setup anti-detection measures
  await setupAntiDetection(page);

  try {
    // Navigate to detail page
    await page.goto(detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await delay(2000); // Increased from 1s to 2s

    // Extract person details from the page
    const personData = await page.evaluate(() => {
      // Extract name from h1
      const h1 = document.querySelector('h1');
      const fullName = h1?.textContent?.trim() || '';

      // Extract collection info
      const h2 = document.querySelector('h2');
      const collectionText = h2?.textContent?.trim() || '';
      const collectionName = collectionText.split('•')[1]?.trim() || collectionText;

      // Extract person details from table
      const detailsTable = document.querySelector('table[caption*="person details"]');
      const rows = detailsTable?.querySelectorAll('tbody tr') || [];

      const details: Record<string, string> = {};
      rows.forEach(row => {
        const header = row.querySelector('th')?.textContent?.trim();
        const value = row.querySelector('td strong')?.textContent?.trim();
        if (header && value) {
          details[header] = value;
        }
      });

      // Extract parents from "Parents and Siblings" section
      const parentsHeading = Array.from(document.querySelectorAll('h3'))
        .find(h => h.textContent?.includes('Parents and Siblings'));

      const parents: Array<{
        name: string;
        url: string;
        relationship: string;
        sex: string;
      }> = [];

      if (parentsHeading) {
        const parentsTable = parentsHeading.closest('div')?.querySelector('table');
        const parentRows = parentsTable?.querySelectorAll('tbody tr') || [];

        parentRows.forEach(row => {
          const nameLink = row.querySelector('a') as HTMLAnchorElement;
          const relationshipElem = row.querySelector('generic');
          const sexCell = row.querySelectorAll('td')[1];

          if (nameLink && relationshipElem) {
            const name = nameLink.textContent?.trim() || '';
            const url = nameLink.href || '';
            const relationship = relationshipElem.textContent?.trim() || '';
            const sex = sexCell?.textContent?.trim() || '';

            parents.push({ name, url, relationship, sex });
          }
        });
      }

      return {
        fullName,
        collectionName,
        details,
        parents
      };
    });

    // Parse name into first and last
    const nameParts = personData.fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Build ExtractedPerson object
    const extractedPerson: ExtractedPerson = {
      fsId: extractFsIdFromUrl(detailUrl),
      fullName: personData.fullName,
      firstName,
      lastName,
      birthDate: personData.details['Event Date'] || personData.details['Birth Date'],
      birthPlace: personData.details['Event Place'] || personData.details['Birth Place'],
      deathDate: personData.details['Death Date'],
      deathPlace: personData.details['Death Place'],
      sex: personData.details['Sex'],
      sourceUrl: detailUrl,
      collectionName: personData.collectionName,
      parents: personData.parents.map(p => ({
        name: p.name,
        fsId: extractFsIdFromUrl(p.url),
        relationship: p.relationship === 'Father' ? 'Father' : 'Mother',
        sex: p.sex
      })),
      extractedAt: new Date().toISOString()
    };

    return extractedPerson;

  } finally {
    await page.close();
    if (shouldCloseContext) {
      await browserContext.close();
    }
  }
}

// ============================================================================
// EXPORT DEFAULT
// ============================================================================

export default {
  searchFamilySearch,
  extractPersonDetails,
  extractFsIdFromUrl
};
