/**
 * Central configuration for the AI4X POC server.
 * Values can be overridden via environment variables so the same build can be
 * run locally or hosted on the "interwebs".
 */
export interface Config {
  port: number;
  host: string;
  /** Tick interval in milliseconds — the game is real-time but purposely slow. */
  tickMs: number;
  map: {
    width: number;
    height: number;
    /** RNG seed so a match is reproducible (important for benchmarking). */
    seed: number;
  };
  /** How many player slots / tokens to mint at startup. */
  playerSlots: number;
  /** Vision radius (in tiles) granted by any unit or building. */
  visionRadius: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config: Config = {
  port: num('PORT', 3000),
  host: process.env.HOST ?? '0.0.0.0',
  tickMs: num('TICK_MS', 500),
  map: {
    width: num('MAP_WIDTH', 32),
    height: num('MAP_HEIGHT', 32),
    seed: num('MAP_SEED', 1337),
  },
  playerSlots: num('PLAYER_SLOTS', 4),
  visionRadius: num('VISION_RADIUS', 4),
};
