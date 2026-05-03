import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Production: VITE_SOCKET_URL (Render etc.) must be HTTPS when the web app is HTTPS,
 * or the browser blocks WebSocket / XHR (mixed content).
 */
function getSocketBaseUrl () {
  const fromEnv = import.meta.env.VITE_SOCKET_URL?.trim();
  if (fromEnv) {
    let base = fromEnv.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      if (base.startsWith('http://')) {
        base = `https://${base.slice('http://'.length)}`;
      }
    }
    return base;
  }
  if (import.meta.env.DEV) return window.location.origin;
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

/**
 * Polling first: opens the Engine.IO session over HTTP (reliable with CORS). Then upgrades
 * to WebSocket when possible. Putting WebSocket first often surfaces "websocket error" on
 * mobile / strict networks before any session exists.
 */
function socketTransports () {
  const force =
    import.meta.env.VITE_SOCKET_FORCE_POLLING === '1' ||
    import.meta.env.VITE_SOCKET_FORCE_POLLING === 'true';
  if (force) {
    return ['polling'];
  }
  return ['polling', 'websocket'];
}

/**
 * Single Socket.IO connection per logged-in user, recreated when the JWT rotates.
 * @returns {{ socket: import('socket.io-client').Socket | null, status: 'idle'|'connecting'|'connected'|'error', error: string | null }}
 */
export function useSocket () {
  const { accessToken, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken || !user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      setStatus('idle');
      setError(null);
      return;
    }

    const base = getSocketBaseUrl();
    if (import.meta.env.PROD && !import.meta.env.VITE_SOCKET_URL?.trim()) {
      console.error(
        'BINOKIO: VITE_SOCKET_URL is missing — chat will not work. Set it on your host (e.g. Vercel) to your HTTPS API URL and redeploy.'
      );
    }

    setStatus('connecting');
    setError(null);

    const transports = socketTransports();
    const s = io(base, {
      auth: { token: accessToken },
      path: '/socket.io',
      transports,
      upgrade: transports.length > 1,
      rememberUpgrade: false,
      withCredentials: false,
      timeout: 60000,
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 15000,
      forceNew: false
    });

    function onConnect () {
      setStatus('connected');
      setError(null);
    }

    function onConnectError (err) {
      const raw = err?.message || '';
      let msg = raw;
      if (/xhr poll error|poll error/i.test(raw)) {
        msg =
          'Cannot connect to chat (polling failed). Set Render FRONTEND_URL to your exact site URL and Vercel VITE_SOCKET_URL to https://your-api.onrender.com — then redeploy both.';
      } else if (/websocket error|ws error/i.test(raw)) {
        msg =
          'Realtime connection failed. Use an HTTPS API URL in VITE_SOCKET_URL (not http:// on an HTTPS site). If it still fails, set VITE_SOCKET_FORCE_POLLING=true on the frontend and redeploy.';
      } else if (!raw) {
        msg =
          'Cannot reach chat server. Check VITE_SOCKET_URL (https) and FRONTEND_URL, then redeploy.';
      }
      setError(msg);
      setStatus('error');
    }

    function onDisconnect (reason) {
      if (s.active) {
        setStatus('connecting');
        setError(null);
      } else {
        setStatus('error');
        setError(
          reason === 'io server disconnect'
            ? 'Signed out or server closed the connection.'
            : 'Disconnected from chat.'
        );
      }
    }

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('disconnect', onDisconnect);

    setSocket(s);
    if (s.connected) {
      onConnect();
    }

    return () => {
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('disconnect', onDisconnect);
      s.disconnect();
      setSocket(null);
      setStatus('idle');
      setError(null);
    };
  }, [accessToken, user?.id]);

  return { socket, status, error };
}
