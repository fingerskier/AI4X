import { nanoid } from 'nanoid';
import type { Config } from '../config.js';
import { Grid } from './grid.js';
import { key, visibleTilesFor } from './fog.js';
import type { EntityId, Player, PlayerId, StateView, Unit, UnitType, Vec2 } from './types.js';

export interface CommandResult {
  ok: boolean;
  error?: string;
}

/** Stats per unit type. Kept tiny for the POC; tune in a data file later. */
const UNIT_STATS: Record<UnitType, { hp: number; speed: number }> = {
  settler: { hp: 100, speed: 0.5 },
  scout: { hp: 40, speed: 1.5 },
  harvester: { hp: 60, speed: 0.75 },
};

/**
 * The authoritative game engine. Holds all state, advances it one tick at a
 * time, and answers fog-of-war-filtered queries. Transport (HTTP/WS/MCP) lives
 * outside this class so the engine stays headless and testable.
 */
export class Engine {
  readonly grid: Grid;
  private readonly config: Config;
  private readonly players = new Map<PlayerId, Player>();
  private readonly units = new Map<EntityId, Unit>();
  private tick = 0;

  private static readonly COLORS = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#42d4f4'];

  constructor(config: Config) {
    this.config = config;
    this.grid = new Grid(config.map.width, config.map.height, config.map.seed);
  }

  // --- Player lifecycle -----------------------------------------------------

  /** Register a player slot and place their starting settler. */
  addPlayer(id: PlayerId, name: string): Player {
    const color = Engine.COLORS[this.players.size % Engine.COLORS.length]!;
    const player: Player = { id, name, color, resources: 0, connected: false };
    this.players.set(id, player);
    this.spawnStartingUnits(player);
    return player;
  }

  setConnected(id: PlayerId, connected: boolean): void {
    const p = this.players.get(id);
    if (p) p.connected = connected;
  }

  /** Players spawn simultaneously around the map edges as settlers. */
  private spawnStartingUnits(player: Player): void {
    const slot = this.players.size - 1;
    const total = Math.max(this.config.playerSlots, this.players.size);
    const angle = (slot / total) * Math.PI * 2;
    const cx = this.grid.width / 2;
    const cy = this.grid.height / 2;
    const margin = Math.min(cx, cy) - 2;
    const preferred: Vec2 = {
      x: Math.round(cx + Math.cos(angle) * margin),
      y: Math.round(cy + Math.sin(angle) * margin),
    };
    const spawn = this.grid.findSpawn(preferred);
    this.createUnit(player.id, 'settler', spawn);
    this.createUnit(player.id, 'scout', this.grid.findSpawn({ x: spawn.x + 1, y: spawn.y }));
  }

  private createUnit(ownerId: PlayerId, type: UnitType, at: Vec2): Unit {
    const stats = UNIT_STATS[type];
    const unit: Unit = {
      id: nanoid(8),
      ownerId,
      type,
      x: at.x,
      y: at.y,
      hp: stats.hp,
      speed: stats.speed,
      target: null,
      moveProgress: 0,
    };
    this.units.set(unit.id, unit);
    return unit;
  }

  // --- Commands -------------------------------------------------------------

  /** Order one of the player's units to move toward a tile. */
  moveUnit(ownerId: PlayerId, unitId: EntityId, to: Vec2): CommandResult {
    const unit = this.units.get(unitId);
    if (!unit) return { ok: false, error: 'unknown unit' };
    if (unit.ownerId !== ownerId) return { ok: false, error: 'not your unit' };
    if (!this.grid.inBounds(to.x, to.y)) return { ok: false, error: 'out of bounds' };
    unit.target = { x: Math.round(to.x), y: Math.round(to.y) };
    return { ok: true };
  }

  // --- Simulation -----------------------------------------------------------

  /** Advance the world by one tick. Called by the server's game loop. */
  step(): void {
    this.tick++;
    for (const unit of this.units.values()) {
      this.stepMovement(unit);
      this.stepHarvest(unit);
    }
  }

  private stepMovement(unit: Unit): void {
    if (!unit.target) return;
    unit.moveProgress += unit.speed;
    while (unit.moveProgress >= 1 && unit.target) {
      unit.moveProgress -= 1;
      const dx = Math.sign(unit.target.x - unit.x);
      const dy = Math.sign(unit.target.y - unit.y);
      const nx = unit.x + dx;
      const ny = unit.y + dy;
      const tile = this.grid.at(nx, ny);
      if (!tile || tile.blocked) {
        unit.target = null; // give up if blocked — pathfinding is a TODO
        break;
      }
      unit.x = nx;
      unit.y = ny;
      if (unit.x === unit.target.x && unit.y === unit.target.y) unit.target = null;
    }
  }

  private stepHarvest(unit: Unit): void {
    if (unit.type !== 'harvester') return;
    const tile = this.grid.at(unit.x, unit.y);
    if (tile && tile.resources > 0) {
      const taken = Math.min(1, tile.resources);
      tile.resources -= taken;
      const player = this.players.get(unit.ownerId);
      if (player) player.resources += taken;
    }
  }

  // --- Queries --------------------------------------------------------------

  getTick(): number {
    return this.tick;
  }

  hasPlayer(id: PlayerId): boolean {
    return this.players.has(id);
  }

  /**
   * Build a state snapshot filtered for a viewer.
   * @param viewerId player id, or `null` for the all-seeing spectator view.
   */
  viewFor(viewerId: PlayerId | null): StateView {
    const isSpectator = viewerId === null;
    const visible = isSpectator
      ? null
      : visibleTilesFor(viewerId, this.units.values(), this.config.visionRadius);

    const tiles = this.grid.all().filter((t) => isSpectator || visible!.has(key(t.x, t.y)));
    const units = [...this.units.values()].filter(
      (u) => isSpectator || u.ownerId === viewerId || visible!.has(key(u.x, u.y)),
    );

    const players = [...this.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      connected: p.connected,
      // Resource totals are public to spectators (the scoreboard) but hidden
      // between competing players.
      resources: isSpectator ? p.resources : undefined,
    }));

    const you =
      viewerId && this.players.has(viewerId)
        ? { id: viewerId, resources: this.players.get(viewerId)!.resources }
        : undefined;

    return {
      tick: this.tick,
      width: this.grid.width,
      height: this.grid.height,
      tiles,
      units,
      players,
      you,
    };
  }
}
