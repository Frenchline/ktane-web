import express from 'express';
import { createServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { networkInterfaces } from 'os';
import { Lobby } from './game.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const PORT = process.env.PORT || 8080;
const HTTPS_PORT = process.env.HTTPS_PORT || 8443;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const lobby = new Lobby();

app.use(express.static(join(ROOT, 'public')));
app.use('/vendor/three', express.static(join(ROOT, 'node_modules', 'three')));

// IP locales pour jouer en LAN
app.get('/api/lan', (req, res) => {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  res.json({ ips, httpPort: PORT, httpsPort: httpsEnabled ? HTTPS_PORT : null });
});

function attachWs(server) {
  const wss = new WebSocketServer({ server });
  wss.on('connection', (ws) => {
    let room = null;

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      switch (msg.t) {
        case 'join': {
          room = lobby.room(msg.room);
          if (room.players.size >= 2) { room = null; return ws.send(JSON.stringify({ t: 'error', msg: 'Salle pleine' })); }
          const role = room.addPlayer(ws, msg.name, msg.role);
          ws.send(JSON.stringify({ t: 'joined', room: room.code, role, players: room.playersList(), state: room.state }));
          if (room.state === 'running' && role === 'defuser') {
            ws.send(JSON.stringify({ t: 'bomb', bomb: room.publicBomb() }));
          }
          break;
        }
        case 'start': {
          if (!room) return;
          room.start(msg.opts || {});
          break;
        }
        case 'action': {
          if (!room) return;
          room.action(ws, msg);
          break;
        }
        case 'rtc': {
          // signaling WebRTC : relayé à l'autre joueur
          if (!room) return;
          room.broadcast({ t: 'rtc', data: msg.data }, ws);
          break;
        }
        case 'chat': {
          if (!room) return;
          const p = room.players.get(ws);
          room.broadcast({ t: 'chat', from: p?.name, msg: String(msg.msg || '').slice(0, 300) });
          break;
        }
      }
    });

    ws.on('close', () => {
      if (room) {
        room.removePlayer(ws);
        lobby.cleanup(room.code);
        room = null;
      }
    });
  });
  return wss;
}

// HTTP
const server = createServer(app);
attachWs(server);
server.listen(PORT, HOST, () => {
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) ips.push(ni.address);
    }
  }
  console.log(`KTANE Web — http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  LAN  → http://${ip}:${PORT}`);
});

// HTTPS optionnel (pour le vocal sur téléphone en LAN)
const httpsEnabled = existsSync(join(ROOT, 'certs', 'key.pem')) && existsSync(join(ROOT, 'certs', 'cert.pem'));
if (httpsEnabled) {
  const creds = {
    key: readFileSync(join(ROOT, 'certs', 'key.pem')),
    cert: readFileSync(join(ROOT, 'certs', 'cert.pem')),
  };
  const shttps = createHttpsServer(creds, app);
  attachWs(shttps);
  shttps.listen(HTTPS_PORT, HOST, () => {
    for (const list of Object.values(networkInterfaces())) {
      for (const ni of list || []) {
        if (ni.family === 'IPv4' && !ni.internal) console.log(`  HTTPS → https://${ni.address}:${HTTPS_PORT}`);
      }
    }
  });
}
