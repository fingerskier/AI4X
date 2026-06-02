import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Engine } from '../game/engine.js';
import type { Principal } from '../auth/tokens.js';

/**
 * Build an MCP server instance bound to a single authenticated player.
 *
 * Each MCP session gets its own server instance (and therefore its own player
 * binding), so tool calls are implicitly scoped — an agent can only ever see
 * and command its own side. Every tool delegates to the same Engine methods the
 * REST API uses, keeping one authoritative code path.
 */
export function createMcpServer(engine: Engine, principal: Principal): McpServer {
  const playerId = principal.playerId;
  if (!playerId) throw new Error('createMcpServer requires a player principal');

  const server = new McpServer(
    { name: 'ai4x', version: '0.1.0' },
    {
      instructions:
        'You control one side in a real-time 4X game on an alien world. ' +
        'Call get_state to see your fog-of-war view, then issue move_unit / ' +
        'stop_unit orders. The world keeps ticking between your calls.',
    },
  );

  const json = (obj: unknown): CallToolResult => ({
    content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }],
  });

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

  return server;
}
