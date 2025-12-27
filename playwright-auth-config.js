const { chromium } = require('playwright');
const path = require('path');

/**
 * Chrome User Data Directory Configuration
 *
 * This configuration allows Playwright to use your existing Chrome profile
 * with all saved authentication sessions (FamilySearch, Ancestry, MyHeritage, etc.)
 */

// Chrome User Data directory on Windows
const CHROME_USER_DATA_DIR = path.join(
  process.env.LOCALAPPDATA || 'C:\\Users\\User\\AppData\\Local',
  'Google\\Chrome\\User Data'
);

// Profile name (typically "Default" for the main profile)
const PROFILE_NAME = 'Default';

/**
 * Creates an authenticated browser context using your existing Chrome profile
 *
 * @param {boolean} headless - Whether to run in headless mode (default: false for debugging)
 * @returns {Promise<import('playwright').BrowserContext>} BrowserContext with your existing authentication sessions
 */
async function createAuthenticatedBrowser(headless = false) {
  console.log(`Launching Chrome with profile from: ${CHROME_USER_DATA_DIR}`);
  console.log(`Using profile: ${PROFILE_NAME}`);

  // Launch persistent context with your Chrome profile
  const context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
    headless: headless,
    channel: 'chrome', // Use installed Chrome, not Chromium

    // Optional: Additional settings
    viewport: { width: 1280, height: 720 },

    // Keep browser open longer for debugging
    timeout: 60000,

    // Ignore HTTPS errors (if needed)
    ignoreHTTPSErrors: true,
  });

  console.log('Browser context created successfully with existing profile');

  return context;
}

/**
 * Test function to verify authentication works
 */
async function testAuthentication() {
  const context = await createAuthenticatedBrowser(false);

  try {
    // Create a new page
    const page = await context.newPage();

    // Test FamilySearch
    console.log('Testing FamilySearch authentication...');
    await page.goto('https://www.familysearch.org/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950');

    // Wait for page to load
    await page.waitForTimeout(5000);

    // Check if we're on the search results page (not login page)
    const url = page.url();
    const title = await page.title();

    console.log(`Current URL: ${url}`);
    console.log(`Page Title: ${title}`);

    if (url.includes('identity/login')) {
      console.error('❌ Authentication failed - redirected to login page');
    } else if (url.includes('search/record/results')) {
      console.log('✅ Authentication successful - on search results page');
    } else {
      console.log('⚠️  Unexpected page - please verify manually');
    }

    // Keep browser open for inspection
    console.log('Browser will remain open for 30 seconds for inspection...');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('Error during testing:', error);
  } finally {
    await context.close();
  }
}

// Export for use in other modules
module.exports = {
  createAuthenticatedBrowser,
  testAuthentication,
  CHROME_USER_DATA_DIR,
};

// Run test if executed directly
if (require.main === module) {
  testAuthentication().catch(console.error);
}
