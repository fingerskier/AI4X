import type { PlayerId, Unit, Vec2 } from './types.js';

/**
 * Fog of war: any unit (and, later, any building) lifts the fog within a radius.
 * We use Chebyshev distance (square vision) for simplicity in this POC.
 */
export function visibleTilesFor(
  ownerId: PlayerId,
  units: Iterable<Unit>,
  radius: number,
): Set<string> {
  const visible = new Set<string>();
  for (const unit of units) {
    if (unit.ownerId !== ownerId) continue;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        visible.add(key(unit.x + dx, unit.y + dy));
      }
    }
  }
  return visible;
}

export function key(x: number, y: number): string {
  return `${x},${y}`;
}

export function keyOf(v: Vec2): string {
  return key(v.x, v.y);
}
