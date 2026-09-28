// Vue expert : manuel intégré (contenu fidèle au manuel FR v1)

const SYM = (n) => `<img class="sym" src="/img/keypad/${n}.png">`;

const KEYPAD_COLS = [
  ['28-balloon','13-at','30-upsidedowny','12-squigglyn','7-squidknife','9-hookn','23-leftc'],
  ['16-euro','28-balloon','23-leftc','26-cursive','3-hollowstar','9-hookn','20-questionmark'],
  ['1-copyright','8-pumpkin','26-cursive','5-doublek','15-meltedthree','30-upsidedowny','3-hollowstar'],
  ['11-six','21-paragraph','31-bt','7-squidknife','5-doublek','20-questionmark','4-smileyface'],
  ['24-pitchfork','4-smileyface','31-bt','22-rightc','21-paragraph','19-dragon','2-filledstar'],
  ['11-six','16-euro','27-tracks','14-ae','24-pitchfork','18-nwithhat','6-omega'],
];

const SECTIONS = {
  regles: {
    title: 'Règles générales',
    html: `
      <h3>Désamorcer des bombes</h3>
      <p>Une bombe explose lorsque son compte à rebours atteint 0:00 ou lorsque trop d'erreurs ont été commises. Le seul moyen de désamorcer une bombe est de désarmer chaque module avant la fin du compte à rebours.</p>
      <p><b>Modules :</b> jusqu'à 11 modules, indépendants, désarmables dans n'importe quel ordre. Une petite lumière verte en haut à droite indique un module désarmé.</p>
      <p><b>Erreurs :</b> la bombe explose à l'erreur max atteinte. Le compte à rebours accélère à chaque erreur.</p>
      <p><b>Informations :</b> certaines instructions nécessitent des infos sur la bombe (n° de série, piles, ports, indicateurs) — situées sur les tranches de la bombe. Voir les annexes.</p>`,
  },
  fils: {
    title: 'Fils',
    html: `
      <h3>À propos des Fils</h3>
      <p>3 à 6 fils. Seul un fil doit être coupé. Ordre : de haut en bas.</p>
      <table><tr><th>3 fils</th></tr><tr><td>
        <ul><li>S'il n'y a pas de fil rouge → couper le <b>2ᵉ</b> fil.</li>
        <li>Sinon, si le dernier fil est blanc → couper le <b>dernier</b> fil.</li>
        <li>Sinon, s'il y a plus d'un fil bleu → couper le <b>dernier fil bleu</b>.</li>
        <li>Sinon → couper le <b>dernier</b> fil.</li></ul></td></tr>
      <tr><th>4 fils</th></tr><tr><td>
        <ul><li>Plus d'un fil rouge ET dernier chiffre du n° de série impair → couper le <b>dernier fil rouge</b>.</li>
        <li>Sinon, dernier fil jaune ET pas de fil rouge → couper le <b>1ᵉʳ</b> fil.</li>
        <li>Sinon, exactement un fil bleu → couper le <b>1ᵉʳ</b> fil.</li>
        <li>Sinon, plus d'un fil jaune → couper le <b>dernier</b> fil.</li>
        <li>Sinon → couper le <b>2ᵉ</b> fil.</li></ul></td></tr>
      <tr><th>5 fils</th></tr><tr><td>
        <ul><li>Dernier fil noir ET dernier chiffre du n° de série impair → couper le <b>4ᵉ</b> fil.</li>
        <li>Sinon, exactement un fil rouge ET plus d'un fil jaune → couper le <b>1ᵉʳ</b> fil.</li>
        <li>Sinon, pas de fil noir → couper le <b>2ᵉ</b> fil.</li>
        <li>Sinon → couper le <b>1ᵉʳ</b> fil.</li></ul></td></tr>
      <tr><th>6 fils</th></tr><tr><td>
        <ul><li>Pas de fil jaune ET dernier chiffre du n° de série impair → couper le <b>3ᵉ</b> fil.</li>
        <li>Sinon, exactement un fil jaune ET plus d'un fil blanc → couper le <b>4ᵉ</b> fil.</li>
        <li>Sinon, pas de fil rouge → couper le <b>dernier</b> fil.</li>
        <li>Sinon → couper le <b>4ᵉ</b> fil.</li></ul></td></tr></table>`,
  },
  bouton: {
    title: 'Bouton',
    html: `
      <h3>À propos du Bouton</h3>
      <p>Suivre ces règles dans l'ordre. Effectuer la première action qui répond aux critères :</p>
      <ol>
        <li>Bouton <b>bleu</b> marqué « <b>Annuler</b> » → maintenir le bouton (voir « Relâcher »).</li>
        <li>Plus d'une pile sur la bombe ET bouton marqué « <b>Exploser</b> » → appuyer et relâcher immédiatement.</li>
        <li>Bouton <b>blanc</b> ET indicateur allumé « <b>CAR</b> » → maintenir.</li>
        <li>Plus de deux piles ET indicateur allumé « <b>FRK</b> » → appuyer et relâcher.</li>
        <li>Bouton <b>jaune</b> → maintenir.</li>
        <li>Bouton <b>rouge</b> marqué « <b>Maintenir</b> » → appuyer et relâcher.</li>
        <li>Aucune règle → maintenir.</li>
      </ol>
      <h3>Relâcher un bouton enfoncé</h3>
      <p>En maintenant le bouton, une <b>bande colorée</b> s'allume à droite du module. Relâcher selon sa couleur :</p>
      <ul>
        <li><b>Bleue</b> → le compte à rebours affiche un <b>4</b> (n'importe quelle position).</li>
        <li><b>Blanche</b> → affiche un <b>1</b>.</li>
        <li><b>Jaune</b> → affiche un <b>5</b>.</li>
        <li><b>Autre couleur</b> → affiche un <b>1</b>.</li>
      </ul>`,
  },
  clavier: {
    title: 'Clavier',
    html: `
      <h3>À propos du Clavier</h3>
      <p>Une seule colonne contient les quatre symboles du clavier. Appuyer sur les boutons dans leur ordre d'apparition dans cette colonne, de haut en bas.</p>
      <table><tr>${KEYPAD_COLS.map(() => '<th></th>').join('')}</tr>
      ${[0,1,2,3,4,5,6].map(r => '<tr>' + KEYPAD_COLS.map(c => `<td>${SYM(c[r])}</td>`).join('')).join('')}</tr>
      </table>`,
  },
  simon: {
    title: 'Simon',
    html: `
      <h3>À propos du Simon</h3>
      <p>Un bouton s'allume ; appuyer sur le bouton correspondant selon la table. La séquence s'allonge à chaque réussite jusqu'au désarmement.</p>
      <p><b>Si le n° de série contient une voyelle</b> (A, E, I, O, U — le Y n'est <b>pas</b> une voyelle) :</p>
      <table><tr><th>Erreurs</th><th>Flash rouge</th><th>Flash bleu</th><th>Flash vert</th><th>Flash jaune</th></tr>
      <tr><td>0</td><td>Bleu</td><td>Rouge</td><td>Jaune</td><td>Vert</td></tr>
      <tr><td>1</td><td>Jaune</td><td>Vert</td><td>Bleu</td><td>Rouge</td></tr>
      <tr><td>2</td><td>Vert</td><td>Rouge</td><td>Jaune</td><td>Bleu</td></tr></table>
      <p><b>Si le n° de série ne contient pas de voyelle :</b></p>
      <table><tr><th>Erreurs</th><th>Flash rouge</th><th>Flash bleu</th><th>Flash vert</th><th>Flash jaune</th></tr>
      <tr><td>0</td><td>Bleu</td><td>Jaune</td><td>Vert</td><td>Rouge</td></tr>
      <tr><td>1</td><td>Rouge</td><td>Bleu</td><td>Jaune</td><td>Vert</td></tr>
      <tr><td>2</td><td>Jaune</td><td>Vert</td><td>Bleu</td><td>Rouge</td></tr></table>`,
  },
  memory: {
    title: 'Memory',
    html: `
      <h3>À propos du Memory</h3>
      <p>Appuyer sur la bonne touche pour passer à l'étape suivante (5 étapes). Une erreur = retour à l'étape 1. Boutons ordonnés de gauche à droite.</p>
      <table>
      <tr><th>Étape</th><th>Écran = 1</th><th>Écran = 2</th><th>Écran = 3</th><th>Écran = 4</th></tr>
      <tr><td>1</td><td>2ᵉ position</td><td>2ᵉ position</td><td>3ᵉ position</td><td>4ᵉ position</td></tr>
      <tr><td>2</td><td>chiffre « 4 »</td><td>même pos. qu'étape 1</td><td>1ʳᵉ position</td><td>même pos. qu'étape 1</td></tr>
      <tr><td>3</td><td>même chiffre qu'étape 2</td><td>même chiffre qu'étape 1</td><td>3ᵉ position</td><td>chiffre « 4 »</td></tr>
      <tr><td>4</td><td>même pos. qu'étape 1</td><td>1ʳᵉ position</td><td>même pos. qu'étape 2</td><td>même pos. qu'étape 2</td></tr>
      <tr><td>5</td><td>même chiffre qu'étape 1</td><td>même chiffre qu'étape 2</td><td>même chiffre qu'étape 4</td><td>même chiffre qu'étape 3</td></tr>
      </table>`,
  },
  demandant: {
    title: 'Condensateur (demandant)',
    html: `
      <h3>Modules demandants</h3>
      <p>Ces modules ne peuvent pas être désarmés : ils se réactivent à tout moment et doivent être traités avant la fin de leur compte à rebours, sinon → erreur.</p>
      <h3>Condensateur</h3>
      <p>Décharger le condensateur avant qu'il ne surcharge en <b>maintenant le levier en bas</b> jusqu'à ce que la jauge redescende à zéro.</p>`,
  },
  annexeA: {
    title: 'Annexe A — Indicateurs',
    html: `
      <h3>Indicateurs</h3>
      <p>Étiquette + lumière sur les tranches de la bombe. Seuls les indicateurs <b>allumés</b> comptent.</p>
      <p>Libellés possibles : SND, CLR, CAR, IND, FRQ, SIG, NSA, MSA, TRN, BOB, FRK.</p>`,
  },
  annexeB: {
    title: 'Annexe B — Piles',
    html: `
      <h3>Piles</h3>
      <p>Deux formats : <b>AA</b> (fines) et <b>D</b> (grosses). Compter le nombre total de piles sur la bombe.</p>
      <p><img class="port" src="/img/appendix/Battery-AA.svg"> <img class="port" src="/img/appendix/Battery-D.svg"></p>`,
  },
  annexeC: {
    title: 'Annexe C — Ports',
    html: `
      <h3>Ports</h3>
      <table>
      <tr><td><img class="port" src="/img/appendix/DVI-D.svg"></td><td>DVI-D</td></tr>
      <tr><td><img class="port" src="/img/appendix/Parallel.svg"></td><td>Parallèle</td></tr>
      <tr><td><img class="port" src="/img/appendix/PS2.svg"></td><td>PS/2</td></tr>
      <tr><td><img class="port" src="/img/appendix/RJ-45.svg"></td><td>RJ-45</td></tr>
      <tr><td><img class="port" src="/img/appendix/Serial.svg"></td><td>Série</td></tr>
      <tr><td><img class="port" src="/img/appendix/StereoRCA.svg"></td><td>Stéréo RCA</td></tr>
      </table>`,
  },
};

export function initExpert() {
  const nav = document.getElementById('manual-nav');
  const content = document.getElementById('manual-content');
  const show = (key) => {
    content.innerHTML = SECTIONS[key].html;
    nav.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.k === key));
  };
  for (const key of Object.keys(SECTIONS)) {
    const b = document.createElement('button');
    b.textContent = SECTIONS[key].title;
    b.dataset.k = key;
    b.onclick = () => show(key);
    nav.appendChild(b);
  }
  show('regles');
}
