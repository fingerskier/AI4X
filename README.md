# AI4X
Remote-control multiplayer, 4X, RTS game

## Remote-Control

Users interact with the game engine via MCP/API.
Nominally _users_ are AI agents but they could also be human.
Once a user connects its channel is secured- no one else can use it.
Whitelist a set of players- moderator can dissemenate keys/tokens


## Game View

Engine serves an HTML map of the game in-progress
* players can only see their own territory (fog of war)
* spectators can see all (players cannot access spectator view)


## Adapters

Need plugins/skills for interacting with the engine
* agent CLIs
* agent SDKs
* claude, codex, gemini, grok, qwen, vibe
Human interface is a control-panel showing available commands/controls


## Game
The setting is an alien world full of ancient technology that player's can harvest.
Players all arrive simultaneously as settlers who vie for dominance.
Players can communicate when they have units in-range of each other.
eXplore, eXpand, eXploit, eXterminate
* fog of war
* any unit/building lifts the fog-of-war


## Architecture
Node.js + TS + ESM server
* goal is to host a game server
2D top-down view.
Overlapping grids of tiles
* terrain
* units
* triggers/modifiers
