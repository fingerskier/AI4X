// Vanilla client: subscribe to the WebSocket state stream, draw the
// fog-of-war-filtered map, and — when a player token is present — act as a
// human control panel (select a unit, click a tile to command it). No build
// step, no framework.

const TERRAIN = {
  plains: { color: '#3a4a2a', label: 'Plains' },
  forest: { color: '#1f3d1f', label: 'Forest' },
  mountain: { color: '#5a5a5a', label: 'Mountain (impassable)' },
  water: { color: '#1b3a5c', label: 'Water (impassable)' },
  ruins: { color: '#7a5cff', label: 'Ancient ruins (harvestable)' },
};

const params = new URLSearchParams(location.search);
const token = params.get('token');

const el = (id) => document.getElementById(id);
const canvas = el('map');
const ctx = canvas.getContext('2d');

let me = null; // our playerId, if any
let playersById = new Map();
let lastState = null; // most recent snapshot, for re-rendering on selection
let cellSize = 16; // px per tile, recomputed each render
let selectedUnitId = null;

// --- Networking -----------------------------------------------------------

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

async function sendCommand(body) {
  if (!token) return { ok: false, error: 'no token' };
  const res = await fetch('/api/command', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: res.ok }));
}

function log(message) {
  const li = document.createElement('li');
  const t = lastState ? `t${lastState.tick} ` : '';
  li.textContent = t + message;
  el('log').prepend(li);
  while (el('log').children.length > 30) el('log').lastChild.remove();
}

// --- Rendering ------------------------------------------------------------

function render(state) {
  lastState = state;
  me = state.you ? state.you.id : null;
  el('role').textContent = me ? `player ${me}` : 'spectator';
  el('tick').textContent = `tick ${state.tick}`;

  const res = el('resources');
  if (state.you) {
    res.hidden = false;
    res.textContent = `resources ${state.you.resources}`;
  } else {
    res.hidden = true;
  }

  el('panel').hidden = !me;
  el('spectatorNote').hidden = !!me;

  playersById = new Map(state.players.map((p) => [p.id, p]));
  cellSize = Math.floor(canvas.width / Math.max(state.width, state.height));

  drawMap(state);
  renderPlayers(state);
  renderUnits(state);
}

function drawMap(state) {
  const cell = cellSize;
  ctx.fillStyle = '#000'; // fog
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const t of state.tiles) {
    ctx.fillStyle = TERRAIN[t.terrain]?.color ?? '#222';
    ctx.fillRect(t.x * cell, t.y * cell, cell, cell);
    if (t.terrain === 'ruins' && t.resources > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(t.x * cell + cell * 0.35, t.y * cell + cell * 0.35, cell * 0.3, cell * 0.3);
    }
  }

  for (const u of state.units) {
    const color = playersById.get(u.ownerId)?.color ?? '#fff';
    const cx = u.x * cell + cell / 2;
    const cy = u.y * cell + cell / 2;

    if (u.id === selectedUnitId) {
      ctx.strokeStyle = '#ffd000';
      ctx.lineWidth = 2;
      ctx.strokeRect(u.x * cell + 1, u.y * cell + 1, cell - 2, cell - 2);
    }

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(2, cell * 0.35), 0, Math.PI * 2);
    ctx.fill();
    if (u.ownerId === me) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

function renderPlayers(state) {
  const ul = el('players');
  ul.innerHTML = '';
  for (const p of state.players) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = p.color;
    li.append(sw);
    const score = p.resources !== undefined ? ` — ${p.resources}` : '';
    li.append(`${p.name}${p.connected ? '' : ' (offline)'}${score}`);
    ul.append(li);
  }
}

function renderUnits(state) {
  const ul = el('units');
  ul.innerHTML = '';
  const mine = state.units.filter((u) => u.ownerId === me);
  if (!mine.length) {
    ul.innerHTML = '<li class="hint">— no units —</li>';
    return;
  }
  for (const u of mine) {
    const li = document.createElement('li');
    li.dataset.unit = u.id;
    if (u.id === selectedUnitId) li.classList.add('active');
    const target = u.target ? ` → (${u.target.x},${u.target.y})` : '';
    li.textContent = `${u.type} @ (${u.x},${u.y}) hp ${u.hp}${target}`;
    li.addEventListener('click', () => select(u.id));
    ul.append(li);
  }
}

function renderLegend() {
  const ul = el('legend');
  ul.innerHTML = '';
  for (const { color, label } of Object.values(TERRAIN)) {
    const li = document.createElement('li');
    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = color;
    li.append(sw, label);
    ul.append(li);
  }
}

// --- Interaction (control panel) -----------------------------------------

function select(unitId) {
  selectedUnitId = unitId;
  const u = lastState?.units.find((x) => x.id === unitId);
  el('selected').textContent = u
    ? `Selected ${u.type} @ (${u.x},${u.y}) — click a tile to move.`
    : 'No unit selected.';
  el('stopBtn').disabled = !u;
  if (lastState) render(lastState);
}

function tileAt(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const px = (clientX - rect.left) * (canvas.width / rect.width);
  const py = (clientY - rect.top) * (canvas.height / rect.height);
  return { x: Math.floor(px / cellSize), y: Math.floor(py / cellSize) };
}

canvas.addEventListener('click', async (e) => {
  if (!lastState) return;
  const { x, y } = tileAt(e.clientX, e.clientY);

  // Inspect the tile (works for spectators too).
  const tile = lastState.tiles.find((t) => t.x === x && t.y === y);
  el('tileinfo').textContent = tile
    ? `(${x},${y}) ${TERRAIN[tile.terrain]?.label ?? tile.terrain}` +
      (tile.resources ? ` — ${tile.resources} resources` : '')
    : `(${x},${y}) — under fog`;

  if (!me) return; // spectators can look but not touch

  // Clicking one of your own units selects it; otherwise move the selection.
  const ownHere = lastState.units.find((u) => u.ownerId === me && u.x === x && u.y === y);
  if (ownHere) {
    select(ownHere.id);
    return;
  }
  if (!selectedUnitId) return;
  const result = await sendCommand({ action: 'move', unitId: selectedUnitId, to: { x, y } });
  log(result.ok ? `move → (${x},${y})` : `move rejected: ${result.error}`);
});

el('stopBtn').addEventListener('click', async () => {
  if (!selectedUnitId) return;
  const result = await sendCommand({ action: 'stop', unitId: selectedUnitId });
  log(result.ok ? 'stop' : `stop rejected: ${result.error}`);
});

renderLegend();
connect();
