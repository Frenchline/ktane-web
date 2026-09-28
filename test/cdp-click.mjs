// Test d'interaction réelle : clics souris sur les modules via CDP
// NB : headless tourne rAF à ~4 fps → on snappe la caméra au lieu d'attendre l'anim
import WebSocket from 'ws';
import http from 'http';

const url = process.argv[2] || 'http://localhost:8080/?demo=1';
const { execFile } = await import('child_process');
const chrome = execFile('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9334', '--window-size=1280,800', 'about:blank',
], () => {});
await new Promise(r => setTimeout(r, 2000));

const targets = await new Promise((res, rej) => {
  http.get('http://127.0.0.1:9334/json', (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 100 * 1024 * 1024 });
let id = 0;
const pending = new Map();
const logs = [];
const send = (method, params = {}) => new Promise(res => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + (m.params.exceptionDetails.exception?.description || ''));
});
await new Promise(r => ws.on('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, 5000));

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
};

await evalJs(`(function(){
  window.__sent = [];
  const s = window.__scene;
  const orig = s.net.send.bind(s.net);
  s.net.send = (o) => { window.__sent.push(o); return orig(o); };
  // snap caméra sur le module (bypass l'anim lerp, lente en headless)
  window.__snap = (mi) => {
    s.zoomTo(mi);
    s.camera.position.copy(s.zoomed.camPos);
    s.controls.target.copy(s.zoomed.lookAt);
    s.camera.lookAt(s.zoomed.lookAt);
    return s.zoomed.i;
  };
  window.__unsnap = () => {
    s.zoomOut();
    s.returning = null;
    s.camera.position.copy(s.homePos);
    s.controls.target.copy(s.homeTarget);
    s.camera.lookAt(s.homeTarget);
    s.controls.enabled = true;
  };
  return 'spy ok';
})()`);

const screenPos = (expr) => evalJs(`(function(){
  const s = window.__scene;
  const obj = ${expr};
  if (!obj) return null;
  const v = obj.getWorldPosition(new obj.position.constructor());
  v.project(s.camera);
  return { x: Math.round((v.x + 1) / 2 * innerWidth), y: Math.round((1 - v.y) / 2 * innerHeight) };
})()`);

const click = async (x, y) => {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  await new Promise(r => setTimeout(r, 150));
};

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌', name); } };

// 1. clic sur un module (non zoomé) → zoome
{
  const pos = await screenPos('s.moduleHandles[0].group');
  await click(pos.x, pos.y);
  await new Promise(r => setTimeout(r, 300));
  ok((await evalJs('window.__scene.zoomed?.i')) === 0, 'clic sur module → zoomTo(0)');
}
// 2. clic sur un fil → cut envoyé
{
  await evalJs('window.__snap(0); window.__sent = []');
  const pos = await screenPos('s.moduleHandles[0].meshes[0]');
  await click(pos.x, pos.y);
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  ok(sent.some(m => m.module === 0 && m.a === 'cut' && m.i === 0), `clic fil → cut(0) : ${JSON.stringify(sent)}`);
}
// 3. retour : clic pendant l'anim de retour → re-zoom autorisé (ne doit plus bloquer)
{
  await evalJs(`(function(){
    const s = window.__scene;
    s.zoomed = null;
    s.returning = { camPos: s.homePos.clone(), lookAt: s.homeTarget.clone() };
    s.camera.position.copy(s.homePos);
    s.controls.target.copy(s.homeTarget);
    return 'returning set';
  })()`);
  const returning = await evalJs('!!window.__scene.returning');
  const pos = await screenPos('s.moduleHandles[2].group');
  await click(pos.x, pos.y);
  const z = await evalJs('window.__scene.zoomed?.i');
  ok(z === 2, `re-zoom pendant retour (returning=${returning}) → zoomed=${z}`);
}
// 4. clavier : press symbole
{
  await evalJs('window.__snap(2); window.__sent = []');
  const pos = await screenPos('s.moduleHandles[2].meshes[0]');
  await click(pos.x, pos.y);
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  ok(sent.some(m => m.module === 2 && m.a === 'press' && !!m.sym), `clic symbole → press : ${JSON.stringify(sent)}`);
}
// 5. simon : press couleur
{
  await evalJs('window.__snap(3); window.__sent = []');
  const pos = await screenPos('s.moduleHandles[3].group.userData.pads.red');
  await click(pos.x, pos.y);
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  ok(sent.some(m => m.module === 3 && m.a === 'press' && m.color === 'red'), `clic pad rouge → press(red) : ${JSON.stringify(sent)}`);
}
// 6. memory : les 4 touches envoient pos 0..3
{
  await evalJs('window.__snap(4); window.__sent = []');
  for (let i = 0; i < 4; i++) {
    const pos = await screenPos(`s.moduleHandles[4].meshes[${i}]`);
    await click(pos.x, pos.y);
  }
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  const presses = sent.filter(m => m.module === 4 && m.a === 'press');
  ok(presses.length === 4 && presses.every((m, k) => m.pos === k),
    `memory 4 touches → pos 0..3 : ${JSON.stringify(presses.map(m => m.pos))}`);
}
// 7. memory face arrière : ordre visuel gauche→droite
{
  await evalJs(`(function(){
    const s = window.__scene;
    s.homePos.set(0, 2.7, -5); s.homeTarget.set(0, 1.855, 0);
    window.__unsnap();
    return 'back view';
  })()`);
  await evalJs('window.__snap(6); window.__sent = []');
  const xs = [];
  for (let i = 0; i < 4; i++) xs.push({ i, ...(await screenPos(`s.moduleHandles[6].meshes[${i}]`)) });
  xs.sort((a, b) => a.x - b.x);
  const order = xs.map(o => o.i);
  const leftmost = xs[0];
  await click(leftmost.x, leftmost.y);
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  const press = sent.find(m => m.a === 'press');
  ok(order.join(',') === '0,1,2,3' && press && press.pos === 0,
    `face arrière : ordre visuel ${order} ; gauche → pos ${press?.pos}`);
  // remettre la caméra devant
  await evalJs(`(function(){
    const s = window.__scene;
    s.homePos.set(0, 2.7, 5); s.homeTarget.set(0, 1.855, 0);
    window.__unsnap();
    return 'front view';
  })()`);
}
// 8. bouton : maintien → hold + release avec heldMs
{
  await evalJs('window.__snap(1); window.__sent = []');
  const pos = await screenPos('s.moduleHandles[1].meshes[0]');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 400));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  const rel = sent.find(m => m.a === 'release');
  ok(sent.some(m => m.a === 'hold') && rel && rel.heldMs > 200,
    `maintien → hold + release(${rel?.heldMs?.toFixed(0)}ms)`);
}
// 9. condensateur : levier holdable
{
  await evalJs('window.__snap(5); window.__sent = []');
  const pos = await screenPos('s.moduleHandles[5].meshes[0]');
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 200));
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
  const sent = JSON.parse(await evalJs('JSON.stringify(window.__sent)') || '[]');
  const holds = sent.filter(m => m.a === 'hold');
  ok(holds.length === 2 && holds[0].v === true && holds[1].v === false,
    `levier → hold(true) puis hold(false) : ${JSON.stringify(holds.map(h => h.v))}`);
}

console.log('\n--- console page ---');
logs.slice(0, 15).forEach(l => console.log(l));
console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} réussis, ${fail} échoués`);
chrome.kill();
process.exit(fail ? 1 : 0);
