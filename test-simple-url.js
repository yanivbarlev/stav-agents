const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');

async function testSimpleUrl() {
  console.log('\n=== Testing Simple FamilySearch URL ===\n');

  const context = await createAuthenticatedBrowserFromCopy(false);
  const page = await context.newPage();

  try {
    // Try the family tree search URL that worked before
    const url = 'https://www.familysearch.org/en/search/tree/name';

    console.log(`Navigating to: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    console.log('Waiting 5 seconds...');
    await page.waitForTimeout(5000);

    const finalUrl = page.url();
    const title = await page.title();

    console.log(`\nFinal URL: ${finalUrl}`);
    console.log(`Page Title: ${title}`);

    if (finalUrl.includes('login') || finalUrl.includes('identity')) {
      console.log('\n❌ Redirected to login - cookies not working');
    } else {
      console.log('\n✅ Success! Authenticated and on FamilySearch');

      // Get page text
      const bodyText = await page.textContent('body');
      console.log(`\nPage content preview:\n${bodyText?.substring(0, 500)}`);
    }

    console.log('\nBrowser will remain open for 20 seconds...');
    await page.waitForTimeout(20000);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await context.close();
  }
}

testSimpleUrl().catch(console.error);
