/**
 * Canvas Translator - Status Page Handler
 */

// API endpoint from config (loaded in HTML before this script)
const API_URL = window.CONFIG?.API_URL || 'https://canvas-translator-api.plax-labs.workers.dev';

// Language display names
const LANG_NAMES = {
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
  en: 'English',
};

// Status display text
const STATUS_TITLES = {
  pending: 'Queued',
  processing: 'Translating...',
  completed: 'Complete!',
  failed: 'Failed',
};

// Elements
const statusLookup = document.getElementById('statusLookup');
const statusDisplay = document.getElementById('statusDisplay');
const notFound = document.getElementById('notFound');
const requestIdInput = document.getElementById('requestId');

let autoRefreshInterval = null;
let currentRequestId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Check for ID in URL
  const urlParams = new URLSearchParams(window.location.search);
  const idFromUrl = urlParams.get('id');

  if (idFromUrl) {
    requestIdInput.value = idFromUrl;
    checkStatus();
  }

  // Handle enter key
  requestIdInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      checkStatus();
    }
  });
});

/**
 * Check translation status
 */
async function checkStatus() {
  const requestId = requestIdInput.value.trim();

  if (!requestId) {
    alert('Please enter a Request ID');
    return;
  }

  // Validate format
  if (!requestId.startsWith('TR-')) {
    alert('Invalid Request ID format. It should start with "TR-"');
    return;
  }

  currentRequestId = requestId;

  // Update URL
  const url = new URL(window.location);
  url.searchParams.set('id', requestId);
  window.history.replaceState({}, '', url);

  try {
    const response = await fetch(`${API_URL}/api/status/${requestId}`);
    const result = await response.json();

    if (result.success) {
      displayStatus(result);
    } else {
      showNotFound();
    }
  } catch (error) {
    console.error('Status check error:', error);
    alert('Failed to check status. Please try again.');
  }
}

// Expose to global scope
window.checkStatus = checkStatus;

/**
 * Display status information
 */
function displayStatus(data) {
  statusLookup.style.display = 'none';
  statusDisplay.hidden = false;
  notFound.hidden = true;

  // Update status icon and text
  const statusIcon = document.getElementById('statusIcon');
  statusIcon.className = `status-icon ${data.status}`;

  document.getElementById('statusTitle').textContent = STATUS_TITLES[data.status] || data.status;
  document.getElementById('statusMessage').textContent = data.message;

  // Update details
  document.getElementById('detailRequestId').textContent = data.requestId;
  document.getElementById('detailSourceLang').textContent = LANG_NAMES[data.sourceLang] || data.sourceLang;
  document.getElementById('detailTargetLang').textContent = LANG_NAMES[data.targetLang] || data.targetLang;
  document.getElementById('detailSubmitted').textContent = formatDate(data.submittedAt);

  // Show/hide completed row
  const completedRow = document.getElementById('completedRow');
  if (data.completedAt) {
    completedRow.hidden = false;
    document.getElementById('detailCompleted').textContent = formatDate(data.completedAt);
  } else {
    completedRow.hidden = true;
  }

  // Show/hide error row
  const errorRow = document.getElementById('errorRow');
  if (data.status === 'failed' && data.error) {
    errorRow.hidden = false;
    document.getElementById('detailError').textContent = data.error;
  } else {
    errorRow.hidden = true;
  }

  // Auto-refresh for pending/processing
  const autoRefresh = document.getElementById('autoRefresh');
  if (data.status === 'pending' || data.status === 'processing') {
    autoRefresh.hidden = false;
    startAutoRefresh();
  } else {
    autoRefresh.hidden = true;
    stopAutoRefresh();
  }
}

/**
 * Show not found message
 */
function showNotFound() {
  statusLookup.style.display = 'none';
  statusDisplay.hidden = true;
  notFound.hidden = false;
  stopAutoRefresh();
}

/**
 * Start auto-refresh interval
 */
function startAutoRefresh() {
  if (autoRefreshInterval) return;

  autoRefreshInterval = setInterval(() => {
    if (currentRequestId) {
      checkStatus();
    }
  }, 10000); // 10 seconds
}

/**
 * Stop auto-refresh interval
 */
function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

/**
 * Format date string
 */
function formatDate(dateString) {
  if (!dateString) return '-';

  const date = new Date(dateString);
  return date.toLocaleString();
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopAutoRefresh();
});
