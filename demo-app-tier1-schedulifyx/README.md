# SchedulifyX Demo App — Tier 1 (Embed) Integration

This is a ready-to-run demo application that shows how to integrate **SchedulifyX embed components** into your own application using the Developer API (Tier 1 — Embed).

## What is Tier 1?

SchedulifyX's Developer API has 3 tiers:

| Tier | Name | What You Get | Starting Price |
|------|------|-------------|----------------|
| **Tier 1** | **Embed** | Tenant management, webhook events, embed components (post creator, accounts, analytics) | Included with `api-dev` plan ($1/mo) |
| Tier 2 | Publishing | Everything in T1 + direct API access to posts, accounts, analytics, media, queue, profiles | Requires approval |
| Tier 3 | Full Engagement | Everything in T2 + comments, inbox, mentions API endpoints + engagement embed widgets | Requires contract |

**Tier 1 is the easiest way to integrate SchedulifyX.** Your users interact with SchedulifyX through secure iframe-embedded components — their social data never passes through your servers.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  YOUR APP (this demo)                                        │
│                                                              │
│  ┌─────────────┐      ┌──────────────────────────────────┐   │
│  │  Your       │ POST │  SchedulifyX Developer API       │   │
│  │  Backend    │─────▶│  api.schedulifyx.com              │   │
│  │  (server.js)│      │                                  │   │
│  │             │◀─────│  1. POST /tenants                │   │
│  │  API Key    │      │  2. POST /tenants/:id/client-token│  │
│  │  (secret)   │      │  3. GET  /tenants                │   │
│  └──────┬──────┘      └──────────────────────────────────┘   │
│         │ client token                                       │
│         ▼                                                    │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Your Frontend (index.html)                          │    │
│  │                                                      │    │
│  │  <script src="components.schedulifyx.com/sdk.js">    │    │
│  │  sfx.embed('post-creator', { container: '#app' })    │    │
│  │                                                      │    │
│  │  ┌────────────────────────────────────────────────┐  │    │
│  │  │  Secure iframe (components.schedulifyx.com)    │  │    │
│  │  │  - User's social data stays in iframe          │  │    │
│  │  │  - Token delivered via postMessage             │  │    │
│  │  │  - Cross-origin isolated                       │  │    │
│  │  └────────────────────────────────────────────────┘  │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Get your API key

Sign up at [app.schedulifyx.com](https://app.schedulifyx.com), go to **Settings → Developer API**, and create an API key. Even the `api-dev` plan ($1/month) includes Tier 1 access.

### 2. Configure

```bash
cp .env.example .env
# Edit .env and add your API key
```

### 3. Install & Run

```bash
npm install
npm start
```

Open [http://localhost:4000](http://localhost:4000) in your browser.

### 4. Try It Out

1. Click **"Create Demo User"** — this creates a tenant in SchedulifyX
2. The tenant gets a **client token** (short-lived, 1 hour)
3. Components render in the page using the embed SDK
4. Users can connect their social accounts, create posts, view analytics — all inside secure iframes

## File Structure

```
demo-app/
├── .env.example       # Environment variable template
├── package.json       # Node.js dependencies
├── server.js          # Express backend (API key stays here, never exposed)
├── public/
│   └── index.html     # Frontend app with embed SDK integration
└── README.md          # This file
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SCHEDULIFYX_API_KEY` | Yes | Your SchedulifyX API key (`sk_live_...`) |
| `PORT` | No | Server port (default: 4000) |
| `PUBLIC_URL` | For media | Public tunnel URL (ngrok/cloudflared) so SchedulifyX servers can download your media files |

## Media Uploads & Tunnel Setup

When users attach images or videos to posts, the files are uploaded to this demo server's `public/uploads/` directory. **SchedulifyX's publishing servers need to download these files** to send them to social platforms.

The problem: your dev server runs on `localhost`, which SchedulifyX servers can't reach. The fix: use a tunnel to expose your local server with a public URL.

### Quick Setup with ngrok

```bash
# 1. Start a tunnel (in a separate terminal)
npx ngrok http 4000

# 2. Copy the "Forwarding" URL (e.g., https://abc123.ngrok-free.app)

# 3. Add to your .env file
PUBLIC_URL=https://abc123.ngrok-free.app

# 4. Restart the demo server
npm start
```

### Alternative: Cloudflare Tunnel (no signup needed)

```bash
# 1. Start a tunnel
npx cloudflared tunnel --url http://localhost:4000

# 2. Copy the generated URL (e.g., https://xxx.trycloudflare.com)

# 3. Add to .env
PUBLIC_URL=https://xxx.trycloudflare.com

# 4. Restart
npm start
```

### For Production

In production, **don't use a tunnel**. Instead, replace the `onMediaUpload` handler to upload files directly to your own cloud storage (S3, Cloudflare R2, Cloudinary, etc.) and return the public URL. See the [Embed Components docs](https://app.schedulifyx.com/docs/embed-components#media-uploads) for examples.

1. **Your backend** creates a tenant (represents your user) via the API
2. **Your backend** generates a short-lived client token for that tenant
3. **Your frontend** loads the SchedulifyX Embed SDK (`sdk.js`)
4. **The SDK** creates secure iframes pointing to `components.schedulifyx.com`
5. **The token** is delivered to the iframe via `postMessage` (never in URLs)
6. **The component** renders inside the iframe with full functionality

### Available Components

| Component | Description |
|-----------|-------------|
| `post-creator` | Full post composition with account selection, content editor, scheduling |
| `accounts` | Connected social accounts overview with status indicators |
| `analytics` | Analytics dashboard with overview cards and charts |

> **Note:** Engagement components (`inbox`, `comments`, `mentions`) require Tier 3 (Full) access and are not available in Tier 1.

### Event Callbacks

```javascript
sfx.embed('post-creator', {
  container: '#my-container',
  on: {
    ready: () => console.log('Component loaded'),
    error: (err) => console.error('Error:', err),
    'post-created': (data) => console.log('Post created:', data.postId),
  }
});
```

## API Pricing (Tier 1)

| Plan | Price | Monthly Requests | Rate Limit | Social Sets |
|------|-------|-----------------|------------|-------------|
| `api-dev` | $1/mo | 5,000 | 20/min | 5 |
| `api-starter` | $9/mo | 25,000 | 60/min | 25 |
| `api-growth` | $29/mo | 100,000 | 120/min | 75 |
| `api-business` | $79/mo | 250,000 | 200/min | 150 |
| `api-enterprise` | $199/mo | Unlimited | 300/min | Unlimited |

A **Social Set** = 1 tenant user with up to 20 connected social accounts.

## Media Uploads (onMediaUpload)

The embed PostCreator component allows users to upload media. By default, files go to SchedulifyX temporary storage. To use **your own storage**, provide an `onMediaUpload` callback:

```javascript
sfx.embed('post-creator', {
  container: '#my-container',
  onMediaUpload: function (file, callback) {
    // Upload to your own server / S3 / CDN
    const formData = new FormData();
    formData.append('file', file);
    fetch('/api/upload', { method: 'POST', body: formData })
      .then(res => res.json())
      .then(data => callback({ url: data.url, mediaType: data.mediaType }))
      .catch(err => callback({ error: err.message }));
  },
});
```

> **⚠️ The `url` you return MUST be publicly accessible!** SchedulifyX's publishing servers will download the file from this URL when publishing to social platforms. A `localhost` URL will cause all posts with media to fail.

This demo includes a built-in `/api/upload` endpoint that saves files locally to `public/uploads/`. Set `PUBLIC_URL` in `.env` to your ngrok/cloudflared tunnel URL so the returned URLs are publicly reachable. See **[Media Uploads & Tunnel Setup](#media-uploads--tunnel-setup)** above for full setup instructions.

For production, replace with your own S3, Cloudflare R2, or Cloudinary upload logic. See the **[Embed Components docs](https://app.schedulifyx.com/docs/embed-components#media-uploads)** for S3 pre-signed URL and Cloudinary examples.

## Security Notes

- Your API key (`sk_live_...`) is **server-side only** — never sent to the browser
- Client tokens are short-lived (1 hour max), scoped to specific components
- Embed iframes are cross-origin isolated (`sandbox` attribute)
- User social data never passes through your servers

## License

MIT — Use this demo as a starting point for your own SchedulifyX integration.
