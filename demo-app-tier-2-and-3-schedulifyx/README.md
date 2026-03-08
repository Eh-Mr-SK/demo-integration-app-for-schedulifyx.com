# SchedulifyX Tier 2-3 API Demo

Interactive demo app for the **SchedulifyX Developer API** — Tier 2 (Publishing) and Tier 3 (Full Engagement) features.

## What This Demos

### Tier 2 — Publishing API (Free with approval)
- **Posts**: Create, list, update, delete, and publish posts across platforms
- **Accounts**: View connected social media accounts and details
- **Analytics**: Overview stats, per-post engagement metrics, date-range analytics
- **Media**: Browse media library (upload not available via API — use your own CDN)
- **Queue**: View and manage posting schedules
- **X/Twitter**: BYOK configuration and mode switching

### Tier 3 — Full Engagement API ($49/yr + contract)
- **Comments**: List comments, filter by sentiment, reply via platform APIs
- **Inbox**: View conversations, read messages, send replies
- **Mentions**: Track brand mentions across platforms, view stats

## Quick Start

```bash
# 1. Install dependencies
cd demo-tier2-app
npm install

# 2. Configure your API key
cp .env.example .env
# Edit .env and add your SchedulifyX API key

# 3. Start the demo
npm start
# Open http://localhost:4001
```

## Requirements

- Node.js 18+
- A SchedulifyX API key with **Tier 2 (Publishing)** or **Tier 3 (Full)** access
- Get your key at: https://app.schedulifyx.com/settings → API Keys

## API Key Tiers

| Tier | Features | How to Get |
|------|----------|------------|
| Tier 1 (Embed) | Tenants, Webhooks, Embed SDK | Default for all keys |
| **Tier 2 (Publishing)** | Posts, Accounts, Analytics, Media, Queue | Request in Settings (free) |
| **Tier 3 (Full)** | All Tier 2 + Comments, Inbox, Mentions | $49/yr + contract |

## Architecture

```
Browser → Demo Server (Express, port 4001) → SchedulifyX API (api.schedulifyx.com)
```

Your API key stays server-side only — never exposed to the browser.

## Code Examples

The demo includes a **Code Examples** tab with copy-paste integration code for:
- Authentication setup
- Creating and publishing posts
- Fetching analytics
- Replying to comments
- Reading and replying to inbox messages
- Pagination and filtering patterns
- Rate limit handling

## Media Uploads

The demo includes a local file upload endpoint (`POST /api/upload`) that stores files in `public/uploads/`. This is for development only.

- **Upload files** via the drag-and-drop zone or file picker in the Create Post form
- **Paste URLs** from your own CDN/S3 in the URL input

**For publishing to work**, the SchedulifyX API must be able to download your media files. Set `PUBLIC_URL` in `.env` to your tunnel URL.

### Quick Setup with ngrok

```bash
# 1. Start a tunnel (in a separate terminal)
npx ngrok http 4001

# 2. Copy the "Forwarding" URL (e.g., https://abc123.ngrok-free.app)

# 3. Add to .env
PUBLIC_URL=https://abc123.ngrok-free.app

# 4. Restart the demo
npm start
```

### Alternative: Cloudflare Tunnel (no signup needed)

```bash
# 1. Start a tunnel
npx cloudflared tunnel --url http://localhost:4001

# 2. Copy the generated URL (e.g., https://xxx.trycloudflare.com)

# 3. Add to .env
PUBLIC_URL=https://xxx.trycloudflare.com

# 4. Restart
npm start
```

### For Production

In production, **don't use a tunnel or local uploads**. Upload files to your own cloud storage (S3, Cloudflare R2, Cloudinary, etc.) and pass the public URLs in the `mediaUrls` array when creating posts via the API. See the [Embed Components docs](https://app.schedulifyx.com/docs/embed-components#media-uploads) for examples.

## Security Notes

- API key is stored in `.env` and never sent to the frontend
- All API calls are proxied through the Express server
- Rate limits are enforced server-side by SchedulifyX (headers returned)
- Maximum pagination limit: 100 items per request
- Content length limits: 25,000 chars (posts), 8,000 chars (replies)
- Media URLs are validated for SSRF protection (no private IPs/localhost)

## Related

- [Tier 1 Embed Demo](../demo-app/) — For embed-only integrations
- [JavaScript SDK](../packages/sdk-js/) — NPM package for API integration
- [Python SDK](../packages/sdk-python/) — PyPI package for API integration
- [API Documentation](../docs/TIER1_API_REFERENCE.md) — Full API reference
