/**
 * Extension Configuration
 * Single source of truth for all configuration values
 */
export const CONFIG = {
  // Backend API URL - change this if the server port changes
  BACKEND_URL: 'http://localhost:3002',

  // API endpoints
  ENDPOINTS: {
    HEALTH: '/health',
    VARIANTS: '/api/variants',
    PERSONS: '/api/persons'
  }
};
