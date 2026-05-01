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
const server = http.createServer(app);

const rawOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

/** Allow configured origins; in development also allow any localhost / 127.0.0.1 port (Vite may use 5174, etc.). */
function isOriginAllowed (origin) {
  if (!origin) {
    return true;
  }
  if (rawOrigins.includes(origin)) {
    return true;
  }
  if (!isProd) {
    return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin);
  }
  return false;
}

app.use(cors({
  origin (origin, cb) {
    cb(null, isOriginAllowed(origin));
  },
  credentials: true
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'binokio-backend' });
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
    origin (origin, cb) {
      cb(null, isOriginAllowed(origin));
    },
    methods: ['GET', 'POST']
  }
});

attachSocketIO(io);

const PORT = Number(process.env.PORT) || 4000;
server.listen(PORT, () => {
  console.log(`BINOKIO backend listening on http://localhost:${PORT}`);
  console.log(
    `CORS allow-list: ${rawOrigins.join(', ') || '(none)'}; dev localhost: ${!isProd}`
  );
});
