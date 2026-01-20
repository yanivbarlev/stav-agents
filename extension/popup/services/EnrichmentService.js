/**
 * EnrichmentService - Fetches detailed data from source URLs and merges it
 *
 * Handles:
 * - Opening source URLs in background tabs
 * - Extracting detailed data using existing content scripts
 * - Merging data from multiple sources
 * - Deduplicating family members
 * - Storing enriched data locally
 */

import { ensureContentScriptReady } from '../utils/contentScriptInjector.js';

export class EnrichmentService {
  constructor() {
    this.isEnriching = false;
    this.shouldCancel = false;
    this.currentTabId = null;
  }

  /**
   * Enrich a person with data from all their source URLs
   * @param {Object} person - Person object with sources array
   * @param {Function} [progressCallback] - Callback for progress updates (message, type)
   * @returns {Promise<Object>} Enriched person with merged data
   */
  async enrichPerson(person, progressCallback = null) {
    if (this.isEnriching) {
      throw new Error('Enrichment already in progress');
    }

    this.isEnriching = true;
    this.shouldCancel = false;

    try {
      // Get all source URLs to fetch
      const sourceUrls = this._extractSourceUrls(person);

      if (sourceUrls.length === 0) {
        throw new Error('No source URLs available to enrich from');
      }

      this._updateProgress(progressCallback, `Enriching from ${sourceUrls.length} source(s)...`, 'info');

      const enrichmentResults = [];

      // Process each source URL
      for (let i = 0; i < sourceUrls.length; i++) {
        if (this.shouldCancel) {
          this._updateProgress(progressCallback, 'Enrichment cancelled', 'info');
          break;
        }

        const source = sourceUrls[i];
        this._updateProgress(
          progressCallback,
          `Fetching from ${source.name} (${i + 1}/${sourceUrls.length})...`,
          'info',
          { current: i + 1, total: sourceUrls.length }
        );

        try {
          const data = await this._fetchFromSource(source);
          enrichmentResults.push({
            source: source.name,
            sourceId: source.id,
            data,
            success: true
          });
          console.log(`[EnrichmentService] Successfully extracted from ${source.name}:`, data);
        } catch (error) {
          console.error(`[EnrichmentService] Failed to extract from ${source.name}:`, error);
          enrichmentResults.push({
            source: source.name,
            sourceId: source.id,
            error: error.message,
            success: false
          });
        }
      }

      // Merge all results
      const mergedPerson = this._mergeEnrichmentResults(person, enrichmentResults);

      // Save enriched data
      await this._saveEnrichedPerson(mergedPerson);

      const successCount = enrichmentResults.filter(r => r.success).length;
      this._updateProgress(
        progressCallback,
        `Enriched from ${successCount}/${sourceUrls.length} sources`,
        successCount === sourceUrls.length ? 'success' : 'info'
      );

      return mergedPerson;

    } finally {
      this.isEnriching = false;
      this.shouldCancel = false;
    }
  }

  /**
   * Cancel the current enrichment operation
   */
  cancel() {
    this.shouldCancel = true;
    // Close current tab if open
    if (this.currentTabId) {
      chrome.tabs.remove(this.currentTabId).catch(() => {});
      this.currentTabId = null;
    }
  }

  /**
   * Extract source URLs from person object
   * @private
   */
  _extractSourceUrls(person) {
    const urls = [];

    // Check sources array (new format)
    if (person.sources && person.sources.length > 0) {
      for (const source of person.sources) {
        if (source.url && !source.enriched) {
          urls.push({
            name: source.name || 'Unknown',
            id: source.id,
            url: source.url,
            collection: source.collection
          });
        }
      }
    }

    // Fallback to sourceUrl (legacy format)
    if (urls.length === 0 && person.sourceUrl) {
      urls.push({
        name: 'FamilySearch',
        id: person.fsId || 'unknown',
        url: person.sourceUrl,
        collection: person.collectionName
      });
    }

    return urls;
  }

  /**
   * Fetch data from a single source URL
   * @private
   */
  async _fetchFromSource(source) {
    // Determine which content script to use based on URL
    const isFamilySearch = source.url.includes('familysearch.org');
    const isMyHeritage = source.url.includes('myheritage.com') || source.url.includes('myheritage.co.il');

    if (!isFamilySearch && !isMyHeritage) {
      throw new Error(`Unsupported source URL: ${source.url}`);
    }

    // Ensure English language for FamilySearch URLs
    let urlToOpen = source.url;
    if (isFamilySearch) {
      urlToOpen = this._ensureEnglishUrl(source.url);
    }

    // Open tab in background
    const tab = await chrome.tabs.create({ url: urlToOpen, active: false });
    this.currentTabId = tab.id;

    try {
      // Wait for tab to load
      await this._waitForTabLoad(tab.id, 15000);

      // Extra wait for SPA rendering
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Ensure content script is ready
      await ensureContentScriptReady(tab.id);

      // Extract data
      const result = await chrome.tabs.sendMessage(tab.id, {
        action: 'extractFamilyFromDetailPage'
      });

      if (result.error) {
        throw new Error(result.error);
      }

      return result.familyData || {};

    } finally {
      // Always close the tab
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {
        // Tab may already be closed
      }
      this.currentTabId = null;
    }
  }

  /**
   * Wait for a tab to finish loading
   * @private
   */
  _waitForTabLoad(tabId, timeoutMs = 15000) {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tabId);
      }, timeoutMs);

      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tabId);
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    });
  }

  /**
   * Merge enrichment results into the base person
   * @private
   */
  _mergeEnrichmentResults(basePerson, results) {
    // Start with deep copy of base person
    const merged = JSON.parse(JSON.stringify(basePerson));
    merged.alternatives = merged.alternatives || {};
    merged.fieldSources = merged.fieldSources || {};

    for (const result of results) {
      if (!result.success || !result.data) continue;

      const data = result.data;
      const sourceName = result.source;

      // Merge identity fields
      this._mergeField(merged, 'birthDate', data.birthDate, sourceName);
      this._mergeField(merged, 'birthPlace', data.birthPlace, sourceName);
      this._mergeField(merged, 'deathDate', data.deathDate, sourceName);
      this._mergeField(merged, 'deathPlace', data.deathPlace, sourceName);
      this._mergeField(merged, 'sex', data.sex, sourceName);

      // Merge new identity fields
      this._mergeField(merged, 'nationality', data.nationality, sourceName);
      this._mergeField(merged, 'lastResidence', data.lastResidence, sourceName);
      this._mergeField(merged, 'maritalStatus', data.maritalStatus, sourceName);
      this._mergeField(merged, 'occupation', data.occupation, sourceName);

      // Merge immigration/travel fields
      this._mergeField(merged, 'arrivalDate', data.arrivalDate, sourceName);
      this._mergeField(merged, 'departurePort', data.departurePort, sourceName);
      this._mergeField(merged, 'shipName', data.shipName, sourceName);
      this._mergeField(merged, 'rawRecord', data.rawRecord, sourceName);

      // Merge addresses array
      if (data.addresses && data.addresses.length > 0) {
        merged.addresses = merged.addresses || [];
        for (const addr of data.addresses) {
          const exists = merged.addresses.some(a =>
            a.address === addr.address && a.year === addr.year
          );
          if (!exists) {
            merged.addresses.push({ ...addr, source: sourceName });
          }
        }
      }

      // Merge occupations array
      if (data.occupations && data.occupations.length > 0) {
        merged.occupations = merged.occupations || [];
        for (const occ of data.occupations) {
          const exists = merged.occupations.some(o =>
            o.occupation === occ.occupation
          );
          if (!exists) {
            merged.occupations.push({ ...occ, source: sourceName });
          }
        }
      } else if (data.occupation) {
        merged.occupations = merged.occupations || [];
        if (!merged.occupations.some(o => o.occupation === data.occupation)) {
          merged.occupations.push({ occupation: data.occupation, source: sourceName });
        }
      }

      // Merge family members with deduplication
      merged.parents = this._mergeFamily(merged.parents, data.parents, sourceName, 'parent');
      merged.spouses = this._mergeFamily(merged.spouses, data.spouses, sourceName, 'spouse');
      merged.children = this._mergeFamily(merged.children, data.children, sourceName, 'child');
      merged.siblings = this._mergeFamily(merged.siblings, data.siblings, sourceName, 'sibling');

      // Merge relatives (cousins, extended family)
      merged.relatives = this._mergeFamily(merged.relatives, data.relatives, sourceName, 'relative');

      // Mark source as enriched
      const sourceIdx = merged.sources?.findIndex(s => s.id === result.sourceId);
      if (sourceIdx >= 0) {
        merged.sources[sourceIdx].enriched = true;
        merged.sources[sourceIdx].enrichedAt = new Date().toISOString();
      }
    }

    // Update enrichment status
    const totalSources = merged.sources?.length || 0;
    const enrichedCount = merged.sources?.filter(s => s.enriched).length || 0;

    merged.enrichmentStatus = enrichedCount === totalSources ? 'complete' :
                               enrichedCount > 0 ? 'partial' : 'none';
    merged.lastEnrichedAt = new Date().toISOString();

    return merged;
  }

  /**
   * Merge a single field, handling conflicts
   * @private
   */
  _mergeField(person, field, newValue, sourceName) {
    if (!newValue || newValue === '-') return;

    const normalizedNew = newValue.trim();
    if (!normalizedNew) return;

    if (!person[field] || person[field] === '-') {
      // No existing value - use new one
      person[field] = normalizedNew;
      person.fieldSources[field] = sourceName;
    } else if (this._normalizeValue(person[field]) !== this._normalizeValue(normalizedNew)) {
      // Conflict - store as alternative
      person.alternatives[field] = person.alternatives[field] || [];

      // Check if this alternative already exists
      const exists = person.alternatives[field].some(
        a => this._normalizeValue(a.value) === this._normalizeValue(normalizedNew)
      );

      if (!exists) {
        person.alternatives[field].push({
          value: normalizedNew,
          source: sourceName
        });
      }
    }
    // If same value (normalized), no action needed
  }

  /**
   * Normalize a value for comparison
   * @private
   */
  _normalizeValue(value) {
    return (value || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Merge family members with deduplication
   * @private
   */
  _mergeFamily(existing, newMembers, sourceName, relationType) {
    if (!newMembers || newMembers.length === 0) return existing || [];
    if (!existing) existing = [];

    for (const newMember of newMembers) {
      const newName = typeof newMember === 'string' ? newMember : newMember.name;
      if (!newName) continue;

      const normalizedNewName = this._normalizeName(newName);

      // Find matching existing member
      const matchIdx = existing.findIndex(e => {
        const existingName = typeof e === 'string' ? e : e.name;
        return this._normalizeName(existingName) === normalizedNewName;
      });

      if (matchIdx >= 0) {
        // Found match - add source reference
        let existingMember = existing[matchIdx];

        // Convert string to object if needed
        if (typeof existingMember === 'string') {
          existingMember = { name: existingMember, relationship: relationType };
          existing[matchIdx] = existingMember;
        }

        // Add source ref
        existingMember.sourceRefs = existingMember.sourceRefs || [];
        if (!existingMember.sourceRefs.includes(sourceName)) {
          existingMember.sourceRefs.push(sourceName);
        }

        // Merge additional data (sex, relationship)
        if (typeof newMember === 'object') {
          if (newMember.sex && !existingMember.sex) {
            existingMember.sex = newMember.sex;
          }
          if (newMember.relationship && !existingMember.relationship) {
            existingMember.relationship = newMember.relationship;
          }
        }
      } else {
        // Add new member
        const memberObj = typeof newMember === 'string'
          ? { name: newMember, relationship: relationType, sourceRefs: [sourceName] }
          : { ...newMember, sourceRefs: [sourceName] };

        existing.push(memberObj);
      }
    }

    return existing;
  }

  /**
   * Normalize a name for comparison
   * @private
   */
  _normalizeName(name) {
    return (name || '').toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Ensure FamilySearch URL uses English language
   * Adds or updates lang=en parameter
   * @private
   * @param {string} url - Original URL
   * @returns {string} URL with English language parameter
   */
  _ensureEnglishUrl(url) {
    try {
      const urlObj = new URL(url);

      // Set lang parameter to English
      urlObj.searchParams.set('lang', 'en');

      return urlObj.toString();
    } catch (e) {
      // If URL parsing fails, try simple string manipulation
      if (url.includes('?')) {
        if (url.includes('lang=')) {
          // Replace existing lang parameter
          return url.replace(/lang=[^&]+/, 'lang=en');
        }
        return url + '&lang=en';
      }
      return url + '?lang=en';
    }
  }

  /**
   * Save enriched person to local storage
   * @private
   */
  async _saveEnrichedPerson(person) {
    try {
      // Get existing enriched persons
      const data = await chrome.storage.local.get(['enrichedPersons']);
      const enrichedPersons = data.enrichedPersons || {};

      // Save this person
      enrichedPersons[person.personId] = person;

      await chrome.storage.local.set({ enrichedPersons });

      // Also update currentDetailPerson if it's the same person
      const currentData = await chrome.storage.local.get(['currentDetailPerson']);
      if (currentData.currentDetailPerson?.personId === person.personId) {
        await chrome.storage.local.set({ currentDetailPerson: person });
      }

      console.log(`[EnrichmentService] Saved enriched person ${person.personId}`);
    } catch (error) {
      console.error('[EnrichmentService] Failed to save enriched person:', error);
    }
  }

  /**
   * Update progress callback
   * @private
   */
  _updateProgress(callback, message, type, progress = null) {
    if (callback) {
      callback(message, type, progress);
    }
  }

  /**
   * Get an enriched person from storage
   * @static
   */
  static async getEnrichedPerson(personId) {
    const data = await chrome.storage.local.get(['enrichedPersons']);
    return data.enrichedPersons?.[personId] || null;
  }

  /**
   * Check if a person has been enriched
   * @static
   */
  static async isPersonEnriched(personId) {
    const person = await EnrichmentService.getEnrichedPerson(personId);
    return person?.enrichmentStatus === 'complete';
  }
}
