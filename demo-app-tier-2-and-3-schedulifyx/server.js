/**
 * SchedulifyX Tier 2-3 Demo App — Backend Server
 *
 * Demonstrates all Tier 2 (Publishing) and Tier 3 (Engagement) API features.
 * Your API key stays server-side — NEVER exposed to the browser.
 *
 * Features:
 * - Tenant signup/login (each user gets isolated data)
 * - All API calls include X-Tenant-Id header for tenant isolation
 * - Tier 2 (Publishing): Posts, Accounts, Analytics, Queue, X/Twitter
 * - Tier 3 (Full Engagement): Comments, Inbox, Mentions
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const multer = require('multer');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');

// Simple password hashing (for demo — production apps should use bcrypt)
function hashPassword(password) {
  return crypto.createHash('sha256').update(password + '_schedulifyx_demo_salt').digest('hex');
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Local Media Uploads (Development) ───────────────────────────────
// In production, replace this with your own CDN/S3 upload.
// Files are stored locally in public/uploads/ and served statically.
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
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, WebP images and MP4, MOV, WebM videos are allowed'));
    }
  },
});

// Upload file → returns a URL that the demo server serves statically.
// When creating posts via the SchedulifyX API, the API fetches media from these URLs.
// IMPORTANT: For publishing to work, these URLs must be publicly reachable.
// Set PUBLIC_URL in .env to your ngrok/cloudflared tunnel URL.
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file provided' });
  }

  // Use PUBLIC_URL (ngrok/cloudflared tunnel) so SchedulifyX servers can reach the file.
  // Falls back to the request host (localhost) if no tunnel is configured.
  const baseUrl = process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL.replace(/\/+$/, '')
    : `${req.protocol}://${req.get('host')}`;

  const isVideo = req.file.mimetype.startsWith('video/');
  res.json({
    url: `${baseUrl}/uploads/${req.file.filename}`,
    fileName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    mediaType: isVideo ? 'video' : 'image',
  });
});

// Expose PUBLIC_URL to the frontend so it can build correct media URLs
app.get('/api/config', (req, res) => {
  res.json({
    publicUrl: process.env.PUBLIC_URL || null,
  });
});

// ─── Configuration ───────────────────────────────────────────────────
const API_KEY = process.env.SCHEDULIFYX_API_KEY;
const API_BASE = 'https://api.schedulifyx.com';
const PORT = process.env.PORT || 4001;

if (!API_KEY || !API_KEY.startsWith('sk_live_')) {
  console.error('\n❌ Missing or invalid SCHEDULIFYX_API_KEY in .env');
  console.error('   Get your API key at: https://app.schedulifyx.com/settings');
  console.error('   Your key must have Tier 2 (Publishing) or Tier 3 (Full) access.\n');
  process.exit(1);
}

// ─── File-backed session store (persists across server restarts) ─────
// In production, use Redis or database-backed sessions.
const SESSIONS_FILE = path.join(__dirname, '.sessions.json');
const sessions = new Map();

function loadSessions() {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
      for (const [key, value] of Object.entries(data)) {
        sessions.set(key, value);
      }
      console.log(`[Sessions] Loaded ${sessions.size} session(s) from disk`);
    }
  } catch (e) {
    console.warn('[Sessions] Could not load sessions file:', e.message);
  }
}

function saveSessions() {
  try {
    const obj = Object.fromEntries(sessions);
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(obj, null, 2));
  } catch (e) {
    console.warn('[Sessions] Could not save sessions file:', e.message);
  }
}

// Load persisted sessions on startup
loadSessions();

function generateToken() {
  return 'sess_' + Array.from({ length: 32 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
}

// ─── Auth middleware: extract tenant from session ────────────────────
function requireTenant(req, res, next) {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Not authenticated. Please sign up or log in.' });
  }
  req.tenant = sessions.get(token);
  next();
}

// ─── Helper: Make API call to SchedulifyX ────────────────────────────
async function apiCall(method, endpoint, body = null, tenantId = null) {
  const headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  };
  // Always include tenant ID for tenant-scoped endpoints
  if (tenantId) {
    headers['X-Tenant-Id'] = tenantId;
  }

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const url = `${API_BASE}${endpoint}`;
  console.log(`[API] ${method} ${url}${tenantId ? ` (tenant: ${tenantId.substring(0, 8)}...)` : ''}`);

  const res = await fetch(url, options);

  const rateLimits = {
    limit: res.headers.get('x-ratelimit-limit'),
    remaining: res.headers.get('x-ratelimit-remaining'),
    monthlyUsed: res.headers.get('x-monthly-used'),
    monthlyLimit: res.headers.get('x-monthly-limit'),
  };

  // Handle non-JSON responses (e.g. Cloudflare HTML error pages, 502/524 timeouts)
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    const text = await res.text();
    console.error(`[API] Non-JSON response (${res.status}): ${text.substring(0, 200)}`);
    data = { error: { message: `API returned non-JSON response (HTTP ${res.status})`, code: 'NON_JSON_RESPONSE' } };
  }
  return { status: res.status, data, rateLimits };
}

// ═══════════════════════════════════════════════════════════════════════
// AUTH ENDPOINTS (Tenant Management)
// ═══════════════════════════════════════════════════════════════════════

// Sign up — creates a new tenant via the API
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Create tenant via SchedulifyX API — store password hash in metadata
    const result = await apiCall('POST', '/tenants', {
      name: name,
      email: email,
      externalId: email, // Use email as external ID for lookups
      metadata: { passwordHash: hashPassword(password) },
    });

    if (result.status !== 201 && result.status !== 200) {
      const msg = result.data?.error?.message || result.data?.error || 'Failed to create tenant';
      return res.status(result.status).json({ error: msg });
    }

    const tenant = result.data?.data || result.data;
    const token = generateToken();
    sessions.set(token, {
      id: tenant.id,
      name: tenant.name || name,
      email: tenant.email || email,
    });
    saveSessions();

    console.log(`[Auth] Signup: ${email} → tenant ${tenant.id}`);
    res.json({ token, tenant: { id: tenant.id, name: tenant.name || name, email } });
  } catch (e) {
    console.error('[Auth] Signup error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Login — finds existing tenant by email, verifies password
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // List tenants and find by email/externalId
    const result = await apiCall('GET', '/tenants');
    if (result.status !== 200) {
      return res.status(500).json({ error: 'Failed to fetch tenants' });
    }

    const tenants = result.data?.data || [];
    const tenant = tenants.find(t => t.email === email || t.externalId === email);

    if (!tenant) {
      return res.status(404).json({ error: 'No account found with that email. Please sign up first.' });
    }

    if (!tenant.isActive) {
      return res.status(403).json({ error: 'This account has been deactivated.' });
    }

    // Verify password against stored hash in metadata
    const storedHash = tenant.metadata?.passwordHash;
    if (!storedHash || storedHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = generateToken();
    sessions.set(token, {
      id: tenant.id,
      name: tenant.name || tenant.email,
      email: tenant.email,
    });
    saveSessions();

    console.log(`[Auth] Login: ${email} → tenant ${tenant.id}`);
    res.json({ token, tenant: { id: tenant.id, name: tenant.name || tenant.email, email: tenant.email } });
  } catch (e) {
    console.error('[Auth] Login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  if (token) {
    sessions.delete(token);
    saveSessions();
  }
  res.json({ success: true });
});

// Get current session
app.get('/api/auth/me', requireTenant, (req, res) => {
  res.json({ tenant: req.tenant });
});

// ─── API Info (no tenant needed) ─────────────────────────────────────
app.get('/api/info', async (req, res) => {
  try {
    const result = await apiCall('GET', '/');
    // result = { status, data: { data: { key, plan, engagementAccess, ... } }, rateLimits }
    // Unwrap so frontend can access info.data.key, info.data.engagementAccess, etc.
    res.json({ data: result.data?.data || result.data, rateLimits: result.rateLimits });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Usage (no tenant needed) ────────────────────────────────────────
app.get('/api/usage', async (req, res) => {
  try {
    const result = await apiCall('GET', '/usage');
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TIER 2: PUBLISHING API (all tenant-scoped)
// ═══════════════════════════════════════════════════════════════════════

// ─── Posts ────────────────────────────────────────────────────────────
app.get('/api/posts', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.status) params.set('status', req.query.status);
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.limit) params.set('limit', req.query.limit);
    if (req.query.offset) params.set('offset', req.query.offset);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/posts${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/posts/:id', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/posts/${req.params.id}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', '/posts', req.body, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/posts/:id', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('PATCH', `/posts/${req.params.id}`, req.body, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/posts/:id', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('DELETE', `/posts/${req.params.id}`, null, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/posts/:id/publish', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', `/posts/${req.params.id}/publish`, null, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Accounts ────────────────────────────────────────────────────────
app.get('/api/accounts', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.active) params.set('active', req.query.active);
    if (req.query.limit) params.set('limit', req.query.limit);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/accounts${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/accounts/${req.params.id}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id/pinterest-boards', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/accounts/${req.params.id}/pinterest-boards`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/accounts/:id/tiktok-creator-info', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/accounts/${req.params.id}/tiktok-creator-info`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Account Connect (Real OAuth) ───────────────────────────────────
// Initiates real OAuth flow via the SchedulifyX API
app.get('/api/connect/:platform', requireTenant, async (req, res) => {
  try {
    const platform = req.params.platform;
    // After OAuth, the SchedulifyX callback redirects to this URL
    const redirectUri = `${req.protocol}://${req.get('host')}/callback`;
    const result = await apiCall(
      'GET',
      `/tenants/${req.tenant.id}/connect/${platform}?redirectUri=${encodeURIComponent(redirectUri)}`,
      null
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Direct login for Bluesky (username + app password)
app.post('/api/connect/bluesky', requireTenant, async (req, res) => {
  try {
    const result = await apiCall(
      'POST',
      `/tenants/${req.tenant.id}/connect/bluesky`,
      req.body
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Direct login for Mastodon (instance URL + credentials)
app.post('/api/connect/mastodon', requireTenant, async (req, res) => {
  try {
    const result = await apiCall(
      'POST',
      `/tenants/${req.tenant.id}/connect/mastodon`,
      req.body
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Disconnect account
app.delete('/api/accounts/:id', requireTenant, async (req, res) => {
  try {
    const result = await apiCall(
      'DELETE',
      `/tenants/${req.tenant.id}/accounts/${req.params.id}`,
      null
    );
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────
app.get('/api/analytics/overview', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/analytics/overview', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/analytics', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.accountId) params.set('accountId', req.query.accountId);
    if (req.query.startDate) params.set('startDate', req.query.startDate);
    if (req.query.endDate) params.set('endDate', req.query.endDate);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/analytics${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/analytics/account/:accountId', requireTenant, async (req, res) => {
  try {
    const days = req.query.days || 30;
    const result = await apiCall('GET', `/analytics/account/${req.params.accountId}?days=${days}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/analytics/posts', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.sortBy) params.set('sortBy', req.query.sortBy);
    if (req.query.limit) params.set('limit', req.query.limit);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/analytics/posts${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Queue ───────────────────────────────────────────────────────────
app.get('/api/queue/slots', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/queue/slots?accountId=${req.query.accountId}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/queue/all', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/queue/all', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── X/Twitter Config ────────────────────────────────────────────────
app.get('/api/x/config', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/x/config', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// TIER 3: ENGAGEMENT API (all tenant-scoped)
// ═══════════════════════════════════════════════════════════════════════

// ─── Comments ────────────────────────────────────────────────────────
app.get('/api/comments', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.accountId) params.set('accountId', req.query.accountId);
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.sentiment) params.set('sentiment', req.query.sentiment);
    if (req.query.limit) params.set('limit', req.query.limit);
    if (req.query.offset) params.set('offset', req.query.offset);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/comments${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/comments/stats', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/comments/stats/overview', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/comments/:id/replies', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', `/comments/${req.params.id}/replies`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/comments/:id/reply', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', `/comments/${req.params.id}/reply`, req.body, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Inbox / Messages ────────────────────────────────────────────────
app.get('/api/inbox/conversations', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.status) params.set('status', req.query.status);
    if (req.query.hasUnread) params.set('hasUnread', req.query.hasUnread);
    if (req.query.limit) params.set('limit', req.query.limit);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/inbox/conversations${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/inbox/conversations/:id/messages', requireTenant, async (req, res) => {
  try {
    const limit = req.query.limit || 50;
    const result = await apiCall('GET', `/inbox/conversations/${req.params.id}/messages?limit=${limit}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inbox/conversations/:id/reply', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', `/inbox/conversations/${req.params.id}/reply`, req.body, req.tenant.id);
    res.status(result.status).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/inbox/stats', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/inbox/stats', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Mentions ────────────────────────────────────────────────────────
app.get('/api/mentions', requireTenant, async (req, res) => {
  try {
    const params = new URLSearchParams();
    if (req.query.platform) params.set('platform', req.query.platform);
    if (req.query.status) params.set('status', req.query.status);
    if (req.query.mentionType) params.set('mentionType', req.query.mentionType);
    if (req.query.limit) params.set('limit', req.query.limit);
    const qs = params.toString() ? `?${params}` : '';
    const result = await apiCall('GET', `/mentions${qs}`, null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/mentions/stats', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('GET', '/mentions/stats', null, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Engagement Sync ─────────────────────────────────────────────────
app.post('/api/comments/sync', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', '/comments/sync', req.body || {}, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/inbox/sync', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', '/inbox/sync', req.body || {}, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/mentions/sync', requireTenant, async (req, res) => {
  try {
    const result = await apiCall('POST', '/mentions/sync', req.body || {}, req.tenant.id);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── SPA fallback ────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Start Server ────────────────────────────────────────────────────
app.listen(PORT, () => {
  const publicUrl = process.env.PUBLIC_URL;
  console.log(`\n🚀 SchedulifyX Tier 2-3 Demo running at http://localhost:${PORT}`);
  console.log(`   API Key: ${API_KEY.substring(0, 12)}...${API_KEY.slice(-4)}`);
  console.log(`   API Base: ${API_BASE}\n`);
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

