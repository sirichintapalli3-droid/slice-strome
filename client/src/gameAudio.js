let context;
let master;
let compressor;
let noiseBuffer;

function prepareAudio(enabled) {
  if (!enabled) return false;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return false;
  context ||= new AudioContextClass();
  if (!compressor) {
    master = context.createGain();
    master.gain.value = 1.35;
    compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -3;
    compressor.ratio.value = 12;
    compressor.connect(context.destination);
    master.connect(compressor);
  }
  if (context.state === 'suspended') context.resume().catch(() => {});
  return true;
}

export function playSound(name, enabled) {
  if (!prepareAudio(enabled)) return;
  const tones = {
    start: [[440, 660, 0.14, 'sine'], [660, 880, 0.18, 'sine', 0.12]],
    levelUp: [[523, 659, 0.13, 'sine'], [659, 784, 0.13, 'sine', 0.12], [784, 1047, 0.24, 'sine', 0.24]],
    bomb: [[240, 70, 0.36, 'sawtooth']],
    over: [[420, 280, 0.2, 'triangle'], [280, 170, 0.28, 'triangle', 0.2]]
  };
  (tones[name] || []).forEach(([from, to, duration, type, delay = 0]) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.7, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start(start);
    oscillator.stop(start + duration);
  });
}

export function playFireworks(enabled) {
  if (!prepareAudio(enabled)) return;
  const duration = 1.35;
  const sampleRate = context.sampleRate;
  const buffer = context.createBuffer(1, Math.floor(sampleRate * duration), sampleRate);
  const samples = buffer.getChannelData(0);
  const bursts = [
    { start: 0.12, duration: 0.22, volume: 0.6 },
    { start: 0.48, duration: 0.16, volume: 0.4 },
    { start: 0.76, duration: 0.24, volume: 0.55 },
    { start: 1.08, duration: 0.18, volume: 0.38 }
  ];

  for (let index = 0; index < samples.length; index += 1) {
    const time = index / sampleRate;
    const envelope = bursts.reduce((level, burst) => {
      const elapsed = time - burst.start;
      if (elapsed < 0 || elapsed > burst.duration) return level;
      const attack = Math.min(1, elapsed / 0.004);
      return level + Math.exp(-elapsed * 18) * attack * burst.volume;
    }, 0);
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  const start = context.currentTime;
  source.buffer = buffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(1900, start);
  filter.Q.value = 0.7;
  gain.gain.setValueAtTime(0.32, start);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
  source.stop(start + duration);
}

export function playSlice(enabled) {
  if (!prepareAudio(enabled)) return;
  if (!noiseBuffer) {
    noiseBuffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.16), context.sampleRate);
    const samples = noiseBuffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
  }
  const start = context.currentTime;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = noiseBuffer;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(450, start);
  filter.frequency.exponentialRampToValueAtTime(3600, start + 0.12);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.linearRampToValueAtTime(0.35, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(start);
  source.stop(start + 0.16);
}
