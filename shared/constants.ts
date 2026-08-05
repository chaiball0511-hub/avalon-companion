/** 全局可配置常量 */

/** 房间码长度（易输入：去掉易混淆字符） */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_ALPHABET = '2345678ABCDEFGHJKLMNPQRSTUVWXYZ';

/** 最后一名玩家离线后房间存活时长，默认 12 小时 */
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

/** 房间创建后若无人加入的初始存活时长 */
export const ROOM_INITIAL_TTL_MS = 12 * 60 * 60 * 1000;

/** 昵称长度限制 */
export const NICKNAME_MIN_LENGTH = 1;
export const NICKNAME_MAX_LENGTH = 12;

/** WebSocket 心跳间隔 */
export const HEARTBEAT_INTERVAL_MS = 20_000;

/** 幂等去重保留的 actionId 数量 */
export const PROCESSED_ACTION_CACHE = 60;

/** 过期房间清理轮询间隔 */
export const ROOM_SWEEP_INTERVAL_MS = 60_000;
