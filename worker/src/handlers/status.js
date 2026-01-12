/**
 * Handle status check requests
 */

import { findByRequestId } from '../lib/sheets.js';

const STATUS_MESSAGES = {
  pending: 'Your request is queued and will be processed shortly.',
  processing: 'Your canvas is being translated. This may take a few minutes.',
  completed: 'Translation complete! Check your email or StoryChat account.',
  failed: 'Translation failed. Please check the error message and try again.',
};

/**
 * Handle GET /api/status/:id
 */
export async function handleStatus(requestId, env) {
  try {
    // Validate request ID format
    if (!requestId || !requestId.startsWith('TR-')) {
      return {
        success: false,
        error: 'Invalid request ID format',
      };
    }

    // Find in Google Sheets
    const request = await findByRequestId(env, requestId);

    if (!request) {
      return {
        success: false,
        error: 'Request not found',
      };
    }

    // Build response
    const response = {
      success: true,
      requestId: request.requestId,
      status: request.status,
      message: STATUS_MESSAGES[request.status] || 'Unknown status',
      sourceLang: request.sourceLang,
      targetLang: request.targetLang,
      submittedAt: request.timestamp,
    };

    // Add status-specific fields
    if (request.status === 'completed') {
      response.completedAt = request.processedAt;
      if (request.resultUrl) {
        if (request.resultUrl.startsWith('mongodb:')) {
          response.deliveryMethod = 'mongodb';
          response.message = 'Translation complete! Your canvas has been imported to your StoryChat account.';
        } else if (request.resultUrl.startsWith('email:')) {
          response.deliveryMethod = 'email';
          response.message = `Translation complete! The translated canvas has been sent to ${request.email}.`;
        }
      }
    }

    if (request.status === 'failed') {
      response.error = request.error || 'Unknown error';
    }

    if (request.status === 'processing') {
      // Estimate remaining time based on queue position
      response.estimatedCompletion = 'A few minutes';
    }

    return response;
  } catch (error) {
    console.error('Status check error:', error);
    return {
      success: false,
      error: 'Failed to check status',
    };
  }
}

export default { handleStatus };
