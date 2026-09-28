// Vocal WebRTC (audio seul) entre les 2 joueurs
export class Voice {
  constructor(net, isInitiator) {
    this.net = net;
    this.isInitiator = isInitiator;
    this.pc = null;
    this.stream = null;
    this.muted = false;
    this.onStatus = null;
    this.audio = new Audio();
    this.audio.autoplay = true;
    this.remoteStream = null;
    this.friture = false;
    this._fxCtx = null;
    this._chopT = null;

    net.on('rtc', (m) => this.onSignal(m.data));
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      this.onStatus?.('off');
      return false;
    }
    this.pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    this.stream.getTracks().forEach(t => this.pc.addTrack(t, this.stream));
    this.pc.ontrack = (e) => { this.remoteStream = e.streams[0]; this._route(); };
    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.net.send({ t: 'rtc', data: { ice: e.candidate } });
    };
    this.pc.onconnectionstatechange = () => {
      const s = this.pc.connectionState;
      this.onStatus?.(s === 'connected' ? 'ok' : s === 'failed' ? 'off' : 'wait');
    };
    if (this.isInitiator) {
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.net.send({ t: 'rtc', data: { sdp: this.pc.localDescription } });
    }
    this.onStatus?.('wait');
    return true;
  }

  async onSignal(data) {
    if (!this.pc) return;
    try {
      if (data.sdp) {
        await this.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const ans = await this.pc.createAnswer();
          await this.pc.setLocalDescription(ans);
          this.net.send({ t: 'rtc', data: { sdp: this.pc.localDescription } });
        }
      } else if (data.ice) {
        await this.pc.addIceCandidate(data.ice);
      }
    } catch (e) { /* ignoré */ }
  }

  toggleMute() {
    if (!this.stream) return false;
    this.muted = !this.muted;
    this.stream.getAudioTracks().forEach(t => t.enabled = !this.muted);
    return this.muted;
  }

  // friture : hache le flux audio entrant + bruit de ligne
  setFriture(on) {
    this.friture = !!on;
    this._route();
  }

  _route() {
    if (!this.remoteStream) return;
    clearInterval(this._chopT);
    this._chopT = null;
    if (this._fxCtx) { try { this._fxCtx.close(); } catch {} this._fxCtx = null; }
    if (!this.friture) {
      this.audio.srcObject = this.remoteStream;
      return;
    }
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume?.();
      const src = ctx.createMediaStreamSource(this.remoteStream);
      const gate = ctx.createGain();
      const dest = ctx.createMediaStreamDestination();
      src.connect(gate).connect(dest);
      // bruit de ligne (crépitements + souffle)
      const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const nd = nb.getChannelData(0);
      for (let i = 0; i < nd.length; i++) {
        nd[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 0.7 : 0.06);
      }
      const ns = ctx.createBufferSource(); ns.buffer = nb; ns.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 1200;
      const ng = ctx.createGain(); ng.gain.value = 0.35;
      ns.connect(nf).connect(ng).connect(dest);
      ns.start();
      // hachoir : coupe le signal par à-coups
      this._chopT = setInterval(() => {
        gate.gain.value = Math.random() < 0.55 ? 0.03 : 1;
      }, 70);
      this._fxCtx = ctx;
      this.audio.srcObject = dest.stream;
    } catch {
      this.audio.srcObject = this.remoteStream;
    }
  }

  stop() {
    this.setFriture(false);
    this.pc?.close();
    this.stream?.getTracks().forEach(t => t.stop());
  }
}
