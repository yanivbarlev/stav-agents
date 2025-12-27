const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')();
const path = require('path');
const fs = require('fs');

// Enable stealth plugin to bypass bot detection
chromium.use(StealthPlugin);

/**
 * Playwright Authentication Setup for Genealogy Sites (with Stealth)
 *
 * IMPORTANT: Chrome profile is locked when Chrome is running!
 *
 * Solutions:
 * 1. Close Chrome before running Playwright scripts
 * 2. Use a copied profile (this script provides that option)
 * 3. Use a separate Chrome profile for automation
 *
 * Anti-Detection: Uses playwright-extra with stealth plugin to bypass Incapsula
 */

const CHROME_USER_DATA_DIR = path.join(
  process.env.LOCALAPPDATA || 'C:\\Users\\User\\AppData\\Local',
  'Google\\Chrome\\User Data'
);

const PLAYWRIGHT_PROFILE_DIR = path.join(__dirname, 'chrome-profile-copy');

/**
 * Option 1: Use your existing Chrome profile (requires Chrome to be closed)
 */
async function createAuthenticatedBrowserFromMainProfile(headless = false) {
  console.log('⚠️  Using main Chrome profile - Chrome must be CLOSED');
  console.log(`Profile directory: ${CHROME_USER_DATA_DIR}`);

  try {
    const context = await chromium.launchPersistentContext(CHROME_USER_DATA_DIR, {
      headless: headless,
      channel: 'chrome',
      viewport: { width: 1280, height: 720 },
      timeout: 60000,
      ignoreHTTPSErrors: true,

      // Anti-detection arguments
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--no-sandbox'
      ],

      // Realistic user agent
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    console.log('✅ Successfully launched with main profile (stealth enabled)');
    return context;
  } catch (error) {
    console.error('❌ Failed to launch with main profile');
    console.error('   This usually means Chrome is running. Please close Chrome and try again.');
    throw error;
  }
}

/**
 * Option 2: Use a copied profile directory (works even if Chrome is running)
 *
 * This creates a one-time copy of your Default profile including cookies/sessions
 */
async function setupCopiedProfile() {
  const sourceProfile = path.join(CHROME_USER_DATA_DIR, 'Default');

  if (!fs.existsSync(sourceProfile)) {
    throw new Error(`Source profile not found: ${sourceProfile}`);
  }

  console.log('Creating a copy of your Chrome profile for Playwright...');
  console.log(`Source: ${sourceProfile}`);
  console.log(`Destination: ${PLAYWRIGHT_PROFILE_DIR}`);

  // Only copy essential files for authentication
  const filesToCopy = [
    'Network',  // Contains Cookies file (Chrome stores cookies here now)
    'Local Storage',
    'Session Storage',
    'IndexedDB',
    'Preferences',
    'Web Data',
  ];

  if (!fs.existsSync(PLAYWRIGHT_PROFILE_DIR)) {
    fs.mkdirSync(PLAYWRIGHT_PROFILE_DIR, { recursive: true });
  }

  let copiedCount = 0;
  for (const file of filesToCopy) {
    const src = path.join(sourceProfile, file);
    const dest = path.join(PLAYWRIGHT_PROFILE_DIR, file);

    if (fs.existsSync(src)) {
      try {
        if (fs.statSync(src).isDirectory()) {
          copyDirRecursive(src, dest);
        } else {
          fs.copyFileSync(src, dest);
        }
        copiedCount++;
        console.log(`  ✓ Copied: ${file}`);
      } catch (err) {
        console.warn(`  ⚠ Could not copy ${file}: ${err.message}`);
      }
    }
  }

  console.log(`✅ Profile copy complete (${copiedCount} items copied)`);
  return PLAYWRIGHT_PROFILE_DIR;
}

/**
 * Helper: Recursively copy directory
 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Option 3: Use the copied profile (works even if Chrome is running)
 */
async function createAuthenticatedBrowserFromCopy(headless = false) {
  if (!fs.existsSync(PLAYWRIGHT_PROFILE_DIR)) {
    console.log('Copied profile not found. Creating it now...');
    await setupCopiedProfile();
  }

  console.log(`Using copied Chrome profile from: ${PLAYWRIGHT_PROFILE_DIR}`);

  const context = await chromium.launchPersistentContext(PLAYWRIGHT_PROFILE_DIR, {
    headless: headless,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    timeout: 60000,
    ignoreHTTPSErrors: true,

    // Anti-detection arguments
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--no-sandbox'
    ],

    // Realistic user agent
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  console.log('✅ Successfully launched with copied profile (stealth enabled)');
  return context;
}

/**
 * Test authentication with FamilySearch
 */
async function testFamilySearchAuth(useCopiedProfile = true) {
  console.log('\n=== Testing FamilySearch Authentication ===\n');

  let context;
  try {
    if (useCopiedProfile) {
      context = await createAuthenticatedBrowserFromCopy(false);
    } else {
      context = await createAuthenticatedBrowserFromMainProfile(false);
    }

    const page = await context.newPage();

    console.log('Navigating to FamilySearch...');
    await page.goto('https://www.familysearch.org/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Wait a bit for any redirects
    await page.waitForTimeout(3000);

    const url = page.url();
    const title = await page.title();

    console.log(`\nCurrent URL: ${url}`);
    console.log(`Page Title: ${title}`);

    if (url.includes('identity/login')) {
      console.log('\n❌ FAILED: Redirected to login page');
      console.log('   You need to log in to FamilySearch in Chrome first,');
      console.log('   then re-run this setup to copy the authenticated session.');
    } else if (url.includes('search/record/results')) {
      console.log('\n✅ SUCCESS: Authenticated and viewing search results!');
    } else {
      console.log('\n⚠️  UNKNOWN: Unexpected page - check browser window');
    }

    console.log('\nBrowser will remain open for 10 seconds...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('\n❌ Error during test:', error.message);
  } finally {
    if (context) {
      await context.close();
    }
  }
}

// Export functions
module.exports = {
  createAuthenticatedBrowserFromMainProfile,
  createAuthenticatedBrowserFromCopy,
  setupCopiedProfile,
  testFamilySearchAuth,
  CHROME_USER_DATA_DIR,
  PLAYWRIGHT_PROFILE_DIR,
};

// Run test if executed directly
if (require.main === module) {
  // Default: use copied profile (works even if Chrome is running)
  testFamilySearchAuth(true).catch(console.error);
}
