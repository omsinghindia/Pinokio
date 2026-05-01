# BINOKIO

Full-stack real-time dating app (formerly scaffolded as “Connectly”): **React + Tailwind** (frontend), **Node + Express + Socket.IO** (backend), **Supabase** (auth, Postgres, storage), and **WebRTC** for peer-to-peer calls. Chat and signaling go through Socket.IO; messages are stored in Supabase.

## Features

- **Auth**: Supabase email/password signup and login, optional email verification, protected routes, logout.
- **Profiles**: Name, age (18+), gender, city, bio, interests, photo upload (Supabase Storage), edit profile, completion percentage.
- **Matching**: Browse cards, like/pass, mutual like creates a match, matches list.
- **Chat** (matched users only): Real-time messages via Socket.IO, typing indicator, online/offline presence, timestamps, persistence in Postgres.
- **Calls**: WebRTC video/audio in chat; incoming call UI; accept/reject; mute, camera toggle, end call.
- **Safety**: Block, report, 18+ checks, chat/call only after mutual match (enforced by UI + RLS + server checks).

## Repository layout

```
connectly/
├── frontend/          # Vite + React (deploy to Vercel)
├── backend/           # Express + Socket.IO (deploy to Render)
├── supabase/
│   ├── schema.sql           # Run in Supabase SQL Editor
│   ├── seed_shiva_kant.sql       # Optional dummy India profile (see file header)
│   └── patch_discover_blocked_rls.sql  # Run if Discover/block list misbehaves (older DBs)
└── README.md
```

## Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project (free tier is enough)

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com).
2. **Authentication → Providers**: enable Email; under **Email** you can turn confirmation on or off for local testing.
3. **Storage**: create a **public** bucket named `avatars` (or rely on `schema.sql` to register it — the script inserts the bucket row).
4. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it.
5. (Optional) Add a test user **Shiva Kant** (India dummy profile): follow the steps at the top of `supabase/seed_shiva_kant.sql`, then run that script in the SQL Editor.
6. Under **Project Settings → API**, copy the **Project URL** and **anon public** key.

**Important:** Never put the **service role** key in the frontend. This app uses only the **anon** key in the browser and on the server for JWT verification and user-scoped queries (RLS).

## 2. Local backend

```bash
cd backend
cp .env.example .env
# Edit .env: SUPABASE_URL, SUPABASE_ANON_KEY, FRONTEND_URL=http://localhost:5173
npm install
npm run dev
```

The API listens on `http://localhost:4000` by default. Health check: `GET http://localhost:4000/api/health`.

## 3. Local frontend

```bash
cd frontend
cp .env.example .env.local
# Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_SOCKET_URL=http://localhost:4000
npm install
npm run dev
```

Open `http://localhost:5173`.

### Trying matching and chat locally

1. Sign up two users (use two browsers or incognito for the second).
2. Complete minimal profiles and **like each other** from Discover.
3. Open **Matches** → **Open chat** on both sides to test realtime and calls.

## 4. Deploy

### Frontend (Vercel)

1. Import the Git repo; set **Root Directory** to `frontend`.
2. Environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_SOCKET_URL` — your **Render Web Service URL** (e.g. `https://binokio-api.onrender.com`) with **no** trailing slash issues; use the same origin you use for Socket.IO (HTTPS in production).
3. Build command: `npm run build`, output directory: `dist`.
4. `vercel.json` includes SPA rewrites for client-side routing.

### Backend (Render)

1. New **Web Service**; connect the repo; **Root Directory** `backend`.
2. **Build command:** `npm install`  
   **Start command:** `npm start`
3. Environment:
   - `PORT` is set automatically by Render.
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
   - `FRONTEND_URL` — your Vercel URL (e.g. `https://your-app.vercel.app`). For multiple origins, use a comma-separated list in `FRONTEND_URL` (the server splits on commas).

Render supports WebSockets; Socket.IO should work over the same HTTPS URL (polling fallback is enabled on the client).

### Supabase Auth redirect URLs

In Supabase **Authentication → URL Configuration**, add:

- Site URL: your Vercel URL.
- Redirect URLs: Vercel URL and `http://localhost:5173` for local dev.

## Environment variables (summary)

| Variable | Where | Purpose |
|----------|--------|---------|
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_ANON_KEY` | Backend | Verify JWT + user-scoped DB via RLS |
| `FRONTEND_URL` | Backend | CORS + Socket.IO origin |
| `VITE_SUPABASE_URL` | Frontend | Supabase client |
| `VITE_SUPABASE_ANON_KEY` | Frontend | Supabase client (RLS) |
| `VITE_SOCKET_URL` | Frontend | Socket.IO server URL |

## WebRTC note

The app uses free **STUN** servers only. Some networks need **TURN** (often a paid or self-hosted service). If video fails behind strict NAT, that is the usual cause.

## License

MIT — use freely for learning and demos.
