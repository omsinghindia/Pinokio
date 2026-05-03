/**
 * BINOKIO API + realtime server
 * - REST: health + optional authenticated helpers
 * - Socket.IO: chat, typing, presence, WebRTC signaling
 */
import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { requireAuth } from './middleware/auth.js';
import { attachSocketIO } from './socket/index.js';

const app = express();
/** Render / proxies: correct secure scheme for clients behind TLS termination */
app.set('trust proxy', 1);
const server = http.createServer(app);

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

function normalizeOrigin (origin) {
  if (!origin || typeof origin !== 'string') return '';
  try {
    const u = new URL(origin);
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return origin.replace(/\/$/, '').toLowerCase();
  }
}

const allowedOriginsNorm = new Set(rawOrigins.map(normalizeOrigin));

/** Set FRONTEND_ALLOW_VERCEL=true on Render if chat fails from *.vercel.app preview / alt deployment URLs. */
const allowVercelSubdomains =
  process.env.FRONTEND_ALLOW_VERCEL === '1' ||
  process.env.FRONTEND_ALLOW_VERCEL === 'true';

const vercelOriginRe = /^https:\/\/[a-z0-9][a-z0-9.-]*\.vercel\.app$/i;

function isVercelPreviewOrigin (origin) {
  const n = normalizeOrigin(origin);
  return vercelOriginRe.test(n);
}

/** Allow configured origins (case/host normalized); in dev also allow localhost / 127.0.0.1 on any port. */
function isOriginAllowed (origin) {
  if (!origin) {
    return true;
  }
  if (allowedOriginsNorm.has(normalizeOrigin(origin))) {
    return true;
  }
  if (allowVercelSubdomains && isVercelPreviewOrigin(origin)) {
    return true;
  }
  if (!isProd) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  }
  return false;
}

/**
 * CORS callback that echoes the browser Origin when allowed.
 * Required for Socket.IO Engine.IO polling (XHR); boolean `true` alone can mis-set headers on some stacks.
 */
function corsOriginCallback (origin, cb) {
  if (!origin) {
    cb(null, true);
    return;
  }
  if (isOriginAllowed(origin)) {
    cb(null, origin);
    return;
  }
  console.warn(
    '[BINOKIO] CORS rejected Origin:',
    origin,
    '| Configured:',
    [...allowedOriginsNorm].join(', ') || '(empty)',
    allowVercelSubdomains ? '| FRONTEND_ALLOW_VERCEL=on' : ''
  );
  cb(null, false);
}

app.use(
  cors({
    origin: corsOriginCallback,
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  })
);
app.use(express.json());

/** Browsers opening the Render URL directly — this host is the API + Socket.IO, not the React app. */
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'binokio-backend',
    message:
      'This URL is the realtime API (REST + Socket.IO). Open your Vercel frontend in the browser; point VITE_SOCKET_URL here.',
    health: '/api/health'
  });
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'binokio-backend' });
});

/**
 * Diagnostic: does this Origin pass CORS? Call as GET .../api/cors-check?origin=https://yoursite.vercel.app
 * (no secrets). Helps fix "chat cannot connect" when FRONTEND_URL does not match the URL in the address bar.
 */
app.get('/api/cors-check', (req, res) => {
  const test = (req.query.origin || req.query.o || '').trim();
  const payload = {
    ok: true,
    configuredOrigins: [...allowedOriginsNorm],
    frontendAllowVercel: allowVercelSubdomains,
    nodeEnv: process.env.NODE_ENV || '(unset)',
    hint:
      'Open your app from the same URL you put in FRONTEND_URL on Render. Add ?origin=https://exact-address-bar-url to test.'
  };
  if (test) {
    payload.testOrigin = test;
    payload.wouldAllow = isOriginAllowed(test);
  }
  res.json(payload);
});

/**
 * Example protected route: confirms the bearer token is valid.
 * The React app talks to Supabase directly for most CRUD; this is here for debugging and extensions.
 */
app.get('/api/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email
    }
  });
});

const io = new Server(server, {
  cors: {
    origin: corsOriginCallback,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false
  },
  allowEIO3: false,
  /** Helps some proxies / load balancers that mishandle compressed WS frames */
  perMessageDeflate: false,
  httpCompression: { threshold: 2048 },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 60000
});

attachSocketIO(io);

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`BINOKIO backend listening on http://localhost:${PORT}`);
  console.log(
    `CORS allow-list (normalized): ${[...allowedOriginsNorm].join(', ') || '(none)'}; dev localhost: ${!isProd}; FRONTEND_ALLOW_VERCEL: ${allowVercelSubdomains}`
  );
  const looksLocalOnly = rawOrigins.every(
    (o) => /localhost|127\.0\.0\.1/i.test(o)
  );
  if (looksLocalOnly && (isProd || process.env.RENDER)) {
    console.warn(
      'BINOKIO: FRONTEND_URL is only localhost — browsers on your live site will get xhr poll / CORS errors. Set FRONTEND_URL on the host to your real HTTPS app URL (comma-separate multiple).'
    );
  }
});
