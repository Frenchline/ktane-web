// Gestion des salles et de l'état de jeu (autoritaire serveur)
import { makeRng } from './prng.js';
import {
  MODULE_TYPES, NEEDY_TYPES, KEYPAD_COLUMNS, generateModule, generateSerial, generateWidgets,
  wiresCorrectIndex, buttonSolution, buttonStripDigit, simonMapping, memoryRule,
} from './modules.js';

const TICK_MS = 100;
const SYNC_EVERY = 5; // broadcast toutes les 500 ms

export const PRESETS = {
  facile:    { moduleCount: 3,  timeSec: 300, maxStrikes: 3, needy: false, effects: true },
  normal:    { moduleCount: 5,  timeSec: 300, maxStrikes: 3, needy: true,  effects: true },
  difficile: { moduleCount: 8,  timeSec: 240, maxStrikes: 2, needy: true,  effects: true },
  expert:    { moduleCount: 11, timeSec: 300, maxStrikes: 1, needy: true,  effects: true },
};

export class Room {
  constructor(code) {
    this.code = code;
    this.players = new Map(); // ws -> {name, role}
    this.state = 'lobby';     // lobby | running | ended
    this.bomb = null;
    this.timer = null;
    this.tickCount = 0;
    this.nextEffectAt = null;
    this.activeEffect = null;
    this.lastTick = null;
    this.result = null;
  }

  broadcast(msg, except = null) {
    const data = JSON.stringify(msg);
    for (const ws of this.players.keys()) {
      if (ws !== except && ws.readyState === 1) ws.send(data);
    }
  }

  send(ws, msg) {
    if (ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  defuserWs() {
    for (const [ws, p] of this.players) if (p.role === 'defuser') return ws;
    return null;
  }

  playersList() {
    return [...this.players.values()].map(p => ({ name: p.name, role: p.role }));
  }

  addPlayer(ws, name, wantRole) {
    const roles = new Set([...this.players.values()].map(p => p.role));
    let role = wantRole;
    if (role && roles.has(role)) role = null;
    if (!role) role = roles.has('defuser') ? 'expert' : 'defuser';
    this.players.set(ws, { name: (name || 'Joueur').slice(0, 20), role });
    this.broadcast({ t: 'players', players: this.playersList(), room: this.code });
    return role;
  }

  removePlayer(ws) {
    const p = this.players.get(ws);
    this.players.delete(ws);
    this.broadcast({ t: 'players', players: this.playersList(), room: this.code });
    if (this.state === 'running') {
      this.broadcast({ t: 'peer-left', name: p?.name });
      // la partie continue : le joueur peut se reconnecter
    }
    return this.players.size === 0;
  }

  // ---------- démarrage ----------

  start(opts) {
    const seed = (opts.seed || '').trim() || String(Math.floor(Math.random() * 1e9));
    const preset = PRESETS[opts.preset] || PRESETS.normal;
    const cfg = {
      moduleCount: Math.min(11, Math.max(1, opts.moduleCount ?? preset.moduleCount)),
      timeSec: Math.min(3600, Math.max(30, opts.timeSec ?? preset.timeSec)),
      maxStrikes: Math.min(5, Math.max(1, opts.maxStrikes ?? preset.maxStrikes)),
      needy: opts.needy ?? preset.needy,
      effects: opts.effects ?? preset.effects,
    };

    const rng = makeRng(seed);
    const regularTypes = MODULE_TYPES.filter(t => !NEEDY_TYPES.includes(t));
    const modules = [];
    for (let i = 0; i < cfg.moduleCount; i++) {
      modules.push(generateModule(rng.pick(regularTypes), rng, null));
    }
    if (cfg.needy && cfg.moduleCount < 12) {
      // un module demandant (condensateur) en plus, placé sur la face arrière
      modules.push(generateModule('capacitor', rng, null));
    }

    this.bomb = {
      seed,
      serial: generateSerial(rng),
      ...generateWidgets(rng),
      modules,
      timeLeftMs: cfg.timeSec * 1000,
      timeTotalMs: cfg.timeSec * 1000,
      maxStrikes: cfg.maxStrikes,
      strikes: 0,
      cfg,
    };

    this.state = 'running';
    this.result = null;
    this.activeEffect = null;
    this.nextEffectAt = cfg.effects ? Date.now() + this.effectDelay(rng) : null;
    this.effectRng = makeRng(seed + ':fx');
    this.needyRng = makeRng(seed + ':needy');
    this.nextNeedyAt = cfg.needy ? Date.now() + 30000 + this.needyRng.next() * 30000 : null;

    const defuser = this.defuserWs();
    this.broadcast({ t: 'started', role: 'broadcast', players: this.playersList() });
    if (defuser) this.send(defuser, { t: 'bomb', bomb: this.publicBomb() });
    for (const [ws, p] of this.players) {
      if (p.role === 'expert') this.send(ws, { t: 'bomb-hidden', seed });
    }

    this.lastTick = Date.now();
    this.tickCount = 0;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return { seed, cfg };
  }

  effectDelay(rng) {
    return 35000 + (rng ? rng.next() : Math.random()) * 50000; // 35–85 s
  }

  publicBomb() {
    const b = this.bomb;
    return {
      seed: b.seed,
      serial: b.serial,
      batteries: b.batteries,
      indicators: b.indicators,
      ports: b.ports,
      timeTotalMs: b.timeTotalMs,
      maxStrikes: b.maxStrikes,
      modules: b.modules.map(m => this.publicModule(m)),
    };
  }

  publicModule(m) {
    const pub = { type: m.type, solved: m.solved, needy: !!m.needy };
    switch (m.type) {
      case 'wires': pub.wires = m.wires; pub.cut = m.cut; break;
      case 'button':
        pub.color = m.color; pub.label = m.label;
        pub.holding = m.holding;
        pub.strip = m.stripRevealed ? m.strip : null;
        break;
      case 'keypad': pub.symbols = m.symbols; pub.pressed = m.pressed; break;
      case 'simon': {
        pub.stage = m.stage; pub.stages = m.stages;
        // séquence à montrer pour l'étape courante
        pub.flash = m.sequence.slice(0, m.stage + 1);
        pub.inputPos = m.inputPos;
        break;
      }
      case 'memory': {
        const s = m.stages[m.stage];
        pub.stage = m.stage;
        pub.display = s ? s.display : null;
        pub.labels = s ? s.labels : null;
        break;
      }
      case 'capacitor':
        pub.active = m.active; pub.charge = m.charge; pub.holding = m.holding;
        break;
    }
    return pub;
  }

  // ---------- boucle ----------

  tick() {
    if (this.state !== 'running' || !this.bomb) return;
    const now = Date.now();
    const dt = now - this.lastTick;
    this.lastTick = now;
    const b = this.bomb;
    this.tickCount++;

    // timer accéléré par les erreurs (x1.25 par erreur)
    const speed = 1 + b.strikes * 0.25;
    b.timeLeftMs -= dt * speed;

    if (b.timeLeftMs <= 0) {
      b.timeLeftMs = 0;
      return this.end('exploded', 'temps écoulé');
    }

    // modules demandants
    const needyMod = b.modules.find(m => m.needy);
    if (needyMod) {
      if (!needyMod.active && this.nextNeedyAt && now >= this.nextNeedyAt) {
        needyMod.active = true;
        needyMod.charge = 0;
        const d = this.defuserWs();
        if (d) this.send(d, { t: 'module', i: b.modules.indexOf(needyMod), m: this.publicModule(needyMod) });
      }
      if (needyMod.active) {
        needyMod.charge += (needyMod.holding ? -28 : 9) * dt / 1000;
        if (needyMod.charge >= 100) {
          needyMod.charge = 100;
          this.strike('condensateur surchargé');
          needyMod.active = false;
          needyMod.charge = 0;
          needyMod.holding = false;
          this.nextNeedyAt = now + 30000 + this.needyRng.next() * 40000;
        } else if (needyMod.charge <= 0 && needyMod.holding) {
          needyMod.charge = 0;
          needyMod.active = false; // déchargé
          needyMod.holding = false;
          this.nextNeedyAt = now + 30000 + this.needyRng.next() * 40000;
        }
        if (needyMod.charge < 0) needyMod.charge = 0;
      }
    }

    // effets de panique
    if (this.activeEffect && this.activeEffect.until && now >= this.activeEffect.until) {
      this.clearEffect();
    }
    if (!this.activeEffect && this.nextEffectAt && now >= this.nextEffectAt) {
      const kinds = ['blackout', 'alarm', 'smoke', 'radio', 'alarmclock', 'friture', 'flashbang', 'neon', 'quake', 'timeroff'];
      const kind = kinds[Math.floor(this.effectRng.next() * kinds.length)];
      const id = Math.floor(this.effectRng.next() * 1e9);
      const dur = {
        smoke: 15000, friture: 16000, radio: 35000, alarmclock: 30000,
        flashbang: 5000, neon: 12000, quake: 14000, timeroff: 20000,
      }[kind] ?? 25000;
      this.activeEffect = { kind, id, until: now + dur }; // auto-fin de secours
      if (kind === 'friture') {
        this.activeEffect.target = this.effectRng.chance(0.5) ? 'defuser' : 'expert';
      }
      this.broadcast({ t: 'effect', effect: this.activeEffect });
    }

    // condensateur : mises à jour fréquentes pour la jauge
    if (needyMod?.active && this.tickCount % 2 === 0) {
      const d = this.defuserWs();
      if (d) this.send(d, { t: 'module', i: b.modules.indexOf(needyMod), m: this.publicModule(needyMod) });
    }

    // sync périodique
    if (this.tickCount % SYNC_EVERY === 0) {
      this.broadcast({
        t: 'tick',
        timeLeftMs: b.timeLeftMs,
        strikes: b.strikes,
        maxStrikes: b.maxStrikes,
      });
    }
  }

  strike(reason) {
    const b = this.bomb;
    b.strikes++;
    this.broadcast({ t: 'strike', strikes: b.strikes, maxStrikes: b.maxStrikes, reason });
    if (b.strikes >= b.maxStrikes) this.end('exploded', 'trop d\'erreurs');
  }

  clearEffect() {
    if (this.activeEffect) {
      this.broadcast({ t: 'effect-end', id: this.activeEffect.id });
      this.activeEffect = null;
    }
    this.nextEffectAt = Date.now() + this.effectDelay(this.effectRng);
  }

  end(result, reason) {
    this.state = 'ended';
    this.result = { result, reason };
    clearInterval(this.timer);
    this.timer = null;
    this.clearEffect();
    this.broadcast({ t: 'ended', result, reason, bomb: this.bomb ? { seed: this.bomb.seed } : null });
  }

  solvedCount() {
    return this.bomb.modules.filter(m => !m.needy && m.solved).length;
  }

  checkDefused() {
    const need = this.bomb.modules.filter(m => !m.needy).length;
    if (this.solvedCount() === need) this.end('defused', 'bombe désamorcée');
  }

  // ---------- actions du désamorceur ----------

  action(ws, msg) {
    if (this.state !== 'running') return;
    const p = this.players.get(ws);
    if (!p || p.role !== 'defuser') return;
    const b = this.bomb;

    // réparer un effet (interrupteur, alarme, ventilation)
    if (msg.a === 'fix-effect') {
      if (this.activeEffect && this.activeEffect.id === msg.id) this.clearEffect();
      return;
    }

    const i = msg.module;
    const m = b.modules[i];
    if (!m) return;
    if (m.solved && !m.needy) return;
    const pub = () => {
      const d = this.defuserWs();
      if (d) this.send(d, { t: 'module', i, m: this.publicModule(m) });
    };

    switch (m.type) {
      case 'wires': {
        if (msg.a !== 'cut' || m.cut !== null) return;
        m.cut = msg.i;
        if (msg.i === wiresCorrectIndex(m, b)) { m.solved = true; pub(); this.checkDefused(); }
        else { pub(); this.strike('mauvais fil coupé'); }
        break;
      }
      case 'button': {
        const sol = buttonSolution(m, b);
        if (msg.a === 'hold') {
          m.holding = true;
          m.stripRevealed = true;
          pub();
        } else if (msg.a === 'release') {
          m.holding = false;
          const heldMs = msg.heldMs ?? 1000;
          if (heldMs < 750) {
            // appui bref = « presser et relâcher immédiatement »
            if (sol === 'tap') { m.solved = true; pub(); this.checkDefused(); }
            else { pub(); this.strike('le bouton devait être maintenu'); }
          } else {
            const digit = buttonStripDigit(m.strip);
            const shown = this.formatTimeDigits(b.timeLeftMs);
            if (sol === 'hold' && shown.includes(digit)) {
              m.solved = true; pub(); this.checkDefused();
            } else {
              pub();
              this.strike(sol === 'hold' ? `relâché au mauvais moment (fallait un ${digit})` : 'le bouton devait être pressé brièvement');
            }
          }
        }
        break;
      }
      case 'keypad': {
        if (msg.a !== 'press') return;
        const col = this.bomb.modules[i]._col ||
          (this.bomb.modules[i]._col = this.findKeypadColumn(m.symbols));
        const order = col.filter(s => m.symbols.includes(s));
        const expected = order[m.pressed.length];
        if (msg.sym === expected) {
          m.pressed.push(msg.sym);
          if (m.pressed.length === order.length) m.solved = true;
          pub();
          if (m.solved) this.checkDefused();
        } else {
          m.pressed = [];
          pub();
          this.strike('mauvais symbole');
        }
        break;
      }
      case 'simon': {
        if (msg.a !== 'press') return;
        const map = simonMapping(b, b.strikes);
        const flash = m.sequence[m.inputPos];
        const expected = map[flash];
        if (msg.color === expected) {
          m.inputPos++;
          if (m.inputPos > m.stage) {
            m.stage++;
            m.inputPos = 0;
            if (m.stage >= m.stages) m.solved = true;
          }
          pub();
          if (m.solved) this.checkDefused();
        } else {
          m.inputPos = 0;
          pub();
          this.strike('mauvaise couleur (Simon)');
        }
        break;
      }
      case 'memory': {
        if (msg.a !== 'press' || !Number.isInteger(msg.pos) || msg.pos < 0 || msg.pos > 3) return;
        const s = m.stages[m.stage];
        const rule = memoryRule(m.stage, s.display, m.history);
        const pos = msg.pos; // 0..3
        const ok = rule.by === 'pos' ? pos === rule.value - 1
                                     : s.labels[pos] === rule.value;
        if (ok) {
          m.history.push({ pos: pos + 1, label: s.labels[pos] });
          m.stage++;
          if (m.stage >= 5) m.solved = true;
          pub();
          if (m.solved) this.checkDefused();
        } else {
          m.stage = 0;
          m.history = [];
          pub();
          this.strike('mauvaise touche (Memory), retour étape 1');
        }
        break;
      }
      case 'capacitor': {
        if (msg.a === 'hold') { m.holding = !!msg.v; pub(); }
        break;
      }
    }
  }

  findKeypadColumn(symbols) {
    return KEYPAD_COLUMNS.find(col => symbols.every(s => col.includes(s)));
  }

  formatTimeDigits(ms) {
    const t = Math.max(0, Math.ceil(ms / 100)); // dixièmes
    const d = t % 10;
    const s = Math.floor(t / 10) % 60;
    const min = Math.floor(t / 600);
    return `${min}${String(s).padStart(2, '0')}${d}`;
  }
}

export class Lobby {
  constructor() { this.rooms = new Map(); }

  room(code) {
    code = (code || '').toUpperCase().trim();
    if (!this.rooms.has(code)) this.rooms.set(code, new Room(code));
    return this.rooms.get(code);
  }

  cleanup(code) {
    const r = this.rooms.get(code);
    if (r && r.players.size === 0) {
      if (r.timer) clearInterval(r.timer);
      this.rooms.delete(code);
    }
  }
}
