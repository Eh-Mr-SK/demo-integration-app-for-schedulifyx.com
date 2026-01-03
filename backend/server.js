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

// =============================================
// DATABASE SETUP
// =============================================
const db = new Database(path.join(__dirname, 'app.db'));

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    tenant_id TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// =============================================
// CONFIGURATION
// =============================================
const SCHEDULIFY_API_KEY = process.env.SCHEDULIFY_API_KEY;
// Note: api.schedulifyx.com already includes /api/v1 prefix via nginx
const SCHEDULIFY_API_URL = process.env.SCHEDULIFY_API_URL || 'https://api.schedulifyx.com';
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-change-in-production';
const PORT = process.env.PORT || 3001;

// =============================================
// HELPER FUNCTIONS
// =============================================

// Call SchedulifyX API
async function schedulifyApi(method, endpoint, body = null, tenantUserId = null) {
  const headers = {
    'Authorization': `Bearer ${SCHEDULIFY_API_KEY}`,
    'Content-Type': 'application/json',
  };
  
  const options = { method, headers };
  
  // For GET requests, add tenantUserId as query param
  let url = `${SCHEDULIFY_API_URL}${endpoint}`;
  if (tenantUserId && method === 'GET') {
    const separator = endpoint.includes('?') ? '&' : '?';
    url += `${separator}tenantUserId=${tenantUserId}`;
  }
  
  // For POST/PUT requests, add tenantUserId to body
  if (body) {
    const bodyWithTenant = tenantUserId ? { ...body, tenantUserId } : body;
    options.body = JSON.stringify(bodyWithTenant);
  }
  
  console.log(`[SchedulifyX] ${method} ${url}`, body ? JSON.stringify(body) : '');
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    console.error(`[SchedulifyX] Error:`, data);
    // Handle error object properly - API returns { error: { code, message } }
    const errorMessage = data.error?.message || data.error || data.message || 'API request failed';
    throw new Error(errorMessage);
  }
  
  return data;
}

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Get or create tenant for user
async function getOrCreateTenant(userId, userEmail, userName) {
  const user = db.prepare('SELECT tenant_id FROM users WHERE id = ?').get(userId);
  
  if (user.tenant_id) {
    return user.tenant_id;
  }
  
  try {
    // Try to create tenant in SchedulifyX
    const result = await schedulifyApi('POST', '/tenants', {
      externalId: `user_${userId}`,
      metadata: { email: userEmail, name: userName }
    });
    
    // API returns { data: {...} }
    const tenantId = result.data.id;
    
    // Save tenant ID
    db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tenantId, userId);
    
    return tenantId;
  } catch (error) {
    // If conflict (tenant already exists), look it up
    if (error.message && error.message.includes('already exists')) {
      console.log(`[SchedulifyX] Tenant exists, looking up by externalId...`);
      const tenants = await schedulifyApi('GET', `/tenants?search=user_${userId}`);
      
      if (tenants.data && tenants.data.length > 0) {
        const tenantId = tenants.data[0].id;
        db.prepare('UPDATE users SET tenant_id = ? WHERE id = ?').run(tenantId, userId);
        return tenantId;
      }
    }
    throw error;
  }
}

// =============================================
// AUTH ROUTES
// =============================================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    
    // Check if user exists
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const result = db.prepare('INSERT INTO users (email, password, name) VALUES (?, ?, ?)').run(email, hashedPassword, name);
    
    // Generate JWT
    const token = jwt.sign({ id: result.lastInsertRowid, email, name }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { id: result.lastInsertRowid, email, name } 
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Check password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { id: user.id, email: user.email, name: user.name, hasTenant: !!user.tenant_id } 
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, tenant_id FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: { ...user, hasTenant: !!user.tenant_id } });
});

// =============================================
// SOCIAL ACCOUNTS ROUTES
// =============================================

// Get connected accounts
app.get('/api/accounts', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    const data = await schedulifyApi('GET', `/tenants/${tenantId}/accounts`);
    
    // Map API response to frontend expected format
    const accounts = (data.data || data || []).map(a => ({
      id: a.id,
      platform: a.platform,
      username: a.accountUsername || a.username || a.accountName,
      displayName: a.accountName || a.displayName || a.account_name,
      profileImage: a.avatarUrl || a.profileImage,
      isActive: a.isActive !== false,
      followersCount: a.followersCount,
      followingCount: a.followingCount,
    }));
    
    res.json({ accounts });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Connect a platform - get OAuth URL
app.post('/api/accounts/connect/:platform', authMiddleware, async (req, res) => {
  try {
    const { platform } = req.params;
    const { redirectUri, identifier, appPassword, instanceUrl, accessToken } = req.body;
    
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    
    // Bluesky uses credential-based auth (POST)
    if (platform === 'bluesky') {
      const response = await schedulifyApi('POST', `/tenants/${tenantId}/connect/bluesky`, {
        identifier,
        appPassword
      });
      // API returns { data: { ... } }, extract the data
      const account = response.data || response;
      return res.json({ account });
    }
    
    // Mastodon uses credential-based auth (POST)
    if (platform === 'mastodon') {
      const response = await schedulifyApi('POST', `/tenants/${tenantId}/connect/mastodon`, {
        instanceUrl,
        accessToken
      });
      // API returns { data: { ... } }, extract the data
      const account = response.data || response;
      return res.json({ account });
    }
    
    // Other platforms use OAuth (GET to get URL)
    const redirect = encodeURIComponent(redirectUri || `${req.headers.origin}/callback`);
    const response = await schedulifyApi('GET', `/tenants/${tenantId}/connect/${platform}?redirectUri=${redirect}`);
    
    // API returns { data: { url: "..." } }, extract the URL
    const authUrl = response.data?.url || response.url;
    console.log('[Demo] OAuth URL:', authUrl);
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Connect platform error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect account
app.delete('/api/accounts/:accountId', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    await schedulifyApi('DELETE', `/tenants/${tenantId}/accounts/${req.params.accountId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Pinterest boards for an account
app.get('/api/accounts/:accountId/boards', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    const data = await schedulifyApi('GET', `/accounts/${req.params.accountId}/pinterest-boards`);
    
    // API returns { data: { boards: [...] } }
    const boards = data.data?.boards || data.boards || [];
    res.json({ boards });
  } catch (error) {
    console.error('Get Pinterest boards error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// POSTS ROUTES
// =============================================

// Get posts
app.get('/api/posts', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    const data = await schedulifyApi('GET', '/posts', null, tenantId);
    // Transform API response to frontend format
    const posts = (data.data || data || []).map(post => ({
      id: post.id,
      content: post.content,
      status: post.status,
      scheduledFor: post.scheduled_for || post.scheduledFor,
      publishedAt: post.published_at || post.publishedAt,
      createdAt: post.created_at || post.createdAt,
      platforms: post.platforms || []
    }));
    res.json({ posts });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create post
app.post('/api/posts', authMiddleware, async (req, res) => {
  try {
    const { content, accountIds, mediaUrls, scheduledFor, pinterestBoardId, pinterestBoardName, tiktokSettings } = req.body;
    
    if (!content || !accountIds || accountIds.length === 0) {
      return res.status(400).json({ error: 'Content and at least one account are required' });
    }
    
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    
    // Get accounts to build platforms array with platform names
    const accountsData = await schedulifyApi('GET', `/tenants/${tenantId}/accounts`);
    const accounts = accountsData.data || [];
    
    // Build platforms array expected by the API
    const platforms = accountIds.map(accountId => {
      const account = accounts.find(a => a.id === accountId);
      const platformEntry = {
        accountId: accountId,
        platform: account?.platform || 'unknown'
      };
      
      // Add Pinterest board settings if this is a Pinterest account
      if (account?.platform === 'pinterest' && pinterestBoardId) {
        platformEntry.platformSettings = {
          board_id: pinterestBoardId,  // Use snake_case to match publisher expectation
          board_name: pinterestBoardName || 'Selected Board'
        };
      }
      
      // Add TikTok settings if this is a TikTok account
      if (account?.platform === 'tiktok' && tiktokSettings) {
        platformEntry.platformSettings = {
          privacy_level: tiktokSettings.privacyLevel || 'SELF_ONLY',
          disable_comment: !tiktokSettings.allowComment,
          disable_duet: !tiktokSettings.allowDuet,
          disable_stitch: !tiktokSettings.allowStitch,
          brand_content_toggle: tiktokSettings.isCommercialContent || false,
          brand_organic_toggle: tiktokSettings.isYourBrand || false,
          is_branded_content: tiktokSettings.isBrandedContent || false,
        };
      }
      
      return platformEntry;
    });
    
    const postData = { 
      content, 
      platforms,
      tenantUserId: tenantId
    };
    if (mediaUrls && mediaUrls.length > 0) postData.mediaUrls = mediaUrls;
    if (scheduledFor) postData.scheduledFor = scheduledFor;
    
    // Create the post
    const data = await schedulifyApi('POST', '/posts', postData, tenantId);
    const postId = data.data?.id || data.id;
    
    // If not scheduled, publish immediately
    if (!scheduledFor && postId) {
      try {
        await schedulifyApi('POST', `/posts/${postId}/publish`, {}, tenantId);
        // Update the response to reflect published status
        if (data.data) data.data.status = 'publishing';
        else data.status = 'publishing';
      } catch (publishError) {
        console.error('Auto-publish error:', publishError.message);
        // Post was created but publish failed - still return success
      }
    }
    
    res.json(data);
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete post
app.delete('/api/posts/:postId', authMiddleware, async (req, res) => {
  try {
    const tenantId = await getOrCreateTenant(req.user.id, req.user.email, req.user.name);
    await schedulifyApi('DELETE', `/posts/${req.params.postId}`, null, tenantId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: error.message });
  }
});

// =============================================
// MEDIA ROUTES (using free hosting)
// =============================================

// File upload middleware
const multer = require('multer');
const fs = require('fs');
const os = require('os');

// Configure multer for larger video files (200MB for catbox.moe)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB limit for videos
});

// Upload media - images use imgBB, videos use catbox.moe (free file hosting)
app.post('/api/media/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const isVideo = req.file.mimetype.startsWith('video/');
    
    if (isVideo) {
      // Use catbox.moe for video hosting (free, no API key required)
      // Files are stored for up to 3 years if accessed regularly
      console.log('[Media] Uploading video to catbox.moe...');
      console.log('[Media] File size:', req.file.size, 'bytes');
      console.log('[Media] File type:', req.file.mimetype);
      
      const formData = new FormData();
      formData.append('reqtype', 'fileupload');
      
      // Create a Blob from the buffer for proper multipart handling
      const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
      formData.append('fileToUpload', blob, req.file.originalname || 'video.mp4');
      
      const response = await fetch('https://catbox.moe/user/api.php', {
        method: 'POST',
        body: formData,
      });
      
      const responseText = await response.text();
      
      if (!response.ok || !responseText.startsWith('https://')) {
        console.error('[Media] Catbox error:', responseText);
        return res.status(500).json({ error: 'Video upload failed: ' + responseText });
      }
      
      console.log('[Media] Uploaded video to catbox:', responseText);
      
      return res.json({ url: responseText.trim(), type: 'video' });
    }
    
    // For images, use imgBB
    const IMGBB_API_KEY = process.env.IMGBB_API_KEY;
    if (!IMGBB_API_KEY) {
      return res.status(500).json({ 
        error: 'IMGBB_API_KEY not configured',
        help: 'Get a free API key at https://api.imgbb.com/'
      });
    }
    
    // imgBB expects URL-encoded form data with base64 image
    const base64Image = req.file.buffer.toString('base64');
    const formBody = new URLSearchParams();
    formBody.append('image', base64Image);
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody.toString()
    });
    
    const data = await response.json();
    
    if (!response.ok || !data.success) {
      console.error('ImgBB error:', data);
      return res.status(500).json({ 
        error: data.error?.message || 'ImgBB upload failed'
      });
    }
    
    console.log('[Media] Uploaded to imgBB:', data.data.url);
    return res.json({ url: data.data.url });
  } catch (error) {
    console.error('Media upload error:', error);
    res.status(500).json({ error: 'Media upload failed' });
  }
});

// Serve temporary video files
app.get('/api/media/temp/:filename', (req, res) => {
  const tempDir = path.join(os.tmpdir(), 'schedulify-uploads');
  const filePath = path.join(tempDir, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Determine content type from extension
  const ext = path.extname(req.params.filename).toLowerCase();
  const contentTypes = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska'
  };
  
  res.setHeader('Content-Type', contentTypes[ext] || 'video/mp4');
  res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`);
  
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

// =============================================
// SERVE FRONTEND
// =============================================
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// =============================================
// START SERVER
// =============================================
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Content Scheduler Demo - Backend                ║
╠═══════════════════════════════════════════════════════════╣
║  Server running at: http://localhost:${PORT}                 ║
║                                                           ║
║  This demo app integrates with SchedulifyX API.           ║
║  API key is stored securely on the backend only.          ║
║                                                           ║
║  Make sure to set your API key in .env file:              ║
║  SCHEDULIFY_API_KEY=sk_live_...                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
});
