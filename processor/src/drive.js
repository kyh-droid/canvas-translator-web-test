/**
 * Google Drive - Download file
 */

import { google } from 'googleapis';
import fs from 'fs';

/**
 * Download a file from Google Drive
 * @param {string} fileId - Google Drive file ID
 * @param {string} outputPath - Local path to save the file
 */
export async function downloadFromDrive(fileId, outputPath) {
  // Parse service account credentials
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

  // Create auth client
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });

  const drive = google.drive({ version: 'v3', auth });

  // Get file metadata first
  const metadata = await drive.files.get({
    fileId,
    fields: 'name, mimeType, size',
  });

  console.log(`  File name: ${metadata.data.name}`);
  console.log(`  Size: ${(metadata.data.size / 1024).toFixed(1)} KB`);

  // Download file content
  const response = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );

  // Write to file
  return new Promise((resolve, reject) => {
    const dest = fs.createWriteStream(outputPath);
    response.data
      .on('end', () => resolve())
      .on('error', reject)
      .pipe(dest);
  });
}
