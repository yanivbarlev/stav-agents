/**
 * ChromeExtensionAPI - Wrapper for Chrome Extension APIs
 * Provides a clean interface for tabs, storage, scripting, and messaging
 */
export class ChromeExtensionAPI {
  /**
   * Create a new tab
   * @param {string} url - URL to open
   * @param {boolean} [active=false] - Whether tab should be active
   * @returns {Promise<chrome.tabs.Tab>} Created tab
   */
  async createTab(url, active = false) {
    return chrome.tabs.create({ url, active });
  }

  /**
   * Create multiple tabs
   * @param {Array<string>} urls - URLs to open
   * @param {number} [delayMs=500] - Delay between opening tabs
   * @returns {Promise<Array<chrome.tabs.Tab>>} Created tabs
   */
  async createTabs(urls, delayMs = 500) {
    const tabs = [];
    for (const url of urls) {
      const tab = await this.createTab(url, false);
      tabs.push(tab);
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
    return tabs;
  }

  /**
   * Wait for a tab to finish loading
   * @param {number} tabId - Tab ID to wait for
   * @param {number} [timeoutMs=30000] - Timeout in milliseconds
   * @returns {Promise<number>} Tab ID when loaded
   */
  async waitForTabLoad(tabId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(tabId); // Resolve anyway, don't reject
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
   * Wait for multiple tabs to finish loading
   * @param {Array<number>} tabIds - Tab IDs to wait for
   * @param {number} [timeoutMs=30000] - Timeout in milliseconds
   * @returns {Promise<Array<number>>} Tab IDs when loaded
   */
  async waitForTabsLoad(tabIds, timeoutMs = 30000) {
    return Promise.all(tabIds.map(tabId => this.waitForTabLoad(tabId, timeoutMs)));
  }

  /**
   * Send a message to a tab's content script
   * @param {number} tabId - Tab ID
   * @param {Object} message - Message to send
   * @returns {Promise<any>} Response from content script
   */
  async sendMessageToTab(tabId, message) {
    return chrome.tabs.sendMessage(tabId, message);
  }

  /**
   * Inject a content script into a tab
   * @param {number} tabId - Tab ID
   * @param {string} scriptPath - Path to script file
   * @returns {Promise<void>}
   */
  async injectScript(tabId, scriptPath) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: [scriptPath]
    });
  }

  /**
   * Remove (close) a tab
   * @param {number} tabId - Tab ID to close
   * @returns {Promise<void>}
   */
  async removeTab(tabId) {
    await chrome.tabs.remove(tabId);
  }

  /**
   * Remove multiple tabs
   * @param {Array<number>} tabIds - Tab IDs to close
   * @returns {Promise<void>}
   */
  async removeTabs(tabIds) {
    await chrome.tabs.remove(tabIds);
  }

  /**
   * Get the currently active tab
   * @returns {Promise<chrome.tabs.Tab>} Active tab
   */
  async getCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  /**
   * Save data to Chrome local storage
   * @param {Object} data - Data to save
   * @returns {Promise<void>}
   */
  async saveToStorage(data) {
    await chrome.storage.local.set(data);
  }

  /**
   * Load data from Chrome local storage
   * @param {string|Array<string>} keys - Keys to load
   * @returns {Promise<Object>} Loaded data
   */
  async loadFromStorage(keys) {
    return chrome.storage.local.get(keys);
  }

  /**
   * Query tabs
   * @param {Object} queryInfo - Query parameters
   * @returns {Promise<Array<chrome.tabs.Tab>>} Matching tabs
   */
  async queryTabs(queryInfo) {
    return chrome.tabs.query(queryInfo);
  }

  /**
   * Update tab properties
   * @param {number} tabId - Tab ID
   * @param {Object} updateProperties - Properties to update
   * @returns {Promise<chrome.tabs.Tab>} Updated tab
   */
  async updateTab(tabId, updateProperties) {
    return chrome.tabs.update(tabId, updateProperties);
  }
}
