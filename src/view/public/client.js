// Minimal vanilla client: subscribe to the WebSocket state stream and draw the
// fog-of-war-filtered map onto a canvas. No build step, no framework.

const TERRAIN_COLORS = {
  plains: '#3a4a2a',
  forest: '#1f3d1f',
  mountain: '#5a5a5a',
  water: '#1b3a5c',
  ruins: '#7a5cff',
};

const params = new URLSearchParams(location.search);
const token = params.get('token');

const canvas = document.getElementById('map');
const ctx = canvas.getContext('2d');
const roleEl = document.getElementById('role');
const tickEl = document.getElementById('tick');
const playersEl = document.getElementById('players');
const unitsEl = document.getElementById('units');

let me = null; // our playerId, if any
let playersById = new Map();

function connect() {
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  const qs = token ? `?token=${encodeURIComponent(token)}` : '';
  const ws = new WebSocket(`${wsProto}://${location.host}/ws${qs}`);
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === 'state') render(msg.data);
  };
  ws.onclose = () => setTimeout(connect, 1000);
}

function render(state) {
  me = state.you ? state.you.id : null;
  roleEl.textContent = me ? `player ${me}` : 'spectator';
  tickEl.textContent = `tick ${state.tick}`;

  playersById = new Map(state.players.map((p) => [p.id, p]));

  const cell = Math.floor(canvas.width / Math.max(state.width, state.height));

  // Fog: fill black, then paint only visible tiles.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const t of state.tiles) {
    ctx.fillStyle = TERRAIN_COLORS[t.terrain] ?? '#222';
    ctx.fillRect(t.x * cell, t.y * cell, cell, cell);
    if (t.terrain === 'ruins' && t.resources > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(t.x * cell + cell * 0.35, t.y * cell + cell * 0.35, cell * 0.3, cell * 0.3);
    }
  }

  for (const u of state.units) {
    const color = playersById.get(u.ownerId)?.color ?? '#fff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(u.x * cell + cell / 2, u.y * cell + cell / 2, Math.max(2, cell * 0.35), 0, Math.PI * 2);
    ctx.fill();
    if (u.ownerId === me) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  renderPlayers(state);
  renderUnits(state);
}

function renderPlayers(state) {
  playersEl.innerHTML = '';
  for (const p of state.players) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = p.color;
    li.append(sw);
    const score = p.resources !== undefined ? ` — ${p.resources}` : '';
    li.append(`${p.name}${p.connected ? '' : ' (offline)'}${score}`);
    playersEl.append(li);
  }
}

function renderUnits(state) {
  unitsEl.innerHTML = '';
  const mine = state.units.filter((u) => u.ownerId === me);
  if (!mine.length) {
    unitsEl.innerHTML = '<li class="hint">— (spectator or no units in view) —</li>';
    return;
  }
  for (const u of mine) {
    const li = document.createElement('li');
    li.textContent = `${u.type} ${u.id} @ (${u.x},${u.y}) hp ${u.hp}${
      u.target ? ` → (${u.target.x},${u.target.y})` : ''
    }`;
    unitsEl.append(li);
  }
}

connect();
