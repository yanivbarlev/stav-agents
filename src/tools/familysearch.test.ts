import { searchFamilySearch, extractPersonDetails, extractFsIdFromUrl } from './familysearch';

/**
 * Test FamilySearch Extraction Tool
 */

async function testExtractFsId() {
  console.log('\n=== Testing extractFsIdFromUrl ===\n');

  const testUrls = [
    'https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD?lang=en',
    '/ark:/61903/1:1:VDPH-2YZ',
    'https://www.familysearch.org/ark:/61903/1:1:V6SW-SGS?lang=en'
  ];

  testUrls.forEach(url => {
    const fsId = extractFsIdFromUrl(url);
    console.log(`URL: ${url}`);
    console.log(`FsId: ${fsId}\n`);
  });
}

async function testSinglePersonExtraction() {
  console.log('\n=== Testing extractPersonDetails ===\n');

  const testUrl = 'https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD?lang=en';

  try {
    const person = await extractPersonDetails(testUrl);
    console.log('\nExtracted Person:');
    console.log(JSON.stringify(person, null, 2));
  } catch (error) {
    console.error('Error extracting person:', error);
  }
}

async function testSearch() {
  console.log('\n=== Testing searchFamilySearch ===\n');

  try {
    const results = await searchFamilySearch({
      firstName: "John",
      lastName: "Smith",
      birthYear: 1945,
      location: "Texas",
      maxResults: 5
    });

    console.log('\n=== Search Results ===\n');
    console.log(`Found ${results.length} persons:\n`);

    results.forEach((person, index) => {
      console.log(`${index + 1}. ${person.fullName} (${person.fsId})`);
      console.log(`   Birth: ${person.birthDate || 'N/A'} in ${person.birthPlace || 'N/A'}`);
      console.log(`   Sex: ${person.sex || 'N/A'}`);
      console.log(`   Collection: ${person.collectionName}`);
      console.log(`   Parents: ${person.parents.length > 0 ? person.parents.map(p => p.name).join(', ') : 'None listed'}`);
      console.log(`   URL: ${person.sourceUrl}`);
      console.log('');
    });

    // Save results to file
    const fs = require('fs');
    const outputPath = './familysearch-test-results.json';
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`\nResults saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error during search:', error);
  }
}

// Run tests
async function runAllTests() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  FamilySearch Extraction Tool Test Suite  ║');
  console.log('╚════════════════════════════════════════════╝');

  // Test 1: Extract FsId from URLs
  await testExtractFsId();

  // Test 2: Extract single person (commented out by default)
  // await testSinglePersonExtraction();

  // Test 3: Full search test
  await testSearch();

  console.log('\n=== All Tests Complete ===\n');
}

// Execute if run directly
if (require.main === module) {
  runAllTests().catch(console.error);
}
