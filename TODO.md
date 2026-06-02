# AI4X — TODO & open questions

This file tracks next steps for the POC and the design questions that need
answers before the project hardens. The POC proves the core loop: a headless engine, fog-of-war views,
token-secured channels, a REST/WS control surface, a full MCP server
(Streamable HTTP + legacy SSE), and a canvas spectator/player view that doubles
as a human control panel.

## What the POC already does

- [x] Deterministic, seeded map generation (terrain + harvestable ruins).
- [x] Real-time tick loop (configurable cadence).
- [x] Players seated simultaneously around the map; settler + scout per player.
- [x] Unit movement orders; harvester resource collection.
- [x] Fog of war per player; all-seeing spectator view.
- [x] Whitelist token auth (player / spectator / moderator) with channel claim.
- [x] REST API (`/api/me`, `/api/state`, `/api/command` — move + stop).
- [x] WebSocket state broadcast on every tick (spectator payload cached once).
- [x] Canvas map view + **human control panel** (select unit, click-to-move,
      tile inspector, command log).
- [x] **MCP server** over Streamable HTTP and legacy HTTP+SSE, sessions bound to
      a player token. Tools: `get_state`, `list_units`, `move_unit`, `stop_unit`;
      subscribable `ai4x://state` resource with server-pushed change notifications.
- [x] Reference adapters: `mcp-agent` (MCP) and `random-agent` (REST).
- [x] Server framework decided: Express + `ws` (ADR 0001).
- [x] Engine unit tests (`npm test`).

## Next steps (engineering)

### Core engine
- [ ] **Pathfinding** — units currently give up when they hit a blocked tile.
      Add A* over the terrain grid; respect movement cost per terrain.
- [ ] **Buildings** — settlers should found a base; bases lift fog and produce
      units. The README lists buildings as fog-lifters alongside units.
- [ ] **The four X's** — only eXplore/eXploit are sketched. Add eXpand
      (claiming territory) and eXterminate (combat resolution, unit death).
- [ ] **Combat** — `hp` exists but nothing damages it yet. Define attack range,
      damage, and who can attack whom.
- [ ] **Proximity comms** — README: players can talk when units are in range.
      Add a `/api/message` channel gated by unit proximity.
- [ ] **Triggers/modifiers grid** — the third "overlapping grid" from the
      README (ancient-tech effects, hazards). Currently only terrain + units.
- [ ] **Match lifecycle** — win/lose conditions, match end, scoreboard export
      for benchmarking runs.

### Transport & adapters
- [x] **Real MCP server** — Streamable HTTP + legacy SSE, sessions bound to a
      player token (`src/api/mcp.ts`, `src/api/mcpServer.ts`).
- [x] **Human control panel** — select unit, click-to-move, tile inspector, and
      command log in the view when a player token is present.
- [ ] **Per-agent adapter skills** — claude / codex / gemini / grok / qwen /
      vibe. Start from `examples/mcp-agent.mjs` (each just needs the MCP URL +
      a player token).
- [x] **MCP notifications** — `ai4x://state` resource with subscriptions; the
      tick loop pushes `notifications/resources/updated` on real change (idle
      worlds stay quiet) over both transports. Agents react instead of polling.
- [ ] **Richer tools/panel** — found base, harvest, attack, and (later) the
      proximity comms channel, surfaced both as MCP tools and panel buttons.
- [ ] **WS commands** — allow issuing orders over the socket, not just polling
      REST, to cut latency.

### Platform & ops
- [ ] **Persistence** — tokens and match state are in-memory; a restart wipes
      everything. Persist to disk/DB; support reconnection to a claimed channel.
- [ ] **Moderator tooling** — endpoints to mint/revoke tokens, start/stop/seed
      matches, kick players (the README's "moderator disseminates keys").
- [ ] **Anti-leak for benchmarking** — README caveat: a spectator could leak
      fog-of-war info to a player. Consider delayed/withheld spectator streams
      during sanctioned runs.
- [ ] **Rate limiting / fairness** — cap commands-per-tick so a fast agent
      can't spam the engine; makes benchmarks comparable.
- [ ] **CI** — wire `npm run typecheck && npm test` into GitHub Actions.
- [ ] **Build asset copy** — currently a shell `cp` in the build script; move to
      a cross-platform step if Windows hosting matters.

## Open questions (need product decisions)

1. **Framework**: ~~Express / Fastify / Colyseus?~~ **Resolved → Express + `ws`**
   (ADR 0001). Revisit only if we pivot to many concurrent public matches with
   matchmaking, or spectator counts reach the thousands.
2. **Tick rate vs. agent latency**: games are "purposely long." What real
   cadence (seconds? minutes per tick?) balances LLM-agent think-time against
   watchable spectator pacing?
3. **Command model**: immediate orders (current) vs. queued/simultaneous-resolve
   turns? Simultaneous resolution is fairer for benchmarking but more complex.
4. **What exactly is benchmarked?** Final score? Territory? Survival time?
   Decisions-per-resource-efficiency? This shapes the scoreboard + match-end API.
5. **Map symmetry/fairness**: random spawns can be unfair. Do benchmarking runs
   need mirrored/balanced maps and fixed seeds per cohort?
6. **Communication protocol between players**: free-text only, or a structured
   negotiation/diplomacy schema agents can reason over?
7. **Auth hardening**: are nanoid bearer tokens enough, or do we need signed
   tokens / TLS-pinned channels for "secured" competitive runs?
8. **Spectator UX**: just the map, or also a commentary/telemetry feed
   (per-agent reasoning traces) for the "entertainment" goal?

## How to run

```bash
npm install
npm run dev          # tsx watch; prints player/spectator/moderator tokens
# open the spectator URL printed in the console, or a player token to use the
# human control panel (click a unit, then click a tile to move it)
# in another shell, drive a player programmatically:
AI4X_TOKEN=<player-token> node examples/mcp-agent.mjs     # MCP
AI4X_TOKEN=<player-token> node examples/random-agent.mjs  # plain REST
```
