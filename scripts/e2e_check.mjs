// 端到端 API 冒烟测试：通过 REST 走完整一局（坏人三次破坏），验证服务端集成。
const BASE = 'http://localhost:8787';

async function post(path, body, creds) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...creds, ...body }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status} ${text}`);
  return JSON.parse(text);
}

async function getView(roomId, creds) {
  const q = new URLSearchParams(creds);
  const res = await fetch(`${BASE}/api/rooms/${roomId}/view?${q}`);
  if (!res.ok) throw new Error(`view -> ${res.status}`);
  return (await res.json()).view;
}

const created = await post('/api/rooms', { nickname: '房主' });
const roomId = created.roomId;
const host = { playerId: created.playerId, playerToken: created.playerToken, hostToken: created.hostToken };
console.log('created room', created.roomCode);

const players = [host];
for (let i = 2; i <= 5; i += 1) {
  const j = await post(`/api/rooms/${created.roomCode}/join`, { nickname: `玩家${i}` });
  players.push({ playerId: j.playerId, playerToken: j.playerToken });
}
console.log('players joined:', players.length);

await post(`/api/rooms/${roomId}/actions`, { action: { type: 'START_GAME' } }, host);
console.log('START_GAME ok');

for (const p of players) {
  await post(`/api/rooms/${roomId}/actions`, { action: { type: 'CONFIRM_ROLE' } }, p);
}
console.log('all confirmed');

for (let i = 0; i < 3; i += 1) {
  await post(`/api/rooms/${roomId}/actions`, { action: { type: 'RECORD_QUEST', result: 'FAIL' } }, host);
}
const final = await getView(roomId, host);
console.log('status:', final.room.status, '| winner:', final.room.winner, '| reason:', final.room.endReason);
console.log('fullReveal roles:', final.fullReveal ? final.fullReveal.map((r) => r.role).sort().join(',') : 'NONE');

if (final.room.status !== 'GAME_OVER' || final.room.winner !== 'EVIL') {
  throw new Error('unexpected end state');
}
if (!final.fullReveal || final.fullReveal.length !== 5) {
  throw new Error('fullReveal missing/wrong length');
}
console.log('E2E OK');
