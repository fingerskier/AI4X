// Example reference agent — the simplest possible "adapter".
//
// Polls the REST API for state and issues random move orders to its units.
// Run the server, copy a player token from the console, then:
//
//   AI4X_TOKEN=<player-token> node examples/random-agent.mjs
//
// This demonstrates the full remote-control contract an AI agent (claude /
// codex / gemini / grok / qwen / vibe) would drive. See TODO.md for the planned
// MCP transport that replaces raw HTTP.

const BASE = process.env.AI4X_BASE ?? 'http://localhost:3000';
const TOKEN = process.env.AI4X_TOKEN;

if (!TOKEN) {
  console.error('Set AI4X_TOKEN to a player token printed by the server.');
  process.exit(1);
}

const headers = { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' };

async function getState() {
  const res = await fetch(`${BASE}/api/state`, { headers });
  if (!res.ok) throw new Error(`state ${res.status}`);
  return res.json();
}

async function move(unitId, to) {
  const res = await fetch(`${BASE}/api/command`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'move', unitId, to }),
  });
  return res.json();
}

async function tick() {
  const state = await getState();
  const mine = state.units.filter((u) => u.ownerId === state.you?.id);
  for (const u of mine) {
    if (u.target) continue; // already moving
    const to = {
      x: Math.max(0, Math.min(state.width - 1, u.x + (Math.floor(Math.random() * 11) - 5))),
      y: Math.max(0, Math.min(state.height - 1, u.y + (Math.floor(Math.random() * 11) - 5))),
    };
    const result = await move(u.id, to);
    console.log(`move ${u.type} ${u.id} -> (${to.x},${to.y})`, result.ok ? 'ok' : result.error);
  }
}

console.log(`random-agent connected to ${BASE}`);
setInterval(() => tick().catch((e) => console.error(e.message)), 2000);
