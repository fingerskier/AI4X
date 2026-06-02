import type { Tile, TerrainType, Vec2 } from './types.js';
import { mulberry32 } from './rng.js';

/**
 * A 2D grid of terrain tiles. The README calls for "overlapping grids of tiles"
 * (terrain / units / triggers). This POC models terrain here; units live in the
 * engine and triggers/modifiers are a future layer (see TODO.md).
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly tiles: Tile[];

  constructor(width: number, height: number, seed: number) {
    this.width = width;
    this.height = height;
    this.tiles = new Array(width * height);
    this.generate(seed);
  }

  private idx(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  at(x: number, y: number): Tile | undefined {
    if (!this.inBounds(x, y)) return undefined;
    return this.tiles[this.idx(x, y)];
  }

  all(): Tile[] {
    return this.tiles;
  }

  /** Procedurally fill the grid using a seeded RNG. */
  private generate(seed: number): void {
    const rng = mulberry32(seed);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const r = rng();
        let terrain: TerrainType;
        if (r < 0.08) terrain = 'water';
        else if (r < 0.16) terrain = 'mountain';
        else if (r < 0.34) terrain = 'forest';
        else if (r < 0.38) terrain = 'ruins';
        else terrain = 'plains';

        const blocked = terrain === 'water' || terrain === 'mountain';
        const resources =
          terrain === 'ruins' ? 50 + Math.floor(rng() * 150) : terrain === 'forest' ? 20 : 0;

        this.tiles[this.idx(x, y)] = { x, y, terrain, resources, blocked };
      }
    }
  }

  /** Find a passable tile near a preferred spawn point (spiral search). */
  findSpawn(preferred: Vec2): Vec2 {
    for (let radius = 0; radius < Math.max(this.width, this.height); radius++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const x = preferred.x + dx;
          const y = preferred.y + dy;
          const tile = this.at(x, y);
          if (tile && !tile.blocked) return { x, y };
        }
      }
    }
    return { x: 0, y: 0 };
  }
}
