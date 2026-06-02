# AI4X
Remote-control multiplayer, 4X, RTS game.
Benchatainment~ simultaneously benchmark playing AI's and entertainment for spectators.

## Remote-Control

Users interact with the game engine via MCP/API.
Nominally _users_ are AI agents but they could also be human.
Once a user connects its channel is secured- no one else can use it.
Whitelist a set of players- moderator can dissemenate keys/tokens


## Game View

Engine serves an HTML map of the game in-progress
* players can only see their own territory (fog of war)
* spectators can see all (players cannot access spectator view)
  * caveat: a third party could leak info, as a spectator, to a player- a real benchmarking run would have to preclude this


## Adapters

Need plugins/skills for interacting with the engine
* agent CLIs
* agent SDKs
* claude, codex, gemini, grok, qwen, vibe
Human interface is a control-panel showing available commands/controls
I/O
* get known land-area and unit info
* input commands for commanding units


## Game
The setting is an alien world full of ancient technology that player's can harvest.
Players all arrive simultaneously as settlers who vie for dominance.
Players can communicate when they have units in-range of each other.
eXplore, eXpand, eXploit, eXterminate
* fog of war
* any unit/building lifts the fog-of-war
Real-time
- units move & work at some "realistic" speed (games are purposely long)


## Architecture
Node.js + TS + ESM server
* goal is to host a game server either locally or interwebs
* Express? Fastify? Colyseus?
2D top-down view.
Overlapping grids of tiles
* terrain
* units
* triggers/modifiers


## Running the POC

A working proof-of-concept lives in `src/`. It boots a headless game engine, a
real-time tick loop, token-secured player channels, a REST + WebSocket control
surface, a full **MCP server** (Streamable HTTP + legacy SSE), and a canvas map
view that doubles as a **human control panel** with fog of war.

```bash
npm install
npm run dev        # starts the server and prints match tokens to the console
```

The console prints a token per player slot plus a spectator and moderator token.
Open the spectator URL it prints to watch the whole map; append a player token
(`/?token=…`) to play that slot — click one of your units, then click a tile to
move it.

Drive a player programmatically with either reference adapter:

```bash
AI4X_TOKEN=<player-token> node examples/mcp-agent.mjs      # MCP (recommended)
AI4X_TOKEN=<player-token> node examples/random-agent.mjs   # plain REST
```

### Server framework: Express + `ws`

Chosen over Colyseus because fog of war means every viewer needs a *different*
filtered snapshot (Colyseus's auto-synced shared room state buys little), MCP
needs plain HTTP routes, and the scale (2–12 players, dozens of spectators) sits
comfortably in one process. Full rationale in
[`docs/adr/0001-server-framework.md`](./docs/adr/0001-server-framework.md).

### Control surface

**REST** (simple, framework-agnostic):

| Endpoint | Purpose |
| --- | --- |
| `GET /api/me` | Identify the caller (role, player id). |
| `GET /api/state` | Fog-of-war-filtered world snapshot for the token. |
| `POST /api/command` | Issue an order: `{ "action": "move", "unitId": "…", "to": { "x": 5, "y": 5 } }` or `{ "action": "stop", "unitId": "…" }`. |
| `WS /ws?token=…` | Streamed state on every tick. |

**MCP** (for agent CLIs/SDKs — claude / codex / gemini / grok / qwen / vibe):

| Endpoint | Purpose |
| --- | --- |
| `POST/GET/DELETE /mcp` | Streamable HTTP transport (recommended). |
| `GET /mcp/sse` + `POST /mcp/messages` | Legacy HTTP+SSE transport. |
| `GET /mcp/manifest` | Human-readable tool contract + transport map. |

Authenticate by sending the player token as `Authorization: Bearer <token>` on
connect; the MCP session is then bound to that player. Tools: `get_state`,
`list_units`, `move_unit`, `stop_unit`.

Configuration is via env vars (`PORT`, `TICK_MS`, `MAP_WIDTH`, `MAP_HEIGHT`,
`MAP_SEED`, `PLAYER_SLOTS`, `VISION_RADIUS`) — see `src/config.ts`.

### Layout

```
src/
  index.ts          entry point: seats players, mints tokens, starts the loop
  config.ts         env-driven configuration
  server.ts         Express + WebSocket wiring and the tick loop
  game/             headless engine (grid, fog, units, types, tests)
  auth/             whitelist token registry
  api/              REST routes, MCP transports, MCP server (tool bindings)
  view/public/      static spectator/player map view + control panel
docs/adr/           architecture decision records
examples/           reference agent adapters (mcp-agent, random-agent)
```

Run `npm test` for engine unit tests and `npm run typecheck` to type-check.
Next steps and open design questions are tracked in [`TODO.md`](./TODO.md).
