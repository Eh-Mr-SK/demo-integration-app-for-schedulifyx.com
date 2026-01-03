# SchedulifyX API Demo Integration App

A complete working example demonstrating how to integrate the **SchedulifyX Multi-Tenant API** into your application. This demo shows OAuth flows, platform settings, image/video uploads, and error handling.

![Demo App Screenshot](./docs/demo-screenshot.png)

## 🚀 Features

- **Multi-Tenant Architecture**: Each user gets their own tenant with isolated social accounts
- **OAuth Integration**: Connect 9+ social platforms (Instagram, TikTok, Twitter, Facebook, YouTube, LinkedIn, Pinterest, Threads)
- **Platform-Specific Settings**: Pinterest board selection, TikTok privacy controls
- **Media Uploads**: Image uploads via imgBB, video uploads via catbox.moe
- **Error Handling**: Display detailed error messages for failed posts
- **Post History**: View post status with per-platform results

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- A SchedulifyX API key ([Get one here](https://app.schedulifyx.com/api-keys))

## 🛠️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/Eh-Mr-SK/demo-integration-app-for-schedulifyx.com.git
cd demo-integration-app-for-schedulifyx.com
```

### 2. Install dependencies

```bash
cd backend
npm install
```

### 3. Configure environment variables

Create a `.env` file in the `backend` folder:

```env
# Required: Your SchedulifyX API key
SCHEDULIFY_API_KEY=sk_live_YOUR_API_KEY_HERE

# Optional: ImgBB API key for image uploads (get free key at https://api.imgbb.com/)
IMGBB_API_KEY=your_imgbb_key

# Optional: Custom JWT secret (defaults to a random string)
JWT_SECRET=your-secret-key

# Optional: Custom port (defaults to 3001)
PORT=3001
```

### 4. Start the server

```bash
node server.js
```

### 5. Open the demo app

Open `frontend/index.html` in your browser, or serve it with any static file server:

```bash
# Using Python
python -m http.server 8080 --directory frontend

# Using Node.js
npx serve frontend
```

## 📁 Project Structure

```
demo-app/
├── backend/
│   ├── server.js        # Express server with API proxy
│   ├── app.db           # SQLite database for demo users
│   ├── package.json
│   └── .env             # Environment variables (create this)
├── frontend/
│   └── index.html       # Single-file Vue.js frontend
├── docs/
│   └── demo-screenshot.png
└── README.md
```

## 🔌 API Integration Guide

### Step 1: Create a Tenant for Each User

When a user signs up to your app, create a tenant in SchedulifyX:

```javascript
const response = await fetch('https://api.schedulifyx.com/tenants', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    externalId: 'user_123',     // Your unique user ID
    email: 'user@example.com',  // Optional
    name: 'John Doe',           // Optional
    metadata: { plan: 'pro' }   // Store any custom data
  })
});

const { data: tenant } = await response.json();
console.log('Tenant ID:', tenant.id);
```

### Step 2: Connect Social Accounts

Get an OAuth URL and redirect the user to connect their account:

```javascript
const response = await fetch(
  `https://api.schedulifyx.com/tenants/${tenantId}/connect/instagram_direct?redirectUri=https://yourapp.com/callback`,
  { headers: { 'Authorization': `Bearer ${API_KEY}` } }
);

const { data } = await response.json();
// Redirect user to data.url
window.location.href = data.url;
```

After OAuth completes, the user returns to your `redirectUri` with:
- `?success=true&accountId=xxx&platform=instagram_direct` on success
- `?error=message` on failure

### Step 3: Create Posts with Platform Settings

```javascript
const response = await fetch('https://api.schedulifyx.com/posts', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    content: 'Check out my new recipe! 🍕',
    tenantUserId: tenantId,
    mediaUrls: ['https://example.com/image.jpg'],
    platforms: [
      // Pinterest requires board_id
      {
        platform: 'pinterest',
        accountId: 'pinterest_account_id',
        platformSettings: {
          board_id: '613334111693253876',
          board_name: 'My Recipes'
        }
      },
      // TikTok with privacy settings
      {
        platform: 'tiktok',
        accountId: 'tiktok_account_id',
        platformSettings: {
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          disable_duet: true,
          disable_stitch: true
        }
      },
      // Other platforms (no special settings needed)
      { platform: 'twitter', accountId: 'twitter_account_id' }
    ]
  })
});
```

### Step 4: Get Pinterest Boards

For Pinterest, you need to get available boards first:

```javascript
const response = await fetch(
  `https://api.schedulifyx.com/accounts/${pinterestAccountId}/pinterest-boards`,
  { headers: { 'Authorization': `Bearer ${API_KEY}` } }
);

const { data: boards } = await response.json();
// boards = [{ id: '123', name: 'My Recipes', pin_count: 42 }, ...]
```

### Step 5: Handle Post Status and Errors

Posts can have these statuses:
- `draft` - Created but not scheduled
- `scheduled` - Waiting for scheduled time
- `publishing` - Currently being published
- `published` - Successfully published to all platforms
- `partial` - Published to some platforms, failed on others
- `failed` - Failed on all platforms

Each platform in a post has its own status and error message:

```javascript
const response = await fetch(
  `https://api.schedulifyx.com/posts?tenantUserId=${tenantId}`,
  { headers: { 'Authorization': `Bearer ${API_KEY}` } }
);

const { data: posts } = await response.json();

posts.forEach(post => {
  console.log(`Post: ${post.content} - Status: ${post.status}`);
  
  post.platforms.forEach(platform => {
    if (platform.status === 'failed') {
      console.log(`  ${platform.platform}: FAILED - ${platform.error}`);
    } else {
      console.log(`  ${platform.platform}: ${platform.status}`);
    }
  });
});
```

## 📤 Media Upload Options

### Images (via imgBB - Free)

```javascript
const formData = new FormData();
formData.append('image', file);

const response = await fetch(
  `https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`,
  { method: 'POST', body: formData }
);

const { data } = await response.json();
const imageUrl = data.url; // Use in mediaUrls
```

### Videos (via catbox.moe - Free, 200MB limit)

```javascript
const formData = new FormData();
formData.append('reqtype', 'fileupload');
formData.append('fileToUpload', file);

const response = await fetch('https://catbox.moe/user/api.php', {
  method: 'POST',
  body: formData
});

const videoUrl = await response.text(); // Use in mediaUrls
```

## 🔧 Platform-Specific Settings Reference

### Pinterest

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `board_id` | string | **Yes** | Pinterest board ID |
| `board_name` | string | No | Board name (display only) |

### TikTok

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `privacy_level` | string | "SELF_ONLY" | PUBLIC_TO_EVERYONE \| MUTUAL_FOLLOW_FRIENDS \| SELF_ONLY |
| `disable_comment` | boolean | true | Disable comments |
| `disable_duet` | boolean | true | Disable duets |
| `disable_stitch` | boolean | true | Disable stitches |
| `brand_content_toggle` | boolean | false | Paid partnership content |
| `brand_organic_toggle` | boolean | false | Your own brand content |

## 🌐 Supported Platforms

| Platform | OAuth Type | Notes |
|----------|-----------|-------|
| Instagram Direct | instagram_direct | Personal & Creator accounts |
| Instagram Business | instagram | Via Facebook Page |
| Facebook | facebook | Page posts only |
| Twitter/X | twitter | OAuth 2.0 with PKCE |
| TikTok | tiktok | Requires privacy settings |
| YouTube | youtube | Shorts and videos |
| LinkedIn | linkedin | Personal profile posts |
| Pinterest | pinterest | Requires board selection |
| Threads | threads | Meta's new platform |

## 🔗 Useful Links

- [SchedulifyX API Documentation](https://app.schedulifyx.com/api-docs)
- [Get API Keys](https://app.schedulifyx.com/api-keys)
- [Main App](https://app.schedulifyx.com)

## 📄 License

MIT License - Feel free to use this as a starting point for your integration.

## 🤝 Support

For API questions, contact support@schedulifyx.com or open an issue on this repository.
