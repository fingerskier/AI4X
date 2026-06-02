// Reference MCP adapter — connects over Streamable HTTP, lists tools, and plays
// by issuing random move orders. This is the shape every agent CLI/SDK (claude /
// codex / gemini / grok / qwen / vibe) would take.
//
//   npm run dev            # in one shell; copy a player token from the console
//   AI4X_TOKEN=<token> node examples/mcp-agent.mjs
//
// Pass `--once` to connect, print the tool list + one state snapshot, and exit
// (used as the project's MCP smoke test).

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const BASE = process.env.AI4X_BASE ?? 'http://localhost:3000';
const TOKEN = process.env.AI4X_TOKEN;
const ONCE = process.argv.includes('--once');

if (!TOKEN) {
  console.error('Set AI4X_TOKEN to a player token printed by the server.');
  process.exit(1);
}

const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`), {
  requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
});

const client = new Client({ name: 'ai4x-mcp-agent', version: '0.1.0' });
await client.connect(transport);

const { tools } = await client.listTools();
console.log('connected; tools:', tools.map((t) => t.name).join(', '));

/** Call a tool and parse the JSON text payload our server returns. */
async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content?.find((c) => c.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}

async function turn() {
  const state = await call('get_state');
  const mine = state.units.filter((u) => u.ownerId === state.you?.id);
  for (const u of mine) {
    if (u.target) continue;
    const to = {
      x: Math.max(0, Math.min(state.width - 1, u.x + (Math.floor(Math.random() * 11) - 5))),
      y: Math.max(0, Math.min(state.height - 1, u.y + (Math.floor(Math.random() * 11) - 5))),
    };
    const result = await call('move_unit', { unitId: u.id, x: to.x, y: to.y });
    console.log(`move ${u.type} ${u.id} -> (${to.x},${to.y})`, result.ok ? 'ok' : result.error);
  }
}

if (ONCE) {
  const state = await call('get_state');
  console.log(`state: tick ${state.tick}, ${state.tiles.length} tiles, ${state.units.length} units`);
  await client.close();
  process.exit(0);
}

console.log(`mcp-agent playing as ${TOKEN.slice(0, 6)}… on ${BASE}`);
setInterval(() => turn().catch((e) => console.error(e.message)), 2500);
