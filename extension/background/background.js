// FamilySearch Hebrew Name Search - Background Service Worker

const API_BASE = 'http://localhost:3000';

// Listen for installation
chrome.runtime.onInstalled.addListener(() => {
  console.log('FamilySearch Hebrew Search extension installed');
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'generateVariants') {
    generateVariants(message.hebrewName)
      .then(variants => sendResponse({ success: true, variants }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'saveToNeo4j') {
    saveToNeo4j(message.persons, message.searchParams)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message.action === 'checkHealth') {
    checkBackendHealth()
      .then(healthy => sendResponse({ healthy }))
      .catch(() => sendResponse({ healthy: false }));
    return true;
  }
});

// Generate name variants via backend API
async function generateVariants(hebrewName) {
  const response = await fetch(`${API_BASE}/api/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hebrewName })
  });

  if (!response.ok) {
    throw new Error('Failed to generate variants');
  }

  const data = await response.json();
  return data.variants;
}

// Save extracted persons to Neo4j via backend API
async function saveToNeo4j(persons, searchParams) {
  const response = await fetch(`${API_BASE}/api/persons`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ persons, searchParams })
  });

  if (!response.ok) {
    throw new Error('Failed to save to Neo4j');
  }

  return response.json();
}

// Check backend health
async function checkBackendHealth() {
  try {
    const response = await fetch(`${API_BASE}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
