# ADR 0001 — Server framework: Express + `ws` (not Colyseus)

- **Status:** Accepted (2026-06-02)
- **Context scale:** 2–12 players, potentially dozens of spectators, a small
  number of concurrent matches.

## Decision

Build the server on **Express + `ws`**. Do not adopt Colyseus (for now).

## Why

1. **Fog of war defeats Colyseus's main advantage.** Colyseus's headline feature
   is one authoritative room state that is automatically synchronised to every
   client in the room via binary deltas. But in AI4X every viewer must receive a
   *different* snapshot — each player sees only their own territory, spectators
   see all. Per-client filtering is possible in Colyseus (`@filter`), but it
   works against the grain of the framework. We already compute per-viewer
   snapshots in the headless engine, so the "free" state sync buys us little.

2. **MCP needs plain HTTP routes.** The agent control surface is MCP over
   Streamable HTTP + legacy SSE — ordinary HTTP endpoints. Express hosts these
   directly. With Colyseus you typically attach Express anyway for HTTP, so we'd
   run both and add a dependency for no net gain.

3. **The scale is modest.** Dozens of connections and a few matches sit
   comfortably in a single Express + `ws` process. Colyseus's real strength is
   horizontal scaling to *thousands* of rooms with matchmaking and presence —
   not our regime.

4. **Agent-agnostic access.** Agents (claude / codex / gemini / grok / qwen /
   vibe) talk MCP / HTTP / WebSocket, not a Colyseus client SDK. Staying on
   standard protocols keeps adapters trivial.

## Consequences

- We hand-roll the WebSocket state broadcast (done) and, when needed, will
  hand-roll **reconnection** and **delta encoding** rather than getting them for
  free. Both are tracked in `TODO.md`.
- Spectators all receive an identical payload, so the server computes the
  spectator snapshot once per tick and reuses it — cheap mitigation for the
  "dozens of spectators" case.

## Revisit if…

- We pivot to many concurrent **public** matches needing matchmaking, lobbies,
  and presence, or
- Spectator counts reach the thousands and delta-synced binary state becomes
  worth the framework switch.
