# ContentFlow — SchedulifyX Integration Demo

A demo app showing how to integrate **SchedulifyX's secure embed components** into your SaaS application. This is a reference implementation that developers can use as a starting point.

**Live Demo**: [demo.schedulifyx.com](https://demo.schedulifyx.com)

## Architecture

ContentFlow demonstrates the recommended integration pattern:

```
┌──────────────────────┐     ┌──────────────────────────┐
│   Your Backend       │     │   SchedulifyX API        │
│   (Express + SQLite) │────▶│   api.schedulifyx.com    │
│                      │     │                          │
│  - User auth (JWT)   │     │  - Tenant management     │
│  - Tenant creation   │     │  - Client token gen      │
│  - Client token proxy│     │  - OAuth connections     │
└──────────────────────┘     └──────────────────────────┘
         │                              │
         │ JWT auth                     │ Client token
         ▼                              ▼
┌──────────────────────┐     ┌──────────────────────────┐
│   Your Frontend      │     │   SchedulifyX Components │
│   (Vanilla JS)       │────▶│   components.schedulifyx │
│                      │     │                          │
│  - Login/Signup UI   │     │  - Post Creator iframe   │
│  - Dashboard tabs    │     │  - Inbox iframe          │
│  - Token management  │     │  - Analytics iframe      │
│  - Account connection│     │  - Comments, Mentions... │
└──────────────────────┘     └──────────────────────────┘
```

### How It Works

1. **User signs up/logs in** → Your backend issues a JWT
2. **Frontend requests client token** → Your backend calls SchedulifyX API (server-side, using your API key) to generate a short-lived client token
3. **Frontend loads SDK** → `<script src="https://components.schedulifyx.com/sdk.js"></script>`
4. **Frontend embeds components** → `sfx.embed('post-creator', { container: '#my-div' })` — each component renders in a secure iframe
5. **Token auto-refreshes** → Frontend refreshes the client token before it expires (tokens last 1 hour)

### Key Concepts

- **API Key** (`sk_live_...`): Server-side only. Never expose to frontend. Used for tenant management and client token generation.
- **Client Token** (`ct_live_...`): Short-lived (1hr max), frontend-safe. Scoped to specific components. Delivered to SDK via postMessage (never in URL).
- **Tenants**: Each of your users maps to a SchedulifyX tenant. Created automatically on first client token request.
- **Social accounts stay connected permanently** — only the client token for viewing embeds is short-lived. When it expires, just request a new one.

## Quick Start

```bash
# Clone the repo
git clone https://github.com/Eh-Mr-SK/demo-integration-app-for-schedulifyx.com.git
cd demo-integration-app-for-schedulifyx.com

# Install dependencies
cd backend
npm install

# Configure environment
cp .env.example .env
# Edit .env and add your SchedulifyX API key

# Start the server
npm start
# Open http://localhost:3001
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SCHEDULIFY_API_KEY` | Yes | Your SchedulifyX API key (get from app.schedulifyx.com/api-keys) |
| `SCHEDULIFY_API_URL` | No | API URL (defaults to https://api.schedulifyx.com) |
| `JWT_SECRET` | No | JWT signing secret (defaults to demo secret) |
| `PORT` | No | Server port (defaults to 3001) |

## API Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/auth/signup | No | Create account |
| POST | /api/auth/login | No | Login |
| GET | /api/auth/me | JWT | Get current user |
| POST | /api/client-token | JWT | Generate SchedulifyX client token |
| POST | /api/accounts/connect/:platform | JWT | Initiate OAuth connection |

## Embed Components

The app demonstrates all 6 SchedulifyX embed components:

| Component | Description |
|-----------|-------------|
| `post-creator` | Create and schedule social media posts |
| `inbox` | Unified social inbox for DMs |
| `comments` | View and reply to comments |
| `mentions` | Track brand mentions |
| `accounts` | Manage connected social accounts |
| `analytics` | Social media analytics dashboard |

## Tech Stack

- **Backend**: Node.js, Express, SQLite (better-sqlite3), JWT auth
- **Frontend**: Vanilla HTML/JS, Tailwind CSS (CDN)
- **Integration**: SchedulifyX SDK (iframe embeds)

## Get Your API Key

1. Sign up at [app.schedulifyx.com](https://app.schedulifyx.com)
2. Go to **API Keys** in the sidebar
3. Create a new API key with `tenants:read`, `tenants:write` scopes
4. Copy the key to your `.env` file

## License

MIT