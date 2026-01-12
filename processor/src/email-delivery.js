/**
 * Canvas Translation - Email Delivery Module
 *
 * Sends translated canvas as JSON attachment via Mailgun
 */

const MAILGUN_API_BASE = 'https://api.mailgun.net/v3';

const LANGUAGE_NAMES = {
  ko: '한국어',
  ja: '日本語',
  en: 'English',
};

/**
 * Build HTML email content for translation delivery
 */
function buildEmailHTML(targetLang, originalLang, stats) {
  const targetLangName = LANGUAGE_NAMES[targetLang] || targetLang;
  const originalLangName = LANGUAGE_NAMES[originalLang] || originalLang;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
      line-height: 1.6;
      color: #333;
      margin: 0;
      padding: 0;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      text-align: center;
      padding: 40px 20px 20px;
      background: linear-gradient(135deg, #00B2FF 0%, #0088cc 100%);
    }
    .header h1 {
      color: white;
      margin: 0;
      font-size: 24px;
    }
    .title {
      text-align: center;
      font-size: 20px;
      font-weight: bold;
      color: #333;
      margin: 30px 0;
    }
    .content {
      padding: 0 40px 30px;
      color: #555;
      font-size: 14px;
    }
    .content p {
      margin: 12px 0;
    }
    .info-box {
      background: #f9f9f9;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .info-box table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-box td {
      padding: 10px 0;
      border-bottom: 1px solid #eee;
    }
    .info-box tr:last-child td {
      border-bottom: none;
    }
    .label {
      color: #888;
      width: 40%;
    }
    .value {
      font-weight: bold;
      text-align: right;
    }
    .instructions {
      background: #e3f2fd;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    .instructions h3 {
      margin: 0 0 10px 0;
      color: #1976d2;
      font-size: 14px;
    }
    .instructions ol {
      margin: 0;
      padding-left: 20px;
    }
    .instructions li {
      margin: 8px 0;
    }
    .footer {
      text-align: center;
      padding: 30px 20px;
      border-top: 1px solid #eee;
      color: #888;
      font-size: 12px;
    }
    .footer a {
      color: #00B2FF;
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RPLAY StoryChat</h1>
    </div>

    <div class="title">Canvas Translation Complete</div>

    <div class="content">
      <p>Your StoryChat canvas has been successfully translated!</p>

      <div class="info-box">
        <table>
          <tr>
            <td class="label">Original Language</td>
            <td class="value">${originalLangName}</td>
          </tr>
          <tr>
            <td class="label">Translated To</td>
            <td class="value">${targetLangName}</td>
          </tr>
          <tr>
            <td class="label">Nodes Translated</td>
            <td class="value">${stats.applied || 'N/A'}</td>
          </tr>
        </table>
      </div>

      <div class="instructions">
        <h3>How to Import Your Translated Canvas:</h3>
        <ol>
          <li>Download the attached JSON file</li>
          <li>Go to <a href="https://rplay.live">rplay.live</a> and log in</li>
          <li>Create a new StoryChat or open an existing one</li>
          <li>In the Canvas Editor, click the <strong>"Import"</strong> button</li>
          <li>Upload the JSON file</li>
          <li>Click <strong>"Compile"</strong> to finalize</li>
        </ol>
      </div>

      <p>If you have any questions or issues, please contact our support team.</p>

      <p style="margin-top: 30px;">
        Thank you for using RPLAY!<br>
        The RPLAY Team
      </p>
    </div>

    <div class="footer">
      <p>
        <a href="https://rplay.live">RPLAY</a> |
        <a href="https://x.com/RPLAY_m">Twitter</a> |
        <a href="https://discord.gg/rplay">Discord</a>
      </p>
      <p>This is an automated message. Please do not reply directly.</p>
    </div>
  </div>
</body>
</html>
`;
}

/**
 * Send translated canvas via email
 * @param {string} toEmail - Recipient email address
 * @param {Object} translatedCanvas - Translated canvas JSON object
 * @param {string} targetLang - Target language code
 * @param {Object} stats - Translation stats { applied, skipped, sourceLang }
 * @param {Object} options - { mailgunApiKey, mailgunDomain }
 * @returns {Promise<Object>} - { success, messageId }
 */
export async function sendTranslatedCanvas(toEmail, translatedCanvas, targetLang, stats, options = {}) {
  const {
    mailgunApiKey = process.env.MAILGUN_API_KEY,
    mailgunDomain = process.env.MAILGUN_DOMAIN || 'rplay.live',
  } = options;

  if (!mailgunApiKey) {
    throw new Error('Mailgun API key not provided (MAILGUN_API_KEY)');
  }

  if (!toEmail || !toEmail.includes('@')) {
    throw new Error('Invalid email address');
  }

  const timestamp = Date.now();
  const filename = `canvas-translated-${targetLang}-${timestamp}.json`;
  const jsonContent = JSON.stringify(translatedCanvas, null, 2);

  const htmlContent = buildEmailHTML(targetLang, stats.sourceLang, stats);

  // Build form data for Mailgun API
  const formData = new FormData();
  formData.append('from', 'RPLAY <robot@rplay.live>');
  formData.append('to', toEmail);
  formData.append('subject', `[RPLAY] Canvas Translation Complete - ${LANGUAGE_NAMES[targetLang] || targetLang}`);
  formData.append('html', htmlContent);
  formData.append('o:tag', 'canvas-translation');

  // Add JSON file as attachment
  const blob = new Blob([jsonContent], { type: 'application/json' });
  formData.append('attachment', blob, filename);

  try {
    const response = await fetch(`${MAILGUN_API_BASE}/${mailgunDomain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64'),
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailgun API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      success: true,
      messageId: result.id,
      message: `Email sent to ${toEmail}`,
    };
  } catch (error) {
    console.error('Email delivery error:', error);
    throw error;
  }
}

/**
 * Send error notification email
 * @param {string} toEmail - Recipient email address
 * @param {string} errorMessage - Error description
 * @param {Object} options - { mailgunApiKey, mailgunDomain }
 */
export async function sendErrorNotification(toEmail, errorMessage, options = {}) {
  const {
    mailgunApiKey = process.env.MAILGUN_API_KEY,
    mailgunDomain = process.env.MAILGUN_DOMAIN || 'rplay.live',
  } = options;

  if (!mailgunApiKey) {
    throw new Error('Mailgun API key not provided');
  }

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .error-box { background: #fee; border: 1px solid #fcc; padding: 20px; border-radius: 8px; }
  </style>
</head>
<body>
  <h2>Canvas Translation Error</h2>
  <div class="error-box">
    <p>We encountered an error while processing your canvas translation request:</p>
    <p><strong>${errorMessage}</strong></p>
  </div>
  <p>Please try again or contact support if the issue persists.</p>
  <p>- RPLAY Team</p>
</body>
</html>
`;

  const formData = new FormData();
  formData.append('from', 'RPLAY <robot@rplay.live>');
  formData.append('to', toEmail);
  formData.append('subject', '[RPLAY] Canvas Translation Error');
  formData.append('html', htmlContent);
  formData.append('o:tag', 'canvas-translation-error');

  try {
    const response = await fetch(`${MAILGUN_API_BASE}/${mailgunDomain}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`api:${mailgunApiKey}`).toString('base64'),
      },
      body: formData,
    });

    return { success: response.ok };
  } catch (error) {
    console.error('Error notification failed:', error);
    return { success: false };
  }
}

export default { sendTranslatedCanvas, sendErrorNotification };
