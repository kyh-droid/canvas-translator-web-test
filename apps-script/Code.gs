/**
 * Canvas Translator - Google Apps Script
 *
 * This script handles Google Form submissions and triggers GitHub Actions
 * for canvas translation.
 *
 * Setup:
 * 1. Create a Google Form with: File upload, Target Language dropdown, Email
 * 2. Link the form to a Google Sheet
 * 3. Open the Sheet > Extensions > Apps Script
 * 4. Paste this code
 * 5. Update CONFIG below with your values
 * 6. Run setupTrigger() once to create the form submit trigger
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================================================

const CONFIG = {
  // GitHub repository info
  GITHUB_OWNER: 'kyh-droid',
  GITHUB_REPO: 'canvas-translator-web-test',
  GITHUB_TOKEN: '', // Add your GitHub PAT (Personal Access Token)

  // Google Form field names (update if different)
  FORM_FIELDS: {
    FILE: 'Canvas JSON File',      // File upload field title
    TARGET_LANG: 'Target Language', // Dropdown field title
    EMAIL: 'Email',                // Email field title
  },

  // Language mapping (Form answer -> code)
  LANGUAGE_MAP: {
    'English': 'en',
    'Korean': 'ko',
    '한국어': 'ko',
    'Japanese': 'ja',
    '日本語': 'ja',
  },
};

// ============================================================================
// TRIGGER SETUP - Run this once
// ============================================================================

/**
 * Run this function once to set up the form submit trigger
 */
function setupTrigger() {
  // Remove existing triggers
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'onFormSubmit') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Create new trigger
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onFormSubmit')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();

  Logger.log('Trigger created successfully!');
}

// ============================================================================
// FORM SUBMIT HANDLER
// ============================================================================

/**
 * Handles form submission
 * @param {Object} e - Form submit event
 */
function onFormSubmit(e) {
  try {
    const responses = e.namedValues;

    // Extract form data
    const fileUrls = responses[CONFIG.FORM_FIELDS.FILE];
    const targetLangRaw = responses[CONFIG.FORM_FIELDS.TARGET_LANG]?.[0] || '';
    const email = responses[CONFIG.FORM_FIELDS.EMAIL]?.[0] || '';

    // Get the file URL (Google Drive URL from form upload)
    const fileUrl = fileUrls?.[0] || '';

    if (!fileUrl) {
      Logger.log('Error: No file uploaded');
      return;
    }

    // Extract file ID from Drive URL
    const fileId = extractFileId(fileUrl);
    if (!fileId) {
      Logger.log('Error: Could not extract file ID from URL: ' + fileUrl);
      return;
    }

    // Map language to code
    const targetLang = CONFIG.LANGUAGE_MAP[targetLangRaw] || 'en';

    // Generate request ID
    const requestId = 'TR-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8);

    // Make file publicly accessible (or shared with service account)
    makeFileAccessible(fileId);

    // Trigger GitHub Actions
    const success = triggerGitHubActions({
      requestId: requestId,
      fileId: fileId,
      targetLang: targetLang,
      email: email,
      timestamp: new Date().toISOString(),
    });

    if (success) {
      Logger.log('Successfully triggered translation for request: ' + requestId);

      // Optionally send confirmation email
      if (email) {
        sendConfirmationEmail(email, requestId, targetLang);
      }
    } else {
      Logger.log('Failed to trigger GitHub Actions');
    }

  } catch (error) {
    Logger.log('Error in onFormSubmit: ' + error.toString());
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract file ID from Google Drive URL
 */
function extractFileId(url) {
  // Handle various Google Drive URL formats
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]+)/,           // /d/FILE_ID/
    /id=([a-zA-Z0-9_-]+)/,             // ?id=FILE_ID
    /open\?id=([a-zA-Z0-9_-]+)/,       // open?id=FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Make file accessible to the service account
 */
function makeFileAccessible(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    // Option 1: Make anyone with link can view
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    Logger.log('File sharing updated: ' + fileId);
  } catch (error) {
    Logger.log('Warning: Could not update file sharing: ' + error.toString());
  }
}

/**
 * Trigger GitHub Actions workflow via repository_dispatch
 */
function triggerGitHubActions(payload) {
  const url = `https://api.github.com/repos/${CONFIG.GITHUB_OWNER}/${CONFIG.GITHUB_REPO}/dispatches`;

  const options = {
    method: 'POST',
    headers: {
      'Authorization': 'token ' + CONFIG.GITHUB_TOKEN,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    payload: JSON.stringify({
      event_type: 'canvas-translation',
      client_payload: payload,
    }),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const statusCode = response.getResponseCode();

    if (statusCode === 204 || statusCode === 200) {
      return true;
    } else {
      Logger.log('GitHub API error: ' + statusCode + ' - ' + response.getContentText());
      return false;
    }
  } catch (error) {
    Logger.log('Error calling GitHub API: ' + error.toString());
    return false;
  }
}

/**
 * Send confirmation email to user
 */
function sendConfirmationEmail(email, requestId, targetLang) {
  const langNames = {
    'en': 'English',
    'ko': 'Korean (한국어)',
    'ja': 'Japanese (日本語)',
  };

  const subject = `[Canvas Translator] Translation Request Received - ${requestId}`;
  const body = `
Hello,

Your canvas translation request has been received and is being processed.

Request ID: ${requestId}
Target Language: ${langNames[targetLang] || targetLang}
Estimated Time: 5-15 minutes

You will receive another email with the translated file once processing is complete.

---
Canvas Translator by RPLAY
`;

  try {
    MailApp.sendEmail(email, subject, body);
    Logger.log('Confirmation email sent to: ' + email);
  } catch (error) {
    Logger.log('Warning: Could not send confirmation email: ' + error.toString());
  }
}

// ============================================================================
// MANUAL TEST FUNCTIONS
// ============================================================================

/**
 * Test the GitHub Actions trigger manually
 */
function testGitHubTrigger() {
  const success = triggerGitHubActions({
    requestId: 'TR-TEST-' + Date.now(),
    fileId: 'TEST_FILE_ID',
    targetLang: 'en',
    email: 'test@example.com',
    timestamp: new Date().toISOString(),
  });

  Logger.log('Test trigger result: ' + (success ? 'SUCCESS' : 'FAILED'));
}

/**
 * Check current configuration
 */
function checkConfig() {
  Logger.log('GitHub Owner: ' + CONFIG.GITHUB_OWNER);
  Logger.log('GitHub Repo: ' + CONFIG.GITHUB_REPO);
  Logger.log('GitHub Token set: ' + (CONFIG.GITHUB_TOKEN ? 'YES' : 'NO'));
  Logger.log('Form Fields: ' + JSON.stringify(CONFIG.FORM_FIELDS));
}
