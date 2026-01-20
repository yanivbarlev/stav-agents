/**
 * SearchOrchestrator - Orchestrates the multi-tab search and extraction process
 * Supports multiple sources: FamilySearch + MyHeritage with cross-source deduplication
 */

import { buildMultiSourceSearchUrls, SOURCES } from '../utils/urlBuilder.js';
import { ensureContentScriptReady, ensureContentScriptReadyFast } from '../utils/contentScriptInjector.js';
import { sortByRelevance } from '../utils/relevanceScoring.js';
import { BackendAPI } from './BackendAPI.js';

export class SearchOrchestrator {
  /**
   * @param {import('./ChromeExtensionAPI.js').ChromeExtensionAPI} chromeAPI - Chrome API wrapper
   * @param {BackendAPI} [backendAPI] - Backend API client for AI analysis
   */
  constructor(chromeAPI, backendAPI = null) {
    this.chromeAPI = chromeAPI;
    this.backendAPI = backendAPI || new BackendAPI();
  }

  // Re-export SOURCES for convenience
  static get SOURCES() {
    return SOURCES;
  }

  /**
   * Execute the complete search workflow
   * @param {Object} selectedVariants - Selected variants for each field
   * @param {Object} searchParams - Search parameters
   * @param {Function} [statusCallback] - Optional callback for status updates
   * @param {string[]} [enabledSources] - Which sources to search (default: both FS and MH)
   * @returns {Promise<Array>} Extracted and deduplicated persons
   */
  async executeSearch(selectedVariants, searchParams, statusCallback, enabledSources = [SOURCES.FAMILYSEARCH, SOURCES.MYHERITAGE]) {
    // Validate required fields
    if (!selectedVariants.firstName || selectedVariants.firstName.length === 0) {
      throw new Error('Please select at least one first name variant');
    }
    if (!selectedVariants.lastName || selectedVariants.lastName.length === 0) {
      throw new Error('Please select at least one last name variant');
    }

    this._updateStatus(statusCallback, 'Building search combinations...', 'info');

    // Build all search URL permutations for all enabled sources
    const searchUrls = buildMultiSourceSearchUrls(selectedVariants, searchParams, enabledSources);

    const sourceLabel = enabledSources.length > 1 ? 'FamilySearch + MyHeritage' : enabledSources[0];
    this._updateStatus(statusCallback, `Opening ${searchUrls.length} search tabs (${sourceLabel})...`, 'info');

    // Open all search tabs
    const openedTabs = await this._openSearchTabs(searchUrls);

    this._updateStatus(statusCallback, `Waiting for ${openedTabs.length} tabs to load...`, 'info');

    // Wait for all tabs to load
    await this._waitForAllTabs(openedTabs);

    // Extra delay for content scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));

    this._updateStatus(statusCallback, 'Extracting results from all tabs...', 'info');

    // Extract from all tabs (basic info from search results)
    const allPersons = await this._extractFromAllTabs(openedTabs, statusCallback);

    if (allPersons.length === 0) {
      throw new Error('No results found across all searches');
    }

    this._updateStatus(
      statusCallback,
      `Found ${allPersons.length} unique results. Now fetching family details...`,
      'info'
    );

    // Enrich with family details from detail pages
    await this._enrichWithFamilyDetails(allPersons, statusCallback);

    // AI analysis to extract additional details (addresses, occupations, etc.)
    this._updateStatus(statusCallback, 'Analyzing records with AI...', 'info');
    await this._analyzeWithAI(allPersons, statusCallback);

    // Sort by relevance to searched names
    this._updateStatus(statusCallback, 'Sorting by relevance...', 'info');
    const sortedPersons = sortByRelevance(allPersons, selectedVariants);

    this._updateStatus(
      statusCallback,
      `Extracted ${sortedPersons.length} results with family details from ${openedTabs.length} tabs`,
      'success'
    );

    return sortedPersons;
  }

  /**
   * Extract from a single tab (for manual extraction)
   * Supports both FamilySearch and MyHeritage pages
   * @param {chrome.tabs.Tab} tab - Tab to extract from
   * @param {boolean} [withDetails=true] - Whether to fetch family details from detail pages
   * @param {Function} [statusCallback] - Optional callback for status updates
   * @returns {Promise<Array>} Extracted persons
   */
  async extractFromTab(tab, withDetails = true, statusCallback = null) {
    // Detect which source based on URL
    let source = SOURCES.FAMILYSEARCH;
    if (tab.url?.includes('myheritage.com') || tab.url?.includes('myheritage.co.il')) {
      source = SOURCES.MYHERITAGE;
    } else if (!tab.url?.includes('familysearch.org')) {
      throw new Error('Please navigate to a FamilySearch or MyHeritage search results page first');
    }

    this._updateStatus(statusCallback, `Extracting from ${source}...`, 'info');

    // Ensure content script is ready (fast version for manual extraction)
    await ensureContentScriptReadyFast(tab.id);

    // Extract basic results from search page
    const tabResults = await this.chromeAPI.sendMessageToTab(tab.id, {
      action: 'extractResults'
    });

    if (tabResults.error) {
      throw new Error(tabResults.error);
    }

    const persons = tabResults.persons || [];

    // Add source info to each person
    for (const person of persons) {
      const sourceId = source === SOURCES.MYHERITAGE ? person.mhId : person.fsId;
      person.source = source;
      person.sources = [{
        name: source,
        id: sourceId,
        url: person.sourceUrl,
        collection: person.collectionName || '',
        extractedAt: person.extractedAt || new Date().toISOString()
      }];
      person.sourceTag = source === SOURCES.MYHERITAGE ? 'MH' : 'FS';
    }

    // If withDetails is true, enrich each person with family data from detail pages
    if (withDetails && persons.length > 0) {
      this._updateStatus(statusCallback, `Extracting family details from ${persons.length} records...`, 'info');
      await this._enrichWithFamilyDetails(persons, statusCallback);

      // AI analysis to extract additional details
      this._updateStatus(statusCallback, 'Analyzing records with AI...', 'info');
      await this._analyzeWithAI(persons, statusCallback);
    }

    return persons;
  }

  /**
   * Enrich persons with family data by opening their detail pages (parallel batches)
   * @private
   * @param {Array} persons - Array of person objects with sourceUrl
   * @param {Function} [statusCallback] - Optional callback for status updates
   */
  async _enrichWithFamilyDetails(persons, statusCallback) {
    const BATCH_SIZE = 3; // Process 3 persons in parallel

    for (let i = 0; i < persons.length; i += BATCH_SIZE) {
      const batch = persons.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(persons.length / BATCH_SIZE);

      this._updateStatus(
        statusCallback,
        `Fetching family details batch ${batchNum}/${totalBatches}...`,
        'info'
      );

      // Process batch in parallel
      await Promise.all(batch.map(person => this._enrichSinglePerson(person)));

      // Delay between batches (not between each person)
      if (i + BATCH_SIZE < persons.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  /**
   * Enrich a single person with family data from their detail page
   * @private
   * @param {Object} person - Person object with sourceUrl
   */
  async _enrichSinglePerson(person) {
    if (!person.sourceUrl) {
      console.log(`[SearchOrchestrator] No sourceUrl for ${person.fullName}, skipping detail extraction`);
      return;
    }

    let detailTab = null;
    try {
      // Open detail page in background tab
      detailTab = await this.chromeAPI.createTab(person.sourceUrl, false);

      // Wait for tab to load
      await this.chromeAPI.waitForTabsLoad([detailTab.id], 15000);

      // Extra wait for content to render (FamilySearch is an SPA)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Ensure content script is ready
      await ensureContentScriptReady(detailTab.id);

      // Extract family data from detail page
      const familyResult = await this.chromeAPI.sendMessageToTab(detailTab.id, {
        action: 'extractFamilyFromDetailPage'
      });

      if (familyResult?.familyData) {
        this._mergeFamilyData(person, familyResult.familyData);
        console.log(`[SearchOrchestrator] Enriched ${person.fullName}: ${person.parents.length} parents, ${person.spouses.length} spouses, ${person.children.length} children, ${person.siblings.length} siblings`);
      }

      // Close detail tab
      await this.chromeAPI.removeTab(detailTab.id);
    } catch (error) {
      console.error(`[SearchOrchestrator] Failed to enrich ${person.fullName}:`, error);
      // Try to close tab even if extraction failed
      if (detailTab) {
        try {
          await this.chromeAPI.removeTab(detailTab.id);
        } catch (closeError) {
          console.error('[SearchOrchestrator] Failed to close detail tab:', closeError);
        }
      }
    }
  }

  /**
   * Merge family data from detail page into person object
   * @private
   * @param {Object} person - Person object to update
   * @param {Object} familyData - Family data from detail page
   */
  _mergeFamilyData(person, familyData) {
    person.parents = familyData.parents || [];
    person.spouses = familyData.spouses || [];
    person.children = familyData.children || [];
    person.siblings = familyData.siblings || [];

    // Merge relatives (cousins, extended family from immigration records)
    if (familyData.relatives?.length > 0) {
      person.relatives = familyData.relatives;
    }

    // Update dates/places if we got better data from detail page
    if (familyData.birthDate && !person.birthDate) person.birthDate = familyData.birthDate;
    if (familyData.birthPlace && !person.birthPlace) person.birthPlace = familyData.birthPlace;
    if (familyData.deathDate && !person.deathDate) person.deathDate = familyData.deathDate;
    if (familyData.deathPlace && !person.deathPlace) person.deathPlace = familyData.deathPlace;
    if (familyData.sex) person.sex = familyData.sex;

    // Merge occupation from detail page
    if (familyData.occupation && !person.occupation) {
      person.occupations = [{ occupation: familyData.occupation }];
    }

    // Merge addresses from detail page
    if (familyData.addresses?.length > 0) {
      person.addresses = familyData.addresses;
    }

    // Store raw record for reference
    if (familyData.rawRecord) {
      person.rawRecord = familyData.rawRecord;
    }

    // Immigration/travel fields
    if (familyData.nationality) person.nationality = familyData.nationality;
    if (familyData.lastResidence) person.lastResidence = familyData.lastResidence;
    if (familyData.maritalStatus) person.maritalStatus = familyData.maritalStatus;
    if (familyData.arrivalDate) person.arrivalDate = familyData.arrivalDate;
    if (familyData.departurePort) person.departurePort = familyData.departurePort;
    if (familyData.shipName) person.shipName = familyData.shipName;

    // Store raw page text for AI analysis
    if (familyData.rawPageText) {
      person._rawPageText = familyData.rawPageText;
    }
  }

  /**
   * Analyze persons with AI to extract additional details (addresses, occupations, etc.)
   * @private
   * @param {Array} persons - Array of person objects
   * @param {Function} [statusCallback] - Optional callback for status updates
   */
  async _analyzeWithAI(persons, statusCallback) {
    const BATCH_SIZE = 3; // Process 3 persons in parallel

    // Filter persons that have raw page text to analyze
    const personsToAnalyze = persons.filter(p => p._rawPageText);

    if (personsToAnalyze.length === 0) {
      console.log('[SearchOrchestrator] No raw page text available for AI analysis');
      return;
    }

    console.log(`[SearchOrchestrator] Analyzing ${personsToAnalyze.length} persons with AI`);

    for (let i = 0; i < personsToAnalyze.length; i += BATCH_SIZE) {
      const batch = personsToAnalyze.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(personsToAnalyze.length / BATCH_SIZE);

      this._updateStatus(
        statusCallback,
        `AI analysis batch ${batchNum}/${totalBatches}...`,
        'info'
      );

      // Process batch in parallel
      await Promise.all(batch.map(person => this._analyzeSinglePerson(person)));

      // Small delay between batches
      if (i + BATCH_SIZE < personsToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  }

  /**
   * Analyze a single person with AI
   * @private
   * @param {Object} person - Person object with _rawPageText
   */
  async _analyzeSinglePerson(person) {
    if (!person._rawPageText) return;

    try {
      const analysis = await this.backendAPI.analyzePersonDetails(
        person.fullName,
        person._rawPageText,
        person.source || 'FamilySearch'
      );

      if (analysis) {
        this._mergeAIAnalysis(person, analysis);
        console.log(`[SearchOrchestrator] AI enriched ${person.fullName}`);
      }

      // Clean up raw text to save memory
      delete person._rawPageText;
    } catch (error) {
      console.error(`[SearchOrchestrator] AI analysis failed for ${person.fullName}:`, error);
      delete person._rawPageText;
    }
  }

  /**
   * Merge AI analysis results into person object
   * @private
   * @param {Object} person - Person object to update
   * @param {Object} analysis - AI analysis results
   */
  _mergeAIAnalysis(person, analysis) {
    // Add AI-extracted spouse if not already present
    if (analysis.spouseName && !person.spouses?.some(s => s.name === analysis.spouseName)) {
      if (!person.spouses) person.spouses = [];
      person.spouses.push({
        name: analysis.spouseName,
        relationship: analysis.spouseRelationship || 'Spouse',
        aiExtracted: true
      });
    }

    // Add addresses with years
    if (analysis.addresses?.length > 0) {
      person.addresses = analysis.addresses;
    }

    // Add occupations with years
    if (analysis.occupations?.length > 0) {
      person.occupations = analysis.occupations;
    }

    // Add alternative names
    if (analysis.alternativeNames?.length > 0) {
      person.alternativeNames = analysis.alternativeNames;
    }

    // Add additional facts
    if (analysis.additionalFacts?.length > 0) {
      person.additionalFacts = analysis.additionalFacts;
    }

    // Store AI confidence
    person.aiAnalysisConfidence = analysis.confidence;
  }

  /**
   * Open all search tabs
   * @private
   * @param {Array} searchUrls - Array of {url, source, firstName, lastName, ...} objects
   * @returns {Promise<Array>} Opened tabs with variant and source info
   */
  async _openSearchTabs(searchUrls) {
    const openedTabs = [];

    for (const search of searchUrls) {
      const tab = await this.chromeAPI.createTab(search.url, false);
      openedTabs.push({
        tab,
        source: search.source || SOURCES.FAMILYSEARCH,
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
   * Extract from all tabs with cross-source deduplication
   * @private
   * @param {Array} openedTabs - Array of {tab, source, firstName, lastName, ...} objects
   * @param {Function} [statusCallback] - Optional callback for status updates
   * @returns {Promise<Array>} Deduplicated persons with source tags
   */
  async _extractFromAllTabs(openedTabs, statusCallback) {
    const allPersons = [];
    const seenIds = new Set(); // Source-specific IDs: "FamilySearch:xxx" or "MyHeritage:yyy"
    const seenNames = new Map(); // nameKey -> person index for cross-source dedup
    let successCount = 0;

    for (let i = 0; i < openedTabs.length; i++) {
      const { tab, source, firstName, lastName, spouseName, fatherName, motherName } = openedTabs[i];

      try {
        // Build variant label for status message
        const variantLabel = [firstName, lastName, spouseName, fatherName, motherName]
          .filter(v => v)
          .join(' / ');

        this._updateStatus(
          statusCallback,
          `Extracting from ${source} tab ${i + 1}/${openedTabs.length} (${variantLabel})...`,
          'info'
        );

        // Ensure content script is ready
        await ensureContentScriptReady(tab.id);

        // Extract basic results from search page (family details fetched later)
        const tabResults = await this.chromeAPI.sendMessageToTab(tab.id, {
          action: 'extractResults'
        });

        if (tabResults && tabResults.persons) {
          // Add source, variant info and deduplicate
          for (const person of tabResults.persons) {
            // Get the source-specific ID
            const sourceId = source === SOURCES.MYHERITAGE ? person.mhId : person.fsId;
            const fullSourceId = `${source}:${sourceId}`;

            // First check by source-specific ID (same exact record from same source)
            if (seenIds.has(fullSourceId)) {
              // Duplicate by ID from same source - just track additional variant
              const existing = allPersons.find(p =>
                p.sources?.some(s => s.name === source && s.id === sourceId)
              );
              if (existing) {
                this._addVariantToExisting(existing, firstName, lastName);
              }
              continue;
            }

            // Then check by name + birth/death dates (cross-source deduplication)
            const nameKey = this._generateNameKey(person);
            console.log(`[SearchOrchestrator] ${source} person "${person.fullName}" -> key: "${nameKey}"`);

            if (seenNames.has(nameKey)) {
              // Same person found in another source - MERGE
              const existingIndex = seenNames.get(nameKey);
              const existing = allPersons[existingIndex];
              if (existing) {
                console.log(`[SearchOrchestrator] CROSS-SOURCE MERGE: "${person.fullName}" (${source}) matches "${existing.fullName}" (${existing.source})`);
                this._addVariantToExisting(existing, firstName, lastName);
                // Add this source to the existing person
                this._addSourceToExisting(existing, person, source);
                // Update sourceTag
                existing.sourceTag = this._computeSourceTag(existing.sources);
              }
              seenIds.add(fullSourceId);
              continue;
            }

            // New person - initialize with source info
            person.source = source; // Primary source
            person.sources = [{
              name: source,
              id: sourceId,
              url: person.sourceUrl,
              collection: person.collectionName || '',
              extractedAt: person.extractedAt || new Date().toISOString()
            }];
            person.sourceTag = source === SOURCES.MYHERITAGE ? 'MH' : 'FS';
            person.matchedVariant = `${firstName} ${lastName}`;
            person.originalFirstName = person.originalFirstName || firstName;
            person.originalLastName = person.originalLastName || lastName;

            allPersons.push(person);
            seenIds.add(fullSourceId);
            seenNames.set(nameKey, allPersons.length - 1);
          }
          successCount++;
        }

        // Close the tab after extraction
        await this.chromeAPI.removeTab(tab.id);

      } catch (error) {
        console.error(`[SearchOrchestrator] Failed to extract from ${source} tab ${i + 1}:`, error);

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
      `[SearchOrchestrator] ${allPersons.length} unique persons after cross-source deduplication`
    );

    // Log source distribution
    const fsOnly = allPersons.filter(p => p.sourceTag === 'FS').length;
    const mhOnly = allPersons.filter(p => p.sourceTag === 'MH').length;
    const both = allPersons.filter(p => p.sourceTag === 'FS+MH').length;
    console.log(`[SearchOrchestrator] Sources: ${fsOnly} FS only, ${mhOnly} MH only, ${both} both`);

    return allPersons;
  }

  /**
   * Add a source to an existing person (for cross-source matches)
   * @private
   */
  _addSourceToExisting(existing, newPerson, source) {
    if (!existing.sources) {
      existing.sources = [];
    }

    const sourceId = source === SOURCES.MYHERITAGE ? newPerson.mhId : newPerson.fsId;

    // Check if this source is already added
    const alreadyHasSource = existing.sources.some(s => s.name === source && s.id === sourceId);
    if (alreadyHasSource) return;

    existing.sources.push({
      name: source,
      id: sourceId,
      url: newPerson.sourceUrl,
      collection: newPerson.collectionName || '',
      extractedAt: newPerson.extractedAt || new Date().toISOString()
    });

    // Merge family data if the new person has more info
    if (newPerson.parents?.length && !existing.parents?.length) {
      existing.parents = newPerson.parents;
    }
    if (newPerson.spouses?.length && !existing.spouses?.length) {
      existing.spouses = newPerson.spouses;
    }
    if (newPerson.children?.length && !existing.children?.length) {
      existing.children = newPerson.children;
    }
    if (newPerson.siblings?.length && !existing.siblings?.length) {
      existing.siblings = newPerson.siblings;
    }
  }

  /**
   * Compute source tag based on sources array
   * @private
   */
  _computeSourceTag(sources) {
    if (!sources || sources.length === 0) return 'FS';

    const hasFS = sources.some(s => s.name === SOURCES.FAMILYSEARCH);
    const hasMH = sources.some(s => s.name === SOURCES.MYHERITAGE);

    if (hasFS && hasMH) return 'FS+MH';
    if (hasMH) return 'MH';
    return 'FS';
  }

  /**
   * Generate a unique key for name-based deduplication
   * Uses normalized name + birth year + death year to identify same person across different sources
   * Normalization handles: different spellings (Levi/Lev/Levy), middle names, etc.
   * @private
   * @param {Object} person - Person object
   * @returns {string} Unique key for deduplication
   */
  _generateNameKey(person) {
    const fullName = (person.fullName || '').toLowerCase().trim();

    // Extract first name (first word only, handles middle names/initials)
    const nameParts = fullName.split(/\s+/);
    const firstName = nameParts[0] || '';

    // Extract last name (last word) and take first 3 chars to handle spelling variations
    // This matches: Levi/Lev/Levy, Cohen/Cohn/Kohen, etc.
    const lastName = nameParts[nameParts.length - 1] || '';
    const lastNameNormalized = lastName.slice(0, 3);

    const birthYear = this._extractYear(person.birthDate);
    const deathYear = this._extractYear(person.deathDate);

    // Key format: firstName|lastNamePrefix|birthYear|deathYear
    // Example: "larry|lev|1936|2024" matches both "Larry Levi" and "Larry S Lev"
    return `${firstName}|${lastNameNormalized}|${birthYear}|${deathYear}`;
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
