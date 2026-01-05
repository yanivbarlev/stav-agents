/**
 * Form utilities for collecting and validating form parameters
 */

/**
 * Collect all form parameters with type conversion and validation
 * @param {string} formId - ID of the form element
 * @returns {Object} Parsed form parameters
 * @throws {Error} If required fields are missing
 */
export function collectFormParams(formId) {
  const form = document.getElementById(formId);
  if (!form) {
    throw new Error(`Form with id "${formId}" not found`);
  }

  // Field configuration with types and defaults
  const config = {
    firstName: { type: 'string', required: true, trim: true },
    lastName: { type: 'string', required: true, trim: true },
    birthYear: { type: 'int', default: null },
    birthYearRange: { type: 'int', default: 10 },
    deathYear: { type: 'int', default: null },
    deathYearRange: { type: 'int', default: 5 },
    birthPlace: { type: 'string', default: null, trim: true },
    deathPlace: { type: 'string', default: null, trim: true },
    anyPlace: { type: 'string', default: null, trim: true },
    spouseName: { type: 'string', default: null, trim: true },
    fatherName: { type: 'string', default: null, trim: true },
    motherName: { type: 'string', default: null, trim: true },
    maxResults: { type: 'int', default: 20 }
  };

  const params = {};

  for (const [fieldName, fieldConfig] of Object.entries(config)) {
    const element = document.getElementById(fieldName);
    if (!element) {
      console.warn(`Field "${fieldName}" not found in form`);
      params[fieldName] = fieldConfig.default;
      continue;
    }

    let value = element.value;

    // Handle empty values
    if (!value || value.trim() === '') {
      if (fieldConfig.required) {
        throw new Error(`Field "${fieldName}" is required`);
      }
      params[fieldName] = fieldConfig.default;
      continue;
    }

    // Trim strings if configured
    if (fieldConfig.trim && typeof value === 'string') {
      value = value.trim();
    }

    // Type conversion
    switch (fieldConfig.type) {
      case 'int':
        params[fieldName] = parseInt(value);
        if (isNaN(params[fieldName])) {
          params[fieldName] = fieldConfig.default;
        }
        break;
      case 'string':
        params[fieldName] = value || fieldConfig.default;
        break;
      default:
        params[fieldName] = value;
    }
  }

  return params;
}

/**
 * Populate form fields from saved parameters
 * @param {string} formId - ID of the form element
 * @param {Object} params - Parameters to populate
 */
export function populateFormFields(formId, params) {
  if (!params) return;

  for (const [fieldName, value] of Object.entries(params)) {
    const element = document.getElementById(fieldName);
    if (element && value !== null && value !== undefined) {
      element.value = value;
    }
  }
}
