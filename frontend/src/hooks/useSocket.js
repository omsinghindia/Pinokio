import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Production / explicit: VITE_SOCKET_URL (e.g. Render HTTPS URL).
 * Local dev: same origin as Vite so `/socket.io` is proxied (see vite.config.js).
 */
function getSocketBaseUrl () {
  const fromEnv = import.meta.env.VITE_SOCKET_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (import.meta.env.DEV) return window.location.origin;
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:4000';
}

/**
 * Prefer WebSocket first: avoids "xhr poll error" when long-polling XHR is blocked by CORS/proxies.
 * Falls back to polling if the WebSocket upgrade fails.
 */
function socketTransports () {
  return ['websocket', 'polling'];
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

    const s = io(base, {
      auth: { token: accessToken },
      path: '/socket.io',
      transports: socketTransports(),
      upgrade: true,
      rememberUpgrade: true,
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
          'Cannot connect to chat server (network or CORS). On Render, set FRONTEND_URL to your exact site URL (e.g. https://your-app.vercel.app). On Vercel, set VITE_SOCKET_URL to your HTTPS API. Redeploy both.';
      } else if (!raw) {
        msg =
          'Cannot reach chat server. Check VITE_SOCKET_URL and FRONTEND_URL, then redeploy.';
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
