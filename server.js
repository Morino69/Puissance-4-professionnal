const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const page = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(page);
});
const wss = new WebSocketServer({ server });

const R = 6, C = 7;
const EMOJIS = ['😀', '😂', '😮', '😡', '👏', '🤝'];
let waiting = null;

const send = (w, o) => w && w.readyState === 1 && w.send(JSON.stringify(o));

function isWin(b, r, c, p) {
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let y = r + dr * s, x = c + dc * s;
      while (y >= 0 && y < R && x >= 0 && x < C && b[y][x] === p) {
        n++; y += dr * s; x += dc * s;
      }
    }
    if (n >= 4) return true;
  }
  return false;
}

function start(a, b) {
  const g = { b: Array.from({ length: R }, () => Array(C).fill(-1)), p: [a, b], turn: 0, over: false, moves: 0 };
  a.game = b.game = g; a.me = 0; b.me = 1;
  send(a, { t: 'start', me: 0, opp: b.name, turn: 0 });
  send(b, { t: 'start', me: 1, opp: a.name, turn: 0 });
}

function leave(ws) {
  if (waiting === ws) waiting = null;
  const g = ws.game;
  if (g) {
    const opp = g.p[1 - ws.me];
    if (!g.over) { g.over = true; send(opp, { t: 'end', winner: opp.me, reason: 'left' }); }
    opp.game = null; ws.game = null;
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }

    if (m.t === 'join') {
      leave(ws);
      ws.name = String(m.name || '').trim().slice(0, 16) || 'Joueur';
      if (waiting && waiting !== ws && waiting.readyState === 1) {
        const other = waiting; waiting = null; start(other, ws);
      } else { waiting = ws; send(ws, { t: 'wait' }); }
      return;
    }

    const g = ws.game;
    if (!g) return;
    const opp = g.p[1 - ws.me];

    if (m.t === 'play') {
      const col = Number(m.col);
      if (g.over || g.turn !== ws.me || !Number.isInteger(col) || col < 0 || col >= C) return;
      let row = R - 1;
      while (row >= 0 && g.b[row][col] !== -1) row--;
      if (row < 0) return;
      g.b[row][col] = ws.me; g.moves++;
      const won = isWin(g.b, row, col, ws.me);
      const draw = !won && g.moves === R * C;
      g.turn = 1 - g.turn;
      const msg = { t: 'move', row, col, p: ws.me, turn: g.turn };
      send(ws, msg); send(opp, msg);
      if (won || draw) {
        g.over = true;
        const end = { t: 'end', winner: won ? ws.me : -1 };
        send(ws, end); send(opp, end);
      }
    } else if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 100).trim();
      if (!text) return;
      const msg = { t: 'chat', from: ws.me, name: ws.name, text };
      send(ws, msg); send(opp, msg);
    } else if (m.t === 'emoji' && EMOJIS.includes(m.e)) {
      const msg = { t: 'emoji', from: ws.me, e: m.e };
      send(ws, msg); send(opp, msg);
    }
  });
  ws.on('close', () => leave(ws));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Puissance 4 en ligne sur le port ' + PORT));
