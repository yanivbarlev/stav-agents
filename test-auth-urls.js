const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');

async function testMultipleUrls() {
  console.log('\n=== Testing FamilySearch URLs with Authentication ===\n');

  const context = await createAuthenticatedBrowserFromCopy(false);

  try {
    const page = await context.newPage();

    const urlsToTest = [
      {
        name: 'Family Tree Search',
        url: 'https://www.familysearch.org/en/search/tree/name'
      },
      {
        name: 'Historic Records Search',
        url: 'https://www.familysearch.org/en/search/record/results?q.anyDate.from=1950&q.birthLikePlace=indiana&q.givenName=larry&q.surname=bird'
      },
      {
        name: 'Tree Search Results',
        url: 'https://www.familysearch.org/en/search/tree/results?q.anyDate.from=1950&q.birthLikePlace=Indiana%2C%20United%20States&q.fatherGivenName=father%20first&q.fatherSurname=father%20last&q.givenName=larry&q.motherGivenName=mother%20first&q.motherSurname=mother%20last&q.otherGivenName=other%20firs&q.otherSurname=other%20last&q.spouseGivenName=spouse%20first&q.spouseSurname=spouse%20last&q.surname=bird'
      }
    ];

    for (const testUrl of urlsToTest) {
      console.log(`\n--- Testing: ${testUrl.name} ---`);
      console.log(`URL: ${testUrl.url.substring(0, 100)}...`);

      await page.goto(testUrl.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(3000);

      const finalUrl = page.url();
      const title = await page.title();

      console.log(`Final URL: ${finalUrl}`);
      console.log(`Page Title: ${title}`);

      if (finalUrl.includes('login') || finalUrl.includes('identity')) {
        console.log('❌ FAILED: Redirected to login/identity page');
      } else if (finalUrl.includes('search')) {
        console.log('✅ SUCCESS: On search page, authenticated!');
      } else {
        console.log('⚠️  UNKNOWN: Check the page');
      }

      console.log('Waiting 3 seconds before next test...');
      await page.waitForTimeout(3000);
    }

    console.log('\n\nAll tests complete. Browser will remain open for 15 seconds for inspection...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('\n❌ Error during testing:', error.message);
  } finally {
    await context.close();
  }
}

testMultipleUrls().catch(console.error);
