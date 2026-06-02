import type { Engine } from '../game/engine.js';
import type { PlayerId } from '../game/types.js';

/** The single subscribable resource: a player's fog-of-war game view. */
export const STATE_URI = 'ai4x://state';

/**
 * One live MCP connection, tracked so the game loop can push it
 * `notifications/resources/updated` when the player's visible state changes.
 */
export interface McpSession {
  readonly playerId: PlayerId;
  /** Resource URIs this client has subscribed to (`resources/subscribe`). */
  readonly subscriptions: Set<string>;
  /** Last seen signature of the player's view, so we only notify on change. */
  lastSignature: string;
  /** Send a `resources/updated` notification to this session's client. */
  notifyUpdated(uri: string): Promise<void>;
}

/**
 * Registry of active MCP sessions. The tick loop calls {@link notifyTick} after
 * each `engine.step()`; subscribers whose view changed get nudged to re-read the
 * state resource — so agents react to events instead of polling.
 */
export class McpSessionRegistry {
  private readonly sessions = new Set<McpSession>();

  add(session: McpSession): void {
    this.sessions.add(session);
  }

  remove(session: McpSession): void {
    this.sessions.delete(session);
  }

  get size(): number {
    return this.sessions.size;
  }

  /** After a tick, notify each subscriber whose visible state actually changed. */
  notifyTick(engine: Engine): void {
    for (const session of this.sessions) {
      if (!session.subscriptions.has(STATE_URI)) continue;
      const signature = engine.viewSignature(session.playerId);
      if (signature === session.lastSignature) continue;
      session.lastSignature = signature;
      // Fire and forget; a closed transport just rejects and is cleaned up
      // elsewhere via the transport's onclose handler.
      void session.notifyUpdated(STATE_URI).catch(() => {});
    }
  }
}
