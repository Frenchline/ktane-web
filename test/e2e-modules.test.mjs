// Test E2E : pilote chaque module via Room.action() comme un vrai client WS
import { Room } from '../server/game.js';
import { makeRng } from '../server/prng.js';
import {
  generateModule, KEYPAD_COLUMNS,
  wiresCorrectIndex, buttonSolution, buttonStripDigit, simonMapping, memoryRule,
} from '../server/modules.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } };

// faux websocket qui capture les messages envoyés au désamorceur
function fakeWs(log) {
  return { readyState: 1, send: (d) => log.push(JSON.parse(d)) };
}

// crée une salle avec un module de chaque type + un condensateur
function makeRoom(seed = 'test-mod') {
  const room = new Room('TEST');
  const sent = [];
  const defuser = fakeWs(sent);
  const expert = fakeWs([]);
  room.addPlayer(defuser, 'Def', 'defuser');
  room.addPlayer(expert, 'Exp', 'expert');
  room.start({ seed, moduleCount: 1, timeSec: 300, maxStrikes: 5, needy: false, effects: false });

  // remplacer les modules générés par un de chaque type (déterministe via le rng)
  const rng = makeRng(seed);
  const bomb = room.bomb;
  const mods = ['wires', 'button', 'keypad', 'simon', 'memory', 'capacitor']
    .map(t => generateModule(t, rng, bomb));
  bomb.modules = mods;

  const acts = (i, a) => room.action(defuser, { t: 'action', module: i, ...a });
  const last = () => sent[sent.length - 1];
  return { room, bomb, mods, acts, sent, last };
}

const tick = (room, ms) => { // simuler des ticks de 100 ms
  for (let t = 0; t < ms; t += 100) { room.lastTick -= 100; room.tick(); }
};

// ---------- 1. FILS ----------
{
  console.log('\n== Fils ==');
  const { bomb, mods, acts, room } = makeRoom();
  const m = mods[0];
  ok(m.type === 'wires' && m.wires.length >= 3, `fils générés: [${m.wires}]`);
  const correct = wiresCorrectIndex(m, bomb);
  const wrong = (correct + 1) % m.wires.length;
  acts(0, { a: 'cut', i: wrong });
  ok(bomb.strikes === 1, `mauvais fil → erreur (${m.wires} idx ${wrong} vs ${correct})`);
  ok(m.cut === wrong, 'fil coupé enregistré');
  // le module est consommé : impossible de recouper
  acts(0, { a: 'cut', i: correct });
  ok(!m.solved, 'un fil coupé = module verrouillé (règle KTANE : un seul essai)');
  room.end('exploded', 'fin test');
}

// ---------- 2. BOUTON ----------
{
  console.log('\n== Bouton ==');
  for (const seed of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) {
    const { bomb, mods, acts, room } = makeRoom(seed);
    const m = mods[1];
    const sol = buttonSolution(m, bomb);
    if (sol === 'tap') {
      acts(1, { a: 'hold' });
      acts(1, { a: 'release', heldMs: 120 });
      ok(m.solved, `tap résout (${m.color}/${m.label})`);
      room.end('defused', 'test');
      break;
    }
    room.end('exploded', 'test');
  }
  for (const seed of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) {
    const { bomb, mods, acts, room } = makeRoom(seed);
    const m = mods[1];
    const sol = buttonSolution(m, bomb);
    if (sol !== 'hold') { room.end('exploded', 'test'); continue; }
    const digit = buttonStripDigit(m.strip);
    // régler le timer pour afficher le bon chiffre
    let ms = 0;
    for (ms = 61000; ms < 300000; ms += 100) {
      if (room.formatTimeDigits(ms).includes(digit)) break;
    }
    bomb.timeLeftMs = ms;
    acts(1, { a: 'hold' });
    ok(m.stripRevealed === true, 'bande révélée pendant le maintien');
    acts(1, { a: 'release', heldMs: 1200 });
    ok(m.solved, `hold + relâche sur «${digit}» résout (${m.color}/${m.label}, timer ${room.formatTimeDigits(ms)})`);
    room.end('defused', 'test');
    break;
  }
  // erreur : relâcher un hold au mauvais moment
  for (const seed of ['b1', 'b2', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']) {
    const { bomb, mods, acts, room } = makeRoom(seed);
    const m = mods[1];
    if (buttonSolution(m, bomb) !== 'hold') { room.end('exploded', 'test'); continue; }
    const digit = buttonStripDigit(m.strip);
    let ms = 0;
    for (ms = 61000; ms < 300000; ms += 100) {
      if (!room.formatTimeDigits(ms).includes(digit)) break;
    }
    bomb.timeLeftMs = ms;
    acts(1, { a: 'hold' });
    acts(1, { a: 'release', heldMs: 1200 });
    ok(!m.solved && bomb.strikes === 1, 'relâché au mauvais moment → erreur');
    room.end('exploded', 'test');
    break;
  }
}

// ---------- 3. CLAVIER ----------
{
  console.log('\n== Clavier ==');
  const { bomb, mods, acts, room } = makeRoom();
  const m = mods[2];
  const col = KEYPAD_COLUMNS.find(c => m.symbols.every(s => c.includes(s)));
  ok(!!col, `4 symboles dans 1 seule colonne: [${m.symbols}]`);
  const order = col.filter(s => m.symbols.includes(s));
  // d'abord une erreur → reset
  const wrongFirst = m.symbols.find(s => s !== order[0]);
  if (wrongFirst) {
    acts(2, { a: 'press', sym: wrongFirst });
    ok(bomb.strikes === 1 && m.pressed.length === 0, 'mauvais symbole → erreur + reset');
  }
  for (const sym of order) acts(2, { a: 'press', sym });
  ok(m.solved, `ordre correct résout: [${order}]`);
  room.end('exploded', 'test');
}

// ---------- 4. SIMON ----------
{
  console.log('\n== Simon ==');
  const { bomb, mods, acts, room } = makeRoom();
  const m = mods[3];
  ok(m.stages >= 3 && m.sequence.length === m.stages, `séquence ${m.stages} étapes: [${m.sequence}]`);
  const totalStages = m.stages;
  // erreur volontaire en étape 1 pour vérifier le reset
  const map0 = simonMapping(bomb, bomb.strikes);
  const wrongColor = ['red', 'blue', 'green', 'yellow'].find(c => c !== map0[m.sequence[0]]);
  acts(3, { a: 'press', color: wrongColor });
  ok(bomb.strikes === 1 && m.inputPos === 0 && m.stage === 0, 'mauvaise couleur → erreur + reset');
  // attention : l'erreur change la table Simon (strikes=1)
  for (let stage = 0; stage < totalStages; stage++) {
    const map = simonMapping(bomb, bomb.strikes);
    for (let k = 0; k <= stage; k++) {
      acts(3, { a: 'press', color: map[m.sequence[k]] });
    }
  }
  ok(m.solved, `Simon ${totalStages} étapes résolu avec ${bomb.strikes} erreur(s)`);
  room.end('exploded', 'test');
}

// ---------- 5. MEMORY ----------
{
  console.log('\n== Memory ==');
  const { bomb, mods, acts, room } = makeRoom();
  const m = mods[4];
  const answerPos = (stage, history) => {
    const s = m.stages[stage];
    const rule = memoryRule(stage, s.display, history);
    return rule.by === 'pos'
      ? rule.value - 1
      : s.labels.indexOf(rule.value);
  };
  // erreur volontaire → vérifie reset à l'étape 1
  const history = [];
  let pos = answerPos(0, history);
  const wrongPos = (pos + 1) % 4;
  acts(4, { a: 'press', pos: wrongPos });
  ok(bomb.strikes === 1 && m.stage === 0 && m.history.length === 0,
    `mauvaise touche → erreur + retour étape 1 (stage=${m.stage})`);

  // résolution complète des 5 étapes
  const hist = [];
  for (let stage = 0; stage < 5; stage++) {
    const p = answerPos(stage, hist);
    const s = m.stages[stage];
    acts(4, { a: 'press', pos: p });
    hist.push({ pos: p + 1, label: s.labels[p] });
    if (m.solved) break;
  }
  ok(m.solved && m.stage === 5, `Memory 5 étapes résolu (hist: ${hist.map(h => h.label)})`);
  room.end('exploded', 'test');
}

// ---------- 6. CONDENSATEUR (demandant) ----------
{
  console.log('\n== Condensateur ==');
  const { bomb, mods, acts, room } = makeRoom();
  const cap = mods[5];
  ok(cap.needy === true, 'module demandant identifié');
  room.nextNeedyAt = Date.now() - 1; // forcer l'activation
  tick(room, 300);
  ok(cap.active === true, 'le condensateur s\'active');
  const before = cap.charge;
  tick(room, 2000);
  ok(cap.charge > before, `la charge monte (${before.toFixed(0)} → ${cap.charge.toFixed(0)})`);
  acts(5, { a: 'hold', v: true });   // maintenir le levier
  tick(room, 8000);
  ok(cap.active === false && cap.charge === 0, 'maintenir → déchargé, désactivé');
  // surcharge → erreur
  room.nextNeedyAt = Date.now() - 1;
  tick(room, 300);
  ok(cap.active === true, 'réactivation');
  const strikesBefore = bomb.strikes;
  tick(room, 13000);
  ok(bomb.strikes > strikesBefore && !cap.active, 'surcharge ignorée → erreur');
  room.end('exploded', 'test');
}

// ---------- 7. Bombe complète → désamorcée ----------
{
  console.log('\n== Bombe complète ==');
  const { bomb, mods, acts, room, last } = makeRoom('full');
  // fils
  const w = mods[0];
  acts(0, { a: 'cut', i: wiresCorrectIndex(w, bomb) });
  // bouton
  const btn = mods[1];
  if (buttonSolution(btn, bomb) === 'tap') {
    acts(1, { a: 'hold' }); acts(1, { a: 'release', heldMs: 100 });
  } else {
    const digit = buttonStripDigit(btn.strip);
    for (let ms = 61000; ms < 300000; ms += 100) {
      if (room.formatTimeDigits(ms).includes(digit)) { bomb.timeLeftMs = ms; break; }
    }
    acts(1, { a: 'hold' }); acts(1, { a: 'release', heldMs: 1000 });
  }
  // clavier
  const kp = mods[2];
  const col = KEYPAD_COLUMNS.find(c => kp.symbols.every(s => c.includes(s)));
  for (const sym of col.filter(s => kp.symbols.includes(s))) acts(2, { a: 'press', sym });
  // simon
  const sm = mods[3];
  for (let stage = 0; stage < sm.stages; stage++) {
    const map = simonMapping(bomb, bomb.strikes);
    for (let k = 0; k <= stage; k++) acts(3, { a: 'press', color: map[sm.sequence[k]] });
  }
  // memory
  const mem = mods[4];
  const hist = [];
  for (let stage = 0; stage < 5; stage++) {
    const s = mem.stages[stage];
    const rule = memoryRule(stage, s.display, hist);
    const p = rule.by === 'pos' ? rule.value - 1 : s.labels.indexOf(rule.value);
    acts(4, { a: 'press', pos: p });
    hist.push({ pos: p + 1, label: s.labels[p] });
    if (mem.solved) break;
  }
  ok(mods.filter(x => !x.needy).every(x => x.solved), 'tous les modules résolus');
  ok(room.state === 'ended' && room.result?.result === 'defused', `partie terminée: ${room.result?.result}`);
  if (room.timer) clearInterval(room.timer);
}

console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
process.exit(fail ? 1 : 0);
