// Scène 3D du désamorceur : pièce, bombe, interactions, effets de panique
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDERS, textCanvas } from './modules3d.js';
import { Sfx } from './sfx.js';

const TABLE_TOP = 0.745; // hauteur du plateau de la table
const BOMB = { w: 3.3, h: 2.2, d: 1.1, y: TABLE_TOP + 1.1 + 0.01 }; // posée sur la table
const SLOT = { cols: [-1.1, 0, 1.1], rows: [0.55, -0.55] }; // 3×2 par face

const MODULE_NAMES = {
  wires: 'Fils', button: 'Bouton', keypad: 'Clavier',
  simon: 'Simon', memory: 'Memory', capacitor: 'Condensateur (demandant)',
};

export class BombScene {
  constructor(canvas, net) {
    this.net = net;
    this.moduleHandles = [];
    this.interactives = [];   // meshes cliquables
    this.zoomed = null;       // module index zoomé
    this.returning = null;    // anim de retour caméra (ne bloque pas les clics)
    this.effect = null;
    this.simonAnims = new Map();
    this.audio = new Sfx();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0c10);
    this.scene.fog = new THREE.Fog(0x0a0c10, 8, 30);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.homePos = new THREE.Vector3(0, 2.7, 5);
    this.homeTarget = new THREE.Vector3(0, BOMB.y, 0);
    this.camera.position.copy(this.homePos);
    this.timerState = null; // {ms, at, strikes, maxStrikes} — sync serveur, rendu interpolé

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(this.homeTarget);
    this.controls.enableDamping = true;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 8;
    this.controls.maxPolarAngle = Math.PI * 0.62;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._downInfo = null;

    this.buildRoom();
    this.bindEvents(canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------- pièce ----------
  buildRoom() {
    const s = this.scene;
    this.lights = {};

    const amb = new THREE.AmbientLight(0x8899bb, 0.35);
    const key = new THREE.PointLight(0xfff2dd, 60, 30);
    key.position.set(0, 4.5, 1.5);
    key.castShadow = true;
    const fill = new THREE.PointLight(0x6688ff, 15, 25);
    fill.position.set(-3, 3, -2);
    s.add(amb, key, fill);
    this.lights = { amb, key, fill, baseInt: { amb: 0.35, key: 60, fill: 15 } };

    // sol + murs
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(30, 12), wallMat);
    back.position.set(0, 6, -4);
    s.add(back);

    // table
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(6, 0.25, 3.4),
      new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.8 })
    );
    table.position.set(0, 0.62, 0);
    table.receiveShadow = true;
    s.add(table);

    // interrupteur mural (pour l'effet blackout)
    this.switchMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.4, 0.08),
      new THREE.MeshStandardMaterial({ color: 0xcccccc, emissive: 0x000000 })
    );
    this.switchMesh.position.set(-2.6, 2.2, -3.95);
    s.add(this.switchMesh);
    const switchGlow = new THREE.PointLight(0xffff88, 0, 2);
    switchGlow.position.copy(this.switchMesh.position).z += 0.3;
    s.add(switchGlow);
    this.switchGlow = switchGlow;

    // boîtier alarme (pour l'effet alarm)
    this.alarmMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.45, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x882222, emissive: 0x000000 })
    );
    this.alarmMesh.position.set(2.6, 2.6, -3.95);
    s.add(this.alarmMesh);
    this.alarmLight = new THREE.PointLight(0xff2222, 0, 15);
    this.alarmLight.position.set(2.6, 2.6, -3.5);
    s.add(this.alarmLight);

    // tube néon au mur (pour l'effet « néon qui grésille »)
    this.neonMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 3.2, 12),
      new THREE.MeshStandardMaterial({ color: 0xdfefff, emissive: 0xbfd4ff, emissiveIntensity: 0.6 })
    );
    this.neonMesh.rotation.z = Math.PI / 2;
    this.neonMesh.position.set(0, 4.6, -3.9);
    s.add(this.neonMesh);

    // grille d'aération (pour l'effet fumée)
    this.ventMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x555a66 })
    );
    this.ventMesh.position.set(0, 3.4, -3.95);
    s.add(this.ventMesh);

    // poste radio (prop interactif pour l'effet « radio »)
    this.radioObj = new THREE.Group();
    const radioBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.3, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x7a4030, roughness: 0.7, emissive: 0x000000 })
    );
    this.radioObj.add(radioBody);
    this.radioMesh = radioBody;
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.06, 16),
      new THREE.MeshBasicMaterial({ color: 0x222211 })
    );
    dial.position.set(-0.12, 0, 0.115);
    this.radioObj.add(dial);
    const grille = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x33241e })
    );
    grille.position.set(0.13, 0, 0.115);
    this.radioObj.add(grille);
    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.55, 8),
      new THREE.MeshStandardMaterial({ color: 0xaaaaaa })
    );
    antenna.position.set(0.2, 0.35, 0);
    antenna.rotation.z = -0.5;
    this.radioObj.add(antenna);
    this.radioObj.position.set(2.3, TABLE_TOP + 0.15, -0.9);
    this.radioObj.rotation.y = -0.4;
    s.add(this.radioObj);

    // réveil (prop interactif pour l'effet « réveil »)
    this.clockObj = new THREE.Group();
    const clockBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.24, 0.14),
      new THREE.MeshStandardMaterial({ color: 0x30343c, roughness: 0.6, emissive: 0x000000 })
    );
    this.clockObj.add(clockBody);
    this.clockMesh = clockBody;
    const clockFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.28, 0.14),
      new THREE.MeshBasicMaterial({ map: textCanvas('00:00', { size: 60, color: '#ff4444', bg: '#0a0a0a' }) })
    );
    clockFace.position.set(0, 0, 0.075);
    this.clockObj.add(clockFace);
    this.clockObj.position.set(-2.3, TABLE_TOP + 0.12, -0.9);
    this.clockObj.rotation.y = 0.4;
    s.add(this.clockObj);

    // particules de fumée (cachées) — dense, doit masquer la bombe
    this.smokeGroup = new THREE.Group();
    const smat = new THREE.SpriteMaterial({ color: 0x555555, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 140; i++) {
      const sp = new THREE.Sprite(smat.clone());
      sp.position.set((Math.random() - 0.5) * 5, 0.8 + Math.random() * 3, (Math.random() - 0.5) * 3);
      sp.scale.setScalar(1.4 + Math.random() * 2.2);
      sp.userData.vy = 0.1 + Math.random() * 0.25;
      this.smokeGroup.add(sp);
    }
    this.smokeGroup.visible = false;
    s.add(this.smokeGroup);
  }

  // ---------- bombe ----------
  buildBomb(bomb) {
    if (this.bombGroup) this.scene.remove(this.bombGroup);
    this.bombGroup = new THREE.Group();
    this.bombGroup.position.y = BOMB.y;
    this.scene.add(this.bombGroup);
    this.interactives = [];
    this.moduleHandles = [];
    this.bomb = bomb;

    // corps
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(BOMB.w, BOMB.h, BOMB.d),
      new THREE.MeshStandardMaterial({ color: 0x4a4f5a, roughness: 0.5, metalness: 0.6 })
    );
    body.castShadow = true;
    this.bombGroup.add(body);

    this.buildTimer(bomb);
    this.buildWidgets(bomb);

    // modules sur les faces
    bomb.modules.forEach((m, i) => {
      const face = i < 6 ? 0 : 1; // 0 = avant, 1 = arrière
      const slot = i % 6;
      const col = slot % 3, row = Math.floor(slot / 3);
      const x = SLOT.cols[col], y = SLOT.rows[row];
      const holder = new THREE.Group();
      holder.position.set(face === 0 ? x : -x, y, (BOMB.d / 2 + 0.01) * (face === 0 ? 1 : -1));
      if (face === 1) holder.rotation.y = Math.PI;
      this.bombGroup.add(holder);

      const built = BUILDERS[m.type]?.(m, (act) => this.sendAction(i, act));
      if (built) {
        holder.add(built.group);
        // cadre cliquable du module (pour zoomer)
        const clickPlane = new THREE.Mesh(
          new THREE.PlaneGeometry(0.98, 0.98),
          new THREE.MeshBasicMaterial({ visible: false })
        );
        clickPlane.position.z = 0.005;
        clickPlane.userData = { moduleIndex: i, zoomTarget: true };
        holder.add(clickPlane);
        this.interactives.push(clickPlane, ...built.meshes);
        built.meshes.forEach(mm => mm.userData.moduleIndex = i);
        this.moduleHandles[i] = built;
      }
    });
  }

  buildTimer(bomb) {
    this.timerCanvas = document.createElement('canvas');
    this.timerCanvas.width = 512; this.timerCanvas.height = 160;
    this.timerTex = new THREE.CanvasTexture(this.timerCanvas);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.45),
      new THREE.MeshBasicMaterial({ map: this.timerTex })
    );
    panel.rotation.x = -Math.PI / 2;
    panel.position.set(0, BOMB.h / 2 + 0.006, 0);
    this.bombGroup.add(panel);
    this.timerPanel = panel;
    this._lastDrawnTenth = -1;
    this.drawTimer(bomb.timeTotalMs, 0, bomb.maxStrikes);
  }

  // écran éteint (effet « timeroff »)
  drawTimerBlank() {
    const c = this.timerCanvas, ctx = c.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#1a0806';
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText('-:--.-', c.width - 20, 115);
    this.timerTex.needsUpdate = true;
  }

  drawTimer(ms, strikes, maxStrikes) {
    const c = this.timerCanvas, ctx = c.getContext('2d');
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, c.width, c.height);
    const t = Math.max(0, Math.floor(ms / 100));
    const d = t % 10, s = Math.floor(t / 10) % 60, m = Math.floor(t / 600);
    ctx.fillStyle = ms < 30000 ? '#ff2222' : '#ff5544';
    ctx.font = 'bold 110px "Courier New", monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${m}:${String(s).padStart(2, '0')}.${d}`, c.width - 20, 115);
    ctx.textAlign = 'left';
    ctx.font = 'bold 60px monospace';
    for (let i = 0; i < Math.min(strikes, 5); i++) {
      ctx.fillStyle = '#ff3333';
      ctx.fillText('✕', 15 + i * 55, 100);
    }
    this.timerTex.needsUpdate = true;
  }

  buildWidgets(bomb) {
    // n° de série — tranche droite
    const serial = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.28),
      new THREE.MeshBasicMaterial({ map: textCanvas(bomb.serial, { size: 60, color: '#111', bg: '#ddd' }) })
    );
    serial.rotation.y = Math.PI / 2;
    serial.rotation.z = Math.PI / 2;
    serial.position.set(BOMB.w / 2 + 0.006, 0.5, 0);
    this.bombGroup.add(serial);

    // indicateurs — tranche droite (sous le série)
    bomb.indicators.forEach((ind, i) => {
      const g = new THREE.Group();
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.3, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x333844 })
      );
      g.add(box);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        new THREE.MeshBasicMaterial({ color: ind.lit ? 0x44ff66 : 0x1a2a1a })
      );
      dot.position.set(0.05, 0.07, 0);
      g.add(dot);
      const txt = new THREE.Mesh(
        new THREE.PlaneGeometry(0.4, 0.14),
        new THREE.MeshBasicMaterial({ map: textCanvas(ind.label, { size: 55, color: '#eee' }) })
      );
      txt.rotation.y = Math.PI / 2;
      txt.rotation.z = Math.PI / 2;
      txt.position.set(0.045, -0.06, 0);
      g.add(txt);
      g.rotation.x = 0;
      g.position.set(BOMB.w / 2 + 0.03, -0.15 - i * 0.45, 0.5 - i * 0.02);
      // dispose verticalement le long de la tranche droite
      g.position.set(BOMB.w / 2 + 0.03, 0.1 - i * 0.42, 0);
      this.bombGroup.add(g);
    });

    // piles — tranche gauche (AA fines, D grosses), couchées
    bomb.batteries.forEach((type, i) => {
      const r = type === 'D' ? 0.09 : 0.055;
      const bat = new THREE.Mesh(
        new THREE.CylinderGeometry(r, r, 0.5, 16),
        new THREE.MeshStandardMaterial({ color: type === 'D' ? 0xbb4444 : 0x4488bb, metalness: 0.5 })
      );
      bat.rotation.x = Math.PI / 2; // axe → Z, couchée sur la tranche
      bat.position.set(-BOMB.w / 2 - 0.04, 0.6 - i * 0.45, 0);
      this.bombGroup.add(bat);
    });

    // ports — tranche inférieure avant (dessinés en canvas)
    const PORT_NAMES = { 'DVI-D': 'DVI-D', 'Parallel': 'PARALLÈLE', 'PS2': 'PS/2', 'RJ-45': 'RJ-45', 'Serial': 'SÉRIE', 'StereoRCA': 'RCA' };
    bomb.ports.forEach((port, i) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.22),
        new THREE.MeshBasicMaterial({ map: textCanvas(PORT_NAMES[port] || port, { size: 44, color: '#eee', bg: '#222' }) })
      );
      m.rotation.x = Math.PI / 2;
      m.position.set(-0.9 + i * 0.6, -BOMB.h / 2 - 0.005, 0.3);
      this.bombGroup.add(m);
    });
  }

  // ---------- interaction ----------
  sendAction(moduleIndex, act) {
    this.net.send({ t: 'action', module: moduleIndex, ...act });
    this.audio.click();
  }

  bindEvents(canvas) {
    const get = (e) => {
      const r = canvas.getBoundingClientRect();
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    // intersectObjects est récursif : remonter jusqu'au mesh porteur de moduleIndex
    this.resolveInteractive = (o) => {
      while (o && o.userData.moduleIndex === undefined) o = o.parent;
      return o;
    };
    canvas.addEventListener('pointerdown', (e) => {
      get(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactives);
      if (!hits.length) { this._downInfo = null; return; }
      const mesh = this.resolveInteractive(hits[0].object);
      if (!mesh) { this._downInfo = null; return; }
      this._downInfo = { mesh, t: performance.now() };
      // les interactions directes exigent d'être zoomé sur le module
      if (this.zoomed !== null && mesh.userData.moduleIndex === this.zoomed.i && mesh.userData.holdable) {
        mesh.userData.down?.();
      }
    });
    const up = (e) => {
      if (this._downInfo?.mesh?.userData.holdable && this.zoomed !== null) {
        this._downInfo.mesh.userData.up?.();
      }
      this._downInfo = null;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointerleave', up);

    canvas.addEventListener('click', (e) => {
      get(e);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactives);
      if (!hits.length) {
        // clic sur les objets d'effet ?
        this.checkEffectClick();
        return;
      }
      const mesh = this.resolveInteractive(hits[0].object);
      if (!mesh) return;
      const i = mesh.userData.moduleIndex;
      if (this.zoomed === null && i !== undefined) {
        this.zoomTo(i);
      } else if (this.zoomed !== null && i === this.zoomed.i && mesh.userData.action) {
        mesh.userData.action();
      } else if (this.zoomed !== null && i !== undefined && i !== this.zoomed.i) {
        this.zoomTo(i); // re-zoom direct sur un autre module
      }
    });

    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.zoomed !== null) this.zoomOut();
    });
  }

  checkEffectClick() {
    if (!this.effect) return;
    const target = {
      blackout: this.switchMesh, alarm: this.alarmMesh, smoke: this.ventMesh,
      radio: this.radioObj, alarmclock: this.clockObj,
    }[this.effect.kind];
    if (!target) return;
    const hits = this.raycaster.intersectObject(target, true);
    if (hits.length) {
      this.net.send({ t: 'action', a: 'fix-effect', id: this.effect.id });
      this.audio.click();
    }
  }

  zoomTo(i) {
    const holder = this.moduleHandles[i]?.group;
    if (!holder) return;
    this.returning = null;
    const pos = new THREE.Vector3();
    holder.getWorldPosition(pos);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(holder.getWorldQuaternion(new THREE.Quaternion()));
    this.zoomed = {
      i,
      camPos: pos.clone().add(normal.multiplyScalar(1.25)).add(new THREE.Vector3(0, 0.05, 0)),
      lookAt: pos,
    };
    this.controls.enabled = false;
    document.getElementById('zoom-out').classList.remove('hidden');
    // aide à identifier le module dans le manuel
    const type = this.bomb?.modules[i]?.type;
    const name = MODULE_NAMES[type] || type;
    const prompt = document.getElementById('prompt');
    if (prompt) {
      prompt.textContent = `Module : ${name}`;
      prompt.classList.remove('hidden');
      clearTimeout(prompt._t);
      prompt._t = setTimeout(() => prompt.classList.add('hidden'), 2500);
    }
  }

  zoomOut() {
    if (!this.zoomed) return;
    this.zoomed = null;
    this.returning = { camPos: this.homePos.clone(), lookAt: this.homeTarget.clone() };
    document.getElementById('zoom-out').classList.add('hidden');
  }

  // ---------- mises à jour ----------
  updateModule(i, m) {
    this.moduleHandles[i]?.group.userData.update?.(m);
    if (m.type === 'simon') this.simonAnims.set(i, { seq: m.flash, t: 0, playing: true });
  }

  setEffect(effect) {
    this.effect = effect;
    const b = document.getElementById('effect-banner');
    if (!effect) {
      // restore
      const { amb, key, fill, baseInt } = this.lights;
      amb.intensity = baseInt.amb; key.intensity = baseInt.key; fill.intensity = baseInt.fill;
      this.alarmLight.intensity = 0;
      this.switchGlow.intensity = 0;
      this.switchMesh.material.emissive.set(0x000000);
      this.alarmMesh.material.emissive.set(0x000000);
      this.radioMesh.material.emissive.set(0x000000);
      this.clockMesh.material.emissive.set(0x000000);
      this.neonMesh.material.emissiveIntensity = 0.6;
      this.smokeGroup.visible = false;
      if (this.bombGroup) this.bombGroup.visible = true;
      if (this.timerPanel) this.timerPanel.visible = true;
      this._timerOffAt = 0;
      this.scene.fog = new THREE.Fog(0x0a0c10, 8, 30);
      const fo = document.getElementById('flash-overlay');
      if (fo) { fo.style.opacity = '0'; fo.classList.add('hidden'); }
      this.audio.stopAlarm();
      this.audio.stopNeonBuzz();
      this.audio.stopRumble();
      b.classList.add('hidden');
      return;
    }
    b.classList.remove('hidden');
    if (effect.kind === 'blackout') {
      // noir total : même les affichages lumineux de la bombe disparaissent
      this.lights.amb.intensity = 0;
      this.lights.key.intensity = 0;
      this.lights.fill.intensity = 0;
      if (this.bombGroup) this.bombGroup.visible = false;
      this.switchMesh.material.emissive.set(0xaaaa00);
      this.switchGlow.intensity = 4;
      b.textContent = '⚡ Coupure de courant ! Trouvez l\'interrupteur dans le noir.';
      this.audio.thunder();
    } else if (effect.kind === 'alarm') {
      this.alarmMesh.material.emissive.set(0xff0000);
      b.textContent = '🚨 Alarme ! Trouvez le boîtier pour la couper.';
      this.audio.startAlarm();
    } else if (effect.kind === 'smoke') {
      this.smokeGroup.visible = true;
      this.scene.fog = new THREE.FogExp2(0x484848, 0.3); // fumée épaisse
      b.textContent = '💨 Fumée ! Cliquez sur la grille d\'aération.';
    } else if (effect.kind === 'radio') {
      this.radioMesh.material.emissive.set(0xff4400);
      b.textContent = '📻 Une radio s\'est déclenchée à fond ! Cliquez dessus pour l\'éteindre.';
    } else if (effect.kind === 'alarmclock') {
      this.clockMesh.material.emissive.set(0xffaa00);
      b.textContent = '⏰ Un réveil sonne ! Cliquez dessus pour l\'arrêter.';
    } else if (effect.kind === 'friture') {
      b.textContent = effect.target === 'defuser'
        ? '📶 Friture sur la ligne — vous entendez mal l\'expert.'
        : '📶 Friture sur la ligne — l\'expert vous entend mal.';
    } else if (effect.kind === 'flashbang') {
      const fo = document.getElementById('flash-overlay');
      if (fo) {
        fo.classList.remove('hidden');
        fo.style.transition = 'none';
        fo.style.opacity = '1';
        requestAnimationFrame(() => {
          fo.style.transition = 'opacity 2.8s';
          fo.style.opacity = '0';
        });
      }
      this.audio.tinnitus();
      b.textContent = '💥 Flash aveuglant !';
    } else if (effect.kind === 'neon') {
      this.audio.startNeonBuzz();
      b.textContent = '💡 Le néon grésille — la lumière saute !';
    } else if (effect.kind === 'quake') {
      this.audio.startRumble();
      b.textContent = '🌋 Séisme ! Tout tremble…';
    } else if (effect.kind === 'timeroff') {
      this._timerOffAt = performance.now();
      b.textContent = '⌛ Le timer de la bombe s\'éteint !';
    }
  }

  // appelé à chaque tick serveur — stocke la synchro, le rendu interpole
  updateTimer(ms, strikes, maxStrikes) {
    if (ms === undefined || ms === null) {
      if (this.timerState) { this.timerState.strikes = strikes; this.timerState.maxStrikes = maxStrikes; }
      return;
    }
    this.timerState = { ms, at: performance.now(), strikes, maxStrikes };
  }

  // rendu du timer : décrément local fluide au dixième (accéléré par les erreurs)
  renderTimerFrame() {
    if (!this.timerState || !this.timerCanvas) return;
    const { ms, at, strikes, maxStrikes } = this.timerState;
    const speed = 1 + strikes * 0.25;
    const cur = Math.max(0, ms - (performance.now() - at) * speed);
    // effet « timeroff » : scintille ~1.5 s puis écran éteint
    if (this.effect?.kind === 'timeroff') {
      const dt = performance.now() - this._timerOffAt;
      const show = dt < 1500 ? Math.random() < 0.45 : Math.random() < 0.02;
      if (show !== this._timerOffShown) {
        this._timerOffShown = show;
        if (show) this.drawTimer(cur, strikes, maxStrikes);
        else this.drawTimerBlank();
      }
      return;
    }
    const tenth = Math.floor(cur / 100);
    if (tenth !== this._lastDrawnTenth) {
      this._lastDrawnTenth = tenth;
      this.drawTimer(cur, strikes, maxStrikes);
    }
  }

  explode() {
    this.audio.explosion();
    // flash + secousse
    const flash = new THREE.PointLight(0xffaa33, 300, 40);
    flash.position.set(0, 2, 0);
    this.scene.add(flash);
    setTimeout(() => { this.scene.remove(flash); }, 900);
    this.bombGroup.rotation.z = 0.15;
    this.bombGroup.position.x += 0.2;
  }

  frame() {
    this.renderTimerFrame();
    // animation zoom (avant/retour)
    if (this.zoomed) {
      this.camera.position.lerp(this.zoomed.camPos, 0.12);
      this.controls.target.lerp(this.zoomed.lookAt, 0.12);
      this.camera.lookAt(this.controls.target);
    } else if (this.returning) {
      this.camera.position.lerp(this.returning.camPos, 0.2);
      this.controls.target.lerp(this.returning.lookAt, 0.2);
      this.camera.lookAt(this.controls.target);
      if (this.camera.position.distanceTo(this.homePos) < 0.05) {
        this.returning = null;
        this.controls.enabled = true;
      }
    } else {
      this.controls.update();
    }
    // alarme : strobo
    if (this.effect?.kind === 'alarm') {
      this.alarmLight.intensity = (Math.sin(performance.now() / 90) > 0) ? 60 : 0;
    }
    // néon : la lumière principale saute + le tube scintille
    if (this.effect?.kind === 'neon') {
      const on = Math.random() > 0.45;
      this.lights.key.intensity = on ? this.lights.baseInt.key : 3;
      this.lights.amb.intensity = on ? this.lights.baseInt.amb : 0.03;
      this.neonMesh.material.emissiveIntensity = on ? 2.5 : 0.05;
    }
    // séisme : la scène entière tremble
    if (this.effect?.kind === 'quake') {
      const a = 0.06;
      this.scene.position.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.5, 0);
    } else if (this.scene.position.x !== 0 || this.scene.position.y !== 0) {
      this.scene.position.set(0, 0, 0);
    }
    // fumée : particules montantes
    if (this.smokeGroup.visible) {
      for (const sp of this.smokeGroup.children) {
        sp.position.y += sp.userData.vy * 0.016;
        if (sp.position.y > 4) sp.position.y = 0.8;
      }
    }
    // simon : rejouer la séquence en boucle
    for (const [i, anim] of this.simonAnims) {
      const pads = this.moduleHandles[i]?.group.userData.pads;
      if (!pads || !anim.seq?.length) continue;
      anim.t += 1 / 60;
      const idx = Math.floor(anim.t / 0.6);
      const on = anim.t % 0.6 < 0.3;
      for (const p of Object.values(pads)) p.material.emissive.set(0x000000);
      if (idx < anim.seq.length && on) pads[anim.seq[idx]]?.material.emissive.set(0xffffff);
      if (idx >= anim.seq.length + 3) anim.t = 0; // pause puis boucle
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
