import { nanoid } from 'nanoid';
import type { PlayerId } from '../game/types.js';

export type Role = 'player' | 'spectator' | 'moderator';

export interface Principal {
  token: string;
  role: Role;
  /** Present for players; their engine player id. */
  playerId?: PlayerId;
  name: string;
  /** Once a player token is used, its channel is "claimed" and bound. */
  claimed: boolean;
}

/**
 * In-memory token registry. The README calls for a whitelist where the
 * moderator disseminates keys/tokens and each player's channel is secured once
 * connected. A real deployment would persist this and rotate secrets — see
 * TODO.md.
 */
export class TokenRegistry {
  private readonly byToken = new Map<string, Principal>();

  /** Mint a player slot token. The caller hands this to one AI agent / human. */
  mintPlayer(name: string, playerId: PlayerId): Principal {
    const principal: Principal = {
      token: nanoid(24),
      role: 'player',
      playerId,
      name,
      claimed: false,
    };
    this.byToken.set(principal.token, principal);
    return principal;
  }

  mintSpectator(name = 'spectator'): Principal {
    const principal: Principal = { token: nanoid(24), role: 'spectator', name, claimed: false };
    this.byToken.set(principal.token, principal);
    return principal;
  }

  mintModerator(name = 'moderator'): Principal {
    const principal: Principal = { token: nanoid(24), role: 'moderator', name, claimed: false };
    this.byToken.set(principal.token, principal);
    return principal;
  }

  resolve(token: string | undefined): Principal | undefined {
    if (!token) return undefined;
    return this.byToken.get(token);
  }

  /**
   * Claim a player channel. Returns false if already claimed by a prior
   * connection (the channel is secured — no one else can use it).
   */
  claim(token: string): boolean {
    const p = this.byToken.get(token);
    if (!p || p.role !== 'player') return false;
    if (p.claimed) return false;
    p.claimed = true;
    return true;
  }

  all(): Principal[] {
    return [...this.byToken.values()];
  }
}
