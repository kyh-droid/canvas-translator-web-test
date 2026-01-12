/**
 * Email delivery via Mailgun
 */

import fs from 'fs';
import path from 'path';
import FormData from 'form-data';

const MAILGUN_API_KEY = process.env.MAILGUN_API_KEY;
const MAILGUN_DOMAIN = process.env.MAILGUN_DOMAIN || 'rplay.live';
const FROM_EMAIL = `Canvas Translator <robot@${MAILGUN_DOMAIN}>`;

const LANG_NAMES = {
  en: 'English',
  ko: 'Korean (한국어)',
  ja: 'Japanese (日本語)',
};

/**
 * Send email with translation result or error
 */
export async function sendEmail({ to, requestId, sourceLang, targetLang, attachmentPath, error }) {
  if (!MAILGUN_API_KEY) {
    throw new Error('MAILGUN_API_KEY is required');
  }

  const form = new FormData();
  form.append('from', FROM_EMAIL);
  form.append('to', to);

  if (error) {
    // Error email
    form.append('subject', `[Canvas Translator] Translation Failed - ${requestId}`);
    form.append('html', generateErrorHtml(requestId, targetLang, error));
  } else {
    // Success email
    form.append('subject', `[Canvas Translator] Translation Complete - ${requestId}`);
    form.append('html', generateSuccessHtml(requestId, sourceLang, targetLang));

    // Attach the translated file
    if (attachmentPath && fs.existsSync(attachmentPath)) {
      const fileName = `canvas-translated-${targetLang}.json`;
      form.append('attachment', fs.createReadStream(attachmentPath), {
        filename: fileName,
        contentType: 'application/json',
      });
    }
  }

  // Send via Mailgun API
  const response = await fetch(
    `https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY}`).toString('base64'),
      },
      body: form,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Mailgun API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Generate success email HTML
 */
function generateSuccessHtml(requestId, sourceLang, targetLang) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: linear-gradient(135deg, #00B2FF, #8b5cf6); color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .success-icon { font-size: 48px; margin-bottom: 16px; }
    .info-box { background: #f0f9ff; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
    .info-row:last-child { border-bottom: none; }
    .label { color: #666; }
    .value { font-weight: 600; }
    .instructions { background: #f5f5f5; border-radius: 8px; padding: 16px; margin-top: 20px; }
    .instructions h3 { margin-top: 0; color: #333; }
    .instructions ol { margin: 0; padding-left: 20px; color: #555; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Translation Complete!</h1>
    </div>
    <div class="content">
      <div style="text-align: center;">
        <div class="success-icon">✅</div>
        <p>Your canvas has been successfully translated.</p>
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="label">Request ID</span>
          <span class="value">${requestId}</span>
        </div>
        <div class="info-row">
          <span class="label">Translation</span>
          <span class="value">${LANG_NAMES[sourceLang] || sourceLang} → ${LANG_NAMES[targetLang] || targetLang}</span>
        </div>
      </div>

      <div class="instructions">
        <h3>How to use the translated file:</h3>
        <ol>
          <li>Download the attached JSON file</li>
          <li>Go to StoryChat Canvas Editor</li>
          <li>Click "Import" and select the downloaded file</li>
          <li>Review and publish your translated canvas</li>
        </ol>
      </div>
    </div>
    <div class="footer">
      <p>Powered by <a href="https://rplay.live">RPLAY</a></p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Generate error email HTML
 */
function generateErrorHtml(requestId, targetLang, error) {
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .header { background: #ef4444; color: white; padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; }
    .content { padding: 30px; }
    .error-icon { font-size: 48px; margin-bottom: 16px; }
    .error-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0; color: #991b1b; }
    .info-box { background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; }
    .label { color: #666; }
    .value { font-weight: 600; }
    .footer { text-align: center; padding: 20px; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Translation Failed</h1>
    </div>
    <div class="content">
      <div style="text-align: center;">
        <div class="error-icon">❌</div>
        <p>We encountered an error while translating your canvas.</p>
      </div>

      <div class="error-box">
        <strong>Error:</strong> ${error}
      </div>

      <div class="info-box">
        <div class="info-row">
          <span class="label">Request ID</span>
          <span class="value">${requestId}</span>
        </div>
        <div class="info-row">
          <span class="label">Target Language</span>
          <span class="value">${LANG_NAMES[targetLang] || targetLang}</span>
        </div>
      </div>

      <p>Please check your file and try again. Common issues:</p>
      <ul>
        <li>File is not a valid StoryChat canvas export</li>
        <li>Canvas is already in the target language</li>
        <li>File is too large (max 10MB)</li>
      </ul>
    </div>
    <div class="footer">
      <p>Powered by <a href="https://rplay.live">RPLAY</a></p>
    </div>
  </div>
</body>
</html>
`;
}
