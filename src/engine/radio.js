// Radio — procedural music channels using Web Audio API
// Channels: synthwave, lo-fi beats, talk radio static

const CHANNELS = [
  { name: 'OFF', genre: 'off' },
  { name: 'Synth FM', genre: 'synthwave' },
  { name: 'Lo-Fi Beats', genre: 'lofi' },
  { name: 'Pulse Radio', genre: 'pulse' },
  { name: 'Rock City', genre: 'rock' },
  { name: 'Jazz Lounge', genre: 'jazz' },
  { name: 'Latin Heat', genre: 'latin' },
];

export class Radio {
  constructor() {
    this.channelIndex = 0;
    this.ctx = null;
    this.masterGain = null;
    this.nodes = [];
    this.playing = false;
    this.volume = 0.08;
    this.beatPhase = 0;
    this.noteIndex = 0;
    this.nextBeatTime = 0;
    this.intervalId = null;
  }

  get currentChannel() {
    return CHANNELS[this.channelIndex];
  }

  get channelName() {
    return CHANNELS[this.channelIndex].name;
  }

  get channelCount() {
    return CHANNELS.length;
  }

  _ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  nextChannel() {
    this.stop();
    this.channelIndex = (this.channelIndex + 1) % CHANNELS.length;
    if (this.channelIndex !== 0) {
      this.start();
    }
    return this.currentChannel;
  }

  prevChannel() {
    this.stop();
    this.channelIndex = (this.channelIndex - 1 + CHANNELS.length) % CHANNELS.length;
    if (this.channelIndex !== 0) {
      this.start();
    }
    return this.currentChannel;
  }

  start() {
    if (this.currentChannel.genre === 'off') return;
    this._ensureCtx();
    this.playing = true;
    this.nextBeatTime = this.ctx.currentTime;
    this._schedule();
  }

  stop() {
    this.playing = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    // Stop all active nodes
    for (const n of this.nodes) {
      try { n.stop(); } catch {}
    }
    this.nodes = [];
  }

  _schedule() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = setInterval(() => {
      if (!this.playing) return;
      while (this.nextBeatTime < this.ctx.currentTime + 0.2) {
        this._playBeat();
      }
    }, 100);
  }

  _playBeat() {
    const genre = this.currentChannel.genre;
    if (genre === 'synthwave') this._synthwaveBeat();
    else if (genre === 'lofi') this._lofiBeat();
    else if (genre === 'pulse') this._pulseBeat();
    else if (genre === 'rock') this._rockBeat();
    else if (genre === 'jazz') this._jazzBeat();
    else if (genre === 'latin') this._latinBeat();
    this.noteIndex++;
  }

  _playNote(freq, type, start, dur, vol = 1) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol * 0.3, start);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start);
    osc.stop(start + dur + 0.05);
    this.nodes.push(osc);
    // Cleanup old nodes
    if (this.nodes.length > 20) {
      this.nodes = this.nodes.slice(-10);
    }
  }

  _synthwaveBeat() {
    const t = this.nextBeatTime;
    const bpm = 110;
    const beat = 60 / bpm;

    // Bassline (minor pentatonic)
    const bassNotes = [55, 65.4, 73.4, 82.4, 98, 82.4, 73.4, 65.4];
    const bassFreq = bassNotes[this.noteIndex % bassNotes.length];
    this._playNote(bassFreq, 'sawtooth', t, beat * 0.8, 0.6);

    // Pad chord on every 4th beat
    if (this.noteIndex % 4 === 0) {
      const chords = [[130.8, 164.8, 196], [146.8, 174.6, 220], [110, 138.6, 164.8]];
      const chord = chords[Math.floor(this.noteIndex / 4) % chords.length];
      for (const f of chord) {
        this._playNote(f, 'sine', t, beat * 3.5, 0.25);
      }
    }

    // Hi-hat
    if (this.noteIndex % 2 === 0) {
      this._playNote(8000 + Math.random() * 2000, 'square', t, 0.03, 0.08);
    }

    // Arp on every other beat
    if (this.noteIndex % 2 === 1) {
      const arpNotes = [220, 261.6, 329.6, 392, 329.6, 261.6];
      this._playNote(arpNotes[this.noteIndex % arpNotes.length], 'triangle', t, beat * 0.3, 0.2);
    }

    this.nextBeatTime += beat;
  }

  _lofiBeat() {
    const t = this.nextBeatTime;
    const bpm = 75;
    const beat = 60 / bpm;

    // Mellow chord (jazz voicings)
    const chordSets = [
      [261.6, 329.6, 392, 493.9],  // Cmaj7
      [220, 277.2, 329.6, 415.3],  // Am7
      [196, 246.9, 293.7, 370],    // Gm7
      [174.6, 220, 261.6, 329.6],  // Fmaj7
    ];
    if (this.noteIndex % 4 === 0) {
      const chord = chordSets[Math.floor(this.noteIndex / 4) % chordSets.length];
      for (const f of chord) {
        // Slightly detuned for warmth
        this._playNote(f * (0.998 + Math.random() * 0.004), 'sine', t, beat * 3.8, 0.15);
      }
    }

    // Kick on 1 and 3
    if (this.noteIndex % 4 === 0 || this.noteIndex % 4 === 2) {
      this._playNote(55, 'sine', t, 0.15, 0.5);
    }

    // Snare on 2 and 4 (noise-like)
    if (this.noteIndex % 4 === 1 || this.noteIndex % 4 === 3) {
      this._playNote(200 + Math.random() * 100, 'sawtooth', t + beat * 0.02, 0.08, 0.15);
    }

    // Hat every beat (soft)
    this._playNote(6000 + Math.random() * 3000, 'square', t, 0.02, 0.04);

    this.nextBeatTime += beat;
  }

  _pulseBeat() {
    const t = this.nextBeatTime;
    const bpm = 128;
    const beat = 60 / bpm;

    // Driving bassline
    const bassPattern = [65.4, 65.4, 82.4, 65.4, 98, 65.4, 82.4, 73.4];
    this._playNote(bassPattern[this.noteIndex % bassPattern.length], 'square', t, beat * 0.6, 0.35);

    // Four-on-the-floor kick
    if (this.noteIndex % 2 === 0) {
      this._playNote(45, 'sine', t, 0.12, 0.6);
    }

    // Off-beat hat
    if (this.noteIndex % 2 === 1) {
      this._playNote(9000, 'square', t, 0.02, 0.06);
    }

    // Stab every 8 beats
    if (this.noteIndex % 8 === 0) {
      this._playNote(196, 'sawtooth', t, beat * 0.3, 0.2);
      this._playNote(293.7, 'sawtooth', t, beat * 0.3, 0.15);
    }

    this.nextBeatTime += beat;
  }

  _rockBeat() {
    const t = this.nextBeatTime;
    const bpm = 140;
    const beat = 60 / bpm;

    // Power chord riff (distorted square waves)
    const riffNotes = [82.4, 82.4, 110, 98, 82.4, 73.4, 82.4, 110];
    const freq = riffNotes[this.noteIndex % riffNotes.length];
    this._playNote(freq, 'square', t, beat * 0.7, 0.4);
    this._playNote(freq * 1.5, 'square', t, beat * 0.5, 0.2); // fifth

    // Kick on 1,3
    if (this.noteIndex % 4 === 0 || this.noteIndex % 4 === 2) {
      this._playNote(50, 'sine', t, 0.1, 0.7);
    }
    // Snare on 2,4
    if (this.noteIndex % 4 === 1 || this.noteIndex % 4 === 3) {
      this._playNote(180 + Math.random() * 60, 'sawtooth', t, 0.06, 0.25);
      this._playNote(6000, 'square', t, 0.04, 0.1);
    }
    // Crash cymbal every 16 beats
    if (this.noteIndex % 16 === 0) {
      this._playNote(5000 + Math.random() * 3000, 'sawtooth', t, 0.4, 0.08);
    }
    // Hi-hat
    this._playNote(8000 + Math.random() * 2000, 'square', t, 0.02, 0.05);

    this.nextBeatTime += beat;
  }

  _jazzBeat() {
    const t = this.nextBeatTime;
    const bpm = 95;
    const beat = 60 / bpm;

    // Walking bassline
    const bassNotes = [110, 123.5, 130.8, 146.8, 164.8, 146.8, 130.8, 123.5];
    this._playNote(bassNotes[this.noteIndex % bassNotes.length], 'triangle', t, beat * 0.85, 0.35);

    // Swing chords (every 2 beats, with swing feel)
    if (this.noteIndex % 2 === 0) {
      const jazzChords = [
        [261.6, 311.1, 370, 466.2],  // Cmaj9
        [220, 277.2, 349.2, 415.3],  // Am9
        [196, 246.9, 311.1, 370],    // G9
        [174.6, 220, 277.2, 349.2],  // Fmaj9
      ];
      const chord = jazzChords[Math.floor(this.noteIndex / 2) % jazzChords.length];
      for (const f of chord) {
        this._playNote(f * (0.997 + Math.random() * 0.006), 'sine', t, beat * 1.8, 0.1);
      }
    }

    // Ride cymbal with swing
    const swingOffset = this.noteIndex % 2 === 1 ? beat * 0.33 : 0;
    this._playNote(7000 + Math.random() * 1500, 'square', t + swingOffset, 0.03, 0.04);

    // Brush snare on 2 and 4
    if (this.noteIndex % 4 === 1 || this.noteIndex % 4 === 3) {
      this._playNote(300 + Math.random() * 100, 'sawtooth', t, 0.05, 0.08);
    }

    this.nextBeatTime += beat;
  }

  _latinBeat() {
    const t = this.nextBeatTime;
    const bpm = 120;
    const beat = 60 / bpm;

    // Tumbao bass pattern
    const bassNotes = [130.8, 0, 164.8, 130.8, 0, 146.8, 130.8, 164.8];
    const bassFreq = bassNotes[this.noteIndex % bassNotes.length];
    if (bassFreq > 0) {
      this._playNote(bassFreq, 'triangle', t, beat * 0.6, 0.4);
    }

    // Clave pattern (3-2 son clave)
    const clavePattern = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];
    if (clavePattern[this.noteIndex % 16]) {
      this._playNote(1800, 'sine', t, 0.04, 0.15);
    }

    // Montuno piano pattern
    if (this.noteIndex % 2 === 0) {
      const montunoChords = [
        [261.6, 329.6, 392],  // C
        [220, 277.2, 329.6],  // Am
        [174.6, 220, 261.6],  // F
        [196, 246.9, 293.7],  // G
      ];
      const chord = montunoChords[Math.floor(this.noteIndex / 4) % montunoChords.length];
      for (const f of chord) {
        this._playNote(f, 'square', t, beat * 0.2, 0.08);
      }
    }

    // Conga pattern
    const congaPattern = [1, 0, 1, 1, 0, 1, 0, 1];
    if (congaPattern[this.noteIndex % 8]) {
      const congaPitch = this.noteIndex % 3 === 0 ? 280 : 350;
      this._playNote(congaPitch, 'triangle', t, 0.06, 0.12);
    }

    this.nextBeatTime += beat;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(0.2, v));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }
}
