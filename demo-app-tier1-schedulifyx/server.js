/**
 * SchedulifyX Demo App — Backend Server
 * 
 * This Express server handles:
 * 1. Creating/managing tenant users via the SchedulifyX Developer API
 * 2. Generating client tokens for embed components
 * 3. Serving the frontend static files
 * 
 * Your API key stays server-side — NEVER exposed to the browser.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Local Media Uploads (Development) ───────────────────────────────────
// In production, replace with your own S3/CDN upload.
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      const id = crypto.randomBytes(12).toString('hex');
      cb(null, `${id}${ext}`);
    },
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file provided' });

  // Use PUBLIC_URL (ngrok/cloudflared tunnel) so the production server can reach the file.
  // Falls back to the request host (localhost) if no tunnel is configured.
  const baseUrl = process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL.replace(/\/+$/, '')
    : `${req.protocol}://${req.get('host')}`;

  res.json({
    url: `${baseUrl}/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mediaType: req.file.mimetype.startsWith('video/') ? 'video' : 'image',
  });
});

// ─── Configuration ──────────────────────────────────────────────────────
const API_KEY = process.env.SCHEDULIFYX_API_KEY;
const API_BASE = 'https://api.schedulifyx.com';
const PORT = process.env.PORT || 4000;

if (!API_KEY || !API_KEY.startsWith('sk_live_')) {
  console.error('\n❌ Missing or invalid SCHEDULIFYX_API_KEY in .env');
  console.error('   Get your API key at: https://app.schedulifyx.com/settings\n');
  process.exit(1);
}

// ─── Helper: Make API call to SchedulifyX ───────────────────────────────
async function apiCall(method, endpoint, body = null, tenantId = null) {
  const options = {
    method,
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
  };
  if (tenantId) options.headers['X-Tenant-Id'] = tenantId;
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, options);

  // Capture rate limit headers
  const rateLimits = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    monthlyUsed: res.headers.get('x-monthly-used'),
    monthlyLimit: res.headers.get('x-monthly-limit'),
  };

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error?.message || `API error: ${res.status}`);
    err.status = res.status;
    err.apiError = data.error;
    throw err;
  }

  return { ...data, _rateLimits: rateLimits };
}

// ─── Routes ─────────────────────────────────────────────────────────────

/**
 * GET /api/status
 * Check API connection and tier info
 */
app.get('/api/status', async (req, res) => {
  try {
    const result = await apiCall('GET', '/');
    res.json({
      connected: true,
      version: result.data.version,
      tier: result.data.key.accessTier,
      keyName: result.data.key.name,
      components: result.data.embeddedComponents?.availableComponents || [],
      plan: result.data.plan || {},
      rateLimits: result._rateLimits,
    });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

/**
 * GET /api/usage
 * Get API usage stats
 */
app.get('/api/usage', async (req, res) => {
  try {
    const result = await apiCall('GET', '/usage');
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/tenants
 * Create a new tenant user (represents one of YOUR users)
 */
app.post('/api/tenants', async (req, res) => {
  try {
    const { externalId, name, email } = req.body;

    if (!externalId || !name) {
      return res.status(400).json({ error: 'externalId and name are required' });
    }

    const result = await apiCall('POST', '/tenants', {
      externalId,
      name,
      email: email || `${externalId}@demo.example.com`,
      metadata: { source: 'demo-app', createdVia: 'schedulifyx-demo' },
    });

    res.json(result.data);
  } catch (err) {
    // If tenant already exists, try to find it
    if (err.status === 409 || err.apiError?.code === 'duplicate') {
      try {
        const list = await apiCall('GET', `/tenants?externalId=${encodeURIComponent(req.body.externalId)}`);
        if (list.data && list.data.length > 0) {
          return res.json(list.data[0]);
        }
      } catch (_) { /* fall through */ }
    }
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/tenants
 * List all tenants
 */
app.get('/api/tenants', async (req, res) => {
  try {
    const result = await apiCall('GET', '/tenants?limit=50');
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenants/:id
 * Get a single tenant
 */
app.get('/api/tenants/:id', async (req, res) => {
  try {
    const result = await apiCall('GET', `/tenants/${req.params.id}`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/tenants/:id/token
 * Generate a client token for embedding components
 */
app.post('/api/tenants/:id/token', async (req, res) => {
  try {
    const result = await apiCall('POST', `/tenants/${req.params.id}/client-token`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * DELETE /api/tenants/:id
 * Remove a tenant
 */
app.delete('/api/tenants/:id', async (req, res) => {
  try {
    const result = await apiCall('DELETE', `/tenants/${req.params.id}`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/tenants/:id/connect/:platform
 * Get OAuth connect URL for a tenant to link a social account
 */
app.get('/api/tenants/:id/connect/:platform', async (req, res) => {
  try {
    const result = await apiCall('GET', `/tenants/${req.params.id}/connect/${req.params.platform}`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/tenants/:id/connect/bluesky
 * Connect a Bluesky account (uses handle + app password)
 */
app.post('/api/tenants/:id/connect/bluesky', async (req, res) => {
  try {
    const result = await apiCall('POST', `/tenants/${req.params.id}/connect/bluesky`, req.body);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/tenants/:id/connect/mastodon
 * Connect a Mastodon account (uses instance URL + access token)
 */
app.post('/api/tenants/:id/connect/mastodon', async (req, res) => {
  try {
    const result = await apiCall('POST', `/tenants/${req.params.id}/connect/mastodon`, req.body);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// NOTE: Posts, Analytics, Accounts data endpoints are NOT available for Tier 1 (embed) keys.
// All data access is through embedded components (iframes with client tokens).
// See demo-tier2-app for REST API data endpoint examples (Tier 2/3).

/**
 * DELETE /api/tenants/:id/accounts/:accountId
 * Disconnect a social account from a tenant
 */
app.delete('/api/tenants/:id/accounts/:accountId', async (req, res) => {
  try {
    const result = await apiCall('DELETE', `/tenants/${req.params.id}/accounts/${req.params.accountId}`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/webhooks
 * List all webhooks
 */
app.get('/api/webhooks', async (req, res) => {
  try {
    const result = await apiCall('GET', '/webhooks');
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/webhooks
 * Create a webhook
 */
app.post('/api/webhooks', async (req, res) => {
  try {
    const result = await apiCall('POST', '/webhooks', req.body);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * DELETE /api/webhooks/:id
 * Delete a webhook
 */
app.delete('/api/webhooks/:id', async (req, res) => {
  try {
    const result = await apiCall('DELETE', `/webhooks/${req.params.id}`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/webhooks/events/types
 * List all available webhook event types
 */
app.get('/api/webhooks/events/types', async (req, res) => {
  try {
    const result = await apiCall('GET', '/webhooks/events/types');
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tenants/:id/accounts
 * List connected social accounts for a tenant
 */
app.get('/api/tenants/:id/accounts', async (req, res) => {
  try {
    const result = await apiCall('GET', `/tenants/${req.params.id}/accounts`);
    res.json(result.data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// NOTE: Post listing via REST API requires Tier 2+.
// In Tier 1, posts are viewed through the embedded post-creator component.

// NOTE: Data sync via REST API requires Tier 2+.
// In Tier 1, sync happens automatically within embedded components.

// ─── Fallback: Serve frontend ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start server ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  const publicUrl = process.env.PUBLIC_URL;
  console.log(`
╔══════════════════════════════════════════════════╗
║   SchedulifyX Demo App                           ║
║   Running at http://localhost:${PORT}               ║
║                                                  ║
║   API Key: ${API_KEY.slice(0, 12)}...${API_KEY.slice(-4)}                   ║
║   Tier 1 (Embed) Integration Demo                ║
╚══════════════════════════════════════════════════╝
  `);
  if (publicUrl) {
    console.log(`   📡 PUBLIC_URL: ${publicUrl}`);
    console.log('   Media uploads will use this URL (accessible by SchedulifyX servers).\n');
  } else {
    console.log('   ⚠️  No PUBLIC_URL set — media uploads use localhost URLs.');
    console.log('   Posts with media will FAIL because SchedulifyX servers cannot reach localhost.');
    console.log('   Fix: Set PUBLIC_URL in .env to your ngrok/cloudflared tunnel URL.\n');
    console.log('   Quick start:');
    console.log(`     1. npx ngrok http ${PORT}`);
    console.log('     2. Copy the https://xxxx.ngrok-free.app URL');
    console.log('     3. Add PUBLIC_URL=https://xxxx.ngrok-free.app to .env');
    console.log('     4. Restart this server\n');
  }
});
