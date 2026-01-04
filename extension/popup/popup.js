// FamilySearch Hebrew Name Search - Popup Script

const API_BASE = 'http://localhost:3000';

// DOM Elements - Get these safely
const form = document.getElementById('search-form');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const variantsSection = document.getElementById('variants-section');
const resultsSection = document.getElementById('results-section');
const resultsCount = document.getElementById('results-count');
const resultsList = document.getElementById('results-list');
const errorSection = document.getElementById('error-section');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');

// State
let lastSearchParams = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  loadSavedParams();
  checkBackendStatus();
  setupExpandableSection();
});

// Setup expandable section
function setupExpandableSection() {
  const expandBtn = document.getElementById('expand-additional');
  const content = document.getElementById('additional-fields');

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

// Load saved search parameters
function loadSavedParams() {
  chrome.storage.local.get(['lastSearch'], (result) => {
    if (result.lastSearch) {
      document.getElementById('firstName').value = result.lastSearch.firstName || '';
      document.getElementById('lastName').value = result.lastSearch.lastName || '';
      document.getElementById('birthYear').value = result.lastSearch.birthYear || '';
      document.getElementById('birthYearRange').value = result.lastSearch.birthYearRange || 10;
      document.getElementById('maxResults').value = result.lastSearch.maxResults || 20;
    }
  });
}

// Save search parameters
function saveSearchParams(params) {
  chrome.storage.local.set({ lastSearch: params });
}

// Check backend status
async function checkBackendStatus() {
  try {
    const response = await fetch(`${API_BASE}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    if (response.ok) {
      showStatus('Backend connected', 'success');
      setTimeout(() => hideStatus(), 2000);
    } else {
      showStatus('Backend error - start server first', 'error');
    }
  } catch (error) {
    showStatus('Backend offline - run: npm run server', 'error');
  }
}

// Show status message
function showStatus(message, type = 'info') {
  statusBar.className = `status-bar ${type}`;
  statusText.textContent = message;
  statusBar.classList.remove('hidden');
}

// Hide status
function hideStatus() {
  statusBar.classList.add('hidden');
}

// Show/hide loading state (DEPRECATED - handled per-button now)
function setLoading(loading) {
  // No-op - loading state handled in each button's handler
}

// Show error
function showError(message) {
  errorText.textContent = message;
  errorSection.classList.remove('hidden');
  resultsSection.classList.add('hidden');
}

// Hide error
function hideError() {
  errorSection.classList.add('hidden');
}

// Display name variants (DEPRECATED - not used in new flow)
function displayVariants(firstVariants, lastVariants) {
  // No-op - variant display handled by displayVariantSelection()
}

// Display results
function displayResults(results) {
  resultsSection.classList.remove('hidden');
  resultsCount.textContent = `(${results.length} found)`;

  resultsList.innerHTML = '';

  if (results.length === 0) {
    resultsList.innerHTML = '<p style="color: #888; text-align: center;">No results found</p>';
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

    resultsList.appendChild(item);
  });
}

// State for generated variants
let generatedVariants = {
  firstName: [],
  lastName: [],
  spouseName: [],
  fatherName: [],
  motherName: []
};
let searchParams = null;

// Form submission handler - Generate variants
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  searchParams = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName: document.getElementById('lastName').value.trim(),
    birthYear: document.getElementById('birthYear').value ? parseInt(document.getElementById('birthYear').value) : null,
    birthYearRange: parseInt(document.getElementById('birthYearRange').value) || 10,
    deathYear: document.getElementById('deathYear').value ? parseInt(document.getElementById('deathYear').value) : null,
    deathYearRange: parseInt(document.getElementById('deathYearRange').value) || 5,
    birthPlace: document.getElementById('birthPlace').value.trim() || null,
    deathPlace: document.getElementById('deathPlace').value.trim() || null,
    anyPlace: document.getElementById('anyPlace').value.trim() || null,
    spouseName: document.getElementById('spouseName').value.trim() || null,
    fatherName: document.getElementById('fatherName').value.trim() || null,
    motherName: document.getElementById('motherName').value.trim() || null,
    maxResults: parseInt(document.getElementById('maxResults').value) || 20
  };

  if (!searchParams.firstName || !searchParams.lastName) {
    showError('Please enter both first and last name');
    return;
  }

  await generateVariants();
});

// Generate variants from Hebrew OR English names
async function generateVariants() {
  const generateBtn = document.getElementById('generate-btn');
  const btnText = generateBtn.querySelector('.btn-text');
  const btnLoading = generateBtn.querySelector('.btn-loading');

  try {
    hideError();
    generateBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    showStatus('Generating name variants...', 'info');

    // Collect all fields that need variant generation
    const fieldsToGenerate = [];

    if (searchParams.firstName) {
      fieldsToGenerate.push({ field: 'firstName', value: searchParams.firstName });
    }
    if (searchParams.lastName) {
      fieldsToGenerate.push({ field: 'lastName', value: searchParams.lastName });
    }
    if (searchParams.spouseName) {
      fieldsToGenerate.push({ field: 'spouseName', value: searchParams.spouseName });
    }
    if (searchParams.fatherName) {
      fieldsToGenerate.push({ field: 'fatherName', value: searchParams.fatherName });
    }
    if (searchParams.motherName) {
      fieldsToGenerate.push({ field: 'motherName', value: searchParams.motherName });
    }

    // Generate variants for each field (both Hebrew and English)
    for (const { field, value } of fieldsToGenerate) {
      const response = await fetch(`${API_BASE}/api/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstNameHebrew: field === 'firstName' || field === 'spouseName' || field === 'fatherName' || field === 'motherName' ? value : null,
          lastNameHebrew: field === 'lastName' ? value : null
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate variants for ' + field);
      }

      const data = await response.json();
      console.log('[Popup] Received variants for', field, ':', data);

      if (field === 'firstName' && data.firstNameVariants) {
        generatedVariants.firstName = data.firstNameVariants;
      } else if (field === 'lastName' && data.lastNameVariants) {
        generatedVariants.lastName = data.lastNameVariants;
      } else if (field === 'spouseName' && data.firstNameVariants) {
        generatedVariants.spouseName = data.firstNameVariants;
      } else if (field === 'fatherName' && data.firstNameVariants) {
        generatedVariants.fatherName = data.firstNameVariants;
      } else if (field === 'motherName' && data.firstNameVariants) {
        generatedVariants.motherName = data.firstNameVariants;
      }

      console.log('[Popup] generatedVariants after processing:', generatedVariants);
    }

    showStatus('Variants generated!', 'success');
    displayVariantSelection();

  } catch (error) {
    console.error('Variant generation error:', error);
    showError(error.message || 'Failed to generate variants');
  } finally {
    generateBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    setTimeout(() => hideStatus(), 2000);
  }
}

// Display variant selection UI
function displayVariantSelection() {
  const variantSelection = document.getElementById('variant-selection');
  const variantLists = document.getElementById('variant-lists');

  variantLists.innerHTML = '';

  console.log('[Popup] displayVariantSelection called with:', generatedVariants);

  const fieldLabels = {
    firstName: 'First Name',
    lastName: 'Last Name',
    spouseName: 'Spouse Name',
    fatherName: "Father's Name",
    motherName: "Mother's Name"
  };

  for (const [field, variants] of Object.entries(generatedVariants)) {
    console.log(`[Popup] Processing field ${field}:`, variants);
    if (!variants || variants.length === 0) continue;

    const fieldDiv = document.createElement('div');
    fieldDiv.className = 'variant-field';

    const label = document.createElement('span');
    label.className = 'variant-field-label';
    label.textContent = fieldLabels[field] || field;
    fieldDiv.appendChild(label);

    variants.forEach((variant, index) => {
      console.log(`[Popup] Processing variant ${index} for ${field}:`, variant);

      const optionDiv = document.createElement('div');
      optionDiv.className = 'variant-option';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `${field}-${index}`;
      checkbox.value = variant.name;
      checkbox.checked = index < 3; // Auto-select top 3
      checkbox.addEventListener('change', updateSearchCount);

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

    variantLists.appendChild(fieldDiv);
  }

  variantSelection.classList.remove('hidden');
  updateSearchCount();

  // Attach search button event listener
  const executeSearchBtn = document.getElementById('execute-search-btn');
  if (executeSearchBtn && !executeSearchBtn.hasListener) {
    executeSearchBtn.addEventListener('click', performSearch);
    executeSearchBtn.hasListener = true;
  }
}

// Update total search count
function updateSearchCount() {
  const selectedCounts = {};

  for (const field of Object.keys(generatedVariants)) {
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

  const totalSpan = document.getElementById('total-searches');
  const summary = document.querySelector('.search-summary');

  totalSpan.textContent = total;

  if (total > 20) {
    summary.classList.add('warning');
  } else {
    summary.classList.remove('warning');
  }
}

// Perform the search with selected variants
async function performSearch() {
  const executeSearchBtn = document.getElementById('execute-search-btn');
  const btnText = executeSearchBtn.querySelector('.btn-text');
  const btnLoading = executeSearchBtn.querySelector('.btn-loading');

  try {
    hideError();
    executeSearchBtn.disabled = true;
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    // Get selected variants for each field
    const selectedVariants = {};
    for (const field of ['firstName', 'lastName', 'spouseName', 'fatherName', 'motherName']) {
      const checkboxes = document.querySelectorAll(`input[id^="${field}-"]:checked`);
      selectedVariants[field] = Array.from(checkboxes).map(cb => cb.value);
    }

    if (selectedVariants.firstName.length === 0 || selectedVariants.lastName.length === 0) {
      throw new Error('Please select at least one variant for first and last name');
    }

    showStatus('Building search combinations...', 'info');

    // Build all search URL permutations
    const searchUrls = [];

    // If no variants selected for optional fields, use empty array to iterate once
    const spouseVariants = selectedVariants.spouseName.length > 0 ? selectedVariants.spouseName : [null];
    const fatherVariants = selectedVariants.fatherName.length > 0 ? selectedVariants.fatherName : [null];
    const motherVariants = selectedVariants.motherName.length > 0 ? selectedVariants.motherName : [null];

    // Generate all permutations
    for (const firstName of selectedVariants.firstName) {
      for (const lastName of selectedVariants.lastName) {
        for (const spouseName of spouseVariants) {
          for (const fatherName of fatherVariants) {
            for (const motherName of motherVariants) {
              const urlParams = new URLSearchParams();

              urlParams.append('q.givenName', firstName);
              urlParams.append('q.surname', lastName);

              if (searchParams.birthYear) {
                const range = searchParams.birthYearRange || 10;
                urlParams.append('q.birthLikeDate.from', String(searchParams.birthYear - range));
                urlParams.append('q.birthLikeDate.to', String(searchParams.birthYear + range));
              }

              if (searchParams.deathYear) {
                const range = searchParams.deathYearRange || 5;
                urlParams.append('q.deathLikeDate.from', String(searchParams.deathYear - range));
                urlParams.append('q.deathLikeDate.to', String(searchParams.deathYear + range));
              }

              if (searchParams.birthPlace) {
                urlParams.append('q.birthLikePlace', searchParams.birthPlace);
              }

              if (searchParams.deathPlace) {
                urlParams.append('q.deathLikePlace', searchParams.deathPlace);
              }

              if (searchParams.anyPlace) {
                urlParams.append('q.anyPlace', searchParams.anyPlace);
              }

              if (spouseName) {
                urlParams.append('q.spouseGivenName', spouseName);
              }

              if (fatherName) {
                urlParams.append('q.fatherGivenName', fatherName);
              }

              if (motherName) {
                urlParams.append('q.motherGivenName', motherName);
              }

              const url = 'https://www.familysearch.org/en/search/record/results?' + urlParams.toString();
              searchUrls.push({
                url,
                firstName,
                lastName,
                spouseName,
                fatherName,
                motherName
              });
            }
          }
        }
      }
    }

    showStatus(`Opening ${searchUrls.length} search tabs...`, 'info');

    // Open tabs and track them
    const openedTabs = [];
    for (const search of searchUrls) {
      const tab = await chrome.tabs.create({
        url: search.url,
        active: false
      });
      openedTabs.push({ tab, ...search });
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    showStatus(`Waiting for ${openedTabs.length} tabs to load...`, 'info');

    // Wait for all tabs to finish loading
    const tabLoadPromises = openedTabs.map(({ tab }) => {
      return new Promise((resolve) => {
        const listener = (tabId, changeInfo) => {
          if (tabId === tab.id && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve(tab.id);
          }
        };
        chrome.tabs.onUpdated.addListener(listener);

        // Timeout after 30 seconds
        setTimeout(() => {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(tab.id);
        }, 30000);
      });
    });

    await Promise.all(tabLoadPromises);

    // Extra delay for content scripts to initialize
    await new Promise(resolve => setTimeout(resolve, 3000));

    showStatus('Extracting results from all tabs...', 'info');

    // Extract from each tab
    const allPersons = [];
    const seenIds = new Set();
    let successCount = 0;

    for (let i = 0; i < openedTabs.length; i++) {
      const { tab, firstName, lastName, spouseName, fatherName, motherName } = openedTabs[i];

      try {
        const variantLabel = [firstName, lastName, spouseName, fatherName, motherName]
          .filter(v => v)
          .join(' / ');

        showStatus(`Checking tab ${i + 1}/${openedTabs.length}...`, 'info');

        // Ping the content script to verify it's ready
        let scriptReady = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
            scriptReady = true;
            console.log(`[Popup] Content script ready on tab ${tab.id}`);
            break;
          } catch (pingError) {
            console.log(`[Popup] Ping attempt ${attempt + 1} failed for tab ${tab.id}:`, pingError.message);

            // Try to inject the content script manually
            if (attempt === 2) {
              try {
                console.log(`[Popup] Attempting manual script injection for tab ${tab.id}`);
                await chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  files: ['content/familysearch.js']
                });
                await new Promise(resolve => setTimeout(resolve, 1000));

                // Try ping one more time after manual injection
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                scriptReady = true;
                console.log(`[Popup] Manual injection successful for tab ${tab.id}`);
              } catch (injectError) {
                console.error(`[Popup] Manual injection failed for tab ${tab.id}:`, injectError);
              }
            } else {
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }

        if (!scriptReady) {
          console.error(`[Popup] Content script not ready on tab ${tab.id}, skipping`);
          await chrome.tabs.remove(tab.id);
          continue;
        }

        showStatus(`Extracting from tab ${i + 1}/${openedTabs.length} (${variantLabel})...`, 'info');

        const tabResults = await chrome.tabs.sendMessage(tab.id, {
          action: 'extractResults'
        });

        if (tabResults && tabResults.persons) {
          // Add variant info and deduplicate
          for (const person of tabResults.persons) {
            if (!seenIds.has(person.fsId)) {
              person.matchedVariant = `${firstName} ${lastName}`;
              person.originalFirstName = searchParams.firstName;
              person.originalLastName = searchParams.lastName;
              allPersons.push(person);
              seenIds.add(person.fsId);
            } else {
              // Person already found, add this variant to their list
              const existing = allPersons.find(p => p.fsId === person.fsId);
              if (existing && !existing.searchedVariants) {
                existing.searchedVariants = [existing.matchedVariant];
              }
              const variantString = `${firstName} ${lastName}`;
              if (existing && !existing.searchedVariants.includes(variantString)) {
                existing.searchedVariants.push(variantString);
              }
            }
          }
          successCount++;
        }

        // Close the tab after extraction
        await chrome.tabs.remove(tab.id);

      } catch (error) {
        console.error(`Failed to extract from tab ${i + 1}:`, error);
        // Try to close tab even if extraction failed
        try {
          await chrome.tabs.remove(tab.id);
        } catch (closeError) {
          console.error('Failed to close tab:', closeError);
        }
      }
    }

    showStatus(`Extracted ${allPersons.length} unique results from ${successCount}/${openedTabs.length} tabs`, 'success');

    if (allPersons.length === 0) {
      throw new Error('No results found across all searches');
    }

    showStatus(`Found ${allPersons.length} unique results`, 'success');
    displayResults(allPersons);

    // Save to Neo4j (optional)
    if (allPersons.length > 0) {
      try {
        await fetch(`${API_BASE}/api/persons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persons: allPersons,
            searchParams: {
              firstNameHebrew: searchParams.firstName,
              lastNameHebrew: searchParams.lastName
            }
          })
        });
      } catch (neo4jError) {
        console.warn('Failed to save to Neo4j:', neo4jError);
      }
    }

  } catch (error) {
    console.error('Search error:', error);
    showError(error.message || 'Search failed. Make sure you are logged into FamilySearch.');
  } finally {
    executeSearchBtn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    setTimeout(() => hideStatus(), 3000);
  }
}

// Retry button handler
retryBtn.addEventListener('click', () => {
  if (lastSearchParams) {
    generateVariants();
  }
});

// Execute search button handler (will be attached dynamically)
// This gets added when variant selection is displayed

// Extract button handler
const extractBtn = document.getElementById('extract-btn');
extractBtn.addEventListener('click', async () => {
  try {
    hideError();
    extractBtn.disabled = true;
    const btnText = extractBtn.querySelector('.btn-text');
    const btnLoading = extractBtn.querySelector('.btn-loading');
    btnText.classList.add('hidden');
    btnLoading.classList.remove('hidden');

    showStatus('Extracting results from current page...', 'info');

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url || !tab.url.includes('familysearch.org')) {
      throw new Error('Please navigate to a FamilySearch search results page first');
    }

    // Ping to verify content script is ready
    let scriptReady = false;
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      scriptReady = true;
      console.log('[Popup] Content script ready');
    } catch (pingError) {
      console.log('[Popup] Content script not responding, attempting manual injection...');
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/familysearch.js']
        });
        await new Promise(resolve => setTimeout(resolve, 500));
        await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
        scriptReady = true;
        console.log('[Popup] Manual injection successful');
      } catch (injectError) {
        throw new Error('Could not connect to FamilySearch page. Try reloading the page and extension.');
      }
    }

    if (!scriptReady) {
      throw new Error('Content script not ready. Try reloading the page.');
    }

    // Send message to content script to extract current page
    const results = await chrome.tabs.sendMessage(tab.id, {
      action: 'extractResults'
    });

    if (results.error) {
      throw new Error(results.error);
    }

    showStatus(`Extracted ${results.persons.length} results`, 'success');
    displayResults(results.persons);

    // Save to Neo4j
    if (results.persons.length > 0) {
      try {
        await fetch(`${API_BASE}/api/persons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persons: results.persons,
            searchParams: {}
          })
        });
      } catch (neo4jError) {
        console.warn('Failed to save to Neo4j:', neo4jError);
      }
    }

  } catch (error) {
    console.error('Extract error:', error);
    showError(error.message || 'Failed to extract results');
  } finally {
    extractBtn.disabled = false;
    const btnText = extractBtn.querySelector('.btn-text');
    const btnLoading = extractBtn.querySelector('.btn-loading');
    btnText.classList.remove('hidden');
    btnLoading.classList.add('hidden');
    setTimeout(() => hideStatus(), 3000);
  }
});
