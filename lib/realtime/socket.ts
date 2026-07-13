import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

import { getApiBaseUrl } from '@/lib/api/base-url';
import { getToken, subscribeSession } from '@/lib/session';

// Single shared socket.io connection to the Nest backend, authenticated with
// the same JWT the HTTP client uses. The connection is opened only while a
// session token exists and is reused across screens. Events are consumed via
// the `useRealtimeEvent` hook.

let socket: Socket | null = null;

function ensureSocket(): Socket {
  if (socket) return socket;
  socket = io(getApiBaseUrl(), {
    // React Native has no long-polling fallback we care about; go straight to
    // WebSocket (nginx is configured to upgrade /socket.io/).
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    // Re-evaluated on every (re)connect, so a refreshed token is picked up.
    auth: (cb) => cb({ token: getToken() ?? '' }),
  });
  return socket;
}

/** Open the socket when authenticated, close it on sign-out. Returns cleanup. */
export function initRealtime(): () => void {
  const s = ensureSocket();
  const sync = () => {
    if (getToken()) {
      if (!s.connected) s.connect();
    } else if (s.connected || s.active) {
      s.disconnect();
    }
  };
  sync();
  return subscribeSession(sync);
}

/**
 * Subscribe to a realtime event for the lifetime of the calling component.
 * Ensures the socket is connected when a session exists. Pass a stable handler
 * (e.g. via useCallback) to avoid needless re-subscription.
 */
export function useRealtimeEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const s = ensureSocket();
    if (getToken() && !s.connected) s.connect();

    const listener = (payload: T) => handlerRef.current(payload);
    s.on(event, listener);
    return () => {
      s.off(event, listener);
    };
  }, [event]);
}
