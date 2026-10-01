# Match-3 Backend

A TypeScript and Express backend for a browser-based Match-3 game, built around server-authoritative account state, reliable gameplay persistence and a canonical campaign leaderboard.

**[Play the Live Demo](https://match3-arcade.onrender.com)**  
**[Frontend Repository](https://github.com/jan-ninh/match3-frontend)**

## Engineering Highlights

- **Server-authoritative account state** for progression, inventory, campaign results and leaderboard data instead of treating browser state as trusted persistence
- **Reliable gameplay commands** bound to account, campaign run, attempt and revision
- **Idempotent operation receipts** that allow ambiguous or lost responses to be reconciled without applying score, rewards or inventory changes twice
- **Transactional persistence** across account state, gameplay attempts, campaign state, receipts and leaderboard projections using MongoDB transactions
- **Canonical campaign and leaderboard flow** where Stage 11 finalizes a campaign result once and the optional Stage 12 sandbox cannot modify it
- **Verified authentication and session lifecycle** using short-lived JWT access tokens, opaque refresh tokens, HttpOnly cookies, rotation and revocation
- **Production-oriented deployment** with environment validation, readiness and health checks, MongoDB Atlas, Render and a same-origin API path for reliable browser sessions

## Why the Backend Is More Than CRUD

A gameplay result can affect several pieces of persistent state at once. A win may update campaign progress, score, experience, inventory, statistics and leaderboard state.

Those changes need to behave as one operation.

The backend therefore treats gameplay as explicit commands rather than independent field updates. MongoDB transactions keep related writes together, while durable operation IDs and receipts make retries safe when the client cannot tell whether an earlier request completed.

```text
React Client
     |
Same-Origin API Path
     |
Express API
     |
Auth + Gameplay Commands
     |
Transactional Domain Logic
     |
MongoDB Atlas
```

The browser remains responsible for running the game itself. The backend owns the persistent account truth and validates which state transitions are allowed.

## Account and Session Flow

Authentication combines a short-lived JWT access token with an opaque refresh token stored through an HttpOnly cookie.

The current portfolio version supports:

- register, login, refresh and logout
- refresh-token rotation and revocation
- verified session restoration after reload
- owner-bound private routes
- strict Origin and CORS handling
- clear separation between Demo and Account state

## Campaign Integrity

Regular account campaigns contain **11 sequential stages**.

A successful Stage 11 completion creates the finalized campaign result used by the leaderboard. Each account has one canonical best-result projection, while Stage 12 remains an optional sandbox outside the finalized campaign result.

This keeps campaign progress, gameplay score and public ranking from becoming competing sources of truth.

## My Work

The original project was created in a two-person team, with my primary responsibility centered on the frontend and gameplay systems.

I later evolved the portfolio version independently across frontend and backend integration. My work on the current backend includes authentication and session reliability, server-authoritative gameplay flows, transactional persistence, operation-receipt recovery, campaign and leaderboard consolidation, production configuration, Atlas and Render deployment, and live debugging across API, database, cookie, CORS and browser boundaries.

The recurring engineering question was simple: **which part of the system should own the truth, and how do we keep that truth consistent when requests fail or arrive twice?**

## Tech Stack

**Backend:** Node.js, Express 5, TypeScript, Zod

**Data:** MongoDB, Mongoose, MongoDB Transactions

**Auth:** JWT, opaque Refresh Tokens, bcrypt, HttpOnly Cookies

**Infrastructure:** MongoDB Atlas, Render, Git, GitHub

## Run Locally

<details>
<summary><strong>Local setup</strong></summary>

Requires **Node.js 22** and a transaction-capable MongoDB deployment.

```bash
npm install
```

Copy the example environment configuration:

```bash
cp .env.example .env
```

Configure your local database and secrets in `.env`, then start the development server:

```bash
npm run dev
```

Build and run the compiled application with:

```bash
npm run build
npm run start:local
```

</details>

## Project Links

- **Live Game:** https://match3-arcade.onrender.com
- **Frontend:** https://github.com/jan-ninh/match3-frontend
- **Backend:** https://github.com/jan-ninh/match3-backend
