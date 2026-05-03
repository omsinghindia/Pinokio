import { createClient } from '@supabase/supabase-js';

/**
 * Socket.IO setup: auth, chat persistence, typing, presence, WebRTC signaling.
 * All chat writes go through the server with the user's JWT so RLS still applies.
 */

function getSupabaseAdminForAuth () {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  return createClient(url, anon);
}

function userScopedClient (jwt) {
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } }
  });
}

/** Returns match row { id } if both users are in a mutual match, else null */
async function findMatchBetween (supabase, a, b) {
  const low = a < b ? a : b;
  const high = a < b ? b : a;
  const { data, error } = await supabase
    .from('matches')
    .select('id')
    .eq('user_low', low)
    .eq('user_high', high)
    .maybeSingle();
  if (error) return null;
  return data;
}

/** True if userId is a participant in matchId */
async function userInMatch (supabase, userId, matchId) {
  const { data, error } = await supabase
    .from('matches')
    .select('id, user_low, user_high')
    .eq('id', matchId)
    .maybeSingle();
  if (error || !data) return false;
  return data.user_low === userId || data.user_high === userId;
}

const CHAT_KINDS = ['text', 'image', 'file', 'audio', 'location'];

export function attachSocketIO (io) {
  // Track typing: matchId -> { userId -> timeoutId }
  const typingTimers = new Map();

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token || typeof token !== 'string') {
        return next(new Error('Unauthorized'));
      }
      const supabase = getSupabaseAdminForAuth();
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (error || !user) {
        return next(new Error('Unauthorized'));
      }
      socket.userId = user.id;
      socket.data.userId = user.id;
      socket.accessToken = token;
      next();
    } catch (e) {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.userId;
    const token = socket.accessToken;
    const supabase = userScopedClient(token);

    // Personal room for incoming calls / direct events
    socket.join(`user:${userId}`);

    // Join all match rooms for presence + chat fan-out
    const { data: matchesLow } = await supabase.from('matches').select('id').eq('user_low', userId);
    const { data: matchesHigh } = await supabase.from('matches').select('id').eq('user_high', userId);
    const matchIds = [
      ...(matchesLow || []).map((m) => m.id),
      ...(matchesHigh || []).map((m) => m.id)
    ];

    for (const mid of matchIds) {
      socket.join(`match:${mid}`);
    }

    for (const mid of matchIds) {
      socket.to(`match:${mid}`).emit('user:presence', {
        userId,
        status: 'online',
        matchId: mid
      });
    }

    for (const mid of matchIds) {
      try {
        const peers = await io.in(`match:${mid}`).fetchSockets();
        for (const other of peers) {
          if (other.id === socket.id) continue;
          const oid = other.data?.userId;
          if (!oid) continue;
          socket.emit('user:presence', {
            userId: oid,
            status: 'online',
            matchId: mid
          });
        }
      } catch (e) {
        console.warn('BINOKIO: presence snapshot', mid, e?.message || e);
      }
    }

    // Let clients join a match room after connect (e.g. new match created post-connect)
    socket.on('join:match', async (payload, cb) => {
      try {
        const matchId = payload?.matchId;
        if (!matchId || !(await userInMatch(supabase, userId, matchId))) {
          if (typeof cb === 'function') cb({ ok: false });
          return;
        }
        socket.join(`match:${matchId}`);
        socket.to(`match:${matchId}`).emit('user:presence', {
          userId,
          status: 'online',
          matchId
        });
        try {
          const peers = await io.in(`match:${matchId}`).fetchSockets();
          for (const other of peers) {
            if (other.id === socket.id) continue;
            const oid = other.data?.userId;
            if (!oid) continue;
            socket.emit('user:presence', {
              userId: oid,
              status: 'online',
              matchId
            });
          }
        } catch (e) {
          console.warn('BINOKIO: join:match presence snapshot', e?.message || e);
        }
        if (typeof cb === 'function') cb({ ok: true });
      } catch (e) {
        if (typeof cb === 'function') cb({ ok: false });
      }
    });

    socket.on('leave:match', (payload) => {
      const matchId = payload?.matchId;
      if (matchId) {
        socket.leave(`match:${matchId}`);
      }
    });

    // --- Chat: persist to Supabase then broadcast ---
    socket.on('chat:send', async (payload, ack) => {
      try {
        const matchId = payload?.matchId;
        const kind = payload?.kind || 'text';
        if (!matchId || !CHAT_KINDS.includes(kind)) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Invalid message' });
          return;
        }
        const ok = await userInMatch(supabase, userId, matchId);
        if (!ok) {
          if (typeof ack === 'function') ack({ ok: false, error: 'Not allowed' });
          return;
        }

        let body = typeof payload?.body === 'string' ? payload.body.trim() : '';
        let filePath = (payload?.filePath || payload?.file_path || '').trim() || null;
        let fileName = (payload?.fileName || payload?.file_name || '').trim() || null;
        let mimeType = (payload?.mimeType || payload?.mime_type || '').trim() || null;

        if (kind === 'text') {
          if (!body) {
            if (typeof ack === 'function') ack({ ok: false, error: 'Invalid message' });
            return;
          }
          filePath = null;
          fileName = null;
          mimeType = null;
        } else if (kind === 'location') {
          let loc;
          try {
            const raw = payload?.body;
            loc = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
          } catch {
            loc = null;
          }
          if (!loc || typeof loc.lat !== 'number' || typeof loc.lng !== 'number') {
            if (typeof ack === 'function') ack({ ok: false, error: 'Invalid location' });
            return;
          }
          body = JSON.stringify({
            lat: loc.lat,
            lng: loc.lng,
            label: typeof loc.label === 'string' ? loc.label.slice(0, 200) : '',
            accuracy: typeof loc.accuracy === 'number' ? loc.accuracy : null
          });
          filePath = null;
          fileName = null;
          mimeType = null;
        } else {
          if (!filePath) {
            if (typeof ack === 'function') ack({ ok: false, error: 'Attachment required' });
            return;
          }
          const prefix = `${matchId}/${userId}/`;
          if (!filePath.startsWith(prefix)) {
            if (typeof ack === 'function') ack({ ok: false, error: 'Invalid attachment path' });
            return;
          }
          if (!fileName) {
            fileName = filePath.split('/').pop() || 'file';
          }
        }

        const { data: row, error } = await supabase
          .from('messages')
          .insert({
            match_id: matchId,
            sender_id: userId,
            body,
            kind,
            file_path: filePath,
            file_name: fileName,
            mime_type: mimeType
          })
          .select(
            'id, match_id, sender_id, body, created_at, kind, file_path, file_name, mime_type'
          )
          .single();
        if (error) {
          if (typeof ack === 'function') ack({ ok: false, error: error.message });
          return;
        }
        socket.to(`match:${matchId}`).emit('chat:message', row);
        if (typeof ack === 'function') ack({ ok: true, message: row });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: 'Server error' });
      }
    });

    // Ephemeral live location (not persisted every tick; partner shows moving pin)
    socket.on('location:live', async (payload) => {
      const matchId = payload?.matchId;
      const lat = payload?.lat;
      const lng = payload?.lng;
      if (!matchId || typeof lat !== 'number' || typeof lng !== 'number') return;
      if (!(await userInMatch(supabase, userId, matchId))) return;
      socket.to(`match:${matchId}`).emit('location:live', {
        userId,
        matchId,
        lat,
        lng,
        at: Date.now()
      });
    });

    socket.on('location:live:stop', async ({ matchId } = {}) => {
      if (!matchId) return;
      if (!(await userInMatch(supabase, userId, matchId))) return;
      socket.to(`match:${matchId}`).emit('location:live:stop', { userId, matchId });
    });

    // --- Typing indicator ---
    socket.on('typing:start', async ({ matchId } = {}) => {
      if (!matchId || !(await userInMatch(supabase, userId, matchId))) return;
      socket.to(`match:${matchId}`).emit('typing:start', { userId, matchId });
    });

    socket.on('typing:stop', async ({ matchId } = {}) => {
      if (!matchId || !(await userInMatch(supabase, userId, matchId))) return;
      socket.to(`match:${matchId}`).emit('typing:stop', { userId, matchId });
    });

    // --- WebRTC signaling (only between matched users) ---
    socket.on('call:invite', async ({ toUserId, matchId }, cb) => {
      if (!toUserId || !matchId) return;
      const m = await findMatchBetween(supabase, userId, toUserId);
      if (!m || m.id !== matchId) {
        if (typeof cb === 'function') cb({ ok: false });
        return;
      }
      io.to(`user:${toUserId}`).emit('call:invite', {
        fromUserId: userId,
        matchId
      });
      if (typeof cb === 'function') cb({ ok: true });
    });

    socket.on('call:reject', async ({ toUserId, matchId }) => {
      if (!toUserId || !matchId) return;
      const m = await findMatchBetween(supabase, userId, toUserId);
      if (!m || m.id !== matchId) return;
      io.to(`user:${toUserId}`).emit('call:reject', { fromUserId: userId, matchId });
    });

    socket.on('call:end', async ({ toUserId, matchId }) => {
      if (!toUserId || !matchId) return;
      const m = await findMatchBetween(supabase, userId, toUserId);
      if (!m || m.id !== matchId) return;
      io.to(`user:${toUserId}`).emit('call:end', { fromUserId: userId, matchId });
    });

    const relaySdp = async (event, { toUserId, matchId, sdp }) => {
      if (!toUserId || !matchId || !sdp) return;
      const m = await findMatchBetween(supabase, userId, toUserId);
      if (!m || m.id !== matchId) return;
      io.to(`user:${toUserId}`).emit(event, { fromUserId: userId, matchId, sdp });
    };

    socket.on('webrtc:offer', (p) => relaySdp('webrtc:offer', p));
    socket.on('webrtc:answer', (p) => relaySdp('webrtc:answer', p));
    socket.on('webrtc:ice', async ({ toUserId, matchId, candidate }) => {
      if (!toUserId || !matchId || !candidate) return;
      const m = await findMatchBetween(supabase, userId, toUserId);
      if (!m || m.id !== matchId) return;
      io.to(`user:${toUserId}`).emit('webrtc:ice', { fromUserId: userId, matchId, candidate });
    });

    socket.on('disconnect', () => {
      for (const mid of matchIds) {
        socket.to(`match:${mid}`).emit('user:presence', { userId, status: 'offline', matchId: mid });
      }
    });
  });
}
