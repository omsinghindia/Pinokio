import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

/**
 * Production / explicit: VITE_SOCKET_URL (e.g. Render).
 * Local dev: same origin as Vite so `/socket.io` is proxied to the backend (see vite.config.js).
 */
function getSocketBaseUrl () {
  const fromEnv = import.meta.env.VITE_SOCKET_URL;
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return window.location.origin;
  return 'http://localhost:4000';
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

    const s = io(getSocketBaseUrl(), {
      auth: { token: accessToken },
      transports: ['websocket', 'polling']
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [accessToken, user?.id]);

  return socket;
}
