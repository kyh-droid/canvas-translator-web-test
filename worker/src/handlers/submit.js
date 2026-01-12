/**
 * Handle translation request submission
 */

import { appendRow } from '../lib/sheets.js';

const SUPPORTED_LANGUAGES = ['en', 'ko', 'ja'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate request body
 */
function validateRequest(body) {
  const errors = [];

  if (!body.canvasJson) {
    errors.push('canvasJson is required');
  } else if (body.canvasJson.length > MAX_FILE_SIZE) {
    errors.push('Canvas file too large (max 10MB)');
  }

  if (!body.targetLang) {
    errors.push('targetLang is required');
  } else if (!SUPPORTED_LANGUAGES.includes(body.targetLang)) {
    errors.push(`targetLang must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  if (!body.email) {
    errors.push('email is required');
  } else if (!body.email.includes('@')) {
    errors.push('Invalid email format');
  }

  if (body.userUid && !/^[a-f0-9]{24}$/i.test(body.userUid)) {
    errors.push('Invalid userUid format (must be 24-character hex)');
  }

  return errors;
}

/**
 * Detect source language from canvas JSON
 */
function detectSourceLang(canvasJsonBase64) {
  try {
    const jsonString = atob(canvasJsonBase64);
    const canvas = JSON.parse(jsonString);
    return canvas.canvas?.canvasLanguage || 'ko';
  } catch {
    return 'ko';
  }
}

/**
 * Generate unique request ID
 */
function generateRequestId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `TR-${timestamp}-${random}`;
}

/**
 * Handle POST /api/submit
 */
export async function handleSubmit(request, env) {
  try {
    // Parse request body
    const contentType = request.headers.get('content-type') || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = {
        canvasJson: formData.get('canvasJson'),
        targetLang: formData.get('targetLang'),
        email: formData.get('email'),
        userUid: formData.get('userUid'),
      };

      // Handle file upload
      const file = formData.get('file');
      if (file && file instanceof File) {
        const text = await file.text();
        body.canvasJson = btoa(text);
      }
    } else {
      return { success: false, error: 'Unsupported content type' };
    }

    // Validate request
    const errors = validateRequest(body);
    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Generate request ID
    const requestId = generateRequestId();

    // Detect source language
    const sourceLang = detectSourceLang(body.canvasJson);

    // Don't translate to the same language
    if (sourceLang === body.targetLang) {
      return {
        success: false,
        error: `Canvas is already in ${body.targetLang}. Please select a different target language.`,
      };
    }

    // Build row data
    const row = [
      requestId,                           // A: Request ID
      new Date().toISOString(),            // B: Timestamp
      body.userUid || '',                  // C: User UID
      body.email,                          // D: Email
      sourceLang,                          // E: Source Lang
      body.targetLang,                     // F: Target Lang
      'pending',                           // G: Status
      body.canvasJson,                     // H: Canvas JSON (base64)
      '',                                  // I: Result URL
      '',                                  // J: Error
      '',                                  // K: Processed At
    ];

    // Add to Google Sheets queue
    await appendRow(env, row);

    // Optionally trigger GitHub Actions (if configured)
    if (env.GITHUB_TOKEN && env.GITHUB_REPO) {
      try {
        await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`, {
          method: 'POST',
          headers: {
            'Authorization': `token ${env.GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            event_type: 'canvas-translation',
            client_payload: { requestId },
          }),
        });
      } catch (e) {
        // Non-fatal - processor will pick up from queue anyway
        console.log('GitHub webhook failed:', e.message);
      }
    }

    return {
      success: true,
      requestId,
      message: 'Translation request submitted successfully',
      estimatedTime: '5-15 minutes',
      statusUrl: `/api/status/${requestId}`,
    };
  } catch (error) {
    console.error('Submit error:', error);
    return { success: false, error: 'Failed to submit request' };
  }
}

export default { handleSubmit };
