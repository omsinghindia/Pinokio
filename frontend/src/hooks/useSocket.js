import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '../contexts/AuthContext';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

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

    const s = io(SOCKET_URL, {
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
