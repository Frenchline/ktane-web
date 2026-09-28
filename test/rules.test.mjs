// Tests unitaires des règles du manuel
import { wiresCorrectIndex, buttonSolution, buttonStripDigit, memoryRule, simonMapping, serialIsOdd, serialHasVowel } from '../server/modules.js';
import assert from 'assert';

const bomb = (serial = 'AA11', batteries = [], indicators = []) => ({
  serial, batteries, indicators,
});

// ---- FILS ----
// 3 fils : pas de rouge → 2e ; dernier blanc → dernier ; >1 bleu → dernier bleu ; sinon dernier
assert.equal(wiresCorrectIndex({ wires: ['blue', 'yellow', 'black'] }, bomb()), 1, '3f pas de rouge → 2e');
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'white'] }, bomb()), 2, '3f dernier blanc → dernier');
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'blue'] }, bomb()), 2, '3f 2 bleus → dernier bleu');
assert.equal(wiresCorrectIndex({ wires: ['red', 'yellow', 'blue'] }, bomb()), 2, '3f sinon dernier');
// 4 fils
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'red', 'white'] }, bomb('AA11')), 2, '4f 2 rouges + série impair → dernier rouge');
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'red', 'white'] }, bomb('AA12')), 0, '4f pair + bleu unique → 1er');
assert.equal(wiresCorrectIndex({ wires: ['blue', 'blue', 'yellow', 'yellow'] }, bomb('AA12')), 0, '4f dernier jaune+pas rouge → 1er');
assert.equal(wiresCorrectIndex({ wires: ['blue', 'blue', 'yellow', 'red'] }, bomb('AA12')), 1, '4f aucune règle → 2e');
assert.equal(wiresCorrectIndex({ wires: ['red', 'yellow', 'yellow', 'white'] }, bomb('AA12')), 3, '4f >1 jaune → dernier fil');
assert.equal(wiresCorrectIndex({ wires: ['white', 'black', 'red', 'yellow'] }, bomb('AA12')), 1, '4f dernier jaune MAIS rouge présent → sinon 2e');
// 5 fils
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'yellow', 'black', 'black'] }, bomb('AA11')), 3, '5f dernier noir + impair → 4e');
assert.equal(wiresCorrectIndex({ wires: ['red', 'yellow', 'yellow', 'black', 'blue'] }, bomb('AA12')), 0, '5f 1 rouge + >1 jaune → 1er');
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'yellow', 'white', 'blue'] }, bomb('AA12')), 1, '5f pas de noir → 2e');
assert.equal(wiresCorrectIndex({ wires: ['red', 'black', 'yellow', 'white', 'blue'] }, bomb('AA12')), 0, '5f sinon → 1er');
// 6 fils
assert.equal(wiresCorrectIndex({ wires: ['red', 'blue', 'white', 'black', 'blue', 'red'] }, bomb('AA11')), 2, '6f pas jaune + impair → 3e');
assert.equal(wiresCorrectIndex({ wires: ['blue', 'yellow', 'white', 'white', 'red', 'blue'] }, bomb('AA12')), 3, '6f 1 jaune + >1 blanc → 4e');
assert.equal(wiresCorrectIndex({ wires: ['blue', 'yellow', 'white', 'black', 'blue', 'yellow'] }, bomb('AA12')), 5, '6f pas de rouge → dernier');
assert.equal(wiresCorrectIndex({ wires: ['red', 'yellow', 'white', 'yellow', 'blue', 'red'] }, bomb('AA12')), 3, '6f sinon → 4e');

// ---- BOUTON ----
const B = (color, label) => ({ color, label });
const inds = (l, lit = true) => [{ label: l, lit }];
assert.equal(buttonSolution(B('blue', 'ANNULER'), bomb()), 'hold');
assert.equal(buttonSolution(B('red', 'EXPLOSER'), bomb('AA11', ['AA', 'AA'])), 'tap');
assert.equal(buttonSolution(B('white', 'APPUYER'), bomb('AA11', [], inds('CAR'))), 'hold');
assert.equal(buttonSolution(B('blue', 'APPUYER'), bomb('AA11', ['AA', 'AA', 'AA'], inds('FRK'))), 'tap');
assert.equal(buttonSolution(B('yellow', 'APPUYER'), bomb()), 'hold');
assert.equal(buttonSolution(B('red', 'MAINTENIR'), bomb()), 'tap');
assert.equal(buttonSolution(B('white', 'APPUYER'), bomb()), 'hold'); // fallback
assert.equal(buttonStripDigit('blue'), '4');
assert.equal(buttonStripDigit('white'), '1');
assert.equal(buttonStripDigit('yellow'), '5');
assert.equal(buttonStripDigit('other'), '1');

// ---- MEMORY ----
// étape 1 (idx 0) display 2 → pos 2 ; on mémorise {pos:2,label:labels[1]}
const st = [{ display: 2, labels: [3, 1, 4, 2] }];
let r = memoryRule(0, 2, []);
assert.deepEqual(r, { by: 'pos', value: 2 });
const hist = [{ pos: 2, label: 1 }];
// étape 2 display 4 → même pos qu'étape 1 = 2
assert.deepEqual(memoryRule(1, 4, hist), { by: 'pos', value: 2 });
// étape 3 display 1 → même chiffre qu'étape 2 ... etc
const hist3 = [{ pos: 2, label: 1 }, { pos: 1, label: 4 }];
assert.deepEqual(memoryRule(2, 1, hist3), { by: 'label', value: 4 });
const hist4 = [{ pos: 2, label: 1 }, { pos: 1, label: 4 }, { pos: 3, label: 2 }];
assert.deepEqual(memoryRule(3, 3, hist4), { by: 'pos', value: 1 });
const hist5 = [{ pos: 2, label: 1 }, { pos: 1, label: 4 }, { pos: 3, label: 2 }, { pos: 4, label: 3 }];
assert.deepEqual(memoryRule(4, 4, hist5), { by: 'label', value: 2 });

// ---- SIMON ----
const m0 = simonMapping(bomb('AB1E'), 0); // voyelle E
assert.equal(m0.red, 'blue');
const m1 = simonMapping(bomb('BC12'), 1); // sans voyelle, 1 erreur
assert.equal(m1.red, 'red');
assert.ok(serialIsOdd('AA11'));
assert.ok(!serialIsOdd('AA12'));
assert.ok(serialHasVowel('AB1E'));
assert.ok(!serialHasVowel('BC12'));

console.log('✅ Tous les tests de règles passent');
