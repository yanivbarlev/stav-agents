import { debugLogger } from '../utils/debugLogger.js';

/**
 * PopupUI - Manages all UI updates and display logic
 * Pure UI component with no business logic
 */
export class PopupUI {
  constructor() {
    // Cache DOM elements
    this.statusBar = document.getElementById('status-bar');
    this.statusText = document.getElementById('status-text');
    this.variantsSection = document.getElementById('variants-section');
    this.variantSelection = document.getElementById('variant-selection');
    this.variantLists = document.getElementById('variant-lists');
    this.totalSearches = document.getElementById('total-searches');
    this.resultsSection = document.getElementById('results-section');
    this.resultsCount = document.getElementById('results-count');
    this.resultsList = document.getElementById('results-list');
    this.errorSection = document.getElementById('error-section');
    this.errorText = document.getElementById('error-text');

    // API reference for save operations
    this.api = null;
    this.state = null;

    // Hover popup management
    this.detailPopup = null;
    this.hoverTimeout = null;
    this.activeResultItem = null;
    this.placeholderElement = null;
    this._createDetailPopup();
  }

  /**
   * Create the detail popup element and placeholder
   * @private
   */
  _createDetailPopup() {
    // Create the detail popup
    this.detailPopup = document.createElement('div');
    this.detailPopup.className = 'person-detail-popup';
    this.detailPopup.id = 'person-detail-popup';
    document.body.appendChild(this.detailPopup);

    // Create placeholder shown when no item is hovered
    this.placeholderElement = document.createElement('div');
    this.placeholderElement.className = 'popup-placeholder';
    this.placeholderElement.id = 'popup-placeholder';
    this.placeholderElement.innerHTML = '👆 Hover over a result to see details';
    this.placeholderElement.style.display = 'none'; // Hidden until results are shown
    document.body.appendChild(this.placeholderElement);

    // Keep popup visible when hovering over it
    this.detailPopup.addEventListener('mouseenter', () => {
      if (this.hoverTimeout) {
        clearTimeout(this.hoverTimeout);
        this.hoverTimeout = null;
      }
    });

    this.detailPopup.addEventListener('mouseleave', () => {
      this._hideDetailPopup();
    });
  }

  /**
   * Set API reference for save operations
   * @param {BackendAPI} api - Backend API instance
   * @param {SearchState} state - Search state instance
   */
  setAPI(api, state) {
    this.api = api;
    this.state = state;
  }

  /**
   * Show status message
   * @param {string} message - Message to display
   * @param {string} [type='info'] - Type: info, success, error
   */
  showStatus(message, type = 'info') {
    this.statusBar.className = `status-bar ${type}`;
    this.statusText.textContent = message;
    this.statusBar.classList.remove('hidden');
  }

  /**
   * Hide status message
   */
  hideStatus() {
    this.statusBar.classList.add('hidden');
  }

  /**
   * Show error message
   * @param {string} message - Error message
   */
  showError(message) {
    this.errorText.textContent = message;
    this.errorSection.classList.remove('hidden');
    this.resultsSection.classList.add('hidden');
  }

  /**
   * Hide error message
   */
  hideError() {
    this.errorSection.classList.add('hidden');
  }

  /**
   * Display variant selection checkboxes
   * @param {Object} variants - Variants for each field
   * @param {Object} fieldLabels - Labels for each field
   */
  displayVariantSelection(variants, fieldLabels) {
    this.variantLists.innerHTML = '';

    console.log('[PopupUI] displayVariantSelection called with:', variants);

    for (const [field, variantList] of Object.entries(variants)) {
      console.log(`[PopupUI] Processing field ${field}:`, variantList);

      if (!variantList || variantList.length === 0) continue;

      const fieldDiv = document.createElement('div');
      fieldDiv.className = 'variant-field';

      const label = document.createElement('span');
      label.className = 'variant-field-label';
      label.textContent = fieldLabels[field] || field;
      fieldDiv.appendChild(label);

      variantList.forEach((variant, index) => {
        console.log(`[PopupUI] Processing variant ${index} for ${field}:`, variant);

        const optionDiv = document.createElement('div');
        optionDiv.className = 'variant-option';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `${field}-${index}`;
        checkbox.value = variant.name;
        checkbox.checked = index < 3; // Auto-select top 3
        checkbox.addEventListener('change', () => this.updateSearchCount(variants));

        const labelEl = document.createElement('label');
        labelEl.htmlFor = `${field}-${index}`;
        labelEl.innerHTML = `
          <span>${variant.name}</span>
          <span class="variant-confidence ${variant.confidence}">${variant.confidence}</span>
        `;

        optionDiv.appendChild(checkbox);
        optionDiv.appendChild(labelEl);
        fieldDiv.appendChild(optionDiv);
      });

      this.variantLists.appendChild(fieldDiv);
    }

    this.variantSelection.classList.remove('hidden');
    this.updateSearchCount(variants);
  }

  /**
   * Update total search count based on selected checkboxes
   * @param {Object} variants - Variants object to determine which fields exist
   */
  updateSearchCount(variants) {
    const selectedCounts = {};

    for (const field of Object.keys(variants)) {
      const checkboxes = document.querySelectorAll(`input[id^="${field}-"]:checked`);
      selectedCounts[field] = checkboxes.length;
    }

    // Calculate total permutations
    let total = 1;
    for (const count of Object.values(selectedCounts)) {
      if (count > 0) {
        total *= count;
      }
    }

    this.totalSearches.textContent = total;

    // Show warning if too many searches
    const summary = document.querySelector('.search-summary');
    if (summary) {
      if (total > 20) {
        summary.classList.add('warning');
      } else {
        summary.classList.remove('warning');
      }
    }
  }

  /**
   * Display search results
   * @param {Array} results - Array of person objects
   */
  displayResults(results) {
    debugLogger.log('PopupUI', '=== DISPLAY RESULTS ===');
    debugLogger.log('PopupUI', `Received ${results.length} results to display`);

    // Log each result's source info
    results.forEach((person, idx) => {
      debugLogger.log('PopupUI', `Displaying result ${idx + 1}:`, {
        fullName: person.fullName,
        source: person.source,
        sourceTag: person.sourceTag,
        hasAncestryId: !!person.ancestryId,
        hasMhId: !!person.mhId,
        hasFsId: !!person.fsId,
        sourcesArray: person.sources?.map(s => s.name)
      });
    });

    this.resultsSection.classList.remove('hidden');
    this.resultsCount.textContent = `(${results.length} found)`;

    this.resultsList.innerHTML = '';

    // Show placeholder for hover instructions
    if (this.placeholderElement && results.length > 0) {
      this.placeholderElement.style.display = 'flex';
    }

    if (results.length === 0) {
      this.resultsList.innerHTML = '<p style="color: #888; text-align: center;">No results found</p>';
      return;
    }

    results.forEach((person, index) => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.id = `result-${index}`;

      const birthInfo = person.birthDate ? `Born: ${person.birthDate}` : '';
      const birthPlace = person.birthPlace ? ` in ${person.birthPlace}` : '';
      const deathInfo = person.deathDate ? ` | Died: ${person.deathDate}` : '';

      // Count family members
      const parentsCount = person.parents?.length || 0;
      const siblingsCount = person.siblings?.length || 0;
      const spousesCount = person.spouses?.length || 0;
      const childrenCount = person.children?.length || 0;
      const totalFamily = parentsCount + siblingsCount + spousesCount + childrenCount;

      // Generate source tag based on sourceTag field
      const sourceTagClass = this._getSourceTagClass(person.sourceTag);
      const sourceTagText = person.sourceTag || 'FS';

      // Generate ID display - show primary ID or first from sources array
      const primaryId = person.fsId || person.mhId ||
                       (person.sources && person.sources[0]?.id) || 'Unknown';

      // Generate source links
      const sourceLinks = this._generateResultSourceLinks(person);

      // Relevance score badge (if available)
      const relevanceScore = person.relevanceScore;
      const relevanceClass = relevanceScore >= 80 ? 'high' : relevanceScore >= 50 ? 'medium' : 'low';
      const relevanceBadge = relevanceScore !== undefined
        ? `<span class="relevance-badge ${relevanceClass}" title="Match relevance: ${relevanceScore}%">${Math.round(relevanceScore)}%</span>`
        : '';

      item.innerHTML = `
        <div class="result-header">
          <div class="result-name">
            ${relevanceBadge}
            ${person.fullName}
            <span class="source-tag ${sourceTagClass}">${sourceTagText}</span>
          </div>
          <div class="result-buttons">
            <button class="btn-details" data-index="${index}" title="View full details in new tab">
              Details
            </button>
            <button class="btn-save" data-index="${index}" title="Save to database">
              <span class="save-icon">+</span> Save
            </button>
          </div>
        </div>
        <div class="result-id">ID: ${primaryId}</div>
        <div class="result-details">
          ${birthInfo}${birthPlace}${deathInfo}
        </div>
        ${person.matchedVariant ? `<div class="result-details">Matched: ${person.matchedVariant}</div>` : ''}
        ${totalFamily > 0 ? `<div class="result-family">Family: ${parentsCount} parents, ${siblingsCount} siblings, ${spousesCount} spouses, ${childrenCount} children</div>` : ''}
        <div class="result-actions">
          ${sourceLinks}
        </div>
        <div class="save-status hidden" id="save-status-${index}"></div>
      `;

      // Add click handler for details button
      const detailsBtn = item.querySelector('.btn-details');
      detailsBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._openPersonDetail(person);
      });

      // Add click handler for save button
      const saveBtn = item.querySelector('.btn-save');
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleSavePerson(person, index);
      });

      // Add hover handlers for detail popup
      item.addEventListener('mouseenter', () => this._onResultHover(person, item));
      item.addEventListener('mouseleave', () => this._onResultLeave());

      this.resultsList.appendChild(item);
    });
  }

  /**
   * Open the person detail page in a new tab
   * @private
   * @param {Object} person - Person data to display
   */
  async _openPersonDetail(person) {
    try {
      // Ensure person has an ID
      if (!person.personId) {
        const sourceIds = person.sources?.map(s => s.id).join('-') || '';
        person.personId = sourceIds || `person-${Date.now()}`;
      }

      // Save person to storage for the detail page to retrieve
      await chrome.storage.local.set({
        currentDetailPerson: person
      });

      // Open detail page in new tab
      chrome.tabs.create({
        url: chrome.runtime.getURL(`detail.html?id=${encodeURIComponent(person.personId)}`)
      });
    } catch (error) {
      console.error('[PopupUI] Failed to open detail page:', error);
      this.showStatus('Failed to open detail page', 'error');
    }
  }

  /**
   * Handle mouse entering a result item
   * @private
   * @param {Object} person - Person data
   * @param {HTMLElement} item - The result item element
   */
  _onResultHover(person, item) {
    // Clear any pending hide timeout
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Show popup after short delay
    this.hoverTimeout = setTimeout(() => {
      this._showDetailPopup(person, item);
    }, 150);
  }

  /**
   * Handle mouse leaving a result item
   * @private
   */
  _onResultLeave() {
    // Clear show timeout if still pending
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Delay hiding to allow mouse to move to popup
    this.hoverTimeout = setTimeout(() => {
      if (!this.detailPopup.matches(':hover')) {
        this._hideDetailPopup();
      }
    }, 100);
  }

  /**
   * Show the detail popup for a person (positioned on the left side)
   * @private
   * @param {Object} person - Person data
   * @param {HTMLElement} item - The result item element
   */
  _showDetailPopup(person, item) {
    // Mark active item
    if (this.activeResultItem) {
      this.activeResultItem.classList.remove('hover-active');
    }
    this.activeResultItem = item;
    item.classList.add('hover-active');

    // Generate popup content
    this.detailPopup.innerHTML = this._generatePopupContent(person);

    // Hide placeholder, show popup
    if (this.placeholderElement) {
      this.placeholderElement.style.display = 'none';
    }

    // Show popup (CSS positions it on the left)
    this.detailPopup.classList.add('visible');
  }

  /**
   * Hide the detail popup
   * @private
   */
  _hideDetailPopup() {
    this.detailPopup.classList.remove('visible');
    if (this.activeResultItem) {
      this.activeResultItem.classList.remove('hover-active');
      this.activeResultItem = null;
    }

    // Show placeholder again
    if (this.placeholderElement) {
      this.placeholderElement.style.display = 'flex';
    }
  }

  /**
   * Generate HTML content for the detail popup
   * Organized for heir search purposes:
   * 1. Identity - Who is this person?
   * 2. Family - Who are their relatives? (CRITICAL for heir search)
   * 3. Source - Where did this data come from?
   * 4. Search - How did we find them?
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string
   */
  _generatePopupContent(person) {
    const lifespan = this._formatLifespan(person);

    return `
      <!-- Header: Name and Lifespan -->
      <div class="popup-header">
        <div class="popup-name">${person.fullName || 'Unknown'}</div>
        <div class="popup-lifespan">${lifespan}</div>
      </div>

      <!-- Section 1: Identity Information -->
      <div class="popup-section identity">
        <div class="popup-section-title">Identity</div>
        ${this._generateIdentityRows(person)}
      </div>

      <!-- Section 2: Family Relationships (Most important for heir search) -->
      <div class="popup-section family">
        <div class="popup-section-title">Family Relationships</div>
        ${this._generateFamilySection(person)}
      </div>

      <!-- Section 3: Source Information -->
      <div class="popup-section source">
        <div class="popup-section-title">Source</div>
        ${this._generateSourceRows(person)}
      </div>

      <!-- Section 4: Search Metadata -->
      <div class="popup-section search">
        <div class="popup-section-title">Search Info</div>
        ${this._generateSearchRows(person)}
      </div>

      <div class="popup-hint">Move mouse here to keep open</div>
    `;
  }

  /**
   * Format lifespan string
   * @private
   * @param {Object} person - Person data
   * @returns {string} Formatted lifespan
   */
  _formatLifespan(person) {
    const birthYear = this._extractYear(person.birthDate);
    const deathYear = this._extractYear(person.deathDate);

    if (birthYear && deathYear) {
      const age = parseInt(deathYear) - parseInt(birthYear);
      return `<span class="year">${birthYear}</span> - <span class="year">${deathYear}</span> (${age} years)`;
    } else if (birthYear) {
      return `Born <span class="year">${birthYear}</span>`;
    } else if (deathYear) {
      return `Died <span class="year">${deathYear}</span>`;
    }
    return 'Dates unknown';
  }

  /**
   * Extract year from date string
   * @private
   * @param {string} dateStr - Date string
   * @returns {string} Year or empty string
   */
  _extractYear(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/\d{4}/);
    return match ? match[0] : '';
  }

  /**
   * Generate identity information rows
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string
   */
  _generateIdentityRows(person) {
    let html = '';

    if (person.birthDate || person.birthPlace) {
      html += `
        <div class="popup-row">
          <span class="popup-label">Birth:</span>
          <span class="popup-value">${person.birthDate || ''} ${person.birthPlace ? `in ${person.birthPlace}` : ''}</span>
        </div>
      `;
    }

    if (person.deathDate || person.deathPlace) {
      html += `
        <div class="popup-row">
          <span class="popup-label">Death:</span>
          <span class="popup-value">${person.deathDate || ''} ${person.deathPlace ? `in ${person.deathPlace}` : ''}</span>
        </div>
      `;
    }

    if (person.sex) {
      html += `
        <div class="popup-row">
          <span class="popup-label">Sex:</span>
          <span class="popup-value">${person.sex}</span>
        </div>
      `;
    }

    if (!html) {
      html = '<div class="no-data">No identity details available</div>';
    }

    return html;
  }

  /**
   * Generate family relationships section
   * This is the MOST IMPORTANT section for heir search
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string
   */
  _generateFamilySection(person) {
    const parents = person.parents || [];
    const siblings = person.siblings || [];
    const spouses = person.spouses || [];
    const children = person.children || [];

    const totalFamily = parents.length + siblings.length + spouses.length + children.length;

    if (totalFamily === 0) {
      return '<div class="no-data">No family relationships found in this record</div>';
    }

    let html = '';

    // Parents - Important for establishing lineage
    if (parents.length > 0) {
      html += `
        <div class="family-group">
          <div class="family-group-label">
            Parents <span class="family-count">${parents.length}</span>
          </div>
          <ul class="family-member-list">
            ${parents.map(p => `
              <li class="family-member parent">
                ${typeof p === 'string' ? p : (p.name || 'Unknown')}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Spouses - Important for identifying married heirs
    if (spouses.length > 0) {
      html += `
        <div class="family-group">
          <div class="family-group-label">
            Spouses <span class="family-count">${spouses.length}</span>
          </div>
          <ul class="family-member-list">
            ${spouses.map(s => `
              <li class="family-member spouse">
                ${typeof s === 'string' ? s : (s.name || 'Unknown')}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Children - CRITICAL for heir search (direct descendants)
    if (children.length > 0) {
      html += `
        <div class="family-group">
          <div class="family-group-label">
            Children <span class="family-count">${children.length}</span>
          </div>
          <ul class="family-member-list">
            ${children.map(c => `
              <li class="family-member child">
                ${typeof c === 'string' ? c : (c.name || 'Unknown')}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    // Siblings - Important for collateral heirs
    if (siblings.length > 0) {
      html += `
        <div class="family-group">
          <div class="family-group-label">
            Siblings <span class="family-count">${siblings.length}</span>
          </div>
          <ul class="family-member-list">
            ${siblings.map(s => `
              <li class="family-member sibling">
                ${typeof s === 'string' ? s : (s.name || 'Unknown')}
              </li>
            `).join('')}
          </ul>
        </div>
      `;
    }

    return html;
  }

  /**
   * Generate source information rows
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string
   */
  _generateSourceRows(person) {
    let html = '';

    // Handle multi-source persons (new format with sources array)
    if (person.sources && person.sources.length > 0) {
      // Show source tag
      const sourceTagClass = this._getSourceTagClass(person.sourceTag);
      html += `
        <div class="popup-row">
          <span class="popup-label">Sources:</span>
          <span class="popup-value"><span class="source-tag ${sourceTagClass}">${person.sourceTag || 'FS'}</span></span>
        </div>
      `;

      // Deduplicate sources by name for display
      const seenSources = new Set();
      for (const source of person.sources) {
        if (seenSources.has(source.name)) continue;
        seenSources.add(source.name);

        let sourceLabel;
        if (source.name === 'FamilySearch') {
          sourceLabel = 'FS ID';
        } else if (source.name === 'Ancestry') {
          sourceLabel = 'AN ID';
        } else {
          sourceLabel = 'MH ID';
        }

        html += `
          <div class="popup-row">
            <span class="popup-label">${sourceLabel}:</span>
            <span class="popup-value">
              <span class="fs-id">${source.id || 'Unknown'}</span>
              ${source.url ? `<a href="${source.url}" target="_blank" class="popup-link">View</a>` : ''}
            </span>
          </div>
        `;

        if (source.collection) {
          html += `
            <div class="popup-row">
              <span class="popup-label">Collection:</span>
              <span class="popup-value">${source.collection}</span>
            </div>
          `;
        }
      }
    } else {
      // Legacy format - single source (FamilySearch)
      html += `
        <div class="popup-row">
          <span class="popup-label">FS ID:</span>
          <span class="popup-value"><span class="fs-id">${person.fsId || 'Unknown'}</span></span>
        </div>
      `;

      if (person.collectionName) {
        html += `
          <div class="popup-row">
            <span class="popup-label">Collection:</span>
            <span class="popup-value">${person.collectionName}</span>
          </div>
        `;
      }
    }

    if (person.extractedAt) {
      const date = new Date(person.extractedAt);
      html += `
        <div class="popup-row">
          <span class="popup-label">Extracted:</span>
          <span class="popup-value">${date.toLocaleDateString()} ${date.toLocaleTimeString()}</span>
        </div>
      `;
    }

    return html;
  }

  /**
   * Get CSS class for source tag
   * @private
   * @param {string} sourceTag - Source tag string (e.g., 'FS', 'MH', 'AN', 'FS+MH', 'FS+MH+AN')
   * @returns {string} CSS class name
   */
  _getSourceTagClass(sourceTag) {
    if (!sourceTag) return 'fs';

    // Multi-source combinations
    if (sourceTag.includes('+')) {
      return 'multi'; // Use 'multi' class for any combination
    }

    // Single sources
    if (sourceTag === 'AN') return 'an';
    if (sourceTag === 'MH') return 'mh';
    return 'fs';
  }

  /**
   * Generate source links for result item
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string with source links
   */
  _generateResultSourceLinks(person) {
    // Handle multi-source persons
    if (person.sources && person.sources.length > 0) {
      // Deduplicate sources by name (only show one link per source type)
      const seenSources = new Set();
      const uniqueLinks = [];

      for (const source of person.sources) {
        if (seenSources.has(source.name)) continue;
        seenSources.add(source.name);

        let linkClass, linkLabel;
        if (source.name === 'FamilySearch') {
          linkClass = 'fs-link';
          linkLabel = 'FamilySearch';
        } else if (source.name === 'Ancestry') {
          linkClass = 'an-link';
          linkLabel = 'Ancestry';
        } else {
          linkClass = 'mh-link';
          linkLabel = 'MyHeritage';
        }

        uniqueLinks.push(`<a href="${source.url}" target="_blank" class="result-link ${linkClass}">View on ${linkLabel}</a>`);
      }

      return uniqueLinks.join(' ');
    }

    // Legacy format - single FamilySearch source
    return `<a href="${person.sourceUrl}" target="_blank" class="result-link">View on FamilySearch</a>`;
  }

  /**
   * Generate search metadata rows
   * @private
   * @param {Object} person - Person data
   * @returns {string} HTML string
   */
  _generateSearchRows(person) {
    let html = '';

    if (person.matchedVariant) {
      html += `
        <div class="popup-row">
          <span class="popup-label">Matched:</span>
          <span class="popup-value">
            <span class="variant-chip-small matched">${person.matchedVariant}</span>
          </span>
        </div>
      `;
    }

    if (person.searchedVariants && person.searchedVariants.length > 0) {
      const otherVariants = person.searchedVariants.filter(v => v !== person.matchedVariant);
      if (otherVariants.length > 0) {
        html += `
          <div class="popup-row">
            <span class="popup-label">Also tried:</span>
            <span class="popup-value">
              ${otherVariants.map(v => `<span class="variant-chip-small">${v}</span>`).join('')}
            </span>
          </div>
        `;
      }
    }

    if (person.mergedFsIds && person.mergedFsIds.length > 1) {
      html += `
        <div class="popup-row">
          <span class="popup-label">Merged IDs:</span>
          <span class="popup-value">${person.mergedFsIds.length} records combined</span>
        </div>
      `;
    }

    if (!html) {
      html = '<div class="no-data">No search metadata</div>';
    }

    return html;
  }

  /**
   * Handle saving a single person to the database
   * @param {Object} person - Person object to save
   * @param {number} index - Index in results list
   */
  async handleSavePerson(person, index) {
    if (!this.api) {
      this.showStatus('API not configured', 'error');
      return;
    }

    const saveBtn = document.querySelector(`#result-${index} .btn-save`);
    const saveStatus = document.getElementById(`save-status-${index}`);

    // Disable button and show loading
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="save-icon">⏳</span> Saving...';

    try {
      // Prepare person data with extractedAt timestamp
      const personToSave = {
        ...person,
        extractedAt: person.extractedAt || new Date().toISOString()
      };

      // Call API to save
      const result = await this.api.savePersons([personToSave], this.state?.params || {});

      if (result.success) {
        // Success - update button
        saveBtn.innerHTML = '<span class="save-icon">✓</span> Saved';
        saveBtn.classList.add('saved');

        // Show family info in status
        const savedPerson = result.persons?.[0];
        if (savedPerson) {
          saveStatus.innerHTML = this.formatSaveConfirmation(result, person);
          saveStatus.classList.remove('hidden');
        }

        this.showStatus(`Saved ${person.fullName} to database`, 'success');
        setTimeout(() => this.hideStatus(), 3000);
      } else {
        throw new Error(result.error || 'Failed to save');
      }
    } catch (error) {
      console.error('[PopupUI] Save error:', error);
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="save-icon">✗</span> Retry';
      saveBtn.classList.add('error');
      this.showStatus(`Failed to save: ${error.message}`, 'error');
    }
  }

  /**
   * Format save confirmation message with family details
   * @param {Object} result - API result
   * @param {Object} person - Original person data
   * @returns {string} HTML string
   */
  formatSaveConfirmation(result, person) {
    let html = `<div class="save-confirmation">`;
    html += `<strong>✓ Saved to Neo4j</strong>`;

    // Show relationship counts
    const relationships = [];
    if (person.parents?.length) relationships.push(`${person.parents.length} parent(s)`);
    if (person.siblings?.length) relationships.push(`${person.siblings.length} sibling(s)`);
    if (person.spouses?.length) relationships.push(`${person.spouses.length} spouse(s)`);
    if (person.children?.length) relationships.push(`${person.children.length} child(ren)`);

    if (relationships.length > 0) {
      html += `<div class="family-saved">Relationships: ${relationships.join(', ')}</div>`;
    }

    // Show match info if any
    if (result.matched > 0) {
      html += `<div class="matches-found">⚡ ${result.matched} potential duplicate(s) found</div>`;
    }

    html += `</div>`;
    return html;
  }

  /**
   * Clear all results
   */
  clearResults() {
    this.resultsList.innerHTML = '';
    this.resultsCount.textContent = '';
    this.resultsSection.classList.add('hidden');

    // Clean up hover popup state
    this._hideDetailPopup();
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }

    // Hide placeholder when no results
    if (this.placeholderElement) {
      this.placeholderElement.style.display = 'none';
    }
  }
}
