const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');

const app = express();
app.use(cors());
app.use(express.json());

const db = new Database(path.join(__dirname, 'app.db'));
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  tenant_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);`);

const SCHEDULIFY_API_KEY = process.env.SCHEDULIFY_API_KEY;
const SCHEDULIFY_API_URL = process.env.SCHEDULIFY_API_URL || 'https://api.schedulifyx.com';
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production';
const PORT = process.env.PORT || 3001;

async function schedulifyApi(method, endpoint, body = null) {
  const headers = { 'Authorization': `Bearer ${SCHEDULIFY_API_KEY}`, 'Content-Type': 'application/json' };
  const options = { method, headers };
  const url = `${SCHEDULIFY_API_URL}${endpoint}`;
  if (body) options.body = JSON.stringify(body);
  console.log(`[SchedulifyX] ${method} ${url}`);
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    console.error('[SchedulifyX] Error:', data);
    throw new Error(data.error?.message || data.error || 'API request failed');
  }
  return data;
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

async function getOrCreateTenant(userId, userEmail, userName) {
  const user = db.prepare('SELECT tenant_id FROM users WHERE id = ?').get(userId);
  if (user.tenant_id) return user.tenant_id;
  try {
    const result = await schedulifyApi('POST', '/tenants', { externalId: `user_${userId}`, metadata: { email: userEmail, name: userName } });
    const tenantId = result.data.id;
    db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tenantId, userId);
    return tenantId;
  } catch (error) {
    if (error.message?.includes('already exists')) {
      const tenants = await schedulifyApi('GET', `/tenants?search=user_${userId}`);
      if (tenants.data?.length > 0) {
        const tenantId = tenants.data[0].id;
        db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tenantId, userId);
        return tenantId;
      }
    }
    throw error;
  }
}

// AUTH ROUTES
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'Email, password, and name are required' });
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) return res.status(400).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, hash, name);
    const token = jwt.sign({ id: result.lastInsertRowid, email, name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: result.lastInsertRowid, email, name } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) return res.status(400).json({ error: 'Invalid email or password' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ error: 'Invalid email or password' });
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, hasTenant: !!user.tenant_id } });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, tenant_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: { ...user, hasTenant: !!user.tenant_id } });
});

// CLIENT TOKEN — Core of Secure Embed Architecture
app.post('/api/client-token', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    const { components = ['post-creator', 'inbox', 'comments', 'mentions', 'accounts', 'analytics'] } = req.body;
    const result = await schedulifyApi('POST', `/tenants/${tenantId}/client-token`, { components, expiresIn: 3600 });
    res.json({ clientToken: result.data.token, expiresAt: result.data.expiresAt, components: result.data.components });
  } catch (error) {
    console.error('Client token error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SOCIAL ACCOUNT CONNECTION (OAuth is still server-side)
app.post('/api/accounts/connect/:platform', authMiddleware, async (req, res) => {
  try {
    const { platform } = req.params;
    const { redirectUri, identifier, appPassword, instanceUrl, accessToken } = req.body;
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    if (platform === 'bluesky') {
      const resp = await schedulifyApi('POST', `/tenants/${tenantId}/connect/bluesky`, { identifier, appPassword });
      return res.json({ account: resp.data || resp });
    }
    if (platform === 'mastodon') {
      const resp = await schedulifyApi('POST', `/tenants/${tenantId}/connect/mastodon`, { instanceUrl, accessToken });
      return res.json({ account: resp.data || resp });
    }
    const redirect = encodeURIComponent(redirectUri || `${req.headers.origin}/callback`);
    const resp = await schedulifyApi('GET', `/tenants/${tenantId}/connect/${platform}?redirectUri=${redirect}`);
    res.json({ authUrl: resp.data?.url || resp.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// SERVE FRONTEND
app.use(express.static(path.join(__dirname, '../frontend')));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));

app.listen(PORT, () => console.log(`\nContentFlow Demo (Secure Embed) running at http://localhost:${PORT}\n`));
