/**
 * FamilySearch Hebrew Name Search - Main Popup Script (Refactored)
 * Clean, modular architecture using ES6 modules
 */

import { SearchState } from './state/SearchState.js';
import { BackendAPI } from './services/BackendAPI.js';
import { ChromeExtensionAPI } from './services/ChromeExtensionAPI.js';
import { SearchOrchestrator } from './services/SearchOrchestrator.js';
import { PopupUI } from './components/PopupUI.js';
import { ButtonLoader } from './utils/ButtonLoader.js';
import { collectFormParams, populateFormFields } from './utils/formUtils.js';

// Initialize services
const state = new SearchState();
const api = new BackendAPI(); // Uses CONFIG.BACKEND_URL from config.js
const chromeAPI = new ChromeExtensionAPI();
const orchestrator = new SearchOrchestrator(chromeAPI);
const ui = new PopupUI();

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  await initializeApp();
});

/**
 * Initialize the application
 */
async function initializeApp() {
  // Load saved parameters
  const savedParams = await state.loadFromStorage();
  if (savedParams) {
    populateFormFields('search-form', savedParams);
  }

  // Setup event listeners
  setupEventListeners();

  // Setup expandable section
  setupExpandableSection();

  // Check backend status
  await checkBackendStatus();
}

/**
 * Setup all event listeners
 */
function setupEventListeners() {
  // Form submission - Generate variants
  document.getElementById('search-form').addEventListener('submit', handleGenerateVariants);

  // Execute search button
  const executeSearchBtn = document.getElementById('execute-search-btn');
  if (executeSearchBtn) {
    executeSearchBtn.addEventListener('click', handleExecuteSearch);
  }

  // Manual extract button
  const extractBtn = document.getElementById('extract-btn');
  if (extractBtn) {
    extractBtn.addEventListener('click', handleExtract);
  }

  // Retry button
  const retryBtn = document.getElementById('retry-btn');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => handleGenerateVariants());
  }
}

/**
 * Setup expandable section toggle
 */
function setupExpandableSection() {
  const expandBtn = document.getElementById('expand-additional');
  const content = document.getElementById('additional-fields');

  if (expandBtn && content) {
    expandBtn.addEventListener('click', () => {
      const isExpanded = !content.classList.contains('hidden');

      if (isExpanded) {
        content.classList.add('hidden');
        expandBtn.classList.remove('expanded');
      } else {
        content.classList.remove('hidden');
        expandBtn.classList.add('expanded');
      }
    });
  }
}

/**
 * Check backend API health status
 */
async function checkBackendStatus() {
  const health = await api.checkHealth();

  if (health.status === 'ok') {
    ui.showStatus('Backend connected', 'success');
    setTimeout(() => ui.hideStatus(), 2000);
  } else if (health.status === 'offline') {
    ui.showStatus('Backend offline - run: npm run server', 'error');
  } else {
    ui.showStatus('Backend error - check server logs', 'error');
  }
}

/**
 * Handle: Generate name variants
 */
async function handleGenerateVariants(e) {
  if (e) e.preventDefault();

  const loader = new ButtonLoader('generate-btn');

  try {
    await loader.wrap(async () => {
      ui.hideError();

      // Collect form parameters
      const params = collectFormParams('search-form');

      // Update state
      state.updateParams(params);
      await state.saveToStorage();

      // Generate variants via API
      ui.showStatus('Generating name variants...', 'info');
      const variants = await api.generateVariants(params);

      // Update state with variants
      state.updateAllVariants(variants);

      // Display variant selection UI
      ui.displayVariantSelection(state.variants, SearchState.getFieldLabels());

      ui.showStatus('Variants generated!', 'success');
      setTimeout(() => ui.hideStatus(), 2000);
    });
  } catch (error) {
    console.error('[Popup] Generate variants error:', error);
    ui.showError(error.message || 'Failed to generate variants. Check backend connection.');
  }
}

/**
 * Handle: Execute search with selected variants
 */
async function handleExecuteSearch() {
  const loader = new ButtonLoader('execute-search-btn');

  try {
    await loader.wrap(async () => {
      ui.hideError();

      // Get selected variants
      const selectedVariants = state.getSelectedVariants();

      // Execute search orchestration
      const results = await orchestrator.executeSearch(
        selectedVariants,
        state.params,
        (message, type) => ui.showStatus(message, type)
      );

      // Display results
      ui.showStatus(`Found ${results.length} unique results`, 'success');
      ui.displayResults(results);

      // Save to backend (non-critical)
      await api.savePersons(results, state.params);

      setTimeout(() => ui.hideStatus(), 3000);
    });
  } catch (error) {
    console.error('[Popup] Search error:', error);
    ui.showError(error.message || 'Search failed. Make sure you are logged into FamilySearch.');
  }
}

/**
 * Handle: Extract from current page
 */
async function handleExtract() {
  const loader = new ButtonLoader('extract-btn');

  try {
    await loader.wrap(async () => {
      ui.hideError();
      ui.showStatus('Extracting results from current page...', 'info');

      // Get current tab
      const tab = await chromeAPI.getCurrentTab();

      // Extract from tab
      const results = await orchestrator.extractFromTab(tab);

      // Display results
      ui.showStatus(`Extracted ${results.length} results`, 'success');
      ui.displayResults(results);

      // Save to backend (non-critical)
      if (results.length > 0 && state.params) {
        await api.savePersons(results, state.params);
      }

      setTimeout(() => ui.hideStatus(), 3000);
    });
  } catch (error) {
    console.error('[Popup] Extract error:', error);
    ui.showError(error.message || 'Failed to extract results');
  }
}
