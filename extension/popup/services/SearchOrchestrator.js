/**
 * SearchOrchestrator - Orchestrates the multi-tab search and extraction process
 * Core refactoring: Extracts the massive performSearch() logic into organized methods
 */

import { buildSearchUrlPermutations } from '../utils/urlBuilder.js';
import { ensureContentScriptReady, ensureContentScriptReadyFast } from '../utils/contentScriptInjector.js';

export class SearchOrchestrator {
  /**
   * @param {import('./ChromeExtensionAPI.js').ChromeExtensionAPI} chromeAPI - Chrome API wrapper
   */
  constructor(chromeAPI) {
    this.chromeAPI = chromeAPI;
  }

  /**
   * Execute the complete search workflow
   * @param {Object} selectedVariants - Selected variants for each field
   * @param {Object} searchParams - Search parameters
   * @param {Function} [statusCallback] - Optional callback for status updates
   * @returns {Promise<Array>} Extracted and deduplicated persons
   */
  async executeSearch(selectedVariants, searchParams, statusCallback) {
    // Validate required fields
    if (!selectedVariants.firstName || selectedVariants.firstName.length === 0) {
      throw new Error('Please select at least one first name variant');
    }
    if (!selectedVariants.lastName || selectedVariants.lastName.length === 0) {
      throw new Error('Please select at least one last name variant');
    }

    this._updateStatus(statusCallback, 'Building search combinations...', 'info');

    // Build all search URL permutations
    const searchUrls = buildSearchUrlPermutations(selectedVariants, searchParams);

    this._updateStatus(statusCallback, `Opening ${searchUrls.length} search tabs...`, 'info');

    // Open all search tabs
    const openedTabs = await this._openSearchTabs(searchUrls);

    this._updateStatus(statusCallback, `Waiting for ${openedTabs.length} tabs to load...`, 'info');

    // Wait for all tabs to load
    await this._waitForAllTabs(openedTabs);

    // Extra delay for content scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));

    this._updateStatus(statusCallback, 'Extracting results from all tabs...', 'info');

    // Extract from all tabs
    const allPersons = await this._extractFromAllTabs(openedTabs, statusCallback);

    this._updateStatus(
      statusCallback,
      `Extracted ${allPersons.length} unique results from ${openedTabs.length} tabs`,
      'success'
    );

    if (allPersons.length === 0) {
      throw new Error('No results found across all searches');
    }

    return allPersons;
  }

  /**
   * Extract from a single tab (for manual extraction)
   * @param {chrome.tabs.Tab} tab - Tab to extract from
   * @returns {Promise<Array>} Extracted persons
   */
  async extractFromTab(tab) {
    if (!tab.url || !tab.url.includes('familysearch.org')) {
      throw new Error('Please navigate to a FamilySearch search results page first');
    }

    // Ensure content script is ready (fast version for manual extraction)
    await ensureContentScriptReadyFast(tab.id);

    // Extract results
    const tabResults = await this.chromeAPI.sendMessageToTab(tab.id, {
      action: 'extractResults'
    });

    if (tabResults.error) {
      throw new Error(tabResults.error);
    }

    return tabResults.persons || [];
  }

  /**
   * Open all search tabs
   * @private
   * @param {Array} searchUrls - Array of {url, firstName, lastName, ...} objects
   * @returns {Promise<Array>} Opened tabs with variant info
   */
  async _openSearchTabs(searchUrls) {
    const openedTabs = [];

    for (const search of searchUrls) {
      const tab = await this.chromeAPI.createTab(search.url, false);
      openedTabs.push({
        tab,
        firstName: search.firstName,
        lastName: search.lastName,
        spouseName: search.spouseName,
        fatherName: search.fatherName,
        motherName: search.motherName
      });

      // Small delay between tab creation
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return openedTabs;
  }

  /**
   * Wait for all tabs to finish loading
   * @private
   * @param {Array} openedTabs - Array of {tab, ...} objects
   * @returns {Promise<void>}
   */
  async _waitForAllTabs(openedTabs) {
    const tabIds = openedTabs.map(({ tab }) => tab.id);
    await this.chromeAPI.waitForTabsLoad(tabIds, 30000);
  }

  /**
   * Extract from all tabs with deduplication
   * @private
   * @param {Array} openedTabs - Array of {tab, firstName, lastName, ...} objects
   * @param {Function} [statusCallback] - Optional callback for status updates
   * @returns {Promise<Array>} Deduplicated persons
   */
  async _extractFromAllTabs(openedTabs, statusCallback) {
    const allPersons = [];
    const seenIds = new Set(); // FamilySearch IDs
    const seenNames = new Map(); // name -> person index for name-based dedup
    let successCount = 0;

    for (let i = 0; i < openedTabs.length; i++) {
      const { tab, firstName, lastName, spouseName, fatherName, motherName } = openedTabs[i];

      try {
        // Build variant label for status message
        const variantLabel = [firstName, lastName, spouseName, fatherName, motherName]
          .filter(v => v)
          .join(' / ');

        this._updateStatus(
          statusCallback,
          `Extracting from tab ${i + 1}/${openedTabs.length} (${variantLabel})...`,
          'info'
        );

        // Ensure content script is ready
        await ensureContentScriptReady(tab.id);

        // Extract results
        const tabResults = await this.chromeAPI.sendMessageToTab(tab.id, {
          action: 'extractResults'
        });

        if (tabResults && tabResults.persons) {
          // Add variant info and deduplicate
          for (const person of tabResults.persons) {
            // First check by FamilySearch ID (same exact record)
            if (seenIds.has(person.fsId)) {
              // Duplicate by fsId - track additional variant
              const existing = allPersons.find(p => p.fsId === person.fsId);
              if (existing) {
                this._addVariantToExisting(existing, firstName, lastName);
              }
              continue;
            }

            // Then check by name + birth/death dates (different records for same person)
            const nameKey = this._generateNameKey(person);
            if (seenNames.has(nameKey)) {
              // Duplicate by name - merge into existing
              const existingIndex = seenNames.get(nameKey);
              const existing = allPersons[existingIndex];
              if (existing) {
                this._addVariantToExisting(existing, firstName, lastName);
                // Also track the additional fsId
                if (!existing.mergedFsIds) {
                  existing.mergedFsIds = [existing.fsId];
                }
                existing.mergedFsIds.push(person.fsId);
              }
              seenIds.add(person.fsId); // Mark this fsId as seen too
              continue;
            }

            // New person - add variant info
            person.matchedVariant = `${firstName} ${lastName}`;
            person.originalFirstName = person.originalFirstName || firstName;
            person.originalLastName = person.originalLastName || lastName;
            allPersons.push(person);
            seenIds.add(person.fsId);
            seenNames.set(nameKey, allPersons.length - 1);
          }
          successCount++;
        }

        // Close the tab after extraction
        await this.chromeAPI.removeTab(tab.id);

      } catch (error) {
        console.error(`[SearchOrchestrator] Failed to extract from tab ${i + 1}:`, error);

        // Try to close tab even if extraction failed
        try {
          await this.chromeAPI.removeTab(tab.id);
        } catch (closeError) {
          console.error('[SearchOrchestrator] Failed to close tab:', closeError);
        }
      }
    }

    console.log(
      `[SearchOrchestrator] Successfully extracted from ${successCount}/${openedTabs.length} tabs`
    );
    console.log(
      `[SearchOrchestrator] ${allPersons.length} unique persons after name-based deduplication`
    );

    return allPersons;
  }

  /**
   * Generate a unique key for name-based deduplication
   * Uses name + birth year + death year to identify same person across different records
   * @private
   * @param {Object} person - Person object
   * @returns {string} Unique key for deduplication
   */
  _generateNameKey(person) {
    const name = (person.fullName || '').toLowerCase().trim();
    const birthYear = this._extractYear(person.birthDate);
    const deathYear = this._extractYear(person.deathDate);
    return `${name}|${birthYear}|${deathYear}`;
  }

  /**
   * Extract year from a date string
   * @private
   * @param {string} dateStr - Date string (e.g., "1952", "10 May 1952", "31 July 2019")
   * @returns {string} Year or empty string
   */
  _extractYear(dateStr) {
    if (!dateStr) return '';
    const match = dateStr.match(/\d{4}/);
    return match ? match[0] : '';
  }

  /**
   * Add variant info to an existing person (for duplicates)
   * @private
   * @param {Object} existing - Existing person object
   * @param {string} firstName - First name variant
   * @param {string} lastName - Last name variant
   */
  _addVariantToExisting(existing, firstName, lastName) {
    if (!existing.searchedVariants) {
      existing.searchedVariants = [existing.matchedVariant];
    }
    const variantString = `${firstName} ${lastName}`;
    if (!existing.searchedVariants.includes(variantString)) {
      existing.searchedVariants.push(variantString);
    }
  }

  /**
   * Update status via callback if provided
   * @private
   * @param {Function} [statusCallback] - Status callback function
   * @param {string} message - Status message
   * @param {string} type - Status type (info, success, error)
   */
  _updateStatus(statusCallback, message, type) {
    if (statusCallback) {
      statusCallback(message, type);
    }
  }
}
