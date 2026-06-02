// Reference MCP adapter — connects over Streamable HTTP, then *subscribes* to
// the game-state resource and reacts to server-pushed notifications instead of
// polling. This is the shape every agent CLI/SDK (claude / codex / gemini /
// grok / qwen / vibe) would take.
//
//   npm run dev            # in one shell; copy a player token from the console
//   AI4X_TOKEN=<token> node examples/mcp-agent.mjs
//
// Pass `--once` to run a smoke test: subscribe, cause a change, wait for the
// resulting notifications/resources/updated, then exit.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ResourceUpdatedNotificationSchema } from '@modelcontextprotocol/sdk/types.js';

const BASE = process.env.AI4X_BASE ?? 'http://localhost:3000';
const TOKEN = process.env.AI4X_TOKEN;
const ONCE = process.argv.includes('--once');
const STATE_URI = 'ai4x://state';

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

/** Read the subscribable state resource and parse its JSON payload. */
async function readState() {
  const res = await client.readResource({ uri: STATE_URI });
  return JSON.parse(res.contents[0].text);
}

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  return JSON.parse(res.content?.find((c) => c.type === 'text')?.text ?? '{}');
}

/** Order any idle unit somewhere new; movement keeps the state changing. */
async function act(state) {
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
  // Smoke test: prove the push loop works end to end.
  let resolveNotice;
  const noticed = new Promise((r) => (resolveNotice = r));
  client.setNotificationHandler(ResourceUpdatedNotificationSchema, (n) => {
    if (n.params.uri === STATE_URI) resolveNotice();
  });

  await client.subscribeResource({ uri: STATE_URI });
  const state = await readState();
  console.log(`subscribed; state: tick ${state.tick}, ${state.units.length} units`);
  await act(state); // moving a unit guarantees the view will change next tick

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('no notification within 10s')), 10_000),
  );
  await Promise.race([noticed, timeout]);
  const after = await readState();
  console.log(`notification received; re-read state at tick ${after.tick}`);
  await client.close();
  process.exit(0);
}

// Event-driven play: re-evaluate whenever the server says our view changed.
let busy = false;
client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (n) => {
  if (n.params.uri !== STATE_URI || busy) return;
  busy = true;
  try {
    await act(await readState());
  } catch (e) {
    console.error(e.message);
  } finally {
    busy = false;
  }
});

await client.subscribeResource({ uri: STATE_URI });
console.log(`mcp-agent subscribed to ${STATE_URI}; reacting to pushes…`);
await act(await readState()); // kick things off
