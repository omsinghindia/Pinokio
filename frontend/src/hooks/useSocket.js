import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Production / explicit: VITE_SOCKET_URL (e.g. Render).
 * Local dev: same origin as Vite so `/socket.io` is proxied to the backend (see vite.config.js).
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

/** Some mobile networks block WebSocket initially; try polling first. */
function socketTransports () {
  if (typeof navigator === 'undefined') return ['websocket', 'polling'];
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod|Android/i.test(ua)) {
    return ['polling', 'websocket'];
  }
  return ['websocket', 'polling'];
}

/**
 * Single Socket.IO connection per logged-in user, recreated when the JWT rotates.
 */
export function useSocket () {
  const { accessToken, user } = useAuth();
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    if (!accessToken || !user) {
      setSocket((prev) => {
        prev?.disconnect();
        return null;
      });
      return;
    }

    const base = getSocketBaseUrl();
    if (import.meta.env.PROD && !import.meta.env.VITE_SOCKET_URL?.trim()) {
      console.error(
        'BINOKIO: VITE_SOCKET_URL is missing — chat and typing will not work on this deploy. Add it in Vercel (or your host) and redeploy.'
      );
    }

    const s = io(base, {
      auth: { token: accessToken },
      transports: socketTransports(),
      upgrade: true,
      rememberUpgrade: false
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [accessToken, user?.id]);

  return socket;
}
