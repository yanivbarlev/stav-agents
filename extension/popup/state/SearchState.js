/**
 * SearchState - Centralized state management for search parameters and variants
 * Handles Chrome storage persistence
 */
export class SearchState {
  constructor() {
    // Generated variants for each field
    this.variants = {
      firstName: [],
      lastName: [],
      spouseName: [],
      fatherName: [],
      motherName: []
    };

    // Current search parameters
    this.params = null;

    // Last successful search parameters
    this.lastParams = null;
  }

  /**
   * Update variants for a specific field
   * @param {string} field - Field name (firstName, lastName, etc.)
   * @param {Array} variants - Array of variant objects with {name, confidence}
   */
  updateVariants(field, variants) {
    if (this.variants.hasOwnProperty(field)) {
      this.variants[field] = variants || [];
    }
  }

  /**
   * Update all variants at once
   * @param {Object} allVariants - Object containing variants for all fields
   */
  updateAllVariants(allVariants) {
    for (const [field, variants] of Object.entries(allVariants)) {
      this.updateVariants(field, variants);
    }
  }

  /**
   * Update current search parameters
   * @param {Object} params - Search parameters
   */
  updateParams(params) {
    this.params = params;
    this.lastParams = params;
  }

  /**
   * Get selected variants by reading checkbox states
   * @returns {Object} Selected variants for each field
   */
  getSelectedVariants() {
    const selected = {};

    for (const field of Object.keys(this.variants)) {
      const checkboxes = document.querySelectorAll(`input[id^="${field}-"]:checked`);
      selected[field] = Array.from(checkboxes).map(cb => cb.value);
    }

    return selected;
  }

  /**
   * Reset all state
   */
  reset() {
    this.variants = {
      firstName: [],
      lastName: [],
      spouseName: [],
      fatherName: [],
      motherName: []
    };
    this.params = null;
  }

  /**
   * Save current state to Chrome storage
   * @returns {Promise<void>}
   */
  async saveToStorage() {
    try {
      await chrome.storage.local.set({
        lastSearch: this.lastParams
      });
    } catch (error) {
      console.error('[SearchState] Failed to save to storage:', error);
    }
  }

  /**
   * Load state from Chrome storage
   * @returns {Promise<Object|null>} Loaded parameters or null
   */
  async loadFromStorage() {
    try {
      const result = await chrome.storage.local.get(['lastSearch']);
      if (result.lastSearch) {
        this.lastParams = result.lastSearch;
        return result.lastSearch;
      }
      return null;
    } catch (error) {
      console.error('[SearchState] Failed to load from storage:', error);
      return null;
    }
  }

  /**
   * Get field labels for display
   * @returns {Object} Field labels
   */
  static getFieldLabels() {
    return {
      firstName: 'First Name',
      lastName: 'Last Name',
      spouseName: 'Spouse Name',
      fatherName: "Father's Name",
      motherName: "Mother's Name"
    };
  }
}
