import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import type { Config } from './config.js';
import { Engine } from './game/engine.js';
import { TokenRegistry } from './auth/tokens.js';
import { createApiRouter } from './api/routes.js';
import { createMcpRouter } from './api/mcp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface GameServer {
  start(): void;
  stop(): void;
  engine: Engine;
  tokens: TokenRegistry;
}

/**
 * Wires the headless Engine to its transports: a static map view, a REST/MCP
 * control API, a WebSocket broadcast of state, and the real-time tick loop.
 */
export function createServer(config: Config): GameServer {
  const engine = new Engine(config);
  const tokens = new TokenRegistry();

  const app = express();
  app.use(express.json());

  app.use('/api', createApiRouter(engine, tokens));
  app.use('/mcp', createMcpRouter(engine, tokens));

  // Static spectator/player map view.
  app.use('/', express.static(path.join(__dirname, 'view', 'public')));

  const httpServer = http.createServer(app);

  // WebSocket: push fog-of-war-filtered state on every tick. Clients connect
  // with ?token=... ; spectators omit it (or use a spectator token).
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const viewerOf = new WeakMap<WebSocket, string | null>();

  wss.on('connection', (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const principal = tokens.resolve(url.searchParams.get('token') ?? undefined);
    const viewerId = principal?.role === 'player' ? (principal.playerId ?? null) : null;
    if (principal?.role === 'player' && principal.playerId) {
      tokens.claim(principal.token);
      engine.setConnected(principal.playerId, true);
    }
    viewerOf.set(socket, viewerId);
    socket.send(JSON.stringify({ type: 'state', data: engine.viewFor(viewerId) }));
  });

  let timer: NodeJS.Timeout | null = null;

  function broadcast(): void {
    // Spectators all receive an identical payload, so build it once per tick
    // (see ADR 0001 — cheap mitigation for the "dozens of spectators" case).
    let spectatorPayload: string | null = null;
    for (const socket of wss.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const viewerId = viewerOf.get(socket) ?? null;
      if (viewerId === null) {
        spectatorPayload ??= JSON.stringify({ type: 'state', data: engine.viewFor(null) });
        socket.send(spectatorPayload);
      } else {
        socket.send(JSON.stringify({ type: 'state', data: engine.viewFor(viewerId) }));
      }
    }
  }

  return {
    engine,
    tokens,
    start(): void {
      timer = setInterval(() => {
        engine.step();
        broadcast();
      }, config.tickMs);

      httpServer.listen(config.port, config.host, () => {
        // eslint-disable-next-line no-console
        console.log(`AI4X server listening on http://${config.host}:${config.port}`);
      });
    },
    stop(): void {
      if (timer) clearInterval(timer);
      wss.close();
      httpServer.close();
    },
  };
}
