import type { Room } from '../../shared/types';

/**
 * 实时房间数据层抽象。
 *
 * 当前提供 MemoryRoomStore（内存 + JSON 快照）实现，可直接在本机/局域网运行。
 * 生产环境可替换为 Supabase / Redis / Postgres 实现，只需满足本接口的事务与订阅语义。
 *
 * 契约：
 * - transact 必须对同一 roomId 串行执行，且回调抛错时完整回滚。
 * - 提交成功后必须触发 onChange，用于向该房间的订阅者推送个人化视图。
 */
export interface RealtimeRoomProvider {
  readonly name: string;

  init(): Promise<void>;

  create(room: Room): Promise<Room>;

  getById(roomId: string): Promise<Room | null>;

  getByCode(roomCode: string): Promise<Room | null>;

  /** 串行事务：回调内可直接原地修改 room，抛错则回滚 */
  transact<T>(roomId: string, mutate: (room: Room) => T): Promise<{ room: Room; result: T }>;

  remove(roomId: string): Promise<void>;

  all(): Promise<Room[]>;

  /** 房间发生变化时回调（含删除时的 DISSOLVED 状态） */
  onChange(listener: (room: Room) => void): () => void;

  close(): Promise<void>;
}

export class RoomNotFoundError extends Error {
  readonly code = 'ROOM_NOT_FOUND';
  constructor() {
    super('ROOM_NOT_FOUND');
    this.name = 'RoomNotFoundError';
  }
}
