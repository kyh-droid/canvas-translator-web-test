#!/usr/bin/env node
/**
 * Google Sheets Setup Script
 *
 * Creates the required spreadsheet structure for the canvas translation queue.
 * Run this once to initialize your Google Sheet.
 *
 * Usage:
 *   node scripts/setup-sheets.js
 *
 * Requires environment variables:
 *   - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   - GOOGLE_PRIVATE_KEY
 *   - SPREADSHEET_ID
 */

import { google } from 'googleapis';
import 'dotenv/config';

const SHEET_NAME = 'Requests';
const HEADERS = [
  'Request ID',
  'Timestamp',
  'User UID',
  'Email',
  'Source Lang',
  'Target Lang',
  'Status',
  'Canvas JSON',
  'Result URL',
  'Error',
  'Processed At',
];

async function getAuthClient() {
  const credentials = {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  };

  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('Google service account credentials not configured in environment');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  return auth;
}

async function setupSheet() {
  console.log('Canvas Translation - Google Sheets Setup');
  console.log('=========================================\n');

  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) {
    console.error('Error: SPREADSHEET_ID not set in environment');
    console.log('\nTo create a new spreadsheet:');
    console.log('1. Go to https://sheets.google.com');
    console.log('2. Create a new spreadsheet');
    console.log('3. Copy the spreadsheet ID from the URL');
    console.log('   URL format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit');
    console.log('4. Set SPREADSHEET_ID in your .env file');
    console.log('\n5. Share the spreadsheet with your service account:');
    console.log(`   ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your-service-account@xxx.iam.gserviceaccount.com'}`);
    process.exit(1);
  }

  try {
    const auth = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth });

    console.log(`Spreadsheet ID: ${spreadsheetId}`);
    console.log(`Service Account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}\n`);

    // Get spreadsheet info
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });

    console.log(`Spreadsheet Title: ${spreadsheet.data.properties.title}`);

    // Check if Requests sheet exists
    const existingSheet = spreadsheet.data.sheets?.find(
      s => s.properties?.title === SHEET_NAME
    );

    if (existingSheet) {
      console.log(`\n✓ Sheet "${SHEET_NAME}" already exists`);

      // Check if headers are set
      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:K1`,
      });

      if (!headerResponse.data.values || headerResponse.data.values.length === 0) {
        console.log('  Adding headers...');
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${SHEET_NAME}!A1:K1`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [HEADERS],
          },
        });
        console.log('  ✓ Headers added');
      } else {
        console.log('  ✓ Headers already present');
      }
    } else {
      console.log(`\nCreating sheet "${SHEET_NAME}"...`);

      // Add new sheet
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: {
                  title: SHEET_NAME,
                },
              },
            },
          ],
        },
      });

      // Add headers
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${SHEET_NAME}!A1:K1`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [HEADERS],
        },
      });

      console.log(`✓ Sheet "${SHEET_NAME}" created with headers`);
    }

    // Format header row
    console.log('\nFormatting sheet...');

    const sheetId = existingSheet?.properties?.sheetId ||
      (await sheets.spreadsheets.get({ spreadsheetId })).data.sheets
        ?.find(s => s.properties?.title === SHEET_NAME)?.properties?.sheetId;

    if (sheetId !== undefined) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            // Bold header row
            {
              repeatCell: {
                range: {
                  sheetId,
                  startRowIndex: 0,
                  endRowIndex: 1,
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 0.2, green: 0.2, blue: 0.3 },
                    textFormat: { bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
                  },
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)',
              },
            },
            // Freeze header row
            {
              updateSheetProperties: {
                properties: {
                  sheetId,
                  gridProperties: {
                    frozenRowCount: 1,
                  },
                },
                fields: 'gridProperties.frozenRowCount',
              },
            },
            // Set column widths
            {
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 0,
                  endIndex: 1,
                },
                properties: { pixelSize: 180 },
                fields: 'pixelSize',
              },
            },
            {
              updateDimensionProperties: {
                range: {
                  sheetId,
                  dimension: 'COLUMNS',
                  startIndex: 6,
                  endIndex: 7,
                },
                properties: { pixelSize: 100 },
                fields: 'pixelSize',
              },
            },
          ],
        },
      });

      console.log('✓ Formatting applied');
    }

    console.log('\n=========================================');
    console.log('Setup complete!');
    console.log('=========================================\n');
    console.log('Your Google Sheet is ready to receive translation requests.');
    console.log(`\nSpreadsheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } catch (error) {
    if (error.message?.includes('not found')) {
      console.error('\nError: Spreadsheet not found or not shared with service account.');
      console.log('\nMake sure to share the spreadsheet with:');
      console.log(`  ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);
    } else {
      console.error('\nError:', error.message);
    }
    process.exit(1);
  }
}

setupSheet();
