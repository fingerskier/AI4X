import { config } from './config.js';
import { createServer } from './server.js';

/**
 * Entry point. Boots a single match: mints player + spectator + moderator
 * tokens, seats the players, and starts the real-time loop. Tokens are printed
 * to the console for the moderator to disseminate (POC convenience).
 */
function main(): void {
  const server = createServer(config);
  const { engine, tokens } = server;

  // Seat the configured number of players and mint their channel tokens.
  const minted: string[] = [];
  for (let i = 0; i < config.playerSlots; i++) {
    const playerId = `p${i + 1}`;
    engine.addPlayer(playerId, `Player ${i + 1}`);
    const principal = tokens.mintPlayer(`Player ${i + 1}`, playerId);
    minted.push(`  ${playerId}  player      ${principal.token}`);
  }
  const spectator = tokens.mintSpectator();
  const moderator = tokens.mintModerator();

  server.start();

  /* eslint-disable no-console */
  console.log('\n=== AI4X match tokens (disseminate to participants) ===');
  console.log('  id   role        token');
  console.log(minted.join('\n'));
  console.log(`       spectator   ${spectator.token}`);
  console.log(`       moderator   ${moderator.token}`);
  console.log('\nSpectator view:  http://localhost:%d/?token=%s', config.port, spectator.token);
  console.log('Player view:     http://localhost:%d/?token=<player-token>', config.port);
  console.log('MCP manifest:    http://localhost:%d/mcp/manifest\n', config.port);
  /* eslint-enable no-console */

  const shutdown = (): void => {
    console.log('\nShutting down…');
    server.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main();
