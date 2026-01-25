import { CONFIG } from '../../config.js';

/**
 * BackendAPI - Client for communicating with the Express backend
 * Provides a clean interface for all API calls with error handling
 */
export class BackendAPI {
  /**
   * @param {string} baseUrl - Base URL of the backend API (uses CONFIG.BACKEND_URL by default)
   */
  constructor(baseUrl = CONFIG.BACKEND_URL) {
    this.baseUrl = baseUrl;
    console.log('[BackendAPI] Initialized with baseUrl:', this.baseUrl);
  }

  /**
   * Check backend health status
   * @returns {Promise<{status: string, groqConfigured: boolean, neo4jConfigured: boolean}>}
   */
  async checkHealth() {
    const url = `${this.baseUrl}/health`;
    console.log('[BackendAPI] Checking health at:', url);

    try {
      console.log('[BackendAPI] Sending fetch request...');
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      });
      console.log('[BackendAPI] Response received, status:', response.status);

      if (!response.ok) {
        console.error('[BackendAPI] Response not OK:', response.status, response.statusText);
        return {
          status: 'error',
          groqConfigured: false,
          neo4jConfigured: false
        };
      }
      const data = await response.json();
      console.log('[BackendAPI] Health check success:', data);
      return data;
    } catch (error) {
      console.error('[BackendAPI] Health check failed:', error.name, error.message);
      console.error('[BackendAPI] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        url: url
      });
      return {
        status: 'offline',
        groqConfigured: false,
        neo4jConfigured: false
      };
    }
  }

  /**
   * Generate name variants from Hebrew or English names
   * @param {Object} params - Parameters containing names to generate variants for
   * @param {string} [params.firstName] - First name
   * @param {string} [params.lastName] - Last name
   * @param {string} [params.spouseName] - Spouse name
   * @param {string} [params.fatherName] - Father's name
   * @param {string} [params.motherName] - Mother's name
   * @returns {Promise<Object>} Object with variant arrays for each field
   */
  async generateVariants(params) {
    const results = {};

    // Collect fields that need variant generation
    const fieldsToGenerate = [];

    if (params.firstName) {
      fieldsToGenerate.push({ field: 'firstName', value: params.firstName });
    }
    if (params.lastName) {
      fieldsToGenerate.push({ field: 'lastName', value: params.lastName });
    }
    if (params.spouseName) {
      fieldsToGenerate.push({ field: 'spouseName', value: params.spouseName });
    }
    if (params.fatherName) {
      fieldsToGenerate.push({ field: 'fatherName', value: params.fatherName });
    }
    if (params.motherName) {
      fieldsToGenerate.push({ field: 'motherName', value: params.motherName });
    }

    // Generate variants for each field
    for (const { field, value } of fieldsToGenerate) {
      const data = await this._post('/api/variants', {
        firstNameHebrew: field === 'firstName' || field === 'spouseName' || field === 'fatherName' || field === 'motherName' ? value : null,
        lastNameHebrew: field === 'lastName' ? value : null
      });

      // Extract the appropriate variants
      if (field === 'firstName' && data.firstNameVariants) {
        results.firstName = data.firstNameVariants;
      } else if (field === 'lastName' && data.lastNameVariants) {
        results.lastName = data.lastNameVariants;
      } else if (field === 'spouseName' && data.firstNameVariants) {
        results.spouseName = data.firstNameVariants;
      } else if (field === 'fatherName' && data.firstNameVariants) {
        results.fatherName = data.firstNameVariants;
      } else if (field === 'motherName' && data.firstNameVariants) {
        results.motherName = data.firstNameVariants;
      }
    }

    return results;
  }

  /**
   * Save extracted persons to backend
   * @param {Array} persons - Array of person objects
   * @param {Object} searchParams - Original search parameters
   * @returns {Promise<{success: boolean, savedCount: number}>}
   */
  async savePersons(persons, searchParams) {
    try {
      return await this._post('/api/persons', {
        persons,
        searchParams: {
          firstNameHebrew: searchParams.firstName,
          lastNameHebrew: searchParams.lastName
        }
      });
    } catch (error) {
      console.warn('[BackendAPI] Failed to save persons:', error);
      // Non-critical error - don't throw
      return { success: false, savedCount: 0 };
    }
  }

  /**
   * Get saved persons from backend
   * @returns {Promise<{persons: Array, total: number}>}
   */
  async getPersons() {
    try {
      return await this._get('/api/persons');
    } catch (error) {
      console.error('[BackendAPI] Failed to fetch persons:', error);
      return { persons: [], total: 0 };
    }
  }

  /**
   * Generic GET request
   * @private
   * @param {string} endpoint - API endpoint
   * @returns {Promise<any>} Response data
   */
  async _get(endpoint) {
    return this._fetch(endpoint, {
      method: 'GET'
    });
  }

  /**
   * Generic POST request
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} body - Request body
   * @returns {Promise<any>} Response data
   */
  async _post(endpoint, body) {
    return this._fetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  /**
   * Generic fetch wrapper with error handling
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} options - Fetch options
   * @returns {Promise<any>} Response data
   */
  async _fetch(endpoint, options = {}) {
    const url = this.baseUrl + endpoint;
    console.log('[BackendAPI] _fetch:', options.method || 'GET', url);

    try {
      const response = await fetch(url, {
        headers: {
          'Content-Type': 'application/json'
        },
        ...options
      });

      console.log('[BackendAPI] _fetch response:', response.status, response.statusText);

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      console.error('[BackendAPI] _fetch error:', error.name, error.message, 'URL:', url);
      throw error;
    }
  }
}
