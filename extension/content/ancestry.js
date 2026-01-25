// Ancestry.com Search - Content Script
// Runs on Ancestry.com pages to extract search results and person details

console.log('[Ancestry] ====================================');
console.log('[Ancestry] Content script loaded!');
console.log('[Ancestry] URL:', window.location.href);
console.log('[Ancestry] Time:', new Date().toISOString());
console.log('[Ancestry] ====================================');

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Ancestry] Received message:', message.action, message);

  if (message.action === 'ping') {
    console.log('[Ancestry] Responding to ping');
    sendResponse({ status: 'ready', source: 'ancestry' });
    return false;
  }

  if (message.action === 'extractResults') {
    console.log('[Ancestry] Starting extractResults...');
    try {
      const results = extractCurrentPageResults();
      console.log('[Ancestry] Extraction complete, found', results.length, 'persons');
      console.log('[Ancestry] First 3 results:', results.slice(0, 3));
      sendResponse({ persons: results, source: 'Ancestry' });
    } catch (error) {
      console.error('[Ancestry] Error extracting results:', error);
      console.error('[Ancestry] Error stack:', error.stack);
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

  // Ancestry uses .global-results-card for search result cards
  const cardSelectors = [
    '.global-results-card',
    '[role="group"][aria-label="result"]',
    '.searchResult',
    '[data-testid="search-result"]'
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
    console.log('[Ancestry] No result cards found');
    return persons;
  }

  cards.forEach((card, index) => {
    try {
      // Get name from bold spans (Ancestry puts first/last name in separate span.bold elements)
      const boldSpans = card.querySelectorAll('span.bold');
      let fullName = '';
      if (boldSpans.length >= 2) {
        fullName = cleanText(boldSpans[0].textContent + ' ' + boldSpans[1].textContent);
      } else if (boldSpans.length === 1) {
        fullName = cleanText(boldSpans[0].textContent);
      }

      // Fallback: try to get name from card text
      if (!fullName) {
        const cardText = card.innerText || '';
        const nameMatch = cardText.match(/Name\s*\n\s*([^\n]+)/);
        if (nameMatch) {
          fullName = cleanText(nameMatch[1]);
        }
      }

      if (!fullName) {
        console.log(`[Ancestry] Skipping card ${index + 1}: no name found`);
        return;
      }

      // Get source URL and collection name from the first link with /search/collections/
      let sourceUrl = '';
      let collectionName = 'Ancestry';
      const links = card.querySelectorAll('a');
      for (const link of links) {
        if (link.href && link.href.includes('/search/collections/')) {
          sourceUrl = link.href;
          // The collection name is the text content of this link
          const linkText = cleanText(link.textContent);
          if (linkText && linkText.length > 5) {
            collectionName = linkText;
          }
          break;
        }
      }

      const ancestryId = extractAncestryIdFromUrl(sourceUrl);

      // Parse record info from card text (format: "Field\t\nValue")
      const cardText = card.innerText || '';

      // Extract birth info
      let birthDate = '';
      let birthPlace = '';
      const birthMatch = cardText.match(/Birth\s*\n\s*([^\n]+)/i);
      if (birthMatch) {
        const { date, place } = parseDatePlace(birthMatch[1]);
        birthDate = date;
        birthPlace = place;
      }

      // Extract death info
      let deathDate = '';
      let deathPlace = '';
      const deathMatch = cardText.match(/Death\s*\n\s*([^\n]+)/i);
      if (deathMatch) {
        const { date, place } = parseDatePlace(deathMatch[1]);
        deathDate = date;
        deathPlace = place;
      }

      // Extract arrival info (common in immigration records)
      let arrivalDate = '';
      let arrivalPlace = '';
      const arrivalMatch = cardText.match(/Arrival\s*\n\s*([^\n]+)/i);
      if (arrivalMatch) {
        const { date, place } = parseDatePlace(arrivalMatch[1]);
        arrivalDate = date;
        arrivalPlace = place;
      }

      // Extract departure info
      let departurePlace = '';
      const departureMatch = cardText.match(/Departure\s*\n\s*([^\n]+)/i);
      if (departureMatch) {
        departurePlace = cleanText(departureMatch[1]);
      }

      // Extract residence info
      let residence = '';
      const residenceMatch = cardText.match(/Residence\s*\n\s*([^\n]+)/i);
      if (residenceMatch) {
        residence = cleanText(residenceMatch[1]);
      }

      // Parse name into first and last
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      // Initialize empty family arrays
      const parents = [];
      const spouses = [];
      const children = [];

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

// Run initial diagnostic
setTimeout(() => {
  const cards = document.querySelectorAll('.global-results-card');
  console.log('[Ancestry] DIAGNOSTIC: Found', cards.length, 'result cards on page');
  if (cards.length > 0) {
    const firstCard = cards[0];
    const spans = firstCard.querySelectorAll('span.bold');
    console.log('[Ancestry] DIAGNOSTIC: First card has', spans.length, 'bold spans');
    if (spans.length > 0) {
      console.log('[Ancestry] DIAGNOSTIC: First name span:', spans[0]?.textContent);
    }
  }
}, 2000);
