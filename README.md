# Keep Talking — Bombe Web

Version web coopérative de *Keep Talking and Nobody Explodes* (manuel FR v1).

## Concept

- **2 joueurs** dans une salle :
  - 💣 **Désamorceur** : voit la bombe en 3D, décrit ce qu'il voit
  - 📖 **Expert** : a le manuel (intégré au jeu ou le PDF original `public/manuel.pdf`), ne voit jamais la bombe
- **Vocal intégré** (WebRTC) entre les deux joueurs
- **Génération par seed** : même seed = même bombe

## Lancer

```bash
export PATH="$HOME/.local/node/bin:$PATH"   # Node 22 installé localement
npm install
npm start
```

→ http://localhost:8080 — un joueur crée une salle (code libre), l'autre la rejoint avec le même code.

### En réseau local (LAN)

Le serveur écoute sur `0.0.0.0` : l'autre joueur ouvre `http://<ip-de-la-machine>:8080`.

> ⚠️ **Vocal** : le micro navigateur exige un contexte sécurisé (HTTPS ou `localhost`). En HTTP sur une IP LAN, le vocal ne marchera pas — le jeu reste jouable avec Discord/téléphone, ou via un reverse proxy HTTPS / certificat auto-signé.

### En ligne

Déployable tel quel sur n'importe quel hébergeur Node (Render, VPS…). `PORT` configurable par variable d'environnement.

## Modules implémentés (MVP)

Fils · Bouton · Clavier · Simon · Memory · Condensateur (demandant)

Les autres modules du manuel (Jeux de mots, Morse, Fils compliqués, Séquences de fils, Labyrinthe, Mot de passe, Gaz, Molette) viendront ensuite — l'architecture est prête (`server/modules.js` + `public/js/modules3d.js`).

## Effets de panique

- **Coupure de courant** : trouver et cliquer l'interrupteur mural
- **Alarme** : cliquer le boîtier rouge au mur
- **Fumée** : cliquer la grille d'aération (ou attendre)

## Contrôles (désamorceur)

- **Glisser** : tourner autour de la bombe
- **Clic sur un module** : zoomer
- **Échap / bouton Reculer** : dézoomer
- **Bouton/levier** : maintenir le clic enfoncé

## Tests

```bash
node test-ws.mjs   # test E2E : 2 clients WS simulés, lancement d'une bombe
```

Mode démo sans serveur/second joueur : `http://localhost:8080/?demo=1`
