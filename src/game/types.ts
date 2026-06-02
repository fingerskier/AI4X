/** Shared domain types for the AI4X engine. */

export type EntityId = string;
export type PlayerId = string;

export type TerrainType =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'water'
  | 'ruins'; // ancient alien tech to harvest

export interface Tile {
  x: number;
  y: number;
  terrain: TerrainType;
  /** Harvestable resources remaining on this tile (0 for most terrain). */
  resources: number;
  /** True if a unit cannot enter (e.g. water, mountain). */
  blocked: boolean;
}

export type UnitType = 'settler' | 'scout' | 'harvester';

export interface Unit {
  id: EntityId;
  ownerId: PlayerId;
  type: UnitType;
  x: number;
  y: number;
  hp: number;
  /** Tiles moved per tick. */
  speed: number;
  /** Pending movement target; null when idle. */
  target: { x: number; y: number } | null;
  /** Accumulator so fractional speeds move over multiple ticks. */
  moveProgress: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  /** Display colour used by the map view. */
  color: string;
  /** Resources banked by harvesting. */
  resources: number;
  connected: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

/** A snapshot of game state, already filtered for a given viewer's fog of war. */
export interface StateView {
  tick: number;
  width: number;
  height: number;
  /** Tiles the viewer can currently see. Omitted tiles are under fog. */
  tiles: Tile[];
  /** Units the viewer can currently see (always includes own units). */
  units: Unit[];
  players: Array<Pick<Player, 'id' | 'name' | 'color' | 'connected'> & { resources?: number }>;
  /** The viewer's own resources, or undefined for spectators. */
  you?: { id: PlayerId; resources: number };
}
