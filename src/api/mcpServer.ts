import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  type CallToolResult,
  SubscribeRequestSchema,
  UnsubscribeRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type { Engine } from '../game/engine.js';
import type { Principal } from '../auth/tokens.js';
import { STATE_URI, type McpSession } from './mcpSessions.js';

/**
 * Build an MCP server instance bound to a single authenticated player, plus the
 * {@link McpSession} the game loop uses to push notifications to it.
 *
 * Each MCP session gets its own server instance (and therefore its own player
 * binding), so tools and the state resource are implicitly scoped — an agent can
 * only ever see and command its own side. Everything delegates to the same
 * Engine methods the REST API uses, keeping one authoritative code path.
 */
export function createMcpServer(
  engine: Engine,
  principal: Principal,
): { server: McpServer; session: McpSession } {
  const playerId = principal.playerId;
  if (!playerId) throw new Error('createMcpServer requires a player principal');

  const server = new McpServer(
    { name: 'ai4x', version: '0.1.0' },
    {
      instructions:
        'You control one side in a real-time 4X game on an alien world. ' +
        'Read the ai4x://state resource (or call get_state) to see your ' +
        'fog-of-war view, then issue move_unit / stop_unit orders. The world ' +
        'keeps ticking between your calls — subscribe to ai4x://state to be ' +
        'notified when your visible state changes instead of polling.',
    },
  );

  const json = (obj: unknown): CallToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
  });

  // --- Tools ---------------------------------------------------------------

  server.tool(
    'get_state',
    'Return your fog-of-war-filtered view of the world: visible tiles, visible units, your resources, and the current tick.',
    {},
    async () => json(engine.viewFor(playerId)),
  );

  server.tool(
    'list_units',
    'List only the units you own, with their positions and current move targets.',
    {},
    async () => {
      const view = engine.viewFor(playerId);
      const units = view.units.filter((u) => u.ownerId === playerId);
      return json({ tick: view.tick, resources: view.you?.resources ?? 0, units });
    },
  );

  server.tool(
    'move_unit',
    'Order one of your units to move toward a target tile (x, y). The unit walks there over subsequent ticks.',
    { unitId: z.string(), x: z.number().int(), y: z.number().int() },
    async ({ unitId, x, y }) => json(engine.moveUnit(playerId, unitId, { x, y })),
  );

  server.tool(
    'stop_unit',
    'Cancel a unit’s current move order, leaving it where it is.',
    { unitId: z.string() },
    async ({ unitId }) => json(engine.stopUnit(playerId, unitId)),
  );

  // --- Subscribable state resource ----------------------------------------

  server.registerResource(
    'state',
    STATE_URI,
    {
      title: 'Your game view',
      description:
        'Fog-of-war-filtered snapshot for you. Subscribe to be notified when it changes.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        { uri: uri.href, mimeType: 'application/json', text: JSON.stringify(engine.viewFor(playerId)) },
      ],
    }),
  );

  // The high-level server advertises resources but not subscription support;
  // opt in so SDK clients are allowed to call resources/subscribe. Must run
  // before connect() (capabilities lock once a transport attaches).
  server.server.registerCapabilities({ resources: { subscribe: true } });

  // --- Session + subscription handlers ------------------------------------

  const session: McpSession = {
    playerId,
    subscriptions: new Set<string>(),
    lastSignature: '',
    async notifyUpdated(uri: string): Promise<void> {
      await server.server.sendResourceUpdated({ uri });
    },
  };

  server.server.setRequestHandler(SubscribeRequestSchema, async (request) => {
    session.subscriptions.add(request.params.uri);
    // Baseline the signature so the first notification fires only on real change.
    session.lastSignature = engine.viewSignature(playerId);
    return {};
  });

  server.server.setRequestHandler(UnsubscribeRequestSchema, async (request) => {
    session.subscriptions.delete(request.params.uri);
    return {};
  });

  return { server, session };
}
