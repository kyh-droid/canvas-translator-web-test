/**
 * Canvas Translation - Google Sheets Handler
 *
 * Manages the translation request queue in Google Sheets
 */

import { google } from 'googleapis';

// Column indices (0-based)
const COLUMNS = {
  REQUEST_ID: 0,      // A
  TIMESTAMP: 1,       // B
  USER_UID: 2,        // C
  EMAIL: 3,           // D
  SOURCE_LANG: 4,     // E
  TARGET_LANG: 5,     // F
  STATUS: 6,          // G
  CANVAS_JSON: 7,     // H (base64 encoded or URL)
  RESULT_URL: 8,      // I
  ERROR: 9,           // J
  PROCESSED_AT: 10,   // K
};

const STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Create authenticated Google Sheets client
 */
async function getAuthClient() {
  const credentials = {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials not configured');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

/**
 * Get Google Sheets API client
 */
async function getSheetsClient() {
  const auth = await getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

/**
 * Get pending translation requests from the queue
 * @param {Object} options - { spreadsheetId, sheetName, limit }
 * @returns {Promise<Array>} - Array of pending requests
 */
export async function getPendingRequests(options = {}) {
  const {
    spreadsheetId = process.env.SPREADSHEET_ID,
    sheetName = 'Requests',
    limit = 10,
  } = options;

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  const sheets = await getSheetsClient();

  // Get all rows
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:K`,
  });

  const rows = response.data.values || [];

  // Filter pending requests and transform to objects
  const pendingRequests = [];
  for (let i = 0; i < rows.length && pendingRequests.length < limit; i++) {
    const row = rows[i];
    const status = row[COLUMNS.STATUS];

    if (status === STATUS.PENDING) {
      pendingRequests.push({
        rowIndex: i + 2, // 1-based, accounting for header
        requestId: row[COLUMNS.REQUEST_ID],
        timestamp: row[COLUMNS.TIMESTAMP],
        userUid: row[COLUMNS.USER_UID] || null,
        email: row[COLUMNS.EMAIL],
        sourceLang: row[COLUMNS.SOURCE_LANG] || 'ko',
        targetLang: row[COLUMNS.TARGET_LANG],
        status: status,
        canvasJson: row[COLUMNS.CANVAS_JSON], // base64 encoded
      });
    }
  }

  return pendingRequests;
}

/**
 * Update request status in the sheet
 * @param {number} rowIndex - Row index (1-based)
 * @param {string} status - New status
 * @param {Object} options - { spreadsheetId, sheetName, error, resultUrl }
 */
export async function updateRequestStatus(rowIndex, status, options = {}) {
  const {
    spreadsheetId = process.env.SPREADSHEET_ID,
    sheetName = 'Requests',
    error = null,
    resultUrl = null,
  } = options;

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  const sheets = await getSheetsClient();

  // Build updates
  const updates = [];

  // Update status (column G)
  updates.push({
    range: `${sheetName}!G${rowIndex}`,
    values: [[status]],
  });

  // Update result URL if provided (column I)
  if (resultUrl) {
    updates.push({
      range: `${sheetName}!I${rowIndex}`,
      values: [[resultUrl]],
    });
  }

  // Update error if provided (column J)
  if (error) {
    updates.push({
      range: `${sheetName}!J${rowIndex}`,
      values: [[error]],
    });
  }

  // Update processed timestamp (column K)
  if (status === STATUS.COMPLETED || status === STATUS.FAILED) {
    updates.push({
      range: `${sheetName}!K${rowIndex}`,
      values: [[new Date().toISOString()]],
    });
  }

  // Batch update
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'RAW',
      data: updates,
    },
  });
}

/**
 * Add a new translation request to the queue
 * @param {Object} request - { userUid, email, targetLang, canvasJson }
 * @param {Object} options - { spreadsheetId, sheetName }
 * @returns {Promise<string>} - Request ID
 */
export async function addRequest(request, options = {}) {
  const {
    spreadsheetId = process.env.SPREADSHEET_ID,
    sheetName = 'Requests',
  } = options;

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  const sheets = await getSheetsClient();

  const requestId = `TR-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

  // Detect source language from canvas
  let sourceLang = 'ko';
  try {
    const canvas = JSON.parse(Buffer.from(request.canvasJson, 'base64').toString('utf-8'));
    sourceLang = canvas.canvas?.canvasLanguage || 'ko';
  } catch (e) {
    // Default to ko if can't parse
  }

  const row = [
    requestId,                           // A: Request ID
    new Date().toISOString(),            // B: Timestamp
    request.userUid || '',               // C: User UID
    request.email,                       // D: Email
    sourceLang,                          // E: Source Lang
    request.targetLang,                  // F: Target Lang
    STATUS.PENDING,                      // G: Status
    request.canvasJson,                  // H: Canvas JSON (base64)
    '',                                  // I: Result URL
    '',                                  // J: Error
    '',                                  // K: Processed At
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A:K`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [row],
    },
  });

  return requestId;
}

/**
 * Get request by ID
 * @param {string} requestId - Request ID to find
 * @param {Object} options - { spreadsheetId, sheetName }
 * @returns {Promise<Object|null>} - Request object or null
 */
export async function getRequestById(requestId, options = {}) {
  const {
    spreadsheetId = process.env.SPREADSHEET_ID,
    sheetName = 'Requests',
  } = options;

  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID not configured');
  }

  const sheets = await getSheetsClient();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A2:K`,
  });

  const rows = response.data.values || [];

  for (const row of rows) {
    if (row[COLUMNS.REQUEST_ID] === requestId) {
      return {
        requestId: row[COLUMNS.REQUEST_ID],
        timestamp: row[COLUMNS.TIMESTAMP],
        userUid: row[COLUMNS.USER_UID] || null,
        email: row[COLUMNS.EMAIL],
        sourceLang: row[COLUMNS.SOURCE_LANG],
        targetLang: row[COLUMNS.TARGET_LANG],
        status: row[COLUMNS.STATUS],
        resultUrl: row[COLUMNS.RESULT_URL] || null,
        error: row[COLUMNS.ERROR] || null,
        processedAt: row[COLUMNS.PROCESSED_AT] || null,
      };
    }
  }

  return null;
}

export { STATUS };
export default {
  getPendingRequests,
  updateRequestStatus,
  addRequest,
  getRequestById,
  STATUS,
};
