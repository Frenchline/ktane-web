// Orchestrateur : lobby, routage des messages, rôles, vocal
import { Net } from './net.js';
import { Voice } from './voice.js';
import { Sfx } from './sfx.js';
import { initExpert } from './expert.js';

const $ = (id) => document.getElementById(id);
const net = new Net();
let myRole = null;
let voice = null;
let scene = null;
const sfx = new Sfx(); // sons des effets de panique (les 2 rôles)

// ---------- lobby ----------
$('join').onclick = async () => {
  const name = $('name').value.trim();
  const room = $('room').value.trim().toUpperCase();
  if (!name || !room) { $('lobby-err').textContent = 'Pseudo et code de salle requis.'; return; }
  await net.open.catch(() => { $('lobby-err').textContent = 'Serveur injoignable.'; });
  net.send({ t: 'join', room, name, role: $('role').value || null });
};

$('preset').onchange = () => {
  $('custom').classList.toggle('hidden', $('preset').value !== 'custom');
};

$('start').onclick = () => {
  const opts = { seed: $('seed').value.trim() };
  if ($('preset').value === 'custom') {
    opts.moduleCount = +$('c-modules').value;
    opts.timeSec = +$('c-time').value;
    opts.maxStrikes = +$('c-strikes').value;
    opts.needy = $('c-needy').checked;
    opts.effects = $('c-effects').checked;
  } else {
    opts.preset = $('preset').value;
  }
  net.send({ t: 'start', opts });
};

$('quit').onclick = () => location.reload();
$('again').onclick = () => {
  $('end-overlay').classList.add('hidden');
  // relancer avec les mêmes paramètres mais nouvelle seed
  $('start').onclick();
};
$('to-lobby').onclick = () => location.reload();
$('zoom-out').onclick = () => scene?.zoomOut();
$('mute').onclick = () => {
  if (!voice) return;
  const m = voice.toggleMute();
  $('mute').textContent = m ? 'Unmute' : 'Mute';
};

$('fullscreen').onclick = () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.().catch(() => {});
};

// hint paysage pour téléphones
function checkOrientation() {
  const portrait = innerHeight > innerWidth;
  const touch = 'ontouchstart' in window;
  $('rotate-hint').classList.toggle('hidden', !(portrait && touch && !$('defuser-view').classList.contains('hidden')));
}
window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);

// afficher les URLs LAN dans le lobby (pour jouer depuis un téléphone)
// — seulement pertinent en réseau local, pas sur un domaine public (Render…)
fetch('/api/lan').then(r => r.json()).then(({ ips, httpPort, httpsPort }) => {
  if (!ips?.length || location.hostname === ips[0]) return;
  if (!/^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname)) return;
  const urls = ips.map(ip => `http://${ip}:${httpPort}`);
  if (httpsPort) urls.push(...ips.map(ip => `https://${ip}:${httpsPort}`));
  $('lan-info').innerHTML = `📶 Jouer depuis un téléphone sur le même Wi-Fi :<br><b>${urls.join('</b> ou <b>')}</b>`;
}).catch(() => {});

// ---------- messages serveur ----------
net.on('joined', (m) => {
  myRole = m.role;
  $('room-code').textContent = m.room;
  $('room-panel').classList.remove('hidden');
  renderPlayers(m.players);
  // reconnexion en pleine partie
  if (m.state === 'running') showGameView();
});

net.on('players', (m) => renderPlayers(m.players));

net.on('error', (m) => { $('lobby-err').textContent = m.msg; });

net.on('started', () => showGameView());

function showGameView() {
  $('lobby').classList.add('hidden');
  $('game').classList.remove('hidden');
  $('hud-room').textContent = `Salle ${$('room-code').textContent}`;
  $('hud-role').textContent = myRole === 'defuser' ? '💣 Désamorceur' : '📖 Expert';
  if (myRole === 'defuser') {
    $('defuser-view').classList.remove('hidden');
    scene?.resize?.();
    checkOrientation();
  } else {
    $('expert-view').classList.remove('hidden');
    $('expert-status').textContent = 'Bombe active — décrivez les modules au téléphone !';
  }
  if (!voice) startVoice();
}

net.on('bomb', async (m) => {
  // reçu par le désamorceur (reconnexion incluse)
  if (myRole !== 'defuser') return;
  if (!scene) {
    const { BombScene } = await import('./scene.js');
    scene = new BombScene($('scene'), net);
  }
  scene.buildBomb(m.bomb);
  m.bomb.modules.forEach((mod, i) => scene.updateModule(i, mod));
  scene.updateTimer(m.bomb.timeTotalMs, 0, m.bomb.maxStrikes);
  flashPrompt('Glissez pour tourner autour de la bombe · cliquez un module pour zoomer · Échap pour reculer', 7000);
});

net.on('module', (m) => {
  scene?.updateModule(m.i, m.m);
  // alerte quand le condensateur (demandant) s'active
  if (m.m.type === 'capacitor') {
    if (m.m.active && !capActive) {
      flashPrompt('⚠️ Le condensateur se charge ! Maintenez son levier jusqu\'à la décharge.', 4000);
      sfx.click();
    }
    capActive = m.m.active;
  }
});

net.on('tick', (m) => {
  lastTime = m.timeLeftMs;
  scene?.updateTimer(m.timeLeftMs, m.strikes, m.maxStrikes);
  updateExpertStrikes(m.strikes, m.maxStrikes);
});

net.on('strike', (m) => {
  scene?.updateTimer(lastTime, m.strikes, m.maxStrikes);
  updateExpertStrikes(m.strikes, m.maxStrikes);
  flashPrompt(`❌ Erreur ! (${m.reason})`);
});

// l'expert DOIT connaître le nombre d'erreurs (table Simon)
function updateExpertStrikes(strikes, maxStrikes) {
  if (myRole === 'expert') {
    $('expert-strikes').textContent = `✕ Erreurs : ${strikes}/${maxStrikes}`;
    $('expert-strikes').style.color = strikes ? '#ff5555' : '#7fb3ff';
  }
}

net.on('effect', (m) => { scene?.setEffect(m.effect); applyAudioEffect(m.effect); });
net.on('effect-end', () => { scene?.setEffect(null); applyAudioEffect(null); });

// sons d'ambiance joués sur les 2 postes (radio, réveil) + friture ciblée
function applyAudioEffect(eff) {
  sfx.stopRadio();
  sfx.stopAlarmClock();
  voice?.setFriture?.(false);
  if (!eff) return;
  if (eff.kind === 'radio') sfx.startRadio();
  else if (eff.kind === 'alarmclock') sfx.startAlarmClock();
  else if (eff.kind === 'friture') voice?.setFriture?.(eff.target === myRole);
  if (myRole === 'expert') {
    const txt = {
      radio: '📻 Une radio hurle dans la pièce du désamorceur…',
      alarmclock: '⏰ Un réveil sonne chez le désamorceur…',
      friture: eff.target === 'expert' ? '📶 Friture : vous entendez mal le désamorceur.' : '📶 Friture sur la ligne.',
      blackout: '⚡ Coupure de courant dans la pièce !',
      alarm: '🚨 Alarme dans la pièce !',
      smoke: '💨 La pièce se remplit de fumée !',
      flashbang: '💥 Flash aveuglant chez le désamorceur !',
      neon: '💡 Le néon grésille — la lumière saute !',
      quake: '🌋 Séisme — la pièce tremble !',
      timeroff: '⌛ Le timer de la bombe s\'est éteint !',
    }[eff.kind];
    if (txt) $('expert-status').textContent = txt;
  }
}

net.on('ended', (m) => {
  const win = m.result === 'defused';
  $('end-overlay').classList.remove('hidden');
  const card = document.querySelector('.end-card');
  card.className = 'end-card ' + (win ? 'win' : 'lose');
  $('end-title').textContent = win ? '✅ Bombe désamorcée !' : '💥 BOUM !';
  $('end-reason').textContent = `${m.reason} — seed : ${m.bomb?.seed}`;
  if (!win && scene) scene.explode();
  sfx.stopRadio();
  sfx.stopAlarmClock();
  voice?.stop();
  voice = null;
});

net.on('peer-left', (m) => flashPrompt(`${m.name} a quitté la partie`));

let lastTime = 0;
let capActive = false;

function renderPlayers(players) {
  $('players').innerHTML = players.map(p =>
    `<li>${p.role === 'defuser' ? '💣' : '📖'} ${p.name} <span class="role">${p.role === 'defuser' ? 'désamorceur' : 'expert'}</span></li>`
  ).join('');
}

function flashPrompt(text, ms = 2500) {
  const p = $('prompt');
  p.textContent = text;
  p.classList.remove('hidden');
  clearTimeout(p._t);
  p._t = setTimeout(() => p.classList.add('hidden'), ms);
}

async function startVoice() {
  if (voice) return;
  voice = new Voice(net, myRole === 'defuser'); // le désamorceur initie l'offre
  voice.onStatus = (s) => {
    $('hud-voice').textContent = s === 'ok' ? '🎙️ vocal OK'
      : s === 'failed' ? '🎙️ échec (NAT trop restrictif)'
      : s === 'off' ? '🎙️ indisponible' : '🎙️ connexion…';
    $('hud-voice').className = s === 'ok' ? 'ok' : (s === 'off' || s === 'failed') ? 'off' : '';
  };
  if (!(await voice.start())) {
    $('hud-voice').textContent = '🎙️ refusé (HTTPS requis hors localhost)';
    $('hud-voice').className = 'off';
  }
}

initExpert();
net.connect().catch(() => { $('lobby-err').textContent = 'Impossible de joindre le serveur.'; });

// mode test : ?auto=defuser|expert&room=X → joint et démarre automatiquement
const params = new URLSearchParams(location.search);
const auto = params.get('auto');
if (auto) {
  net.open.then(() => {
    const room = params.get('room') || 'AUTO';
    net.send({ t: 'join', room, name: 'Test-' + auto, role: auto });
    if (auto === 'expert') setTimeout(() => net.send({ t: 'start', opts: { preset: 'normal' } }), 500);
  });
}

// mode démo : ?demo=1 → bombe factice, sans serveur
if (params.get('demo')) {
  myRole = 'defuser';
  showGameView();
  const demoBomb = {
    seed: 'demo', serial: 'KT4N36',
    batteries: ['AA', 'D'],
    indicators: [{ label: 'CAR', lit: true }, { label: 'FRK', lit: false }],
    ports: ['Parallel', 'RJ-45'],
    timeTotalMs: 300000, maxStrikes: 3,
    modules: [
      { type: 'wires', solved: false, wires: ['red', 'blue', 'yellow', 'white'], cut: null },
      { type: 'button', solved: false, color: 'blue', label: 'ANNULER', holding: false, strip: null },
      { type: 'keypad', solved: false, symbols: ['balloon', 'at', 'hookn', 'leftc'], pressed: [] },
      { type: 'simon', solved: false, stage: 0, stages: 3, flash: ['red'], inputPos: 0 },
      { type: 'memory', solved: false, stage: 0, display: 2, labels: [3, 1, 4, 2] },
      { type: 'capacitor', solved: false, needy: true, active: false, charge: 30, holding: false },
      { type: 'memory', solved: false, stage: 0, display: 3, labels: [4, 1, 2, 3] },
    ],
  };
  import('./scene.js').then(({ BombScene }) => {
    scene = new BombScene($('scene'), net);
    window.__scene = scene;
    scene.buildBomb(demoBomb);
    demoBomb.modules.forEach((m, i) => scene.updateModule(i, m));
    scene.updateTimer(253400, 1, 3);
    const z = params.get('zoom');
    if (z !== null && z !== undefined && z !== '') {
      setTimeout(() => {
        scene.zoomTo(+z);
        scene.zoomed.camPos.copy(scene.zoomed.camPos); // force
        scene.camera.position.copy(scene.zoomed.camPos);
        scene.controls.target.copy(scene.zoomed.lookAt);
      }, 1500);
    }
    const fx = params.get('fx');
    if (fx) {
      setTimeout(() => {
        const eff = { kind: fx, id: 1, target: 'defuser' };
        scene.setEffect(eff);
        applyAudioEffect(eff);
      }, 2000);
    }
  });
}
