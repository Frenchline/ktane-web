// Test E2E complet : joint, démarre, et désamorce la bombe en appliquant les règles
import WebSocket from 'ws';
import { wiresCorrectIndex, buttonSolution, memoryRule, simonMapping, serialHasVowel, KEYPAD_COLUMNS } from '../server/modules.js';

const URL = 'ws://localhost:8080';

function client(name) {
  const ws = new WebSocket(URL);
  const c = { ws, msgs: [], role: null, bomb: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    if (m.t === 'joined') c.role = m.role;
    if (m.t === 'bomb') c.bomb = m.bomb;
    if (m.t === 'module') c.bomb.modules[m.i] = m.m;
    if (m.t === 'ended') { console.log(`>>> FIN: ${m.result} (${m.reason})`); c.result = m; }
  });
  return c;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const send = (c, o) => c.ws.send(JSON.stringify(o));

const defuser = client('D');
const expert = client('E');
await sleep(300);
send(defuser, { t: 'join', room: 'E2E', name: 'A', role: 'defuser' });
send(expert, { t: 'join', room: 'E2E', name: 'B', role: 'expert' });
await sleep(400);
send(expert, { t: 'start', opts: { seed: 'full-test', moduleCount: 4, timeSec: 120, maxStrikes: 3, needy: false, effects: false } });
await sleep(600);

const b = defuser.bomb;
if (!b) { console.log('FAIL pas de bombe'); process.exit(1); }
const bombRef = { serial: b.serial, batteries: b.batteries, indicators: b.indicators };
console.log('serial', b.serial, '| modules:', b.modules.map(m => m.type).join(', '));

// résolution séquentielle des modules
const memoryHist = [];
for (let i = 0; i < b.modules.length; i++) {
  const m = defuser.bomb.modules[i];
  if (m.needy) continue;
  if (m.type === 'wires') {
    send(defuser, { t: 'action', module: i, a: 'cut', i: wiresCorrectIndex(m, bombRef) });
  } else if (m.type === 'button') {
    if (buttonSolution(m, bombRef) === 'tap') {
      send(defuser, { t: 'action', module: i, a: 'hold' });
      send(defuser, { t: 'action', module: i, a: 'release', heldMs: 50 });
    } else {
      // hold + release quand le timer affiche le bon chiffre (1:5x.x → '5' possible ?)
      send(defuser, { t: 'action', module: i, a: 'hold' });
      await sleep(200);
      const strip = defuser.bomb.modules[i].strip || 'white';
      const digit = strip === 'blue' ? '4' : strip === 'yellow' ? '5' : '1';
      // attendre que le timer affiche le chiffre
      for (let k = 0; k < 100; k++) {
        const tick = [...defuser.msgs].reverse().find(x => x.t === 'tick');
        const t = Math.ceil(tick.timeLeftMs / 100);
        const str = `${Math.floor(t / 600)}${String(Math.floor(t / 10) % 60).padStart(2, '0')}${t % 10}`;
        if (str.includes(digit)) break;
        await sleep(100);
      }
      send(defuser, { t: 'action', module: i, a: 'release', heldMs: 2000 });
    }
  } else if (m.type === 'keypad') {
    const col = KEYPAD_COLUMNS.find(c => m.symbols.every(s => c.includes(s)));
    for (const sym of col.filter(s => m.symbols.includes(s))) {
      send(defuser, { t: 'action', module: i, a: 'press', sym });
      await sleep(120);
    }
  } else if (m.type === 'simon') {
    let mod = defuser.bomb.modules[i];
    while (!mod.solved) {
      const strikes = [...defuser.msgs].reverse().find(x => x.t === 'tick')?.strikes ?? 0;
      const map = simonMapping(bombRef, strikes);
      for (const flash of mod.flash) {
        send(defuser, { t: 'action', module: i, a: 'press', color: map[flash] });
        await sleep(80);
      }
      await sleep(300);
      mod = defuser.bomb.modules[i];
    }
  } else if (m.type === 'memory') {
    let mod = defuser.bomb.modules[i];
    while (!mod.solved) {
      const s = { display: mod.display, labels: mod.labels };
      const r = memoryRule(mod.stage, s.display, memoryHist);
      const pos = r.by === 'pos' ? r.value - 1 : s.labels.indexOf(r.value);
      send(defuser, { t: 'action', module: i, a: 'press', pos });
      await sleep(150);
      const after = defuser.bomb.modules[i];
      if (after.stage > mod.stage || after.solved) memoryHist.push({ pos: pos + 1, label: s.labels[pos] });
      else memoryHist.length = 0;
      mod = after;
    }
  }
  await sleep(300);
  console.log(`module ${i} (${m.type}) →`, defuser.bomb.modules[i].solved ? 'résolu' : 'ECHEC');
}
await sleep(800);
console.log('résultat:', defuser.result ? defuser.result.result : 'toujours en cours');
process.exit(0);
