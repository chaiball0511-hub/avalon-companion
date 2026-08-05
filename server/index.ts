import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer, type WebSocket } from 'ws';
import { MemoryRoomStore } from './store/MemoryRoomStore';
import { RoomService, ServiceError, type AuthInput } from './roomService';
import { computePlayerView } from '../shared/engine';
import { HEARTBEAT_INTERVAL_MS } from '../shared/constants';
import type { Action } from '../shared/engine';
import type { Room } from '../shared/types';

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '0.0.0.0';
const DATA_FILE =
  process.env.AVALON_DATA_FILE === 'none'
    ? null
    : path.resolve(process.cwd(), process.env.AVALON_DATA_FILE ?? 'data/rooms.json');

const store = new MemoryRoomStore({ persistFile: DATA_FILE });
const service = new RoomService(store);

const app = express();
app.use(express.json({ limit: '64kb' }));

/* --------------------------- 工具 --------------------------- */

function authFrom(req: express.Request): AuthInput {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    playerId: (body.playerId as string) ?? (req.query.playerId as string) ?? null,
    playerToken:
      (body.playerToken as string) ??
      (req.query.playerToken as string) ??
      (req.header('x-player-token') as string) ??
      null,
    hostToken:
      (body.hostToken as string) ??
      (req.query.hostToken as string) ??
      (req.header('x-host-token') as string) ??
      null,
  };
}

function sendError(res: express.Response, error: unknown): void {
  if (error instanceof ServiceError) {
    res.status(error.status).json({ error: { code: error.code, params: error.params ?? null } });
    return;
  }
  const message = error instanceof Error ? error.message : 'INTERNAL_ERROR';
  res.status(500).json({ error: { code: message, params: null } });
}

/* --------------------------- REST --------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, store: store.name, time: Date.now() });
});

app.post('/api/rooms', async (req, res) => {
  try {
    const nickname = String((req.body as { nickname?: string })?.nickname ?? '');
    const result = await service.createRoom(nickname);
    res.json(result);
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/rooms/:code/summary', async (req, res) => {
  try {
    res.json(await service.getRoomSummary(req.params.code));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/rooms/:code/join', async (req, res) => {
  try {
    const nickname = String((req.body as { nickname?: string })?.nickname ?? '');
    res.json(await service.joinRoom(req.params.code, nickname));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/rooms/:code/seat-claims', async (req, res) => {
  try {
    const targetPlayerId = String((req.body as { targetPlayerId?: string })?.targetPlayerId ?? '');
    res.json(await service.requestSeatClaim(req.params.code, targetPlayerId));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/rooms/:code/seat-claims/:claimId', async (req, res) => {
  try {
    res.json(await service.getSeatClaim(req.params.code, req.params.claimId));
  } catch (error) {
    sendError(res, error);
  }
});

app.get('/api/rooms/:roomId/view', async (req, res) => {
  try {
    res.json(await service.getView(req.params.roomId, authFrom(req)));
  } catch (error) {
    sendError(res, error);
  }
});

app.post('/api/rooms/:roomId/actions', async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      action?: Action;
      expectedVersion?: number;
      actionId?: string;
    };
    if (!body.action || typeof body.action.type !== 'string') {
      throw new ServiceError('ACTION_REQUIRED', 400);
    }
    const envelope = await service.dispatch(req.params.roomId, authFrom(req), body.action, {
      expectedVersion: body.expectedVersion,
      actionId: body.actionId,
    });
    res.json(envelope);
  } catch (error) {
    sendError(res, error);
  }
});

/* ----------------------- 静态资源 / SPA ----------------------- */

const clientDir = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!api|ws).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, 'index.html'));
  });
}

/* --------------------------- WebSocket --------------------------- */

interface Subscriber {
  socket: WebSocket;
  roomId: string;
  playerId: string;
  playerToken: string;
  hostToken: string | null;
  alive: boolean;
}

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
const subscribers = new Set<Subscriber>();

function pushView(sub: Subscriber, room: Room): void {
  if (sub.socket.readyState !== sub.socket.OPEN) return;
  try {
    const view = computePlayerView(room, sub.playerId, Date.now());
    sub.socket.send(JSON.stringify({ type: 'state', view }));
  } catch {
    // 忽略单个推送失败
  }
}

store.onChange((room) => {
  for (const sub of subscribers) {
    if (sub.roomId === room.id) pushView(sub, room);
  }
});

wss.on('connection', (socket, request) => {
  const url = new URL(request.url ?? '/ws', 'http://localhost');
  const roomId = url.searchParams.get('roomId') ?? '';
  const playerId = url.searchParams.get('playerId') ?? '';
  const playerToken = url.searchParams.get('token') ?? '';

  void (async () => {
    try {
      const room = await store.getById(roomId);
      if (!room) {
        socket.send(JSON.stringify({ type: 'error', code: 'ROOM_NOT_FOUND' }));
        socket.close();
        return;
      }
      // 鉴权失败直接断开，避免未授权设备订阅房间流
      service.authorize(room, { playerId, playerToken });

      const sub: Subscriber = { socket, roomId, playerId, playerToken, hostToken: null, alive: true };
      subscribers.add(sub);

      socket.on('pong', () => {
        sub.alive = true;
      });
      socket.on('message', (raw) => {
        // 收到任何客户端消息都视为连接存活。部分反向代理（如 Railway）不会转发
        // WebSocket 的 ping/pong 控制帧，仅靠控制帧判断存活会把健康连接误杀。
        sub.alive = true;
        try {
          const msg = JSON.parse(String(raw)) as { type?: string };
          if (msg.type === 'ping') socket.send(JSON.stringify({ type: 'pong' }));
        } catch {
          /* 忽略非法消息 */
        }
      });
      socket.on('close', () => {
        subscribers.delete(sub);
        const stillConnected = Array.from(subscribers).some(
          (s) => s.roomId === roomId && s.playerId === playerId,
        );
        if (!stillConnected) void service.setOnline(roomId, playerId, false);
      });

      await service.setOnline(roomId, playerId, true);
      const fresh = await store.getById(roomId);
      if (fresh) pushView(sub, fresh);
    } catch (error) {
      const code = error instanceof ServiceError ? error.code : 'UNAUTHORIZED';
      socket.send(JSON.stringify({ type: 'error', code }));
      socket.close();
    }
  })();
});

const heartbeat = setInterval(() => {
  for (const sub of subscribers) {
    if (!sub.alive) {
      sub.socket.terminate();
      subscribers.delete(sub);
      void service.setOnline(sub.roomId, sub.playerId, false);
      continue;
    }
    sub.alive = false;
    try {
      sub.socket.ping();
    } catch {
      /* 忽略 */
    }
  }
}, HEARTBEAT_INTERVAL_MS);
heartbeat.unref?.();

/* --------------------------- 启动 --------------------------- */

async function main(): Promise<void> {
  await store.init();
  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(`[avalon-companion] server ready  http://localhost:${PORT}  (store=${store.name})`);
  });
}

function shutdown(): void {
  clearInterval(heartbeat);
  void store.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref?.();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

void main();
