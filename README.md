# SchedulifyX Demo Integration Apps

Official demo applications showcasing the [SchedulifyX Developer API](https://api.schedulifyx.com) integration across all three tiers.

## Apps

### [Tier 1 — Embed Integration](./demo-app-tier1-schedulifyx/)
White-label embedded UI components (post creator, account connector, analytics dashboard) using client tokens and iframes. No direct API access needed for end-users.

### [Tier 2 & 3 — Publishing + Engagement API](./demo-app-tier-2-and-3-schedulifyx/)
Full REST API integration for post management, analytics, social account inspection, comment management, inbox conversations, and brand mention tracking.

## Architecture Overview

```
Your App (SaaS)
  │
  ├─ Tier 1 (Embed)         → Client tokens + iframe components
  ├─ Tier 2 (Publishing)    → REST API for posts, accounts, analytics, queue, profiles
  └─ Tier 3 (Engagement)    → REST API for comments, inbox, mentions
```

## Quick Start

1. Get an API key from [app.schedulifyx.com](https://app.schedulifyx.com) → Settings → API Keys
2. Pick a demo app folder
3. Copy `.env.example` → `.env` and add your API key
4. `npm install && npm start`

## Official SDKs

| Language | Package | Repository |
|----------|---------|------------|
| JavaScript/TypeScript | `schedulifyx` | [schedulifyx-sdk-js](https://github.com/Eh-Mr-SK/schedulifyx-sdk-js) |
| Python | `schedulifyx` | [schedulifyx-sdk-python](https://github.com/Eh-Mr-SK/schedulifyx-sdk-python) |

## Links

- **API Documentation**: [TIER1_API_REFERENCE.md](https://github.com/Eh-Mr-SK/demo-integration-app-for-schedulifyx.com/blob/main/demo-app-tier1-schedulifyx/README.md) · [TIER2_TIER3_API_REFERENCE.md](https://github.com/Eh-Mr-SK/demo-integration-app-for-schedulifyx.com/blob/main/demo-app-tier-2-and-3-schedulifyx/README.md)
- **App**: [app.schedulifyx.com](https://app.schedulifyx.com)
- **Website**: [schedulifyx.com](https://schedulifyx.com)

## License

MIT
