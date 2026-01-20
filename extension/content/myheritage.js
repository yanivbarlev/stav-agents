// MyHeritage Search - Content Script
// Runs on MyHeritage pages to extract search results

console.log('[MH Extension] Content script loaded on:', window.location.href);

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[MH Extension] Received message:', message);

  if (message.action === 'ping') {
    sendResponse({ status: 'ready', source: 'myheritage' });
    return false;
  }

  if (message.action === 'extractResults') {
    try {
      const results = extractCurrentPageResults();
      sendResponse({ persons: results, source: 'MyHeritage' });
    } catch (error) {
      sendResponse({ error: error.message });
    }
    return false;
  }

  if (message.action === 'extractFamilyFromDetailPage') {
    try {
      const familyData = extractFamilyFromCurrentPage();
      sendResponse({ familyData, source: 'MyHeritage' });
    } catch (error) {
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
 * Check if user is logged into MyHeritage
 */
function checkLoginStatus() {
  // Look for login indicators - MyHeritage shows user menu when logged in
  const userMenu = document.querySelector('[class*="user-menu"], [class*="account"], .logged-in');
  const loginButton = document.querySelector('a[href*="login"], button[class*="login"]');

  return !!userMenu || !loginButton;
}

/**
 * Extract MyHeritage ID from URL
 */
function extractMhIdFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const itemId = urlObj.searchParams.get('itemId');
    if (itemId) return itemId;

    // Fallback: try to extract from path
    const pathMatch = url.match(/\/person-(\d+-\d+)/);
    if (pathMatch) return pathMatch[1];

    return 'MH-' + Date.now(); // Generate unique ID if not found
  } catch (e) {
    return 'MH-' + Date.now();
  }
}

/**
 * Parse birth/death value which may contain date and place
 * Format examples: "1936 - United States", "11 Nov 2024 - Michigan"
 */
function parseDatePlace(value) {
  if (!value) return { date: '', place: '' };

  const parts = value.split(' - ');
  if (parts.length >= 2) {
    return {
      date: parts[0].trim(),
      place: parts.slice(1).join(' - ').trim()
    };
  }

  // Check if it's just a year or date
  if (/^\d{4}$/.test(value.trim()) || /^\d/.test(value.trim())) {
    return { date: value.trim(), place: '' };
  }

  return { date: '', place: value.trim() };
}

/**
 * Extract person stubs from current search results page
 */
function extractCurrentPageResults() {
  console.log('[MH Extract] Starting extraction on:', window.location.href);
  const persons = [];

  // Find all result cards
  const cards = document.querySelectorAll('.record_card');
  console.log('[MH Extract] Found', cards.length, 'result cards');

  cards.forEach((card, index) => {
    try {
      // Get name and URL
      const nameLink = card.querySelector('.record_name');
      if (!nameLink) return;

      const fullName = nameLink.textContent?.trim() || '';
      const sourceUrl = nameLink.href || '';
      const mhId = extractMhIdFromUrl(sourceUrl);

      // Get collection/source info
      const collectionEl = card.querySelector('.collection_name');
      const collectionName = collectionEl?.textContent?.trim() || 'MyHeritage';

      // Get birth info
      const birthEl = card.querySelector('.fields_list_item.birth .value');
      const birthValue = birthEl?.textContent?.trim() || '';
      const { date: birthDate, place: birthPlace } = parseDatePlace(birthValue);

      // Get death info
      const deathEl = card.querySelector('.fields_list_item.death .value');
      const deathValue = deathEl?.textContent?.trim() || '';
      const { date: deathDate, place: deathPlace } = parseDatePlace(deathValue);

      // Get spouse info
      const spouseEl = card.querySelector('.fields_list_item.partner .value');
      const spouseText = spouseEl?.textContent?.trim() || '';
      const spouses = spouseText ? [{ name: spouseText, relationship: 'Spouse' }] : [];

      // Get children info
      const childrenEl = card.querySelector('.fields_list_item.child .value');
      const childrenText = childrenEl?.textContent?.trim() || '';
      const children = childrenText
        ? childrenText.split(',').map(c => ({ name: c.trim(), relationship: 'Child' })).filter(c => c.name)
        : [];

      // Get parents info (if available)
      const fatherEl = card.querySelector('.fields_list_item.father .value');
      const motherEl = card.querySelector('.fields_list_item.mother .value');
      const parents = [];
      if (fatherEl?.textContent?.trim()) {
        parents.push({ name: fatherEl.textContent.trim(), relationship: 'Father', sex: 'M' });
      }
      if (motherEl?.textContent?.trim()) {
        parents.push({ name: motherEl.textContent.trim(), relationship: 'Mother', sex: 'F' });
      }

      // Parse name into first and last
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const person = {
        mhId,
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
        source: 'MyHeritage',
        extractedAt: new Date().toISOString()
      };

      console.log(`[MH Extract] Extracted person ${index + 1}:`, person.fullName);
      persons.push(person);
    } catch (err) {
      console.error('[MH Extract] Error extracting card:', err);
    }
  });

  console.log(`[MH Extract] Total extracted: ${persons.length} persons`);
  return persons;
}

/**
 * Extract family relationships from current detail page
 */
function extractFamilyFromCurrentPage() {
  console.log('[MH Extract] Extracting family from detail page:', window.location.href);

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
    rawPageText: rawPageText.slice(0, 15000) // Limit to ~15KB for API
  };

  try {
    // MyHeritage detail pages have different structures
    // Try to extract from the page content
    const allText = document.body.innerText || '';

    // Look for birth/death dates in various formats
    const birthMatch = allText.match(/(?:Born|Birth|לידה)[:\s]+([^\n]+)/i);
    if (birthMatch) {
      const { date, place } = parseDatePlace(birthMatch[1]);
      result.birthDate = date;
      result.birthPlace = place;
    }

    const deathMatch = allText.match(/(?:Died|Death|פטירה)[:\s]+([^\n]+)/i);
    if (deathMatch) {
      const { date, place } = parseDatePlace(deathMatch[1]);
      result.deathDate = date;
      result.deathPlace = place;
    }

    // Extract spouse from Hebrew labels (בן/בת זוג) - for records like city directories
    const spouseMatch = allText.match(/(?:בן\/בת זוג|בן זוג|בת זוג|Spouse)(?:\s*\([^)]*\))?\s*[\t:]\s*([^\n\t]+)/i);
    if (spouseMatch) {
      const spouseName = spouseMatch[1].trim();
      if (spouseName && spouseName.length >= 2 && !result.spouses.some(s => s.name === spouseName)) {
        result.spouses.push({ name: spouseName, relationship: 'Spouse' });
        console.log(`[MH Extract] Found spouse from text: ${spouseName}`);
      }
    }

    // Extract occupation (מקצוע)
    const occupationMatch = allText.match(/(?:מקצוע|Occupation)\s*[\t:]\s*([^\n\t]+)/i);
    if (occupationMatch) {
      result.occupation = occupationMatch[1].trim();
      console.log(`[MH Extract] Found occupation: ${result.occupation}`);
    }

    // Extract residence/address (מגורים)
    const residenceMatch = allText.match(/(?:מגורים|Residence|Address)\s*[\t:]\s*(\d{4})?\s*([^\n]+)/i);
    if (residenceMatch) {
      const year = residenceMatch[1] || '';
      const place = residenceMatch[2]?.trim() || '';
      if (place) {
        result.addresses = result.addresses || [];
        result.addresses.push({ year, address: place });
        console.log(`[MH Extract] Found residence: ${year} - ${place}`);
      }
    }

    // Extract from Raw Record field (contains address details like "hl76 Girard")
    const rawRecordMatch = allText.match(/Raw Record\s*[\t:]\s*([^\n]+)/i);
    if (rawRecordMatch) {
      result.rawRecord = rawRecordMatch[1].trim();
      console.log(`[MH Extract] Found raw record: ${result.rawRecord}`);
    }

    // Extract nationality (אזרחות)
    const nationalityMatch = allText.match(/(?:אזרחות|Nationality|Citizenship)\s*[\t:]\s*([^\n\t]+)/i);
    if (nationalityMatch) {
      result.nationality = nationalityMatch[1].trim();
      console.log(`[MH Extract] Found nationality: ${result.nationality}`);
    }

    // Extract last residence (מקום מגורים קבוע אחרון)
    const lastResidenceMatch = allText.match(/(?:מקום מגורים קבוע אחרון|Last Residence|Last Place of Residence)\s*[\t:]\s*([^\n\t]+)/i);
    if (lastResidenceMatch) {
      result.lastResidence = lastResidenceMatch[1].trim();
      console.log(`[MH Extract] Found last residence: ${result.lastResidence}`);
    }

    // Extract marital status (מצב משפחתי)
    const maritalMatch = allText.match(/(?:מצב משפחתי|Marital Status)\s*[\t:]\s*([^\n\t]+)/i);
    if (maritalMatch) {
      result.maritalStatus = maritalMatch[1].trim();
      console.log(`[MH Extract] Found marital status: ${result.maritalStatus}`);
    }

    // Extract immigration/arrival info (הגעה)
    const arrivalMatch = allText.match(/(?:הגעה|Arrival)\s*[\t:]\s*([^\n]+)/i);
    if (arrivalMatch) {
      result.arrivalDate = arrivalMatch[1].trim();
      console.log(`[MH Extract] Found arrival: ${result.arrivalDate}`);
    }

    // Extract departure port (עזיבה)
    const departureMatch = allText.match(/(?:עזיבה|Departure)\s*[\t:]\s*([^\n\t]+)/i);
    if (departureMatch) {
      result.departurePort = departureMatch[1].trim();
      console.log(`[MH Extract] Found departure: ${result.departurePort}`);
    }

    // Extract ship name (אניה)
    const shipMatch = allText.match(/(?:אניה|Ship)\s*[\t:]\s*([^\n\t]+)/i);
    if (shipMatch) {
      result.shipName = shipMatch[1].trim();
      console.log(`[MH Extract] Found ship: ${result.shipName}`);
    }

    // Extract relatives (קרוב משפחה) - these contain relationship info in parentheses
    const relativePatterns = [
      /קרוב משפחה בארץ המוצא\s*[\t:]\s*([^\n]+)/i,
      /קרוב משפחה שהצטרף בארה"ב\.?\s*[\t:]\s*([^\n]+)/i,
      /(?:Relative|Contact)\s*[\t:]\s*([^\n]+)/i
    ];

    result.relatives = result.relatives || [];
    for (const pattern of relativePatterns) {
      const match = allText.match(pattern);
      if (match) {
        const relativeText = match[1].trim();
        // Parse "Name (relationship)" format, e.g., "Sara Soboborski (אשה)" or "Jacob ??? (בן/בת דוד)"
        const relativeMatch = relativeText.match(/^([^(]+)\s*\(([^)]+)\)/);
        if (relativeMatch) {
          const name = relativeMatch[1].trim();
          const relationshipRaw = relativeMatch[2].trim();

          // Map Hebrew relationship terms to English
          let relationship = relationshipRaw;
          let sex = '';
          if (relationshipRaw.includes('אשה') || relationshipRaw.includes('wife')) {
            relationship = 'Wife';
            sex = 'F';
            // Also add as spouse if not already present
            if (!result.spouses.some(s => s.name === name)) {
              result.spouses.push({ name, relationship: 'Spouse', sex: 'F' });
            }
          } else if (relationshipRaw.includes('בעל') || relationshipRaw.includes('husband')) {
            relationship = 'Husband';
            sex = 'M';
            if (!result.spouses.some(s => s.name === name)) {
              result.spouses.push({ name, relationship: 'Spouse', sex: 'M' });
            }
          } else if (relationshipRaw.includes('בן/בת דוד') || relationshipRaw.includes('cousin')) {
            relationship = 'Cousin';
          } else if (relationshipRaw.includes('אח') || relationshipRaw.includes('brother')) {
            relationship = 'Brother';
            sex = 'M';
            if (!result.siblings.some(s => s.name === name)) {
              result.siblings.push({ name, relationship: 'Sibling', sex: 'M' });
            }
          } else if (relationshipRaw.includes('אחות') || relationshipRaw.includes('sister')) {
            relationship = 'Sister';
            sex = 'F';
            if (!result.siblings.some(s => s.name === name)) {
              result.siblings.push({ name, relationship: 'Sibling', sex: 'F' });
            }
          }

          if (!result.relatives.some(r => r.name === name)) {
            result.relatives.push({ name, relationship, sex, rawRelationship: relationshipRaw });
            console.log(`[MH Extract] Found relative: ${name} (${relationship})`);
          }
        } else {
          // No parentheses, just add the name
          if (!result.relatives.some(r => r.name === relativeText)) {
            result.relatives.push({ name: relativeText, relationship: 'Unknown' });
            console.log(`[MH Extract] Found relative: ${relativeText}`);
          }
        }
      }
    }

    // Extract family members from links
    const personLinks = document.querySelectorAll('a[href*="itemId"], a[href*="person-"]');

    personLinks.forEach(link => {
      const name = link.textContent?.trim() || '';
      if (!name || name.length < 2) return;

      const parent = link.closest('tr, li, div, section');
      if (!parent) return;

      const context = parent.textContent || '';
      const contextLower = context.toLowerCase();

      // Determine relationship from context
      if (contextLower.includes('father') || contextLower.includes('אב')) {
        if (!result.parents.some(p => p.name === name)) {
          result.parents.push({ name, relationship: 'Father', sex: 'M' });
        }
      } else if (contextLower.includes('mother') || contextLower.includes('אם')) {
        if (!result.parents.some(p => p.name === name)) {
          result.parents.push({ name, relationship: 'Mother', sex: 'F' });
        }
      } else if (contextLower.includes('spouse') || contextLower.includes('wife') ||
                 contextLower.includes('husband') || contextLower.includes('בן זוג') ||
                 contextLower.includes('בת זוג')) {
        if (!result.spouses.some(s => s.name === name)) {
          result.spouses.push({ name, relationship: 'Spouse' });
        }
      } else if (contextLower.includes('child') || contextLower.includes('son') ||
                 contextLower.includes('daughter') || contextLower.includes('ילד')) {
        if (!result.children.some(c => c.name === name)) {
          let sex = '';
          if (contextLower.includes('son')) sex = 'M';
          if (contextLower.includes('daughter')) sex = 'F';
          result.children.push({ name, relationship: 'Child', sex });
        }
      } else if (contextLower.includes('sibling') || contextLower.includes('brother') ||
                 contextLower.includes('sister') || contextLower.includes('אח') ||
                 contextLower.includes('אחות')) {
        if (!result.siblings.some(s => s.name === name)) {
          let sex = '';
          if (contextLower.includes('brother') || contextLower.includes('אח')) sex = 'M';
          if (contextLower.includes('sister') || contextLower.includes('אחות')) sex = 'F';
          result.siblings.push({ name, relationship: 'Sibling', sex });
        }
      }
    });

    console.log(`[MH Extract] Found: ${result.parents.length} parents, ${result.spouses.length} spouses, ${result.children.length} children, ${result.siblings.length} siblings`);

  } catch (error) {
    console.error('[MH Extract] Error extracting family:', error);
  }

  return result;
}

// Notify that content script is ready
console.log('[MH Extension] Content script ready');
