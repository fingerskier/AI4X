import { Router } from 'express';

/**
 * MCP adapter (stub).
 *
 * The README's core idea is that agents control the game over MCP. A full
 * implementation would spin up an MCP server (stdio or streamable-HTTP) using
 * `@modelcontextprotocol/sdk` and expose the tools below, each delegating to the
 * same Engine methods the REST API uses.
 *
 * For the POC we publish a machine-readable manifest at `/mcp/manifest` so
 * adapter authors (claude / codex / gemini / grok / qwen / vibe) know the exact
 * tool contract before the transport is wired up. See TODO.md.
 */
export interface McpToolSpec {
  name: string;
  description: string;
  /** JSON-schema-ish input description, intentionally loose for the POC. */
  input: Record<string, string>;
  /** The REST endpoint this tool maps onto. */
  restEquivalent: string;
}

export const MCP_TOOLS: McpToolSpec[] = [
  {
    name: 'get_state',
    description:
      'Return the fog-of-war-filtered view of the world for the authenticated player: visible tiles, visible units, and your resources.',
    input: {},
    restEquivalent: 'GET /api/state',
  },
  {
    name: 'list_units',
    description: 'Convenience filter of get_state returning only units you own.',
    input: {},
    restEquivalent: 'GET /api/state (units where ownerId === you)',
  },
  {
    name: 'move_unit',
    description: 'Order one of your units to move toward a target tile.',
    input: { unitId: 'string', x: 'number', y: 'number' },
    restEquivalent: 'POST /api/command { action: "move", unitId, to: {x, y} }',
  },
];

export function createMcpRouter(): Router {
  const router = Router();
  router.get('/manifest', (_req, res) => {
    res.json({
      protocol: 'mcp',
      status: 'stub',
      note: 'Transport not yet implemented; tools map onto the REST API. See TODO.md.',
      tools: MCP_TOOLS,
    });
  });
  return router;
}
