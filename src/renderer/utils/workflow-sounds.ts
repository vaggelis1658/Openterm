// Workflow sound effects using Web Audio API
// No external audio files needed - generates tones programmatically

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext()
  return audioCtx
}

function playTone(frequency: number, duration: number, type: OscillatorType = 'sine', volume = 0.15) {
  try {
    const ctx = getAudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = type
    osc.frequency.value = frequency
    gain.gain.setValueAtTime(volume, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + duration)
  } catch { /* ignore audio errors */ }
}

// Step completed — gentle ascending ding
export function playStepComplete() {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(600, now)
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.12)
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
    osc.start(now)
    osc.stop(now + 0.3)
  } catch { /* ignore */ }
}

// Step error — low buzz
export function playStepError() {
  playTone(200, 0.3, 'square', 0.08)
  setTimeout(() => playTone(160, 0.25, 'square', 0.06), 150)
}

// Workflow complete — triumphant 3-note ascending
export function playWorkflowDone() {
  const ctx = getAudioContext()
  const now = ctx.currentTime
  try {
    const notes = [523, 659, 784] // C5, E5, G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = now + i * 0.15
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.12, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.4)
      osc.start(start)
      osc.stop(start + 0.4)
    })
  } catch { /* ignore */ }
}

// Workflow start — quick tap
export function playWorkflowStart() {
  playTone(880, 0.08, 'sine', 0.1)
  setTimeout(() => playTone(1100, 0.12, 'sine', 0.08), 80)
}
