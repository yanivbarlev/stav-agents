/**
 * Content Script Injection utilities
 * Handles verification, retry, and manual injection of content scripts
 */

/**
 * Delay helper function
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the correct content script path based on URL
 * @param {string} url - The URL to determine script for
 * @returns {string} Content script path
 */
function getScriptPathForUrl(url) {
  if (url?.includes('myheritage.com') || url?.includes('myheritage.co.il')) {
    return 'content/myheritage.js';
  }
  if (url?.includes('ancestry.com')) {
    return 'content/ancestry.js';
  }
  return 'content/familysearch.js';
}

/**
 * Ensure content script is ready on a tab with ping/retry/inject fallback
 * @param {number} tabId - Chrome tab ID
 * @param {string} [scriptPath] - Path to content script (auto-detected from URL if not provided)
 * @param {number} [retries=3] - Number of retry attempts
 * @returns {Promise<boolean>} True if content script is ready
 * @throws {Error} If content script cannot be made ready after all attempts
 */
export async function ensureContentScriptReady(
  tabId,
  scriptPath = null,
  retries = 3
) {
  // Auto-detect script path from tab URL if not provided
  if (!scriptPath) {
    try {
      const tab = await chrome.tabs.get(tabId);
      scriptPath = getScriptPathForUrl(tab.url);
      console.log(`[ContentScriptInjector] Auto-detected script: ${scriptPath} for ${tab.url}`);
    } catch (e) {
      scriptPath = 'content/familysearch.js'; // Default fallback
    }
  }

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      // Try to ping the content script
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log(`[ContentScriptInjector] Content script ready on tab ${tabId}`);
      return true;
    } catch (pingError) {
      console.log(
        `[ContentScriptInjector] Ping attempt ${attempt + 1}/${retries} failed for tab ${tabId}:`,
        pingError.message
      );

      // On last attempt, try manual injection
      if (attempt === retries - 1) {
        try {
          console.log(`[ContentScriptInjector] Attempting manual script injection for tab ${tabId}`);
          await chrome.scripting.executeScript({
            target: { tabId },
            files: [scriptPath]
          });

          // Wait for script to initialize
          await delay(1000);

          // Verify injection worked
          await chrome.tabs.sendMessage(tabId, { action: 'ping' });
          console.log(`[ContentScriptInjector] Manual injection successful for tab ${tabId}`);
          return true;
        } catch (injectError) {
          console.error(
            `[ContentScriptInjector] Manual injection failed for tab ${tabId}:`,
            injectError
          );
          throw new Error(
            `Content script not ready on tab ${tabId} after ${retries} attempts and manual injection`
          );
        }
      } else {
        // Wait before retrying
        await delay(1500);
      }
    }
  }

  throw new Error(`Content script not ready on tab ${tabId} after ${retries} attempts`);
}

/**
 * Ensure content script is ready with shorter timeout for single attempts
 * Useful for manual extraction where we want to fail fast
 * @param {number} tabId - Chrome tab ID
 * @param {string} [scriptPath] - Path to content script (auto-detected from URL if not provided)
 * @returns {Promise<boolean>} True if content script is ready
 * @throws {Error} If content script is not ready
 */
export async function ensureContentScriptReadyFast(tabId, scriptPath = null) {
  // Auto-detect script path from tab URL if not provided
  if (!scriptPath) {
    try {
      const tab = await chrome.tabs.get(tabId);
      scriptPath = getScriptPathForUrl(tab.url);
      console.log(`[ContentScriptInjector] Auto-detected script: ${scriptPath} for ${tab.url}`);
    } catch (e) {
      scriptPath = 'content/familysearch.js'; // Default fallback
    }
  }

  try {
    await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    console.log(`[ContentScriptInjector] Content script ready on tab ${tabId}`);
    return true;
  } catch (pingError) {
    console.log(`[ContentScriptInjector] Content script not responding, attempting manual injection...`);
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: [scriptPath]
      });
      await delay(500);
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      console.log(`[ContentScriptInjector] Manual injection successful`);
      return true;
    } catch (injectError) {
      throw new Error('Could not connect to page. Try reloading the page and extension.');
    }
  }
}
