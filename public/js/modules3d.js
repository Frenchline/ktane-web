// Rendus 3D des modules — chaque module = un groupe de meshes avec userData.action
import * as THREE from 'three';

export const COLORS = {
  red: 0xd43a2f, blue: 0x2f6fd4, yellow: 0xe8c832, white: 0xf0f0f0, black: 0x1a1a1a,
  green: 0x35c23f,
};

export function textCanvas(text, { size = 64, color = '#222', bg = null, font = 'bold %spx Arial' } = {}) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.fillStyle = color;
  ctx.font = font.replace('%s', size);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}

export function makePanel(w = 0.98, h = 0.98) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x777d8a, roughness: 0.6, metalness: 0.4 })
  );
  g.add(base);
  // LED d'état en haut à droite
  const led = new THREE.Mesh(
    new THREE.CircleGeometry(0.035, 16),
    new THREE.MeshBasicMaterial({ color: 0x330000 })
  );
  led.position.set(w / 2 - 0.09, h / 2 - 0.09, 0.031);
  g.add(led);
  g.userData.led = led;
  return g;
}

export function setSolved(panel, solved) {
  panel.userData.led.material.color.set(solved ? 0x22ff44 : 0x330000);
}

function imgTexture(name) {
  const tex = new THREE.TextureLoader().load(`/img/keypad/${name}.png`);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- FILS ----------
export function buildWires(mod, send) {
  const p = makePanel();
  const meshes = [];
  const wireMats = { red: 0xd43a2f, blue: 0x2f6fd4, yellow: 0xe8c832, white: 0xf0f0f0, black: 0x222222 };
  const n = mod.wires.length;
  mod.wires.forEach((color, i) => {
    const y = 0.33 - i * (0.66 / (n - 1 || 1));
    const wire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 0.8, 12),
      new THREE.MeshStandardMaterial({ color: wireMats[color], roughness: 0.4 })
    );
    wire.rotation.z = Math.PI / 2;
    wire.position.set(0, y, 0.07);
    wire.userData = { action: () => send({ a: 'cut', i }) };
    p.add(wire);
    meshes.push(wire);
  });
  p.userData.update = (m) => {
    setSolved(p, m.solved);
    if (m.cut !== null && meshes[m.cut]) {
      const w = meshes[m.cut];
      // fil coupé : deux moignons
      w.visible = false;
      const stubG = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12);
      const s1 = new THREE.Mesh(stubG, w.material);
      const s2 = new THREE.Mesh(stubG, w.material);
      s1.rotation.z = s2.rotation.z = Math.PI / 2;
      s1.position.set(-0.3, w.position.y, 0.07);
      s2.position.set(0.3, w.position.y, 0.07);
      p.add(s1, s2);
    }
  };
  return { group: p, meshes };
}

// ---------- BOUTON ----------
export function buildButton(mod, send) {
  const p = makePanel();
  const meshes = [];
  const btnColor = COLORS[mod.color] ?? 0x888888;

  const btn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.3, 0.14, 32),
    new THREE.MeshStandardMaterial({ color: btnColor, roughness: 0.35 })
  );
  btn.rotation.x = Math.PI / 2;
  btn.position.set(0, 0.02, 0.1);
  p.add(btn);

  // étiquette sous le bouton
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.18),
    new THREE.MeshBasicMaterial({ map: textCanvas(mod.label, { size: 52, color: '#eee', bg: '#111' }) })
  );
  label.position.set(0, -0.38, 0.065);
  p.add(label);

  // bande latérale (révélée pendant le maintien)
  const strip = new THREE.Mesh(
    new THREE.PlaneGeometry(0.07, 0.7),
    new THREE.MeshBasicMaterial({ color: 0x222222 })
  );
  strip.position.set(0.42, 0, 0.065);
  p.add(strip);

  let downAt = 0;
  btn.userData = {
    holdable: true,
    down: () => { downAt = performance.now(); send({ a: 'hold' }); btn.position.z = 0.06; },
    up: () => {
      btn.position.z = 0.1;
      send({ a: 'release', heldMs: performance.now() - downAt });
    },
  };
  meshes.push(btn);

  p.userData.update = (m) => {
    setSolved(p, m.solved);
    if (m.strip) {
      const c = m.strip === 'other' ? 0x44ddcc : COLORS[m.strip];
      strip.material.color.set(c);
    } else {
      strip.material.color.set(0x222222);
    }
  };
  return { group: p, meshes };
}

// ---------- CLAVIER ----------
export function buildKeypad(mod, send) {
  const p = makePanel();
  const meshes = [];
  mod.symbols.forEach((sym, i) => {
    const btn = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.36, 0.07),
      [
        new THREE.MeshStandardMaterial({ color: 0x999999 }),
        new THREE.MeshStandardMaterial({ color: 0x999999 }),
        new THREE.MeshStandardMaterial({ color: 0x999999 }),
        new THREE.MeshStandardMaterial({ color: 0x999999 }),
        new THREE.MeshStandardMaterial({ map: imgTexture(`${symNum(sym)}-${sym}`), color: 0xdddddd, transparent: true }),
        new THREE.MeshStandardMaterial({ color: 0x999999 }),
      ]
    );
    const x = (i % 2 === 0 ? -1 : 1) * 0.24;
    const y = (i < 2 ? 1 : -1) * 0.24;
    btn.position.set(x, y, 0.07);
    btn.userData = { action: () => send({ a: 'press', sym }) };
    p.add(btn);
    meshes.push(btn);
  });
  p.userData.update = (m) => {
    setSolved(p, m.solved);
    // griser les déjà pressés
    meshes.forEach((b, i) => {
      const sym = mod.symbols[i];
      const pressed = (m.pressed || []).includes(sym);
      b.material[4].color.set(pressed ? 0x66ff66 : 0xdddddd);
    });
  };
  return { group: p, meshes };
}

// nom → fichier sprite (identique à expert.js)
const SPRITE_IDS = {
  copyright: 1, filledstar: 2, hollowstar: 3, smileyface: 4, doublek: 5, omega: 6,
  squidknife: 7, pumpkin: 8, hookn: 9, six: 11, squigglyn: 12, at: 13, ae: 14,
  meltedthree: 15, euro: 16, nwithhat: 18, dragon: 19, questionmark: 20,
  paragraph: 21, rightc: 22, leftc: 23, pitchfork: 24, cursive: 26, tracks: 27,
  balloon: 28, upsidedowny: 30, bt: 31,
};
function symNum(name) { return SPRITE_IDS[name]; }

// ---------- SIMON ----------
export function buildSimon(mod, send) {
  const p = makePanel();
  const meshes = [];
  const colors = { red: 0xd43a2f, blue: 0x2f6fd4, green: 0x35c23f, yellow: 0xe8c832 };
  const pos = { red: [0.22, 0.22], blue: [-0.22, 0.22], green: [-0.22, -0.22], yellow: [0.22, -0.22] };
  const pads = {};
  for (const [name, [x, y]] of Object.entries(pos)) {
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.08, 24),
      new THREE.MeshStandardMaterial({ color: colors[name], roughness: 0.4, emissive: 0x000000 })
    );
    pad.rotation.x = Math.PI / 2;
    pad.position.set(x, y, 0.08);
    pad.userData = { action: () => send({ a: 'press', color: name }), flashColor: colors[name] };
    p.add(pad);
    pads[name] = pad;
    meshes.push(pad);
  }
  p.userData.pads = pads;
  p.userData.flashQueue = [];
  p.userData.update = (m) => {
    setSolved(p, m.solved);
    if (m.flash && !p.userData.playedSeq || p.userData.lastStage !== m.stage) {
      p.userData.playedSeq = false;
      p.userData.lastStage = m.stage;
    }
  };
  return { group: p, meshes, isSimon: true };
}

// ---------- MEMORY ----------
export function buildMemory(mod, send) {
  const p = makePanel();
  const meshes = [];
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.3),
    new THREE.MeshBasicMaterial({ map: textCanvas('?', { size: 90, color: '#0f0', bg: '#000' }) })
  );
  display.position.set(0, 0.26, 0.065);
  p.add(display);
  p.userData.display = display;

  const btns = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(
      new THREE.BoxGeometry(0.19, 0.22, 0.07),
      new THREE.MeshStandardMaterial({ color: 0xcccccc })
    );
    b.position.set(-0.33 + i * 0.22, -0.2, 0.07);
    b.userData = { action: () => send({ a: 'press', pos: i }) };
    const lbl = new THREE.Mesh(
      new THREE.PlaneGeometry(0.15, 0.15),
      new THREE.MeshBasicMaterial({ map: textCanvas('?', { size: 90, color: '#111' }), transparent: true })
    );
    lbl.position.set(0, 0, 0.04);
    b.add(lbl);
    b.userData.lbl = lbl;
    p.add(b);
    btns.push(b);
    meshes.push(b);
  }
  p.userData.update = (m) => {
    setSolved(p, m.solved);
    if (m.display != null) {
      display.material.map = textCanvas(String(m.display), { size: 90, color: '#0f0', bg: '#000' });
      display.material.needsUpdate = true;
    }
    if (m.labels) {
      btns.forEach((b, i) => {
        b.userData.lbl.material.map = textCanvas(String(m.labels[i]), { size: 90, color: '#111' });
        b.userData.lbl.material.needsUpdate = true;
      });
    }
  };
  return { group: p, meshes };
}

// ---------- CONDENSATEUR (demandant) ----------
export function buildCapacitor(mod, send) {
  const p = makePanel();
  const meshes = [];
  // jauge verticale
  const gaugeBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.12, 0.6),
    new THREE.MeshBasicMaterial({ color: 0x111111 })
  );
  gaugeBg.position.set(0.3, 0, 0.065);
  p.add(gaugeBg);
  const gauge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.1, 0.58),
    new THREE.MeshBasicMaterial({ color: 0xffaa00 })
  );
  gauge.position.set(0.3, 0, 0.07);
  p.add(gauge);
  p.userData.gauge = gauge;

  // levier
  const lever = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.4, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xaa3333 })
  );
  lever.position.set(-0.15, 0, 0.1);
  lever.userData = {
    holdable: true,
    down: () => { send({ a: 'hold', v: true }); lever.position.z = 0.06; },
    up: () => { send({ a: 'hold', v: false }); lever.position.z = 0.1; },
  };
  p.add(lever);
  meshes.push(lever);

  const lbl = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.14),
    new THREE.MeshBasicMaterial({ map: textCanvas('CONDENSATEUR', { size: 34, color: '#ddd' }) })
  );
  lbl.position.set(0, -0.4, 0.065);
  p.add(lbl);

  p.userData.update = (m) => {
    const h = Math.max(0.02, (m.charge / 100) * 0.58);
    gauge.scale.y = h / 0.58;
    gauge.position.y = -0.29 + h / 2;
    gauge.material.color.set(m.charge > 70 ? 0xff2222 : 0xffaa00);
    gaugeBg.material.color.set(m.active ? 0x331100 : 0x111111);
  };
  return { group: p, meshes };
}

export const BUILDERS = {
  wires: buildWires,
  button: buildButton,
  keypad: buildKeypad,
  simon: buildSimon,
  memory: buildMemory,
  capacitor: buildCapacitor,
};
