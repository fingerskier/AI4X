import { Router, type Request, type Response, type NextFunction } from 'express';
import type { Engine } from '../game/engine.js';
import type { Principal, TokenRegistry } from '../auth/tokens.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

/** Pull a bearer token from the Authorization header or `?token=` query. */
function extractToken(req: Request): string | undefined {
  const header = req.header('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  const q = req.query.token;
  return typeof q === 'string' ? q : undefined;
}

/**
 * REST API for agents and humans. This is the "remote-control" surface; the MCP
 * adapter (see src/api/mcp.ts) is a thin wrapper over these same engine calls.
 */
export function createApiRouter(engine: Engine, tokens: TokenRegistry): Router {
  const router = Router();

  const authenticate = (req: Request, res: Response, next: NextFunction): void => {
    const principal = tokens.resolve(extractToken(req));
    if (!principal) {
      res.status(401).json({ error: 'invalid or missing token' });
      return;
    }
    req.principal = principal;
    next();
  };

  // Who am I / what can I do.
  router.get('/me', authenticate, (req, res) => {
    const p = req.principal!;
    res.json({ role: p.role, name: p.name, playerId: p.playerId ?? null });
  });

  // Fog-of-war-filtered world snapshot.
  router.get('/state', authenticate, (req, res) => {
    const p = req.principal!;
    const viewerId = p.role === 'player' ? (p.playerId ?? null) : null;
    if (p.role === 'player' && viewerId) tokens.claim(p.token);
    res.json(engine.viewFor(viewerId));
  });

  // Issue a command. Body: { unitId, action, ...args }
  router.post('/command', authenticate, (req, res) => {
    const p = req.principal!;
    if (p.role !== 'player' || !p.playerId) {
      res.status(403).json({ error: 'only players can issue commands' });
      return;
    }
    tokens.claim(p.token);

    const { action, unitId, to } = req.body ?? {};
    switch (action) {
      case 'move': {
        if (typeof unitId !== 'string' || !to || typeof to.x !== 'number' || typeof to.y !== 'number') {
          res.status(400).json({ error: 'move requires { unitId, to: {x, y} }' });
          return;
        }
        const result = engine.moveUnit(p.playerId, unitId, to);
        res.status(result.ok ? 200 : 400).json(result);
        return;
      }
      case 'stop': {
        if (typeof unitId !== 'string') {
          res.status(400).json({ error: 'stop requires { unitId }' });
          return;
        }
        const result = engine.stopUnit(p.playerId, unitId);
        res.status(result.ok ? 200 : 400).json(result);
        return;
      }
      default:
        res.status(400).json({ error: `unknown action: ${action}` });
    }
  });

  return router;
}
