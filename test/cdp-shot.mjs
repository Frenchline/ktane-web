// Screenshot en temps réel via Chrome DevTools Protocol
import WebSocket from 'ws';
import http from 'http';

const url = process.argv[2] || 'http://localhost:8080/?demo=1&zoom=2';
const out = process.argv[3] || '/tmp/cdp.png';
const waitMs = parseInt(process.argv[4] || '6000');

const { execFile } = await import('child_process');
const chrome = execFile('google-chrome', [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  '--remote-debugging-port=9333', '--window-size=1280,800', 'about:blank',
], () => {});

await new Promise(r => setTimeout(r, 2000));

const targets = await new Promise((res, rej) => {
  http.get('http://127.0.0.1:9333/json', (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const page = targets.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 100 * 1024 * 1024 });

let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise(res => {
  const i = ++id;
  pending.set(i, res);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const logs = [];
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    logs.push('EXCEPTION: ' + JSON.stringify(m.params.exceptionDetails.exception?.description || m.params));
  }
});
await new Promise(r => ws.on('open', r));

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) {
    logs.push('HTTP ' + m.params.response.status + ' ' + m.params.response.url);
  }
});
await send('Page.navigate', { url });
await new Promise(r => setTimeout(r, waitMs));

// inspecter l'état des textures du module clavier
const evalRes = await send('Runtime.evaluate', {
  expression: `(function(){
    const s = window.__scene;
    if (!s) return 'no scene';
    const h = s.moduleHandles[2];
    if (!h) return 'no module 2';
    return h.meshes.map(b => {
      const m = b.material[4];
      return m && m.map ? ('img:' + (m.map.image ? m.map.image.width + 'x' + m.map.image.height : 'null') + ' color:' + m.color.getHexString()) : 'nomap';
    }).join(' | ');
  })()`,
  returnByValue: true,
});
console.log('KEYPAD TEX:', JSON.stringify(evalRes?.result?.value));

const shot = await send('Page.captureScreenshot', { format: 'png' });
const { writeFileSync } = await import('fs');
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('saved', out);
console.log('--- console ---');
logs.slice(0, 30).forEach(l => console.log(l));
chrome.kill();
process.exit(0);
