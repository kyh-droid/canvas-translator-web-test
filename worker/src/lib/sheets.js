/**
 * Google Sheets API client for Cloudflare Workers
 *
 * Uses direct HTTP requests since googleapis library isn't compatible with Workers
 */

/**
 * Get Google OAuth2 access token using service account
 */
async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);

  // Build JWT header and payload
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  // Encode header and payload
  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  // Sign with private key
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  // Import the private key
  const pemContent = privateKey.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const binaryKey = Uint8Array.from(atob(pemContent), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // Sign the JWT
  const signatureInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, signatureInput);
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${encodedHeader}.${encodedPayload}.${encodedSignature}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

/**
 * Append a row to Google Sheets
 */
export async function appendRow(env, values, sheetName = 'Requests') {
  const accessToken = await getAccessToken(env);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${sheetName}!A:K:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        values: [values],
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sheets API error: ${error}`);
  }

  return await response.json();
}

/**
 * Get rows from Google Sheets
 */
export async function getRows(env, range, sheetName = 'Requests') {
  const accessToken = await getAccessToken(env);

  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${env.SPREADSHEET_ID}/values/${sheetName}!${range}`,
    {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Sheets API error: ${error}`);
  }

  const data = await response.json();
  return data.values || [];
}

/**
 * Find row by Request ID
 */
export async function findByRequestId(env, requestId, sheetName = 'Requests') {
  const rows = await getRows(env, 'A2:K', sheetName);

  for (const row of rows) {
    if (row[0] === requestId) {
      return {
        requestId: row[0],
        timestamp: row[1],
        userUid: row[2] || null,
        email: row[3],
        sourceLang: row[4],
        targetLang: row[5],
        status: row[6],
        resultUrl: row[8] || null,
        error: row[9] || null,
        processedAt: row[10] || null,
      };
    }
  }

  return null;
}

export default { appendRow, getRows, findByRequestId };
