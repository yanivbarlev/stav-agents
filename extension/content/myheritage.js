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

  const result = {
    parents: [],
    spouses: [],
    children: [],
    siblings: [],
    sex: '',
    birthDate: '',
    birthPlace: '',
    deathDate: '',
    deathPlace: ''
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
