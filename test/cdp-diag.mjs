// Diagnostic : vitesse rAF + état zoomed + raycast
import WebSocket from 'ws';
import http from 'http';

const url = process.argv[2] || 'http://localhost:8080/?demo=1';
const { execFile } = await import('child_process');
const chrome = execFile('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9335', '--window-size=1280,800', 'about:blank',
], () => {});
await new Promise(r => setTimeout(r, 2000));
const targets = await new Promise((res, rej) => {
  http.get('http://127.0.0.1:9335/json', (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
let id = 0; const pending = new Map();
const send = (m, p = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
ws.on('message', (d) => { const m = JSON.parse(d); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
await new Promise(r => ws.on('open', r));
await send('Runtime.enable');
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 5000));
const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }))?.result?.value;

// 1. est-ce que rAF tourne ?
const fps = await ev(`new Promise(r => { let n=0; const t0=performance.now();
  const loop=()=>{n++; if(performance.now()-t0<1000) requestAnimationFrame(loop); else r(n);};
  requestAnimationFrame(loop); })`);
console.log('rAF frames en 1s:', fps);

// 2. zoom + dézoom + mesure de la distance caméra
await ev('window.__scene.zoomTo(0)');
await new Promise(r => setTimeout(r, 1500));
console.log('après zoom  :', await ev(`JSON.stringify({
  zoomed: window.__scene.zoomed?.i,
  camDist: window.__scene.camera.position.distanceTo(window.__scene.zoomed.camPos).toFixed(3)})`));
await ev('window.__scene.zoomOut()');
for (const wait of [500, 1000, 2000]) {
  await new Promise(r => setTimeout(r, wait));
  console.log(`retour +${wait}ms:`, await ev(`JSON.stringify({
    zoomed: window.__scene.zoomed ? (window.__scene.zoomed.i ?? 'null-i') : null,
    returning: window.__scene.zoomed?.returning,
    dist: window.__scene.camera.position.distanceTo(window.__scene.homePos).toFixed(3)})`));
}
chrome.kill();
process.exit(0);
