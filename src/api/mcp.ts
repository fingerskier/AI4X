import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Engine } from '../game/engine.js';
import type { Principal, TokenRegistry } from '../auth/tokens.js';
import { createMcpServer } from './mcpServer.js';

/**
 * MCP adapter. Exposes the agent control surface over two transports:
 *
 *   - Streamable HTTP at  POST/GET/DELETE /mcp   (current MCP standard)
 *   - Legacy HTTP+SSE at  GET /mcp/sse + POST /mcp/messages   (older clients)
 *
 * Both bind an MCP session to a player via their bearer token, then delegate to
 * the same Engine methods as the REST API (see src/api/mcpServer.ts).
 *
 * A static `/mcp/manifest` documents the tool contract for adapter authors.
 */
export interface McpToolSpec {
  name: string;
  description: string;
  input: Record<string, string>;
  restEquivalent: string;
}

export const MCP_TOOLS: McpToolSpec[] = [
  {
    name: 'get_state',
    description: 'Your fog-of-war view: visible tiles, visible units, your resources, current tick.',
    input: {},
    restEquivalent: 'GET /api/state',
  },
  {
    name: 'list_units',
    description: 'Only the units you own, with positions and move targets.',
    input: {},
    restEquivalent: 'GET /api/state (units where ownerId === you)',
  },
  {
    name: 'move_unit',
    description: 'Order one of your units to move toward a target tile.',
    input: { unitId: 'string', x: 'number', y: 'number' },
    restEquivalent: 'POST /api/command { action: "move", unitId, to: {x, y} }',
  },
  {
    name: 'stop_unit',
    description: 'Cancel a unit’s current move order.',
    input: { unitId: 'string' },
    restEquivalent: 'POST /api/command { action: "stop", unitId }',
  },
];

/** Pull a bearer token from the Authorization header or `?token=` query. */
function bearer(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  const q = req.query.token;
  return typeof q === 'string' ? q : undefined;
}

/** Resolve a player principal or write a JSON-RPC error and return undefined. */
function requirePlayer(
  tokens: TokenRegistry,
  engine: Engine,
  req: Request,
  res: Response,
): Principal | undefined {
  const principal = tokens.resolve(bearer(req));
  if (!principal || principal.role !== 'player' || !principal.playerId) {
    res.status(401).json({
      jsonrpc: '2.0',
      error: { code: -32001, message: 'Provide a valid player bearer token.' },
      id: null,
    });
    return undefined;
  }
  tokens.claim(principal.token);
  engine.setConnected(principal.playerId, true);
  return principal;
}

export function createMcpRouter(engine: Engine, tokens: TokenRegistry): Router {
  const router = Router();

  router.get('/manifest', (_req, res) => {
    res.json({
      protocol: 'mcp',
      transports: {
        streamableHttp: { endpoint: '/mcp', methods: ['POST', 'GET', 'DELETE'] },
        legacySse: { sse: 'GET /mcp/sse', messages: 'POST /mcp/messages' },
      },
      auth: 'Send a player token via Authorization: Bearer <token> on connect.',
      tools: MCP_TOOLS,
    });
  });

  // --- Streamable HTTP transport (recommended) ----------------------------
  const streamables = new Map<string, StreamableHTTPServerTransport>();

  router.post('/', async (req, res) => {
    const sessionId = req.header('mcp-session-id');
    let transport = sessionId ? streamables.get(sessionId) : undefined;

    if (!transport) {
      // A brand-new connection must begin with an `initialize` request.
      if (sessionId || !isInitializeRequest(req.body)) {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'No valid session: send an initialize request first.' },
          id: null,
        });
        return;
      }
      const principal = requirePlayer(tokens, engine, req, res);
      if (!principal) return;

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          streamables.set(sid, transport!);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) streamables.delete(transport!.sessionId);
      };
      await createMcpServer(engine, principal).connect(transport);
    }

    await transport.handleRequest(req, res, req.body);
  });

  const replayStreamable = async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.header('mcp-session-id');
    const transport = sessionId ? streamables.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send('Unknown or missing mcp-session-id');
      return;
    }
    await transport.handleRequest(req, res);
  };
  router.get('/', replayStreamable); // server→client SSE stream
  router.delete('/', replayStreamable); // explicit session teardown

  // --- Legacy HTTP+SSE transport (older MCP clients) ----------------------
  const sseTransports = new Map<string, SSEServerTransport>();

  router.get('/sse', async (req, res) => {
    const principal = requirePlayer(tokens, engine, req, res);
    if (!principal) return;
    const transport = new SSEServerTransport('/mcp/messages', res);
    sseTransports.set(transport.sessionId, transport);
    res.on('close', () => sseTransports.delete(transport.sessionId));
    await createMcpServer(engine, principal).connect(transport);
  });

  router.post('/messages', async (req, res) => {
    const sessionId = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
    const transport = sessionId ? sseTransports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send('No active SSE session for that sessionId');
      return;
    }
    await transport.handlePostMessage(req, res, req.body);
  });

  return router;
}
