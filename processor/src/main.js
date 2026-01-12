/**
 * Canvas Translator - Main Entry Point
 *
 * Downloads canvas from Google Drive, translates it, and sends via email.
 */

import { downloadFromDrive } from './drive.js';
import { translateCanvas } from './translate.js';
import { sendEmail } from './email.js';
import fs from 'fs';
import path from 'path';

// ============================================================================
// CONFIGURATION
// ============================================================================

const REQUEST_ID = process.env.REQUEST_ID || 'TR-LOCAL-' + Date.now();
const FILE_ID = process.env.FILE_ID;
const TARGET_LANG = process.env.TARGET_LANG || 'en';
const USER_EMAIL = process.env.USER_EMAIL;

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
  console.log(`  Email:          ${USER_EMAIL}`);
  console.log('');

  // Validate inputs
  if (!FILE_ID) {
    throw new Error('FILE_ID is required');
  }
  if (!USER_EMAIL) {
    throw new Error('USER_EMAIL is required');
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

    // Step 3: Send email
    console.log('');
    console.log('Step 3: Sending result via email...');
    await sendEmail({
      to: USER_EMAIL,
      requestId: REQUEST_ID,
      sourceLang,
      targetLang: TARGET_LANG,
      attachmentPath: outputPath,
    });
    console.log(`  Email sent to: ${USER_EMAIL}`);

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  TRANSLATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('');
    console.error('ERROR:', error.message);

    // Send error notification email
    if (USER_EMAIL) {
      try {
        await sendEmail({
          to: USER_EMAIL,
          requestId: REQUEST_ID,
          sourceLang: 'unknown',
          targetLang: TARGET_LANG,
          error: error.message,
        });
      } catch (emailError) {
        console.error('Failed to send error email:', emailError.message);
      }
    }

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
