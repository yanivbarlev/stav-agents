import { createAuthenticatedBrowserFromCopy } from '../../playwright-auth-setup';

/**
 * Debug script to test FamilySearch search and see what's on the page
 */

async function debugSearch() {
  console.log('\n=== FamilySearch Debug ===\n');

  const context = await createAuthenticatedBrowserFromCopy(false); // headless = false
  const page = await context.newPage();

  // Setup anti-detection
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none'
  });

  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });

  try {
    const searchUrl = 'https://www.familysearch.org/en/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950&q.birthLikePlace=Texas';

    console.log(`Navigating to: ${searchUrl}`);
    await page.goto(searchUrl, { waitUntil: 'load', timeout: 60000 });

    console.log('\nWaiting 10 seconds for page to settle (for any JS challenges)...');
    await page.waitForTimeout(10000);

    const url = page.url();
    const title = await page.title();

    console.log(`Current URL: ${url}`);
    console.log(`Page Title: ${title}`);

    // Check if table exists
    const tableExists = await page.$('table');
    console.log(`\nTable exists: ${!!tableExists}`);

    if (tableExists) {
      // Count rows
      const rowCount = await page.$$eval('table tbody tr', rows => rows.length);
      console.log(`Number of rows: ${rowCount}`);

      // Get page HTML snippet
      const tableHTML = await page.$eval('table', el => el.outerHTML.substring(0, 500));
      console.log(`\nTable HTML (first 500 chars):\n${tableHTML}`);
    } else {
      console.log('\nNo table found. Checking page content...');

      // Get body text
      const bodyText = await page.textContent('body');
      console.log(`Body text (first 1000 chars):\n${bodyText?.substring(0, 1000)}`);
    }

    console.log('\n\nBrowser will remain open for 30 seconds for manual inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await context.close();
  }
}

debugSearch().catch(console.error);
