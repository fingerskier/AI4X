# AI4X — TODO & open questions

This file tracks next steps for the POC and the design questions that need
answers before the project hardens. The POC (this commit) proves the core loop:
a headless engine, fog-of-war views, token-secured channels, a REST/WS control
surface, an MCP manifest stub, and a canvas spectator/player view.

## What the POC already does

- [x] Deterministic, seeded map generation (terrain + harvestable ruins).
- [x] Real-time tick loop (configurable cadence).
- [x] Players seated simultaneously around the map; settler + scout per player.
- [x] Unit movement orders; harvester resource collection.
- [x] Fog of war per player; all-seeing spectator view.
- [x] Whitelist token auth (player / spectator / moderator) with channel claim.
- [x] REST API (`/api/me`, `/api/state`, `/api/command`).
- [x] WebSocket state broadcast on every tick.
- [x] Static canvas map view with fog rendering.
- [x] MCP tool manifest (`/mcp/manifest`) — contract published, transport TBD.
- [x] Reference `random-agent` adapter over HTTP.
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
- [ ] **Real MCP server** — implement with `@modelcontextprotocol/sdk`
      (streamable-HTTP), exposing the tools in `src/api/mcp.ts`, each bound to a
      player token. Replace the manifest stub.
- [ ] **Per-agent adapter skills** — claude / codex / gemini / grok / qwen /
      vibe. Start from `examples/random-agent.mjs`.
- [ ] **Human control panel** — buttons/forms in the view for the listed I/O
      (inspect land/units, command units) when a player token is present.
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

1. **Framework**: README floats Express / Fastify / Colyseus. POC uses Express +
   `ws`. Colyseus gives rooms/state-sync out of the box and suits real-time
   multiplayer — switch before the netcode grows, or stay lean? 
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
# open the spectator URL printed in the console
# in another shell, drive a player:
AI4X_TOKEN=<player-token> node examples/random-agent.mjs
```
