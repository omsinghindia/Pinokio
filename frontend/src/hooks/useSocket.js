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

/** Polling first is more reliable through mobile networks and some CDNs / proxies. */
function socketTransports () {
  if (import.meta.env.PROD) {
    return ['polling', 'websocket'];
  }
  if (typeof navigator === 'undefined') return ['websocket', 'polling'];
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) {
    return ['polling', 'websocket'];
  }
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
      path: '/socket.io/',
      transports: socketTransports(),
      upgrade: true,
      rememberUpgrade: false,
      timeout: 25000,
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 800,
      reconnectionDelayMax: 10000,
      forceNew: false
    });

    function onConnect () {
      setStatus('connected');
      setError(null);
    }

    function onConnectError (err) {
      const msg =
        err?.message ||
        'Cannot reach chat server. Check VITE_SOCKET_URL and that the API allows your site in FRONTEND_URL.';
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
