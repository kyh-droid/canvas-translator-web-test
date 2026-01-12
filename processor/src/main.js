/**
 * Canvas Translator - Main Entry Point
 *
 * Downloads canvas from Google Drive, translates it, and imports to MongoDB.
 */

import { downloadFromDrive } from './drive.js';
import { translateCanvas } from './translate.js';
import { importCanvasToMongoDB } from './mongodb-import.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REQUEST_ID = process.env.REQUEST_ID || 'TR-LOCAL-' + Date.now();
const FILE_ID = process.env.FILE_ID;
const TARGET_LANG = process.env.TARGET_LANG || 'en';
const USER_UID = process.env.USER_UID;

const LANG_NAMES = {
  en: 'English',
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
};

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  CANVAS TRANSLATOR');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Request ID:     ${REQUEST_ID}`);
  console.log(`  File ID:        ${FILE_ID}`);
  console.log(`  Target Lang:    ${TARGET_LANG} (${LANG_NAMES[TARGET_LANG]})`);
  console.log(`  User UID:       ${USER_UID}`);
  console.log('');

  // Validate inputs
  if (!FILE_ID) {
    throw new Error('FILE_ID is required');
  }
  if (!USER_UID) {
    throw new Error('USER_UID is required');
  }
  if (!/^[a-f0-9]{24}$/i.test(USER_UID)) {
    throw new Error('Invalid USER_UID format (must be 24-character hex)');
  }
  if (!['en', 'ko', 'ja'].includes(TARGET_LANG)) {
    throw new Error(`Invalid target language: ${TARGET_LANG}`);
  }

  // Create work directory
  const workDir = path.join(process.cwd(), 'work', REQUEST_ID);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // Step 1: Download from Google Drive
    console.log('Step 1: Downloading canvas from Google Drive...');
    const inputPath = path.join(workDir, 'input.json');
    await downloadFromDrive(FILE_ID, inputPath);
    console.log(`  Downloaded: ${inputPath}`);

    // Validate JSON
    const canvasData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    const sourceLang = canvasData.canvas?.canvasLanguage || 'ko';
    console.log(`  Source language: ${sourceLang}`);

    if (sourceLang === TARGET_LANG) {
      throw new Error(`Canvas is already in ${TARGET_LANG}. Please select a different target language.`);
    }

    // Step 2: Translate
    console.log('');
    console.log('Step 2: Translating canvas...');
    const outputPath = path.join(workDir, `translated-${TARGET_LANG}.json`);
    await translateCanvas(inputPath, outputPath, TARGET_LANG);
    console.log(`  Translated: ${outputPath}`);

    // Step 3: Import to MongoDB
    console.log('');
    console.log('Step 3: Importing to user account...');
    const translatedCanvas = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    const result = await importCanvasToMongoDB(translatedCanvas, USER_UID);
    console.log(`  Canvas ID: ${result.canvasId}`);
    console.log(`  Nodes: ${result.nodeCount}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TRANSLATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log(`  The translated canvas has been imported to the user's account.`);
    console.log(`  Canvas ID: ${result.canvasId}`);
    console.log('');

  } catch (error) {
    console.error('');
    console.error('ERROR:', error.message);
    throw error;
  } finally {
    // Cleanup work directory
    if (fs.existsSync(workDir)) {
      fs.rmSync(workDir, { recursive: true, force: true });
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
