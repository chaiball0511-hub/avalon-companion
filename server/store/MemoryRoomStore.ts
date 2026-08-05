import fs from 'node:fs';
import path from 'node:path';
import type { Room } from '../../shared/types';
import { ROOM_SWEEP_INTERVAL_MS } from '../../shared/constants';
import { RoomNotFoundError, type RealtimeRoomProvider } from './RealtimeRoomProvider';

interface MemoryStoreOptions {
  /** JSON 快照路径；不传则纯内存（测试用） */
  persistFile?: string | null;
  sweepIntervalMs?: number;
}

/**
 * 开发/自托管默认实现：内存权威 + JSON 快照落盘。
 *
 * 快照的意义是服务重启后房间不丢；并发控制通过每个房间的 Promise 链实现串行化。
 */
export class MemoryRoomStore implements RealtimeRoomProvider {
  readonly name = 'memory';

  private rooms = new Map<string, Room>();
  private codeIndex = new Map<string, string>();
  private locks = new Map<string, Promise<unknown>>();
  private listeners = new Set<(room: Room) => void>();
  private persistFile: string | null;
  private persistTimer: NodeJS.Timeout | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweepIntervalMs: number;

  constructor(options: MemoryStoreOptions = {}) {
    this.persistFile = options.persistFile ?? null;
    this.sweepIntervalMs = options.sweepIntervalMs ?? ROOM_SWEEP_INTERVAL_MS;
  }

  async init(): Promise<void> {
    if (this.persistFile && fs.existsSync(this.persistFile)) {
      try {
        const raw = fs.readFileSync(this.persistFile, 'utf-8');
        const parsed = JSON.parse(raw) as { rooms?: Room[] };
        const now = Date.now();
        for (const room of parsed.rooms ?? []) {
          if (room.expiresAt > now && room.status !== 'DISSOLVED') {
            // 重启后所有连接都断了
            room.players.forEach((p) => {
              p.online = false;
            });
            this.rooms.set(room.id, room);
            this.codeIndex.set(room.roomCode, room.id);
          }
        }
      } catch {
        // 快照损坏时忽略，重新开始
      }
    }
    this.sweepTimer = setInterval(() => this.sweep(), this.sweepIntervalMs);
    this.sweepTimer.unref?.();
  }

  async create(room: Room): Promise<Room> {
    this.rooms.set(room.id, room);
    this.codeIndex.set(room.roomCode, room.id);
    this.schedulePersist();
    this.emit(room);
    return this.clone(room);
  }

  async getById(roomId: string): Promise<Room | null> {
    const room = this.rooms.get(roomId);
    return room ? this.clone(room) : null;
  }

  async getByCode(roomCode: string): Promise<Room | null> {
    const id = this.codeIndex.get(roomCode.toUpperCase());
    if (!id) return null;
    return this.getById(id);
  }

  async transact<T>(roomId: string, mutate: (room: Room) => T): Promise<{ room: Room; result: T }> {
    const previous = this.locks.get(roomId) ?? Promise.resolve();
    const run = previous.then(async () => {
      const current = this.rooms.get(roomId);
      if (!current) throw new RoomNotFoundError();
      // 在副本上操作，失败时原状态不受影响
      const draft = this.clone(current);
      const result = mutate(draft);
      this.rooms.set(roomId, draft);
      this.codeIndex.set(draft.roomCode, draft.id);
      this.schedulePersist();
      this.emit(draft);
      return { room: this.clone(draft), result };
    });
    this.locks.set(
      roomId,
      run.catch(() => undefined),
    );
    return run;
  }

  async remove(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    this.rooms.delete(roomId);
    this.codeIndex.delete(room.roomCode);
    this.schedulePersist();
  }

  async all(): Promise<Room[]> {
    return Array.from(this.rooms.values()).map((r) => this.clone(r));
  }

  onChange(listener: (room: Room) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async close(): Promise<void> {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.flush();
    this.listeners.clear();
  }

  /* ---------------- 内部 ---------------- */

  private emit(room: Room): void {
    const snapshot = this.clone(room);
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // 单个订阅者异常不影响其他人
      }
    }
  }

  private clone(room: Room): Room {
    return structuredClone(room);
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms) {
      const everyoneOffline = room.players.every((p) => !p.online);
      const expired = room.expiresAt < now && everyoneOffline;
      if (expired || room.status === 'DISSOLVED') {
        this.rooms.delete(id);
        this.codeIndex.delete(room.roomCode);
      }
    }
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (!this.persistFile) return;
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flush();
    }, 400);
    this.persistTimer.unref?.();
  }

  private flush(): void {
    if (!this.persistFile) return;
    try {
      fs.mkdirSync(path.dirname(this.persistFile), { recursive: true });
      const payload = JSON.stringify({ savedAt: Date.now(), rooms: Array.from(this.rooms.values()) });
      fs.writeFileSync(this.persistFile, payload, 'utf-8');
    } catch {
      // 落盘失败不影响进程内运行
    }
  }
}
