/**
 * Canvas Translation Processor - Main Entry Point
 *
 * Processes canvas translation requests from Google Sheets queue.
 * Translates using Claude API and delivers via MongoDB import or email.
 *
 * Usage:
 *   node src/main.js           # Process all pending requests
 *   node src/main.js --once    # Process one request and exit
 *   node src/main.js --test    # Run with test canvas
 */

import { extractCanvas } from './extract.js';
import { translateAllBatches } from './translate.js';
import { mergeTranslations } from './merge.js';
import { validateCanvas } from './validate.js';
import { importCanvasToMongoDB, verifyUserExists } from './mongodb-import.js';
import { sendTranslatedCanvas, sendErrorNotification } from './email-delivery.js';
import {
  getPendingRequests,
  updateRequestStatus,
  STATUS,
} from './sheets-handler.js';

/**
 * Process a single translation request
 * @param {Object} request - Request from queue
 * @returns {Promise<Object>} - Processing result
 */
async function processRequest(request) {
  const { requestId, userUid, email, targetLang, canvasJson } = request;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Processing request: ${requestId}`);
  console.log(`Target language: ${targetLang}`);
  console.log(`User UID: ${userUid || 'Not provided'}`);
  console.log(`Email: ${email}`);
  console.log('='.repeat(60));

  try {
    // Step 1: Parse canvas JSON from base64
    console.log('\n[1/6] Parsing canvas JSON...');
    let canvas;
    try {
      const jsonString = Buffer.from(canvasJson, 'base64').toString('utf-8');
      canvas = JSON.parse(jsonString);
    } catch (e) {
      throw new Error(`Invalid canvas JSON: ${e.message}`);
    }

    const sourceLang = canvas.canvas?.canvasLanguage || 'ko';
    console.log(`  Source language: ${sourceLang}`);
    console.log(`  Nodes: ${Object.keys(canvas.metadataSet || {}).length}`);

    // Step 2: Extract translatable content
    console.log('\n[2/6] Extracting translatable content...');
    const extractedData = extractCanvas(canvas);
    console.log(`  Story core: ${extractedData.batches.storyCore.length} nodes`);
    console.log(`  Variables: ${extractedData.batches.variables.length} nodes`);
    console.log(`  Characters: ${extractedData.batches.characters.length} nodes`);
    console.log(`  Character text: ${extractedData.batches.characterText.length} nodes`);
    console.log(`  Content: ${extractedData.batches.content.length} nodes`);
    console.log(`  System: ${extractedData.batches.system.length} nodes`);

    // Step 3: Translate all batches
    console.log('\n[3/6] Translating content via Claude API...');
    const { translatedBatches, glossary } = await translateAllBatches(
      extractedData,
      targetLang,
      (batchType, current, total) => {
        if (current === total) {
          console.log(`  ✓ ${batchType}: ${total} nodes translated`);
        }
      }
    );

    // Step 4: Merge translations back into canvas
    console.log('\n[4/6] Merging translations...');
    const { canvas: translatedCanvas, stats } = mergeTranslations(
      canvas,
      translatedBatches,
      extractedData.context,
      targetLang
    );
    console.log(`  Applied: ${stats.applied} nodes`);
    console.log(`  Skipped: ${stats.skipped} nodes`);

    // Step 5: Validate translated canvas
    console.log('\n[5/6] Validating translation...');
    const validation = validateCanvas(translatedCanvas, sourceLang);
    if (validation.passed) {
      console.log('  ✓ Validation passed');
    } else {
      console.log('  ⚠ Validation warnings:');
      for (const error of validation.errors) {
        console.log(`    - ${error.type}: ${error.message}`);
      }
    }

    // Step 6: Deliver to user
    console.log('\n[6/6] Delivering translated canvas...');

    let deliveryResult;
    let deliveryMethod;

    // Try MongoDB import first if UID provided
    if (userUid) {
      try {
        console.log('  Attempting MongoDB import...');
        const userExists = await verifyUserExists(userUid);
        if (userExists) {
          deliveryResult = await importCanvasToMongoDB(translatedCanvas, userUid);
          deliveryMethod = 'mongodb';
          console.log(`  ✓ Canvas imported: ${deliveryResult.canvasId}`);
        } else {
          console.log('  ⚠ User not found in database, falling back to email');
        }
      } catch (mongoError) {
        console.log(`  ⚠ MongoDB import failed: ${mongoError.message}`);
        console.log('  Falling back to email delivery...');
      }
    }

    // Fall back to email if MongoDB failed or no UID
    if (!deliveryResult) {
      deliveryResult = await sendTranslatedCanvas(email, translatedCanvas, targetLang, stats);
      deliveryMethod = 'email';
      console.log(`  ✓ Email sent to ${email}`);
    }

    return {
      success: true,
      requestId,
      deliveryMethod,
      stats,
      validation: validation.passed ? 'passed' : 'warnings',
    };
  } catch (error) {
    console.error(`\n❌ Error processing request: ${error.message}`);

    // Try to send error notification
    if (email) {
      try {
        await sendErrorNotification(email, error.message);
        console.log(`  Error notification sent to ${email}`);
      } catch (emailError) {
        console.error(`  Failed to send error notification: ${emailError.message}`);
      }
    }

    throw error;
  }
}

/**
 * Main processing loop
 */
async function main() {
  const args = process.argv.slice(2);
  const runOnce = args.includes('--once');
  const testMode = args.includes('--test');

  console.log('\n' + '═'.repeat(60));
  console.log('  CANVAS TRANSLATION PROCESSOR');
  console.log('═'.repeat(60));
  console.log(`  Mode: ${testMode ? 'TEST' : runOnce ? 'Single request' : 'Continuous'}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('═'.repeat(60));

  // Test mode with sample data
  if (testMode) {
    console.log('\n⚠ Test mode: Using sample canvas data');
    // Create minimal test canvas
    const testCanvas = {
      exportVersion: 2,
      canvas: {
        canvasLanguage: 'ko',
        compilerVersion: 4,
      },
      nodes: [],
      connections: [],
      metadataSet: {
        'test-story-001': {
          type: 'story',
          name: '테스트 스토리',
          coreContext: '이것은 테스트 스토리입니다.',
          prologue: '안녕하세요, 세계!',
        },
        'test-char-001': {
          type: 'character',
          name: '주인공',
          text: '용감하고 친절한 주인공입니다.',
        },
      },
    };

    const testRequest = {
      requestId: 'TEST-001',
      userUid: null,
      email: 'test@example.com',
      targetLang: 'en',
      canvasJson: Buffer.from(JSON.stringify(testCanvas)).toString('base64'),
    };

    try {
      const result = await processRequest(testRequest);
      console.log('\n✓ Test completed successfully');
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('\n✗ Test failed:', error.message);
      process.exit(1);
    }
    return;
  }

  // Normal mode: Process from Google Sheets queue
  try {
    const requests = await getPendingRequests({ limit: runOnce ? 1 : 10 });

    if (requests.length === 0) {
      console.log('\nNo pending requests found.');
      return;
    }

    console.log(`\nFound ${requests.length} pending request(s)`);

    for (const request of requests) {
      try {
        // Mark as processing
        await updateRequestStatus(request.rowIndex, STATUS.PROCESSING);

        // Process the request
        const result = await processRequest(request);

        // Mark as completed
        await updateRequestStatus(request.rowIndex, STATUS.COMPLETED, {
          resultUrl: result.deliveryMethod === 'mongodb'
            ? `mongodb:${result.canvasId || 'imported'}`
            : `email:${request.email}`,
        });

        console.log(`\n✓ Request ${request.requestId} completed`);
      } catch (error) {
        // Mark as failed
        await updateRequestStatus(request.rowIndex, STATUS.FAILED, {
          error: error.message,
        });

        console.error(`\n✗ Request ${request.requestId} failed: ${error.message}`);
      }

      // Add delay between requests
      if (requests.indexOf(request) < requests.length - 1) {
        console.log('\nWaiting 2 seconds before next request...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n' + '═'.repeat(60));
    console.log('  PROCESSING COMPLETE');
    console.log('═'.repeat(60));
  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

// Run main
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
