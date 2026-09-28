// Client WebSocket minimaliste
export class Net {
  constructor() {
    this.ws = null;
    this.handlers = {};
    this.open = null;
  }

  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}`);
    this.ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      (this.handlers[msg.t] || []).forEach(fn => fn(msg));
    };
    this.open = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    return this.open;
  }

  on(type, fn) {
    (this.handlers[type] ||= []).push(fn);
  }

  send(obj) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(obj));
  }

  close() { this.ws?.close(); }
}
