# Avalon Companion · 阿瓦隆身份助手

线下桌游《抵抗组织：阿瓦隆》（The Resistance: Avalon）的**身份与流程辅助工作台**。

它不是一款把整局博弈搬上服务器的在线对战游戏，而是一套**信任最小化**的线下助手：
服务器只负责**安全地随机发牌、按玩家分发的私密视图、记录线下已经发生的任务结果**，
并实时把每位玩家该看到的信息推送到各自的设备。所有人仍然围坐同一张桌子，用真实身份出牌。

> 设计原则：完整身份表（谁是什么角色）**永远不**整张下发给任何客户端；
> 只有「当前玩家自己的身份 + 该身份能合法知道的信息」会被推送。

---

## ✨ 功能特性

- **房间与加入**：创建房间得到 6 位易输入房间码（去掉易混淆字符），好友输入房间码即可加入。
- **角色配置**：房主在开局前开启/关闭派西维尔、莫甘娜、莫德雷德、奥伯伦、湖上夫人等扩展角色。
- **安全随机发牌**：服务端使用密码学安全随机数（`crypto.randomBytes` 派生的 `randomUUID` 种子化 RNG）洗牌分配，客户端无法预知或操纵。
- **按玩家私密视图**：每位玩家在「身份揭示」阶段只在本机看到自己的角色卡与已知同伴；梅林能看到坏人（不含奥伯伦）、派西维尔能看到梅林/莫甘娜（但分不清谁是真梅林）。
- **离线任务流程记录**：组队、投票、任务成功/失败全部在本地逐个记录并上报，支持 5–10 人不同队伍人数表。
- **湖上夫人（Lady of the Lake）**：可选模块，第二关任务后触发，令牌顺时针移交，持有者可查验目标阵营。
- **刺杀阶段**：好人方赢下 3 关后进入刺客刺杀梅林环节；刺客候选名单**刻意包含奥伯伦**，避免候选名单本身泄露其阵营。
- **断线重连 / 席位恢复**：中途离开的玩家可由房主批准「恢复席位」重新拿回原座位与令牌。
- **单人测试模式**：同一台设备模拟多玩家、内置设备模拟器与管理员面板、10 套预设场景（A–J），便于无真人开测或演示。
- **移动端优先**：响应式布局，针对 375 / 390 / 430 宽度手机优化；明暗双主题；中/英双语。

---

## 🧱 技术架构

```
┌─────────────────────────────┐         ┌──────────────────────────────────┐
│  前端 (Vite + React 18 + TS) │         │  服务端 (Node + Express + ws)      │
│                             │         │                                  │
│  RoomShell (模式无关渲染器)  │ ──REST─▶ │  /api/*  动作、视图、房间管理      │
│   useOnlineRoom  ◀──WS──┐   │ ◀─推送─ │                                  │
│   useLocalRoom (测试)   │   │         │  RoomService (鉴权 + 引擎驱动)    │
└─────────────────────────────┘         │       │                          │
                                          │       ▼                          │
                                ┌─────────┴───────────────┐                  │
                                │  shared/engine.ts       │ ◀── 前后端共用   │
                                │  权威纯函数状态机        │     同一份代码    │
                                └─────────┬───────────────┘                  │
                                          │ 接口                            │
                                ┌─────────▼───────────────┐                  │
                                │  RealtimeRoomProvider    │                  │
                                │  MemoryRoomStore (默认)  │                  │
                                │  内存权威 + JSON 快照     │                  │
                                └──────────────────────────┘                  │
```

- **前后端共用「权威引擎」**：`shared/engine.ts` 是一个无副作用的纯函数状态机，服务端 `applyAction` 驱动真实房间，
  测试模式 `useLocalRoom` 直接复用同一份代码——保证**测试模式与线上行为完全一致**。
- **两种房间控制器，一种渲染器**：`RoomController` 接口由 `useOnlineRoom`（WebSocket 实时）与 `useLocalRoom`（单机测试）分别实现；
  `RoomShell` 只消费与模式无关的 `{ view, dispatch, busy, isTest }`，UI 代码零重复。
- **单一私密数据出口**：`computePlayerView(room, viewerId)` 是秘密信息离开服务端的唯一函数。

---

## 📁 目录结构

```
avalon-companion/
├── index.html                 # SPA 入口
├── server/                    # Node 后端
│   ├── index.ts               # Express + ws + 静态托管 + 启动
│   ├── roomService.ts         # 鉴权 / 动作分发 / 视图信封 / 席位恢复
│   ├── security.ts            # SHA-256 令牌哈希 + timingSafeEqual 校验
│   └── store/
│       ├── RealtimeRoomProvider.ts  # 数据层接口
│       └── MemoryRoomStore.ts       # 默认实现：内存 + JSON 快照
├── shared/                    # 前后端共用
│   ├── engine.ts              # 权威状态机 / computePlayerView（单一私密出口）
│   ├── roles.ts               # 角色人数表 / 默认配置
│   ├── visibility.ts          # 可见性规则
│   ├── types.ts               # 共享类型
│   ├── constants.ts           # 房间码、TTL、心跳、清理间隔等
│   └── random.ts              # 密码学安全 RNG
├── src/                       # React 前端
│   ├── main.tsx               # 根：I18n + Confirm + Router
│   ├── pages/                 # Home / Create / Join / Room / Test / Settings / NotFound
│   ├── room/                  # 13 个房间视图 + RoomShell 共享渲染器
│   ├── state/                 # api / controller / session / theme / useOnlineRoom / useLocalRoom
│   ├── components/            # ui.tsx（设计系统）/ Crest / PlayerList / SecretVeil
│   └── i18n/                  # zh-CN / en / index
├── tests/                     # Vitest：engine.test.ts / security.test.ts
├── scripts/e2e_check.mjs      # 端到端冒烟脚本（REST 走完整局）
└── data/                      # 运行时快照 data/rooms.json（可删除/可禁用）
```

---

## 🚀 快速开始

### 本地开发（推荐）

一条命令同时启动后端（:8787）与前端（:5173，并代理 `/api`、`/ws`）：

```bash
npm install
npm run dev
```

然后浏览器打开 **http://localhost:5173** —— 用手机或开多个无痕窗口即可模拟多名玩家。

### 生产构建与运行

```bash
npm install
npm run build        # 构建前端 dist/client + 编译服务（tsx 直接跑 TS）
npm run start        # 启动单一 Node 进程，同时托管 API 与静态资源
```

默认监听 **http://localhost:8787**，访问该地址即可进入应用。

> 说明：`package.json` 中 `"type": "module"`，因此服务以 `tsx server/index.ts` 直接运行源码，
> 无需额外的 CommonJS 构建步骤。

---

## 🔧 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | HTTP / WebSocket 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址（容器内用 `0.0.0.0`） |
| `AVALON_DATA_FILE` | `data/rooms.json` | 房间 JSON 快照路径。**设为 `none` 可关闭持久化**（纯内存，重启即清空） |

示例：

```bash
PORT=3000 AVALON_DATA_FILE=none npm run start
```

---

## ⚡ 实时通信架构

- **REST（`/api`）**：创建/加入房间、拉取视图、提交动作、席位恢复轮询。
- **WebSocket（`/ws`）**：每位玩家建立一条带鉴权的长连接，服务端状态变更时通过 `computePlayerView` 计算**该玩家的个性化视图**并实时推送。
- **心跳**：默认每 20s（`HEARTBEAT_INTERVAL_MS`）一次 `ping/pong`，断开即把该玩家标记为离线。
- **乐观锁 / 幂等**：每个动作可携带 `expectedVersion` 与 `actionId`，服务端用版本号做冲突检测、用 `actionId` 去重（缓存最近 60 条），避免重复提交与并发覆盖。

---

## 💾 数据层与持久化

默认 `MemoryRoomStore` 实现 `RealtimeRoomProvider` 接口：

- **内存权威状态**：所有房间常驻内存，`transact` 通过**每个房间一条 Promise 链**串行化所有变更，避免并发竞态。
- **JSON 快照**：状态变更后 400ms 内（防抖）写入 `data/rooms.json`；进程启动时 `init()` 重新加载**未过期且未解散**的房间，并把所有玩家在线标记重置为 `false`（因为重启后连接都已断开）。
- **过期清理**：每 60s（`ROOM_SWEEP_INTERVAL_MS`）扫描一次，最后一名玩家离线且超过 TTL（默认 12 小时）或已解散的房间会被回收。
- **可替换**：只要实现 `RealtimeRoomProvider` 接口（如改用 Redis 集群），即可横向扩展；`roomService` 不依赖具体存储。

---

## 🛡️ 安全模型（重点）

本项目的核心目标是：**任何客户端都无法拿到不该看到的身份信息，也无法通过篡改本地存储获得房主权限。**

1. **令牌只存哈希**：`playerToken` / `hostToken` 的明文仅下发一次给客户端（存于 `localStorage`），服务端只保存 `SHA-256` 哈希。校验走 `server/security.ts` 的 `verifyToken`，使用 `crypto.timingSafeEqual` 防时序攻击。
2. **房主权不能伪造**：`hostVerified` 只在 **「`hostToken` 哈希匹配」且「`playerId` 恰好是当前房主」** 时为真。房间码本身**不是**任何权限凭证；即便修改 `localStorage` 也无法凭空获得 `hostVerified`，需要房主转移的专用令牌。
3. **房主令牌一次性投递**：房主转移时，新令牌通过 `hostGrants` 一次性投递箱随下一次视图下发，**绝不写入持久化房间状态**。
4. **单一私密出口**：完整身份分配表 `fullReveal` **只在 `GAME_OVER` 之后**才会以公开形式出现；游戏进行中，`computePlayerView` 只回传「自己 + 该身份合法可见的同伴」。
5. **刺客候选不泄露奥伯伦**：刺杀候选 = 全部玩家 − 刺客自己 − 刺客已知坏人队友。若按阵营过滤掉奥伯伦，候选名单本身就等于告诉刺客「他是坏人」，因此候选名单**刻意包含奥伯伦**。
6. **未授权订阅即断开**：WebSocket 连接若在鉴权（`authorize`）阶段失败，服务端直接关闭连接，未授权设备无法订阅房间流。

---

## 🎲 支持的规则与流程

状态机：`LOBBY → ROLE_CONFIGURATION → ROLE_REVEAL → WAITING_FOR_CONFIRMATION → IN_GAME → (LADY_OF_THE_LAKE) → ASSASSINATION → GAME_OVER`，外加 `RESTARTING` / `DISSOLVED`。

- 5–10 人均可开局，队伍人数表与失败任务数遵循阿瓦隆标准。
- 角色人数表由 `buildRoleComposition` 计算；湖上夫人仅在玩家数达标时可用。
- 胜负判定：坏人方 3 次任务失败即胜（`EVIL_THREE_FAILS`）；好人方 3 关成功则进入刺杀，刺客命中梅林则坏人胜，否则好人胜。

---

## 🧪 单人测试模式

访问 `/test`（首页「单人测试」按钮）：

- **设备模拟器**：在同一屏幕上切换「当前查看的玩家」，模拟多人同机演示。
- **测试管理员面板**：一键全员确认、重置、调试查看答案。
- **预设场景**：内置 A–J 共 10 套固定席位/角色场景，便于回归与教学。
- 测试模式复用 `useLocalRoom` + 同一份 `shared/engine.ts`，行为与实际联机完全一致。

---

## ✅ 测试与验证

```bash
npm run verify       # lint + 类型检查 + 单元测试（一次性跑完）
npm run lint         # eslint（0 warning 门槛）
npm run typecheck    # 前后端 TS 类型检查
npm run test         # vitest 运行 engine / security 测试
```

- `tests/engine.test.ts`：角色人数表、发牌与身份隔离（梅林/派西维尔/奥伯伦可见性）、对局流程、湖上夫人、权限与安全性，共 25 个用例。
- `tests/security.test.ts`：`hashToken` / `verifyToken` 的哈希一致性、错误令牌拒绝、`timingSafeEqual` 边界。

端到端冒烟（需要服务在 :8787 运行）：

```bash
npm run start &          # 先起服务
node scripts/e2e_check.mjs   # 走完 创建→加入→开局→确认→3次失败→GAME_OVER
```

---

## ⚠️ 已知限制

- **单节点 / 单进程**：默认 `MemoryRoomStore` 仅进程内有效，多实例部署需自行实现 `RealtimeRoomProvider`（如 Redis）。
- **无中心匹配**：没有全局大厅/匹配系统，房间靠 6 位房间码人工传递。
- **快照非强一致**：`data/rooms.json` 为防抖异步落盘，进程被强杀可能丢失最近 400ms 内的变更（可设 `AVALON_DATA_FILE=none` 关闭）。
- **身份仍在线下**：本工具只负责发牌与流程记录，玩家实际的「出牌表演」在线下进行；它不判断谎言或实时博弈策略。
- **单人测试不做权限隔离**：`/test` 模式绕过令牌校验，仅用于演示与回归，不应作为权限模型的验证依据。

---

## 📄 许可

本项目为离线桌游辅助工具，仅供学习与非商业娱乐使用。
