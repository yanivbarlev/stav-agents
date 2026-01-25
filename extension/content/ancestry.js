// Ancestry.com Search - Content Script
// Runs on Ancestry.com pages to extract search results and person details

console.log('[Ancestry] Content script loaded on:', window.location.href);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Ancestry] Received message:', message);

  if (message.action === 'ping') {
    sendResponse({ status: 'ready', source: 'ancestry' });
    return false;
  }

  if (message.action === 'extractResults') {
    try {
      const results = extractCurrentPageResults();
      sendResponse({ persons: results, source: 'Ancestry' });
    } catch (error) {
      console.error('[Ancestry] Error extracting results:', error);
      sendResponse({ error: error.message });
    }
    return false;
  }

  if (message.action === 'extractFamilyFromDetailPage') {
    try {
      const familyData = extractFamilyFromCurrentPage();
      sendResponse({ familyData, source: 'Ancestry' });
    } catch (error) {
      console.error('[Ancestry] Error extracting family:', error);
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
 * Check if user is logged into Ancestry
 */
function checkLoginStatus() {
  // Look for login indicators - Ancestry shows user menu when logged in
  const userMenu = document.querySelector('[data-testid="user-menu"]') ||
                   document.querySelector('.userMenu') ||
                   document.querySelector('.ancUserName') ||
                   document.querySelector('[class*="signedIn"]') ||
                   document.querySelector('a[href*="/account/"]');

  const signInButton = document.querySelector('a[href*="signin"]') ||
                       document.querySelector('button[class*="signIn"]') ||
                       document.querySelector('[data-testid="sign-in"]');

  // If we find a user menu or no sign-in button, likely logged in
  return !!userMenu || !signInButton;
}

/**
 * Extract Ancestry ID from URL
 * Ancestry URLs can have various formats:
 * - /discoveryui-content/view/xxx:xxx
 * - /family-tree/person/tree/xxx/person/xxx
 * - /search/record/xxx
 */
function extractAncestryIdFromUrl(url) {
  try {
    if (!url) return 'AN-' + Date.now();

    // Try to extract from discoveryui-content format
    let match = url.match(/discoveryui-content\/view\/(\d+:\d+)/);
    if (match) return match[1];

    // Try to extract from family tree URL
    match = url.match(/person\/tree\/(\d+)\/person\/(\d+)/);
    if (match) return `${match[1]}-${match[2]}`;

    // Try to extract record ID
    match = url.match(/record\/(\d+)/);
    if (match) return match[1];

    // Try to extract any numeric ID from the URL
    match = url.match(/\/(\d+:\d+|\d+-\d+|\d+)(?:\?|$|#)/);
    if (match) return match[1];

    // Generate unique ID if nothing found
    return 'AN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  } catch (e) {
    return 'AN-' + Date.now();
  }
}

/**
 * Parse date and place from combined string
 * Format examples: "1936 - New York, USA", "11 Nov 2024", "New York"
 */
function parseDatePlace(value) {
  if (!value) return { date: '', place: '' };

  const trimmed = value.trim();

  // Check for " - " separator (common format: "date - place")
  const dashParts = trimmed.split(/\s+-\s+/);
  if (dashParts.length >= 2) {
    return {
      date: dashParts[0].trim(),
      place: dashParts.slice(1).join(' - ').trim()
    };
  }

  // Check if it's just a year or date
  if (/^\d{4}$/.test(trimmed) || /^\d/.test(trimmed)) {
    return { date: trimmed, place: '' };
  }

  // Otherwise assume it's a place
  return { date: '', place: trimmed };
}

/**
 * Clean and normalize text content
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Extract person stubs from current search results page
 */
function extractCurrentPageResults() {
  console.log('[Ancestry] Starting extraction on:', window.location.href);
  const persons = [];

  // Ancestry search results selectors (multiple fallbacks)
  const cardSelectors = [
    '.searchResult',
    '[data-testid="search-result"]',
    '.result-card',
    '.srchHit',
    'article.record',
    '.record-result',
    '.cardContent',
    '[class*="ResultCard"]',
    '.result'
  ];

  let cards = [];
  for (const selector of cardSelectors) {
    cards = document.querySelectorAll(selector);
    if (cards.length > 0) {
      console.log(`[Ancestry] Found ${cards.length} cards using selector: ${selector}`);
      break;
    }
  }

  if (cards.length === 0) {
    // Try finding table rows as fallback
    cards = document.querySelectorAll('table tbody tr');
    console.log(`[Ancestry] Found ${cards.length} table rows as fallback`);
  }

  cards.forEach((card, index) => {
    try {
      // Try multiple selectors for name
      const nameSelectors = [
        '.srchHitName a',
        '.name a',
        '[data-testid="name"] a',
        'h2 a',
        '.personName a',
        'a[href*="/person/"]',
        'a[href*="/discoveryui-content/"]'
      ];

      let nameLink = null;
      let fullName = '';
      let sourceUrl = '';

      for (const selector of nameSelectors) {
        nameLink = card.querySelector(selector);
        if (nameLink) {
          fullName = cleanText(nameLink.textContent);
          sourceUrl = nameLink.href || '';
          break;
        }
      }

      // Fallback: try to find any name text
      if (!fullName) {
        const nameEl = card.querySelector('.name, .srchHitName, [data-testid="name"]');
        if (nameEl) {
          fullName = cleanText(nameEl.textContent);
        }
      }

      if (!fullName) {
        console.log(`[Ancestry] Skipping card ${index + 1}: no name found`);
        return;
      }

      const ancestryId = extractAncestryIdFromUrl(sourceUrl);

      // Get collection/source info
      const collectionSelectors = [
        '.collection',
        '.collectionTitle',
        '[data-testid="collection"]',
        '.srchDB',
        '.database-name'
      ];

      let collectionName = 'Ancestry';
      for (const selector of collectionSelectors) {
        const el = card.querySelector(selector);
        if (el) {
          collectionName = cleanText(el.textContent) || 'Ancestry';
          break;
        }
      }

      // Get birth info
      let birthDate = '';
      let birthPlace = '';
      const birthSelectors = [
        '.birthDate',
        '[data-testid="birth"]',
        '.birth',
        '.srchBirth'
      ];

      for (const selector of birthSelectors) {
        const el = card.querySelector(selector);
        if (el) {
          const { date, place } = parseDatePlace(el.textContent);
          birthDate = date;
          birthPlace = place;
          break;
        }
      }

      // Also try to find birth from text patterns
      if (!birthDate) {
        const cardText = card.textContent || '';
        const birthMatch = cardText.match(/(?:Birth|Born|b\.?)\s*[:.]?\s*(\d{1,2}\s+\w+\s+\d{4}|\d{4})/i);
        if (birthMatch) birthDate = birthMatch[1].trim();

        const birthPlaceMatch = cardText.match(/(?:Birth|Born)\s*[:.]\s*(?:\d+[^,]*,?\s*)?([A-Za-z][^,\n]+(?:,\s*[A-Za-z][^,\n]+)*)/i);
        if (birthPlaceMatch && !birthPlace) birthPlace = birthPlaceMatch[1].trim();
      }

      // Get death info
      let deathDate = '';
      let deathPlace = '';
      const deathSelectors = [
        '.deathDate',
        '[data-testid="death"]',
        '.death',
        '.srchDeath'
      ];

      for (const selector of deathSelectors) {
        const el = card.querySelector(selector);
        if (el) {
          const { date, place } = parseDatePlace(el.textContent);
          deathDate = date;
          deathPlace = place;
          break;
        }
      }

      // Also try to find death from text patterns
      if (!deathDate) {
        const cardText = card.textContent || '';
        const deathMatch = cardText.match(/(?:Death|Died|d\.?)\s*[:.]?\s*(\d{1,2}\s+\w+\s+\d{4}|\d{4})/i);
        if (deathMatch) deathDate = deathMatch[1].trim();

        const deathPlaceMatch = cardText.match(/(?:Death|Died)\s*[:.]\s*(?:\d+[^,]*,?\s*)?([A-Za-z][^,\n]+(?:,\s*[A-Za-z][^,\n]+)*)/i);
        if (deathPlaceMatch && !deathPlace) deathPlace = deathPlaceMatch[1].trim();
      }

      // Get family member info from card if available
      const parents = [];
      const spouses = [];
      const children = [];

      // Try to extract parents
      const parentSelectors = ['.father', '.mother', '.parent', '[data-testid="parent"]'];
      for (const selector of parentSelectors) {
        const els = card.querySelectorAll(selector);
        els.forEach(el => {
          const name = cleanText(el.textContent);
          if (name && !parents.some(p => p.name === name)) {
            const isFather = selector.includes('father') || el.className.includes('father');
            parents.push({
              name,
              relationship: isFather ? 'Father' : 'Mother',
              sex: isFather ? 'M' : 'F'
            });
          }
        });
      }

      // Try to extract spouse
      const spouseSelectors = ['.spouse', '.partner', '[data-testid="spouse"]'];
      for (const selector of spouseSelectors) {
        const el = card.querySelector(selector);
        if (el) {
          const name = cleanText(el.textContent);
          if (name) {
            spouses.push({ name, relationship: 'Spouse' });
          }
        }
      }

      // Parse name into first and last
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const person = {
        ancestryId,
        fullName,
        firstName,
        lastName,
        birthDate,
        birthPlace,
        deathDate,
        deathPlace,
        sourceUrl,
        collectionName,
        parents,
        spouses,
        children,
        siblings: [],
        source: 'Ancestry',
        extractedAt: new Date().toISOString()
      };

      console.log(`[Ancestry] Extracted person ${index + 1}:`, person.fullName);
      persons.push(person);
    } catch (err) {
      console.error('[Ancestry] Error extracting card:', err);
    }
  });

  console.log(`[Ancestry] Total extracted: ${persons.length} persons`);
  return persons;
}

/**
 * Extract family relationships from current detail page
 */
function extractFamilyFromCurrentPage() {
  console.log('[Ancestry] Extracting family from detail page:', window.location.href);

  // Capture raw page text for AI analysis
  const rawPageText = document.body.innerText || '';

  const result = {
    parents: [],
    spouses: [],
    children: [],
    siblings: [],
    relatives: [],
    sex: '',
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: '',
    occupation: '',
    addresses: [],
    rawRecord: '',
    // Immigration/travel fields
    nationality: '',
    lastResidence: '',
    maritalStatus: '',
    arrivalDate: '',
    departurePort: '',
    shipName: '',
    rawPageText: rawPageText.slice(0, 15000) // Limit for API
  };

  try {
    const pageText = document.body.innerText || '';

    // Extract birth date and place
    const birthMatch = pageText.match(/(?:Birth|Born)\s*[:.]?\s*([^\n]+)/i);
    if (birthMatch) {
      const { date, place } = parseDatePlace(birthMatch[1]);
      result.birthDate = date;
      result.birthPlace = place;
    }

    // Extract death date and place
    const deathMatch = pageText.match(/(?:Death|Died)\s*[:.]?\s*([^\n]+)/i);
    if (deathMatch) {
      const { date, place } = parseDatePlace(deathMatch[1]);
      result.deathDate = date;
      result.deathPlace = place;
    }

    // Extract sex/gender
    const sexMatch = pageText.match(/(?:Sex|Gender)\s*[:.]?\s*(Male|Female|M|F)/i);
    if (sexMatch) {
      const sex = sexMatch[1].toUpperCase();
      result.sex = (sex === 'M' || sex === 'MALE') ? 'M' : 'F';
    }

    // Extract spouse
    const spousePatterns = [
      /(?:Spouse|Wife|Husband|Partner)\s*[:.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i,
      /(?:Married to|Married)\s*[:.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i
    ];
    for (const pattern of spousePatterns) {
      const match = pageText.match(pattern);
      if (match) {
        const spouseName = cleanText(match[1]);
        if (spouseName && !result.spouses.some(s => s.name === spouseName)) {
          result.spouses.push({ name: spouseName, relationship: 'Spouse' });
          console.log(`[Ancestry] Found spouse: ${spouseName}`);
        }
        break;
      }
    }

    // Extract parents
    const fatherMatch = pageText.match(/(?:Father)\s*[:.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (fatherMatch) {
      const name = cleanText(fatherMatch[1]);
      if (name && !result.parents.some(p => p.name === name)) {
        result.parents.push({ name, relationship: 'Father', sex: 'M' });
        console.log(`[Ancestry] Found father: ${name}`);
      }
    }

    const motherMatch = pageText.match(/(?:Mother)\s*[:.]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
    if (motherMatch) {
      const name = cleanText(motherMatch[1]);
      if (name && !result.parents.some(p => p.name === name)) {
        result.parents.push({ name, relationship: 'Mother', sex: 'F' });
        console.log(`[Ancestry] Found mother: ${name}`);
      }
    }

    // Extract occupation
    const occupationMatch = pageText.match(/(?:Occupation|Job|Profession)\s*[:.]?\s*([^\n]+)/i);
    if (occupationMatch) {
      result.occupation = cleanText(occupationMatch[1]);
      console.log(`[Ancestry] Found occupation: ${result.occupation}`);
    }

    // Extract residence
    const residenceMatch = pageText.match(/(?:Residence|Address|Living in)\s*[:.]?\s*(\d{4})?\s*([^\n]+)/i);
    if (residenceMatch) {
      const year = residenceMatch[1] || '';
      const place = cleanText(residenceMatch[2]);
      if (place) {
        result.addresses.push({ year, address: place });
        console.log(`[Ancestry] Found residence: ${year} - ${place}`);
      }
    }

    // Extract nationality/citizenship
    const nationalityMatch = pageText.match(/(?:Nationality|Citizenship|Country of Origin)\s*[:.]?\s*([^\n]+)/i);
    if (nationalityMatch) {
      result.nationality = cleanText(nationalityMatch[1]);
      console.log(`[Ancestry] Found nationality: ${result.nationality}`);
    }

    // Extract marital status
    const maritalMatch = pageText.match(/(?:Marital Status|Marriage Status)\s*[:.]?\s*([^\n]+)/i);
    if (maritalMatch) {
      result.maritalStatus = cleanText(maritalMatch[1]);
      console.log(`[Ancestry] Found marital status: ${result.maritalStatus}`);
    }

    // Extract immigration info
    const arrivalMatch = pageText.match(/(?:Arrival|Arrived|Immigration Date)\s*[:.]?\s*([^\n]+)/i);
    if (arrivalMatch) {
      result.arrivalDate = cleanText(arrivalMatch[1]);
      console.log(`[Ancestry] Found arrival: ${result.arrivalDate}`);
    }

    const departureMatch = pageText.match(/(?:Departure|Departed from|Port of Departure)\s*[:.]?\s*([^\n]+)/i);
    if (departureMatch) {
      result.departurePort = cleanText(departureMatch[1]);
      console.log(`[Ancestry] Found departure: ${result.departurePort}`);
    }

    const shipMatch = pageText.match(/(?:Ship|Vessel|Ship Name)\s*[:.]?\s*([^\n]+)/i);
    if (shipMatch) {
      result.shipName = cleanText(shipMatch[1]);
      console.log(`[Ancestry] Found ship: ${result.shipName}`);
    }

    // Try to extract family members from DOM elements
    // Ancestry often has family sections in the detail page
    const familySelectors = {
      parents: ['.parent', '[data-testid="parent"]', '.familyMember.parent'],
      spouses: ['.spouse', '[data-testid="spouse"]', '.familyMember.spouse'],
      children: ['.child', '[data-testid="child"]', '.familyMember.child'],
      siblings: ['.sibling', '[data-testid="sibling"]', '.familyMember.sibling']
    };

    for (const [relation, selectors] of Object.entries(familySelectors)) {
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const nameLink = el.querySelector('a') || el;
          const name = cleanText(nameLink.textContent);
          if (name && name.length >= 2) {
            const existing = result[relation].some(p => p.name === name);
            if (!existing) {
              result[relation].push({ name, relationship: relation });
            }
          }
        });
      }
    }

    // Also try to find linked persons
    const personLinks = document.querySelectorAll('a[href*="/person/"], a[href*="/tree/"]');
    personLinks.forEach(link => {
      const name = cleanText(link.textContent);
      if (!name || name.length < 2) return;

      const parent = link.closest('tr, li, div, section');
      if (!parent) return;

      const context = (parent.textContent || '').toLowerCase();

      if (context.includes('father')) {
        if (!result.parents.some(p => p.name === name)) {
          result.parents.push({ name, relationship: 'Father', sex: 'M' });
        }
      } else if (context.includes('mother')) {
        if (!result.parents.some(p => p.name === name)) {
          result.parents.push({ name, relationship: 'Mother', sex: 'F' });
        }
      } else if (context.includes('spouse') || context.includes('wife') || context.includes('husband')) {
        if (!result.spouses.some(s => s.name === name)) {
          result.spouses.push({ name, relationship: 'Spouse' });
        }
      } else if (context.includes('child') || context.includes('son') || context.includes('daughter')) {
        if (!result.children.some(c => c.name === name)) {
          let sex = '';
          if (context.includes('son')) sex = 'M';
          if (context.includes('daughter')) sex = 'F';
          result.children.push({ name, relationship: 'Child', sex });
        }
      } else if (context.includes('sibling') || context.includes('brother') || context.includes('sister')) {
        if (!result.siblings.some(s => s.name === name)) {
          let sex = '';
          if (context.includes('brother')) sex = 'M';
          if (context.includes('sister')) sex = 'F';
          result.siblings.push({ name, relationship: 'Sibling', sex });
        }
      }
    });

    console.log(`[Ancestry] Extracted: ${result.parents.length} parents, ${result.spouses.length} spouses, ${result.children.length} children, ${result.siblings.length} siblings`);

  } catch (error) {
    console.error('[Ancestry] Error extracting family:', error);
  }

  return result;
}

// Notify that content script is ready
console.log('[Ancestry] Content script ready');
