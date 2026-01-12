/**
 * Canvas Translator - Configuration
 *
 * Update the API_URL to your deployed Cloudflare Worker URL.
 *
 * Development: Use wrangler dev to run locally
 *   API_URL = 'http://localhost:8787'
 *
 * Production: Deploy with wrangler deploy and use the workers.dev URL
 *   API_URL = 'https://canvas-translator-api.YOUR-SUBDOMAIN.workers.dev'
 */

const CONFIG = {
  // Update this to your Cloudflare Worker URL
  API_URL: 'https://canvas-translator-api.plax-labs.workers.dev',

  // Supported languages
  LANGUAGES: {
    en: 'English',
    ko: '한국어 (Korean)',
    ja: '日本語 (Japanese)',
  },

  // Auto-refresh interval for status page (ms)
  STATUS_REFRESH_INTERVAL: 10000,

  // Maximum file size (bytes)
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
};

// Make available globally
window.CONFIG = CONFIG;
