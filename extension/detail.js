/**
 * Person Detail Page - Displays full information about a person
 * With enrichment support to fetch and merge data from source URLs
 */

import { EnrichmentService } from './popup/services/EnrichmentService.js';

// Global state
let currentPerson = null;
let enrichmentService = null;

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeDetailPage();
});

/**
 * Initialize the detail page
 */
async function initializeDetailPage() {
  try {
    // Initialize enrichment service
    enrichmentService = new EnrichmentService();

    // Load person data from storage
    currentPerson = await loadPersonData();

    if (!currentPerson) {
      showError();
      return;
    }

    // Render all sections
    renderAll(currentPerson);

    // Setup event handlers
    setupEventHandlers();

  } catch (error) {
    console.error('[DetailPage] Initialization error:', error);
    showError();
  }
}

/**
 * Render all sections
 */
function renderAll(person) {
  renderHeader(person);
  renderIdentity(person);
  renderSources(person);
  renderFamily(person);
  renderImmigration(person);
  renderAddresses(person);
  renderOccupations(person);
  renderSearchInfo(person);
  renderFooter(person);
}

/**
 * Load person data from Chrome storage
 * @returns {Promise<Object|null>} Person data or null
 */
async function loadPersonData() {
  try {
    const data = await chrome.storage.local.get(['currentDetailPerson']);
    return data.currentDetailPerson || null;
  } catch (error) {
    console.error('[DetailPage] Failed to load person data:', error);
    return null;
  }
}

/**
 * Show error state
 */
function showError() {
  document.querySelector('.container').classList.add('hidden');
  document.getElementById('error-container').classList.remove('hidden');
}

/**
 * Setup event handlers
 */
function setupEventHandlers() {
  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    window.close();
  });

  // Error back button
  document.getElementById('error-back-btn')?.addEventListener('click', () => {
    window.close();
  });

  // Enrich button
  document.getElementById('enrich-btn').addEventListener('click', handleEnrich);

  // Cancel enrichment button
  document.getElementById('cancel-enrich').addEventListener('click', () => {
    enrichmentService?.cancel();
  });
}

/**
 * Handle enrich button click
 */
async function handleEnrich() {
  if (!currentPerson) return;

  const enrichBtn = document.getElementById('enrich-btn');
  const progressContainer = document.getElementById('enrich-progress');
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');

  try {
    // Disable button and show progress
    enrichBtn.disabled = true;
    enrichBtn.textContent = 'Enriching...';
    progressContainer.classList.remove('hidden');

    // Progress callback
    const updateProgress = (message, type, progress) => {
      progressText.textContent = message;

      if (progress) {
        const percent = (progress.current / progress.total) * 100;
        progressFill.style.width = `${percent}%`;
      }
    };

    // Run enrichment
    const enrichedPerson = await enrichmentService.enrichPerson(currentPerson, updateProgress);

    // Update current person and re-render
    currentPerson = enrichedPerson;
    renderAll(currentPerson);

    // Update button state
    enrichBtn.textContent = 'Enriched!';
    enrichBtn.classList.add('enriched');

  } catch (error) {
    console.error('[DetailPage] Enrichment error:', error);
    enrichBtn.textContent = 'Enrich Failed - Retry';
    enrichBtn.disabled = false;
  } finally {
    // Hide progress after a delay
    setTimeout(() => {
      progressContainer.classList.add('hidden');
      progressFill.style.width = '0%';
    }, 2000);
  }
}

// ============================================================================
// RENDER FUNCTIONS
// ============================================================================

/**
 * Render header section
 */
function renderHeader(person) {
  // Name
  document.getElementById('person-name').textContent = person.fullName || 'Unknown';

  // Lifespan
  const birthYear = extractYear(person.birthDate);
  const deathYear = extractYear(person.deathDate);
  let lifespan = '';
  if (birthYear && deathYear) {
    const age = parseInt(deathYear) - parseInt(birthYear);
    lifespan = `${birthYear} - ${deathYear} (${age} years)`;
  } else if (birthYear) {
    lifespan = `Born ${birthYear}`;
  } else if (deathYear) {
    lifespan = `Died ${deathYear}`;
  }
  document.getElementById('lifespan').textContent = lifespan;

  // Source tags
  const sourceTagsContainer = document.getElementById('source-tags');
  const sourceTag = person.sourceTag || 'FS';
  const tagClass = getSourceTagClass(sourceTag);
  sourceTagsContainer.innerHTML = `<span class="source-tag ${tagClass}">${sourceTag}</span>`;

  // Enrichment status badge
  const enrichmentBadge = document.getElementById('enrichment-badge');
  const enrichBtn = document.getElementById('enrich-btn');

  if (person.enrichmentStatus === 'complete') {
    enrichmentBadge.textContent = 'Fully Enriched';
    enrichmentBadge.className = 'enrichment-badge complete';
    enrichmentBadge.classList.remove('hidden');
    enrichBtn.textContent = 'Re-Enrich';
    enrichBtn.classList.add('enriched');
  } else if (person.enrichmentStatus === 'partial') {
    enrichmentBadge.textContent = 'Partially Enriched';
    enrichmentBadge.className = 'enrichment-badge partial';
    enrichmentBadge.classList.remove('hidden');
  } else {
    enrichmentBadge.classList.add('hidden');
  }
}

/**
 * Render identity section with source indicators
 */
function renderIdentity(person) {
  renderFieldWithSource('birth-info', person.birthDate, person.fieldSources?.birthDate, person.alternatives?.birthDate);
  renderFieldWithSource('birth-place', person.birthPlace, person.fieldSources?.birthPlace, person.alternatives?.birthPlace);
  renderFieldWithSource('death-info', person.deathDate, person.fieldSources?.deathDate, person.alternatives?.deathDate);
  renderFieldWithSource('death-place', person.deathPlace, person.fieldSources?.deathPlace, person.alternatives?.deathPlace);

  // Calculate age
  const birthYear = extractYear(person.birthDate);
  const deathYear = extractYear(person.deathDate);
  if (birthYear && deathYear) {
    const age = parseInt(deathYear) - parseInt(birthYear);
    document.getElementById('age-info').textContent = `${age} years`;
  } else {
    document.getElementById('age-info').textContent = '-';
  }

  // Sex with source indicator
  renderFieldWithSource('sex-info', person.sex, person.fieldSources?.sex, person.alternatives?.sex);

  // New enrichment fields
  renderFieldWithSource('nationality-info', person.nationality, person.fieldSources?.nationality, person.alternatives?.nationality);
  renderFieldWithSource('last-residence-info', person.lastResidence, person.fieldSources?.lastResidence, person.alternatives?.lastResidence);
  renderFieldWithSource('marital-status-info', person.maritalStatus, person.fieldSources?.maritalStatus, person.alternatives?.maritalStatus);

  // Occupation - show first occupation if available, or single occupation field
  const primaryOccupation = person.occupations?.[0]?.occupation || person.occupation;
  renderFieldWithSource('occupation-info', primaryOccupation, person.fieldSources?.occupation, person.alternatives?.occupation);
}

/**
 * Render a field with source indicator and alternatives
 */
function renderFieldWithSource(elementId, value, source, alternatives) {
  const element = document.getElementById(elementId);
  if (!element) return;

  if (!value || value === '-') {
    element.innerHTML = '-';
    return;
  }

  let html = `<span class="field-value">${value}</span>`;

  // Add source indicator
  if (source) {
    const shortSource = getShortSourceName(source);
    html += ` <span class="source-indicator ${shortSource.toLowerCase()}">${shortSource}</span>`;
  }

  // Add alternatives indicator
  if (alternatives && alternatives.length > 0) {
    html += ` <button class="alternatives-btn" data-field="${elementId}">+${alternatives.length}</button>`;
    html += `<div class="alternatives-panel hidden" id="alt-${elementId}">`;
    alternatives.forEach(alt => {
      const altSource = getShortSourceName(alt.source);
      html += `<div class="alternative-item"><span class="alt-value">${alt.value}</span> <span class="alt-source">${altSource}</span></div>`;
    });
    html += `</div>`;
  }

  element.innerHTML = html;

  // Setup alternatives toggle
  const altBtn = element.querySelector('.alternatives-btn');
  if (altBtn) {
    altBtn.addEventListener('click', () => {
      const panel = document.getElementById(`alt-${elementId}`);
      panel.classList.toggle('hidden');
    });
  }
}

/**
 * Render sources section with enrichment status
 */
function renderSources(person) {
  const container = document.getElementById('sources-content');

  if (person.sources && person.sources.length > 0) {
    container.innerHTML = person.sources.map(source => {
      // Ensure English URL for FamilySearch links
      const displayUrl = ensureEnglishUrl(source.url);
      return `
      <div class="source-item ${source.enriched ? 'enriched' : ''}">
        <div class="source-item-header">
          <span class="source-name">${source.name || 'Unknown Source'}</span>
          <span class="source-id">${source.id || '-'}</span>
          ${source.enriched ? '<span class="enriched-check" title="Data fetched from this source">✓</span>' : ''}
        </div>
        ${source.collection ? `<div class="source-collection">${source.collection}</div>` : ''}
        ${displayUrl ? `
          <div class="source-link">
            <a href="${displayUrl}" target="_blank">View original record</a>
          </div>
        ` : ''}
        ${source.enrichedAt ? `<div class="source-enriched-at">Enriched: ${new Date(source.enrichedAt).toLocaleDateString()}</div>` : ''}
      </div>
    `;
    }).join('');
  } else {
    // Fallback to single source format
    const sourceHtml = [];

    if (person.fsId) {
      const fsUrl = ensureEnglishUrl(person.sourceUrl);
      sourceHtml.push(`
        <div class="source-item">
          <div class="source-item-header">
            <span class="source-name">FamilySearch</span>
            <span class="source-id">${person.fsId}</span>
          </div>
          ${person.collectionName ? `<div class="source-collection">${person.collectionName}</div>` : ''}
          ${fsUrl ? `
            <div class="source-link">
              <a href="${fsUrl}" target="_blank">View original record</a>
            </div>
          ` : ''}
        </div>
      `);
    }

    if (person.mhId) {
      sourceHtml.push(`
        <div class="source-item">
          <div class="source-item-header">
            <span class="source-name">MyHeritage</span>
            <span class="source-id">${person.mhId}</span>
          </div>
        </div>
      `);
    }

    container.innerHTML = sourceHtml.length > 0 ? sourceHtml.join('') : '<p class="empty-state">No source information available</p>';
  }
}

/**
 * Render family section with source refs
 */
function renderFamily(person) {
  renderFamilyList('parents-list', person.parents, 'parent');
  renderFamilyList('siblings-list', person.siblings, 'sibling');
  renderFamilyList('spouses-list', person.spouses, 'spouse');
  renderFamilyList('children-list', person.children, 'child');
  renderFamilyList('relatives-list', person.relatives, 'relative');
}

/**
 * Render a family member list with source indicators
 */
function renderFamilyList(elementId, members, memberClass) {
  const list = document.getElementById(elementId);

  if (members && members.length > 0) {
    list.innerHTML = members.map(member => {
      const name = typeof member === 'string' ? member : member.name || member.fullName || 'Unknown';
      const sourceRefs = member.sourceRefs || [];

      let sourceIndicators = '';
      if (sourceRefs.length > 0) {
        sourceIndicators = sourceRefs.map(ref => {
          const shortRef = getShortSourceName(ref);
          return `<span class="source-indicator ${shortRef.toLowerCase()}">${shortRef}</span>`;
        }).join('');
      }

      // Add relationship info if available
      let relationshipInfo = '';
      if (typeof member === 'object' && member.relationship) {
        const rel = member.relationship;
        if (rel !== memberClass && !['parent', 'spouse', 'child', 'sibling'].includes(rel.toLowerCase())) {
          relationshipInfo = `<span class="relationship-type">(${rel})</span>`;
        }
      }

      return `<li class="${memberClass}">
        <span class="member-name">${name}</span>
        ${relationshipInfo}
        ${sourceIndicators}
      </li>`;
    }).join('');
  }
  // Keep the default "No X found" text if empty
}

/**
 * Render immigration/travel section
 */
function renderImmigration(person) {
  const card = document.getElementById('immigration-card');
  const hasImmigrationData = person.arrivalDate || person.departurePort || person.shipName;

  if (!hasImmigrationData) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  renderFieldWithSource('arrival-date', person.arrivalDate, person.fieldSources?.arrivalDate, person.alternatives?.arrivalDate);
  renderFieldWithSource('departure-port', person.departurePort, person.fieldSources?.departurePort, person.alternatives?.departurePort);
  renderFieldWithSource('ship-name', person.shipName, person.fieldSources?.shipName, person.alternatives?.shipName);
}

/**
 * Render addresses section
 */
function renderAddresses(person) {
  const card = document.getElementById('addresses-card');
  const container = document.getElementById('addresses-content');

  if (!person.addresses || person.addresses.length === 0) {
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  container.innerHTML = person.addresses.map(addr => {
    const sourceShort = getShortSourceName(addr.source);
    return `
      <div class="address-item">
        <span class="address-text">${addr.address || addr}</span>
        ${addr.year ? `<span class="address-year">(${addr.year})</span>` : ''}
        ${sourceShort ? `<span class="source-indicator ${sourceShort.toLowerCase()}">${sourceShort}</span>` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Render occupations section
 */
function renderOccupations(person) {
  const card = document.getElementById('occupations-card');
  const container = document.getElementById('occupations-content');

  if (!person.occupations || person.occupations.length <= 1) {
    // Hide if no occupations or only one (already shown in identity)
    card.classList.add('hidden');
    return;
  }

  card.classList.remove('hidden');
  container.innerHTML = person.occupations.map(occ => {
    const sourceShort = getShortSourceName(occ.source);
    return `
      <div class="occupation-item">
        <span class="occupation-text">${occ.occupation || occ}</span>
        ${occ.year ? `<span class="occupation-year">(${occ.year})</span>` : ''}
        ${sourceShort ? `<span class="source-indicator ${sourceShort.toLowerCase()}">${sourceShort}</span>` : ''}
      </div>
    `;
  }).join('');
}

/**
 * Render search info section
 */
function renderSearchInfo(person) {
  // Matched variant
  if (person.matchedVariant) {
    document.getElementById('matched-variant').textContent = person.matchedVariant;
    document.getElementById('matched-variant').classList.add('variant-chip');
  }

  // Searched variants
  const searchedVariantsRow = document.getElementById('searched-variants-row');
  if (person.searchedVariants && person.searchedVariants.length > 1) {
    const otherVariants = person.searchedVariants.filter(v => v !== person.matchedVariant);
    if (otherVariants.length > 0) {
      document.getElementById('searched-variants').innerHTML = otherVariants
        .map(v => `<span class="variant-chip-small">${v}</span>`)
        .join(' ');
    } else {
      searchedVariantsRow.classList.add('hidden');
    }
  } else {
    searchedVariantsRow.classList.add('hidden');
  }

  // Hebrew names
  const hebrewRow = document.getElementById('hebrew-names-row');
  const hebrewFirst = person.hebrewFirstName || person.originalFirstName;
  const hebrewLast = person.hebrewLastName || person.originalLastName;
  if (hebrewFirst || hebrewLast) {
    document.getElementById('hebrew-names').textContent = `${hebrewFirst || ''} ${hebrewLast || ''}`.trim();
  } else {
    hebrewRow.classList.add('hidden');
  }
}

/**
 * Render footer with source links
 */
function renderFooter(person) {
  const linksContainer = document.getElementById('source-links');
  const links = [];

  // Add source links (with English language for FamilySearch)
  if (person.sources && person.sources.length > 0) {
    // Deduplicate by source name
    const seenSources = new Set();
    person.sources.forEach(source => {
      if (source.url && !seenSources.has(source.name)) {
        seenSources.add(source.name);
        const displayUrl = ensureEnglishUrl(source.url);
        const btnClass = getSourceButtonClass(source.name);
        links.push(`
          <a href="${displayUrl}" target="_blank" class="btn ${btnClass}">
            Open in ${source.name}
          </a>
        `);
      }
    });
  } else if (person.sourceUrl) {
    const displayUrl = ensureEnglishUrl(person.sourceUrl);
    links.push(`
      <a href="${displayUrl}" target="_blank" class="btn btn-source">
        Open in FamilySearch
      </a>
    `);
  }

  linksContainer.innerHTML = links.join('');

  // Extracted/enriched timestamp
  const timestampEl = document.getElementById('extracted-at');
  if (person.lastEnrichedAt) {
    const date = new Date(person.lastEnrichedAt);
    timestampEl.textContent = `Enriched: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } else if (person.extractedAt) {
    const date = new Date(person.extractedAt);
    timestampEl.textContent = `Extracted: ${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Extract year from date string
 */
function extractYear(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/\d{4}/);
  return match ? match[0] : '';
}

/**
 * Ensure FamilySearch URL uses English language
 * @param {string} url - Original URL
 * @returns {string} URL with English language
 */
function ensureEnglishUrl(url) {
  if (!url) return url;

  // Only process FamilySearch URLs
  if (!url.includes('familysearch.org')) return url;

  try {
    const urlObj = new URL(url);
    // Set lang parameter to English
    urlObj.searchParams.set('lang', 'en');
    return urlObj.toString();
  } catch (e) {
    // Fallback for malformed URLs
    if (url.includes('?')) {
      if (url.includes('lang=')) {
        return url.replace(/lang=[^&]+/, 'lang=en');
      }
      return url + '&lang=en';
    }
    return url + '?lang=en';
  }
}

/**
 * Get short source name for display
 * @param {string} source - Full source name
 * @returns {string} Short source name (FS, MH, AN, or original)
 */
function getShortSourceName(source) {
  if (!source) return '';
  if (source === 'FamilySearch') return 'FS';
  if (source === 'MyHeritage') return 'MH';
  if (source === 'Ancestry') return 'AN';
  return source;
}

/**
 * Get CSS class for source tag
 * @param {string} sourceTag - Source tag string (e.g., 'FS', 'MH', 'AN', 'FS+MH+AN')
 * @returns {string} CSS class name
 */
function getSourceTagClass(sourceTag) {
  if (!sourceTag) return 'fs';
  if (sourceTag.includes('+')) return 'multi';
  if (sourceTag === 'AN') return 'an';
  if (sourceTag === 'MH') return 'mh';
  return 'fs';
}

/**
 * Get CSS class for source button
 * @param {string} sourceName - Source name
 * @returns {string} CSS class string
 */
function getSourceButtonClass(sourceName) {
  if (sourceName === 'MyHeritage') return 'btn-source mh';
  if (sourceName === 'Ancestry') return 'btn-source an';
  return 'btn-source';
}
