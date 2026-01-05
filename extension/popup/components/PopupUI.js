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
    this.resultsSection.classList.remove('hidden');
    this.resultsCount.textContent = `(${results.length} found)`;

    this.resultsList.innerHTML = '';

    if (results.length === 0) {
      this.resultsList.innerHTML = '<p style="color: #888; text-align: center;">No results found</p>';
      return;
    }

    results.forEach(person => {
      const item = document.createElement('div');
      item.className = 'result-item';

      const birthInfo = person.birthDate ? `Born: ${person.birthDate}` : '';
      const birthPlace = person.birthPlace ? ` in ${person.birthPlace}` : '';
      const deathInfo = person.deathDate ? ` | Died: ${person.deathDate}` : '';

      item.innerHTML = `
        <div class="result-name">${person.fullName}</div>
        <div class="result-id">ID: ${person.fsId}</div>
        <div class="result-details">
          ${birthInfo}${birthPlace}${deathInfo}
        </div>
        ${person.matchedVariant ? `<div class="result-details">Matched: ${person.matchedVariant}</div>` : ''}
        <a href="${person.sourceUrl}" target="_blank" class="result-link">View on FamilySearch</a>
      `;

      this.resultsList.appendChild(item);
    });
  }

  /**
   * Clear all results
   */
  clearResults() {
    this.resultsList.innerHTML = '';
    this.resultsCount.textContent = '';
    this.resultsSection.classList.add('hidden');
  }
}
