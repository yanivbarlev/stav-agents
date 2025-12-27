# FamilySearch User Guide

## Overview

FamilySearch is a free genealogy website that provides access to historical records and family tree information. This guide covers how to use FamilySearch both manually and programmatically with Playwright.

---

## Table of Contents

1. [Authentication](#authentication)
2. [Search Types](#search-types)
3. [Search Parameters](#search-parameters)
4. [Navigating Search Results](#navigating-search-results)
5. [Person Detail Pages](#person-detail-pages)
6. [Family Relationships](#family-relationships)
7. [Programmatic Access](#programmatic-access)
8. [URL Patterns](#url-patterns)

---

## Authentication

### Manual Authentication

1. Go to https://www.familysearch.org
2. Click "Sign In" in the top right
3. Choose your authentication method:
   - Google
   - Facebook
   - Apple
   - Church Account
   - Username/Password

### Playwright Authentication

After running `npm run setup` (with Chrome closed), your authentication is automatically handled:

```javascript
const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');
const context = await createAuthenticatedBrowserFromCopy();
const page = await context.newPage();
// You're now authenticated!
```

**Important**: Some URLs redirect if you haven't set up your family tree. Use the search URLs below to bypass this.

---

## Search Types

FamilySearch offers three main search types:

### 1. Family Tree Search
Search within user-contributed family trees.

**URL**: `https://www.familysearch.org/en/search/tree/name`

**Use Cases**:
- Finding living or recent relatives
- Connecting to existing family trees
- Finding family connections

### 2. Historical Records Search
Search within digitized historical documents (birth certificates, census records, etc.).

**URL**: `https://www.familysearch.org/en/search/record/results`

**Use Cases**:
- Finding birth, marriage, death records
- Census data
- Immigration records
- Military records

### 3. Memories
Photos, stories, and documents uploaded by users (not yet active in API).

**URL**: `https://www.familysearch.org/en/memories/find`

---

## Search Parameters

### Basic Search Parameters

All search URLs accept query parameters in the format `?q.parameter=value`

#### Person Information
- `q.givenName` - First name (e.g., "John")
- `q.surname` - Last name (e.g., "Smith")
- `q.birthLikePlace` - Birth location (e.g., "Indiana, United States")
- `q.anyDate.from` - Start year (e.g., "1940")
- `q.anyDate.to` - End year (e.g., "1950")

#### Specific Events
- `q.birthLikeDate.from` - Birth year start
- `q.birthLikeDate.to` - Birth year end
- `q.deathLikeDate.from` - Death year start
- `q.deathLikeDate.to` - Death year end

#### Family Relationships
- `q.fatherGivenName` - Father's first name
- `q.fatherSurname` - Father's last name
- `q.motherGivenName` - Mother's first name
- `q.motherSurname` - Mother's last name
- `q.spouseGivenName` - Spouse's first name
- `q.spouseSurname` - Spouse's last name

#### Other Search Filters
- `q.sex` - Gender (e.g., "Male", "Female")
- `q.race` - Race/ethnicity
- `q.residencePlace` - Residence location

### Example Search URLs

#### Simple Search
```
https://www.familysearch.org/en/search/record/results?q.givenName=John&q.surname=Smith&q.birthLikeDate.from=1940&q.birthLikeDate.to=1950
```

#### Detailed Search with Family
```
https://www.familysearch.org/en/search/tree/results?q.givenName=Larry&q.surname=Bird&q.anyDate.from=1950&q.birthLikePlace=Indiana%2C%20United%20States&q.fatherGivenName=Joe&q.fatherSurname=Bird&q.motherGivenName=Georgia&q.motherSurname=Bird
```

#### Location-Specific Search
```
https://www.familysearch.org/en/search/record/results?q.anyDate.from=1950&q.birthLikePlace=indiana&q.givenName=larry&q.surname=bird
```

---

## Navigating Search Results

### Search Results Page Structure

**Elements on the page**:
- **Results count**: Shows total number of matches (e.g., "2,276,116 results")
- **Results table**: List of matching records
- **Pagination**: Navigate through pages of results
- **Filters**: Refine search by collection, sex, race, dates, etc.

### Each Result Row Contains:

1. **Person Name** (clickable link to detail page)
   - Example: "John Wesley Smith"

2. **Collection Name**
   - Example: "Texas, Birth Index, 1903-1997"

3. **Event Information**
   - Event type: Birth, Death, Marriage, etc.
   - Date: "2 April 1945"
   - Location: "Wichita, Texas"

4. **Family Information** (if available)
   - Parents: "William Russell Smith, Mary Ann Archer"
   - Spouse (if applicable)

### Pagination

- **Results per page**: 10, 20, 50, or 100 (default: 20)
- **Page navigation**: Previous/Next buttons
- **Direct page access**: Jump to specific page number

**Example**: If you have 2,276,116 results with 20 per page, that's 113,806 pages

---

## Person Detail Pages

### Accessing Detail Pages

Click on any person's name in search results to view their detail page.

**URL Pattern**: `/ark:/61903/1:1:{UNIQUE_ID}?lang=en`

**Example**: `https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD?lang=en`

### Detail Page Contains:

#### 1. Person Information Table
- Name
- Sex
- Event Type (Birth, Death, Marriage, etc.)
- Event Date
- Event Place
- Father's Name (clickable link)
- Mother's Name (clickable link)

#### 2. Parents and Siblings Section
- **Father** - Name, sex, expandable details
- **Mother** - Name, sex, expandable details
- **Siblings** (if available)

Each parent is clickable and leads to their own detail page.

#### 3. Additional Information
- **Document Information** - Source document details
- **Collection Information** - Which collection this record is from
- **Citation** - How to cite this record
- **Tree Attachment** - Link to attach this record to your family tree
- **Similar Records** - Related records

---

## Family Relationships

### Understanding Family Structure

FamilySearch organizes people in a hierarchical family structure:

```
Person (Principal)
├── Father
│   ├── Grandfather (Father's Father)
│   └── Grandmother (Father's Mother)
└── Mother
    ├── Grandfather (Mother's Father)
    └── Grandmother (Mother's Mother)
```

### Extracting Family Trees

To build a complete family tree:

1. **Start with a person** - Get their detail page
2. **Extract parent links** - Get URLs for father and mother
3. **Follow parent links** - Visit each parent's detail page
4. **Repeat recursively** - Continue following parent links
5. **Track visited people** - Avoid infinite loops

### Example Relationship Chain

```
John Wesley Smith (1945)
├── ARK ID: /ark:/61903/1:1:VDPH-2YD
├── Father: William Russell Smith
│   └── ARK ID: /ark:/61903/1:1:VDPH-2YZ
└── Mother: Mary Ann Archer
    └── ARK ID: /ark:/61903/1:1:VDPH-2Y8
```

---

## Programmatic Access

### Basic Navigation

```javascript
const { createAuthenticatedBrowserFromCopy } = require('./playwright-auth-setup');

async function navigateToSearch() {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  // Navigate to search page
  await page.goto('https://www.familysearch.org/en/search/tree/name');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  await context.close();
}
```

### Performing a Search

```javascript
async function searchForPerson(firstName, lastName, birthYear) {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  // Build search URL
  const searchUrl = `https://www.familysearch.org/en/search/record/results?` +
    `q.givenName=${encodeURIComponent(firstName)}&` +
    `q.surname=${encodeURIComponent(lastName)}&` +
    `q.birthLikeDate.from=${birthYear}&` +
    `q.birthLikeDate.to=${birthYear}`;

  await page.goto(searchUrl);
  await page.waitForLoadState('networkidle');

  // Extract results here...

  await context.close();
}
```

### Extracting Search Results

```javascript
async function extractSearchResults(searchUrl) {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  await page.goto(searchUrl);
  await page.waitForLoadState('networkidle');

  // Wait for results table
  await page.waitForSelector('table');

  // Extract all person links
  const results = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tbody tr'));

    return rows.map(row => {
      const nameLink = row.querySelector('h2 a');
      const nameText = nameLink?.textContent.trim();
      const url = nameLink?.href;

      // Extract birth info
      const birthInfo = row.textContent.match(/Birth.*?(\d{1,2}\s+\w+\s+\d{4})/);
      const birthDate = birthInfo ? birthInfo[1] : null;

      return {
        name: nameText,
        url: url,
        birthDate: birthDate
      };
    });
  });

  console.log(`Found ${results.length} results`);
  console.log(results);

  await context.close();
  return results;
}
```

### Visiting Detail Pages

```javascript
async function getPersonDetails(arkUrl) {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  await page.goto(arkUrl);
  await page.waitForLoadState('networkidle');

  // Extract person details
  const details = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    const data = {};

    rows.forEach(row => {
      const header = row.querySelector('th')?.textContent.trim();
      const value = row.querySelector('td strong')?.textContent.trim();
      if (header && value) {
        data[header] = value;
      }
    });

    return data;
  });

  console.log('Person Details:', details);

  await context.close();
  return details;
}
```

### Extracting Family Relationships

```javascript
async function getParentLinks(arkUrl) {
  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  await page.goto(arkUrl);
  await page.waitForLoadState('networkidle');

  // Find Parents and Siblings section
  const parents = await page.evaluate(() => {
    const parentsSection = Array.from(document.querySelectorAll('h3'))
      .find(h => h.textContent.includes('Parents and Siblings'));

    if (!parentsSection) return [];

    const parentRows = parentsSection.closest('div')
      .querySelectorAll('table tbody tr');

    return Array.from(parentRows).map(row => {
      const link = row.querySelector('a');
      const relationshipLabel = row.querySelector('td:nth-child(1)')?.textContent;

      return {
        name: link?.textContent.trim(),
        url: link?.href,
        relationship: relationshipLabel?.includes('Father') ? 'Father' : 'Mother'
      };
    });
  });

  console.log('Parents:', parents);

  await context.close();
  return parents;
}
```

### Building a Family Tree (Recursive)

```javascript
async function buildFamilyTree(arkUrl, depth = 3, visited = new Set()) {
  // Prevent infinite loops
  if (visited.has(arkUrl) || depth === 0) {
    return null;
  }

  visited.add(arkUrl);

  const context = await createAuthenticatedBrowserFromCopy();
  const page = await context.newPage();

  await page.goto(arkUrl);
  await page.waitForLoadState('networkidle');

  // Extract person info and parent links
  const personData = await page.evaluate(() => {
    // Get person details
    const nameElem = document.querySelector('h1');
    const name = nameElem?.textContent.trim();

    // Get parent links
    const parentLinks = Array.from(document.querySelectorAll('table tbody tr'))
      .map(row => {
        const link = row.querySelector('a');
        const relationship = row.textContent.includes('Father') ? 'father' :
                           row.textContent.includes('Mother') ? 'mother' : null;

        if (link && relationship) {
          return { relationship, url: link.href };
        }
        return null;
      })
      .filter(Boolean);

    return { name, parentLinks };
  });

  await context.close();

  // Build tree node
  const treeNode = {
    name: personData.name,
    url: arkUrl,
    father: null,
    mother: null
  };

  // Recursively get parents
  for (const parent of personData.parentLinks) {
    const parentTree = await buildFamilyTree(parent.url, depth - 1, visited);
    if (parent.relationship === 'father') {
      treeNode.father = parentTree;
    } else if (parent.relationship === 'mother') {
      treeNode.mother = parentTree;
    }
  }

  return treeNode;
}

// Usage
const tree = await buildFamilyTree('https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD', 3);
console.log(JSON.stringify(tree, null, 2));
```

---

## URL Patterns

### Search URLs

**Family Tree Search**:
```
https://www.familysearch.org/en/search/tree/name
https://www.familysearch.org/en/search/tree/results?[params]
```

**Historical Records Search**:
```
https://www.familysearch.org/en/search/record/results?[params]
```

**Memories**:
```
https://www.familysearch.org/en/memories/find
```

### Detail Page URLs

**Pattern**: `/ark:/61903/1:1:{ID}?lang=en`

**Examples**:
```
https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD?lang=en
https://www.familysearch.org/ark:/61903/1:1:VDPH-2YZ?lang=en
https://www.familysearch.org/ark:/61903/1:1:VDPH-2Y8?lang=en
```

### API/Identity URLs

**Login**:
```
https://ident.familysearch.org/en/identity/login/
```

**Authentication State**:
```
https://www.familysearch.org/auth/familysearch/login?returnUrl=[encoded_url]
```

---

## Best Practices

### Rate Limiting
- Add delays between requests: `await page.waitForTimeout(2000)`
- Don't make more than 1 request per second
- Be respectful of FamilySearch servers

### Error Handling
- Check for authentication redirects
- Handle missing data gracefully
- Implement retry logic for network failures

### Data Collection
- Track visited URLs to avoid duplicates
- Implement depth limits for recursive searches
- Save data incrementally (don't lose progress)
- Export to structured format (JSON, CSV, database)

### Session Management
- Refresh cookies periodically (`npm run setup:clean`)
- Monitor for session expiration
- Handle re-authentication automatically

---

## Common Use Cases

### 1. Find All Ancestors for a Person
```javascript
const tree = await buildFamilyTree(personUrl, 5); // 5 generations
```

### 2. Search for People in a Specific Location and Time
```javascript
const url = `https://www.familysearch.org/en/search/record/results?` +
  `q.birthLikePlace=Indiana&q.birthLikeDate.from=1950&q.birthLikeDate.to=1960`;
const results = await extractSearchResults(url);
```

### 3. Extract All Family Members
```javascript
const person = await getPersonDetails(personUrl);
const parents = await getParentLinks(personUrl);
// Continue for siblings, spouses, children
```

### 4. Build a Multi-Generation Family Tree
```javascript
// Start with known ancestor
const startUrl = 'https://www.familysearch.org/ark:/61903/1:1:VDPH-2YD';
const familyTree = await buildFamilyTree(startUrl, 10); // 10 generations
```

---

## Troubleshooting

### Authentication Issues
- **Redirected to login**: Run `npm run setup:clean` to refresh cookies
- **Session expired**: Close Chrome, run setup again
- **Profile locked**: Make sure Chrome is fully closed

### Page Loading Issues
- **Slow loading**: Increase timeout values
- **Missing elements**: Wait for specific selectors before extracting
- **Dynamic content**: Use `waitForLoadState('networkidle')`

### Data Extraction Issues
- **Empty results**: Check if you're authenticated
- **Missing fields**: Not all records have complete data
- **Wrong selectors**: Page structure may have changed

---

## Additional Resources

- **FamilySearch Help**: https://www.familysearch.org/en/help
- **Research Wiki**: https://www.familysearch.org/en/wiki/
- **Collection List**: Browse available historical records
- **Community Forum**: Get help from other researchers

---

## Summary

FamilySearch is a powerful tool for genealogy research with three main search types:
1. **Family Tree Search** - User-contributed trees
2. **Historical Records** - Digitized documents
3. **Memories** - Photos and stories

With Playwright authentication set up, you can programmatically:
- Search for people by name, date, location
- Extract search results
- Navigate to detail pages
- Follow family relationships
- Build multi-generation family trees

Remember to respect rate limits and handle authentication properly!
