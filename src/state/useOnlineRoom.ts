import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action } from '@shared/engine';
import type { PlayerView } from '@shared/types';
import { ApiError, api, type Credentials } from './api';
import { patchSession, type StoredSession } from './session';
import type { ConnectionState, ControllerError, RoomController } from './controller';

function wsUrl(roomId: string, creds: Credentials): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const query = new URLSearchParams({
    roomId,
    playerId: creds.playerId,
    token: creds.playerToken,
  });
  return `${protocol}://${window.location.host}/ws?${query.toString()}`;
}

/** 线上房间控制器：REST 发动作，WebSocket 收个人化视图 */
export function useOnlineRoom(session: StoredSession | null): RoomController & { session: StoredSession | null } {
  const [view, setView] = useState<PlayerView | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [error, setError] = useState<ControllerError | null>(null);
  const [busy, setBusy] = useState(false);
  const [localSession, setLocalSession] = useState<StoredSession | null>(session);
  const socketRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const closedRef = useRef(false);
  const sessionRef = useRef<StoredSession | null>(session);

  useEffect(() => {
    sessionRef.current = session;
    setLocalSession(session);
  }, [session]);

  const credentials = useCallback((): Credentials | null => {
    const s = sessionRef.current;
    if (!s) return null;
    return { playerId: s.playerId, playerToken: s.playerToken, hostToken: s.hostToken };
  }, []);

  const absorb = useCallback((envelope: { view: PlayerView; grantedHostToken?: string }) => {
    setView(envelope.view);
    if (envelope.grantedHostToken) {
      const next = patchSession({ hostToken: envelope.grantedHostToken });
      if (next) {
        sessionRef.current = next;
        setLocalSession(next);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    const s = sessionRef.current;
    const creds = credentials();
    if (!s || !creds) return;
    api
      .view(s.roomId, creds)
      .then(absorb)
      .catch((err: unknown) => {
        if (err instanceof ApiError) setError({ code: err.code, params: err.params });
      });
  }, [absorb, credentials]);

  /* --------------------- WebSocket 连接与自动重连 --------------------- */
  useEffect(() => {
    if (!session) {
      setConnection('closed');
      return;
    }
    closedRef.current = false;
    let reconnectTimer: number | undefined;

    const connect = () => {
      if (closedRef.current) return;
      const creds = credentials();
      if (!creds) return;
      setConnection('connecting');
      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl(session.roomId, creds));
      } catch {
        scheduleRetry();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        retryRef.current = 0;
        setConnection('open');
      };
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as
            | { type: 'state'; view: PlayerView }
            | { type: 'error'; code: string }
            | { type: 'pong' };
          if (message.type === 'state') {
            setView(message.view);
          } else if (message.type === 'error') {
            setError({ code: message.code, params: null });
          }
        } catch {
          /* 忽略非法负载 */
        }
      };
      socket.onclose = () => {
        setConnection('closed');
        if (!closedRef.current) scheduleRetry();
      };
      socket.onerror = () => {
        socket.close();
      };
    };

    const scheduleRetry = () => {
      retryRef.current = Math.min(retryRef.current + 1, 6);
      const delay = Math.min(1000 * 2 ** (retryRef.current - 1), 15000);
      reconnectTimer = window.setTimeout(connect, delay);
    };

    refresh();
    connect();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (socketRef.current?.readyState !== WebSocket.OPEN) {
          retryRef.current = 0;
          connect();
        }
        refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      closedRef.current = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [session, credentials, refresh]);

  /* ------------------------------ 动作 ------------------------------ */
  const dispatch = useCallback(
    async (action: Action) => {
      const s = sessionRef.current;
      const creds = credentials();
      if (!s || !creds) return;
      setBusy(true);
      setError(null);
      try {
        const envelope = await api.dispatch(s.roomId, creds, action, {
          expectedVersion: undefined,
          actionId: crypto.randomUUID(),
        });
        absorb(envelope);
      } catch (err) {
        if (err instanceof ApiError) {
          setError({ code: err.code, params: err.params });
          if (err.code === 'VERSION_CONFLICT') refresh();
        } else {
          setError({ code: 'INTERNAL_ERROR', params: null });
        }
      } finally {
        setBusy(false);
      }
    },
    [absorb, credentials, refresh],
  );

  const clearError = useCallback(() => setError(null), []);

  return { isTest: false, view, connection, error, busy, dispatch, clearError, refresh, session: localSession };
}
