/**
 * Canvas Translator API - Cloudflare Worker
 *
 * Endpoints:
 *   POST /api/submit   - Submit new translation request
 *   GET  /api/status/:id - Check request status
 *   POST /api/webhook  - Internal webhook for GitHub Actions (optional)
 */

import { handleSubmit } from './handlers/submit.js';
import { handleStatus } from './handlers/status.js';

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * Handle CORS preflight
 */
function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  });
}

/**
 * Create JSON response with CORS headers
 */
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return handleOptions();
    }

    try {
      // Route: POST /api/submit
      if (path === '/api/submit' && method === 'POST') {
        const result = await handleSubmit(request, env);
        return jsonResponse(result, result.success ? 200 : 400);
      }

      // Route: GET /api/status/:id
      if (path.startsWith('/api/status/') && method === 'GET') {
        const requestId = path.split('/api/status/')[1];
        if (!requestId) {
          return jsonResponse({ error: 'Request ID required' }, 400);
        }
        const result = await handleStatus(requestId, env);
        return jsonResponse(result, result.success ? 200 : 404);
      }

      // Route: POST /api/webhook (trigger GitHub Action)
      if (path === '/api/webhook' && method === 'POST') {
        if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
          return jsonResponse({ error: 'Webhook not configured' }, 500);
        }

        // Trigger GitHub Actions workflow
        const response = await fetch(
          `https://api.github.com/repos/${env.GITHUB_REPO}/dispatches`,
          {
            method: 'POST',
            headers: {
              'Authorization': `token ${env.GITHUB_TOKEN}`,
              'Accept': 'application/vnd.github.v3+json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              event_type: 'canvas-translation',
            }),
          }
        );

        if (response.ok) {
          return jsonResponse({ success: true, message: 'Workflow triggered' });
        } else {
          const error = await response.text();
          return jsonResponse({ error: `GitHub API error: ${error}` }, 500);
        }
      }

      // Health check
      if (path === '/health' || path === '/') {
        return jsonResponse({
          status: 'ok',
          service: 'canvas-translator-api',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        });
      }

      // 404 for unknown routes
      return jsonResponse({ error: 'Not found' }, 404);
    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: 'Internal server error' }, 500);
    }
  },
};
