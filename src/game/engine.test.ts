import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Engine } from './engine.js';
import type { Config } from '../config.js';

const config: Config = {
  port: 0,
  host: '127.0.0.1',
  tickMs: 1,
  map: { width: 16, height: 16, seed: 1 },
  playerSlots: 2,
  visionRadius: 3,
};

function freshEngine(): Engine {
  const engine = new Engine(config);
  engine.addPlayer('p1', 'Player 1');
  engine.addPlayer('p2', 'Player 2');
  return engine;
}

test('map generation is deterministic for a given seed', () => {
  const a = new Engine(config).grid.all().map((t) => t.terrain);
  const b = new Engine(config).grid.all().map((t) => t.terrain);
  assert.deepEqual(a, b);
});

test('players spawn with starting units', () => {
  const engine = freshEngine();
  const view = engine.viewFor(null); // spectator
  const p1Units = view.units.filter((u) => u.ownerId === 'p1');
  assert.ok(p1Units.length >= 1, 'p1 should have at least one unit');
});

test('fog of war hides distant tiles from players but not spectators', () => {
  const engine = freshEngine();
  const spectator = engine.viewFor(null);
  const player = engine.viewFor('p1');
  assert.equal(spectator.tiles.length, 16 * 16, 'spectator sees the whole map');
  assert.ok(player.tiles.length < spectator.tiles.length, 'player sees less than spectator');
});

test('a player cannot move another player’s unit', () => {
  const engine = freshEngine();
  const p2Unit = engine.viewFor(null).units.find((u) => u.ownerId === 'p2')!;
  const result = engine.moveUnit('p1', p2Unit.id, { x: 0, y: 0 });
  assert.equal(result.ok, false);
});

test('a unit advances toward its move target over ticks', () => {
  const engine = freshEngine();
  const unit = engine.viewFor('p1').units.find((u) => u.ownerId === 'p1' && u.type === 'scout')!;
  const start = { x: unit.x, y: unit.y };
  // Pick an in-bounds target a few tiles away.
  const target = { x: Math.min(start.x + 3, 15), y: start.y };
  assert.equal(engine.moveUnit('p1', unit.id, target).ok, true);
  for (let i = 0; i < 20; i++) engine.step();
  const moved = engine.viewFor('p1').units.find((u) => u.id === unit.id)!;
  assert.notDeepEqual({ x: moved.x, y: moved.y }, start, 'unit should have moved');
});
