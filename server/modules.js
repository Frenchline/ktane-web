// Définitions des modules : génération + validation (règles du manuel FR v1)

export const MODULE_TYPES = ['wires', 'button', 'keypad', 'simon', 'memory', 'capacitor'];
export const NEEDY_TYPES = ['capacitor'];

// ---------- données statiques ----------

export const KEYPAD_COLUMNS = [
  ['balloon', 'at', 'upsidedowny', 'squigglyn', 'squidknife', 'hookn', 'leftc'],
  ['euro', 'balloon', 'leftc', 'cursive', 'hollowstar', 'hookn', 'questionmark'],
  ['copyright', 'pumpkin', 'cursive', 'doublek', 'meltedthree', 'upsidedowny', 'hollowstar'],
  ['six', 'paragraph', 'bt', 'squidknife', 'doublek', 'questionmark', 'smileyface'],
  ['pitchfork', 'smileyface', 'bt', 'rightc', 'paragraph', 'dragon', 'filledstar'],
  ['six', 'euro', 'tracks', 'ae', 'pitchfork', 'nwithhat', 'omega'],
];

const WIRE_COLORS = ['red', 'blue', 'yellow', 'white', 'black']; // rouge, bleu, jaune, blanc, noir
const BUTTON_COLORS = ['blue', 'white', 'yellow', 'red'];
const BUTTON_LABELS = ['ANNULER', 'EXPLOSER', 'MAINTENIR', 'APPUYER'];
const STRIP_COLORS = ['blue', 'white', 'yellow', 'other'];
const SIMON_COLORS = ['red', 'blue', 'green', 'yellow'];

// Tables Simon (manuel FR)
const SIMON_VOWEL = {
  0: { red: 'blue', blue: 'red', green: 'yellow', yellow: 'green' },
  1: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
  2: { red: 'green', blue: 'red', green: 'yellow', yellow: 'blue' },
};
const SIMON_NO_VOWEL = {
  0: { red: 'blue', blue: 'yellow', green: 'green', yellow: 'red' },
  1: { red: 'red', blue: 'blue', green: 'yellow', yellow: 'green' },
  2: { red: 'yellow', blue: 'green', green: 'blue', yellow: 'red' },
};

// ---------- helpers bombe ----------

export function serialIsOdd(serial) {
  return parseInt(serial.slice(-1), 10) % 2 === 1;
}
export function serialHasVowel(serial) {
  return /[AEIOU]/.test(serial); // Y n'est PAS une voyelle dans KTANE
}

// ---------- génération ----------

export function generateModule(type, rng, bomb) {
  switch (type) {
    case 'wires': {
      const n = rng.int(3, 6);
      const wires = Array.from({ length: n }, () => rng.pick(WIRE_COLORS));
      return { type, wires, cut: null, solved: false };
    }
    case 'button': {
      return {
        type,
        color: rng.pick(BUTTON_COLORS),
        label: rng.pick(BUTTON_LABELS),
        strip: rng.pick(STRIP_COLORS),
        holding: false,
        stripRevealed: false,
        solved: false,
      };
    }
    case 'keypad': {
      // 4 symboles qui n'appartiennent qu'à UNE seule colonne
      let symbols;
      for (let tries = 0; tries < 50; tries++) {
        const col = rng.pick(KEYPAD_COLUMNS);
        symbols = rng.shuffle([...new Set(col)]).slice(0, 4);
        const colsContaining = KEYPAD_COLUMNS.filter(c => symbols.every(s => c.includes(s)));
        if (colsContaining.length === 1) break;
      }
      return { type, symbols, pressed: [], solved: false };
    }
    case 'simon': {
      const stages = rng.int(3, 5);
      const sequence = Array.from({ length: stages }, () => rng.pick(SIMON_COLORS));
      return { type, sequence, stages, stage: 0, inputPos: 0, solved: false };
    }
    case 'memory': {
      const stages = [];
      for (let i = 0; i < 5; i++) {
        stages.push({
          display: rng.int(1, 4),
          labels: rng.shuffle([1, 2, 3, 4]),
        });
      }
      return { type, stages, stage: 0, history: [], solved: false };
    }
    case 'capacitor': {
      return { type, needy: true, active: false, charge: 0, holding: false, solved: false };
    }
    default:
      throw new Error('module inconnu: ' + type);
  }
}

// ---------- règles de résolution ----------

export function wiresCorrectIndex(mod, bomb) {
  const w = mod.wires, n = w.length;
  const count = (c) => w.filter(x => x === c).length;
  const last = w[n - 1];
  const odd = serialIsOdd(bomb.serial);
  if (n === 3) {
    if (count('red') === 0) return 1;
    if (last === 'white') return n - 1;
    if (count('blue') > 1) return w.lastIndexOf('blue');
    return n - 1;
  }
  if (n === 4) {
    if (count('red') > 1 && odd) return w.lastIndexOf('red');
    if (last === 'yellow' && count('red') === 0) return 0;
    if (count('blue') === 1) return 0;
    if (count('yellow') > 1) return n - 1;
    return 1;
  }
  if (n === 5) {
    if (last === 'black' && odd) return 3;
    if (count('red') === 1 && count('yellow') > 1) return 0;
    if (count('black') === 0) return 1;
    return 0;
  }
  // 6 fils
  if (count('yellow') === 0 && odd) return 2;
  if (count('yellow') === 1 && count('white') > 1) return 3;
  if (count('red') === 0) return n - 1;
  return 3;
}

export function buttonSolution(mod, bomb) {
  // renvoie 'tap' ou 'hold'
  const lit = (l) => bomb.indicators.some(i => i.label === l && i.lit);
  const bats = bomb.batteries.length;
  if (mod.color === 'blue' && mod.label === 'ANNULER') return 'hold';
  if (bats > 1 && mod.label === 'EXPLOSER') return 'tap';
  if (mod.color === 'white' && lit('CAR')) return 'hold';
  if (bats > 2 && lit('FRK')) return 'tap';
  if (mod.color === 'yellow') return 'hold';
  if (mod.color === 'red' && mod.label === 'MAINTENIR') return 'tap';
  return 'hold';
}

// chiffre à afficher au moment du relâchement selon la bande
export function buttonStripDigit(strip) {
  if (strip === 'blue') return '4';
  if (strip === 'white') return '1';
  if (strip === 'yellow') return '5';
  return '1';
}

export function simonMapping(bomb, strikes) {
  const table = serialHasVowel(bomb.serial) ? SIMON_VOWEL : SIMON_NO_VOWEL;
  return table[Math.min(strikes, 2)];
}

// règle mémoire : renvoie {by: 'pos'|'label', value}
export function memoryRule(stageIdx, display, history) {
  // history[i] = {pos, label} des étapes précédentes
  const h = history;
  switch (stageIdx) {
    case 0:
      if (display === 1) return { by: 'pos', value: 2 };
      if (display === 2) return { by: 'pos', value: 2 };
      if (display === 3) return { by: 'pos', value: 3 };
      return { by: 'pos', value: 4 };
    case 1:
      if (display === 1) return { by: 'label', value: 4 };
      if (display === 2) return { by: 'pos', value: h[0].pos };
      if (display === 3) return { by: 'pos', value: 1 };
      return { by: 'pos', value: h[0].pos };
    case 2:
      if (display === 1) return { by: 'label', value: h[1].label };
      if (display === 2) return { by: 'label', value: h[0].label };
      if (display === 3) return { by: 'pos', value: 3 };
      return { by: 'label', value: 4 };
    case 3:
      if (display === 1) return { by: 'pos', value: h[0].pos };
      if (display === 2) return { by: 'pos', value: 1 };
      if (display === 3) return { by: 'pos', value: h[1].pos };
      return { by: 'pos', value: h[1].pos };
    case 4:
      if (display === 1) return { by: 'label', value: h[0].label };
      if (display === 2) return { by: 'label', value: h[1].label };
      if (display === 3) return { by: 'label', value: h[3].label };
      return { by: 'label', value: h[2].label };
  }
}

// ---------- génération des widgets de la bombe ----------

// lettres lisibles sans ambiguïté chiffre/lettre : pas de I (1), O (0), Q (O)
const SERIAL_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';
const INDICATOR_LABELS = ['SND', 'CLR', 'CAR', 'IND', 'FRQ', 'SIG', 'NSA', 'MSA', 'TRN', 'BOB', 'FRK'];
const PORT_TYPES = ['DVI-D', 'Parallel', 'PS2', 'RJ-45', 'Serial', 'StereoRCA'];

export function generateSerial(rng) {
  // format L L D L L D : lettres et chiffres à positions fixes → aucune ambiguïté
  let s = '';
  s += rng.pick([...SERIAL_LETTERS]);
  s += rng.pick([...SERIAL_LETTERS]);
  s += rng.int(0, 9);
  s += rng.pick([...SERIAL_LETTERS]);
  s += rng.pick([...SERIAL_LETTERS]);
  s += rng.int(0, 9);
  return s;
}

export function generateWidgets(rng) {
  // piles : 1 à 4, types AA ou D
  const nBat = rng.int(1, 4);
  const batteries = Array.from({ length: nBat }, () => rng.pick(['AA', 'D']));
  // indicateurs : 0 à 3
  const nInd = rng.int(0, 3);
  const labels = rng.shuffle(INDICATOR_LABELS).slice(0, nInd);
  const indicators = labels.map(l => ({ label: l, lit: rng.chance(0.7) }));
  // ports : 0 à 3 types distincts
  const nPorts = rng.int(0, 3);
  const ports = rng.shuffle(PORT_TYPES).slice(0, nPorts);
  return { batteries, indicators, ports };
}
