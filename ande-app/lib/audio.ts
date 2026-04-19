"use client";

// Lightweight Web Audio API synth for the reasoning UI. No external audio
// files — we ship a tiny sine-wave tick for every phase advance and an
// ascending major arpeggio when the final verdict lands. Browsers block
// AudioContext until a user gesture, so the first play() attempt will
// either resume the existing context or no-op silently until one happens.

type PlayOptions = { volume?: number };

let _ctx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (_ctx) return _ctx;
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  _ctx = new Ctor();
  return _ctx;
}

function ensureRunning(ac: AudioContext) {
  if (ac.state === "suspended") void ac.resume().catch(() => {});
}

// A soft "tick" — short sine sweep 480→620 Hz, ~120ms, quiet envelope.
// Meant for passive background confirmation of a stage advance.
export function playPhaseTick({ volume = 0.07 }: PlayOptions = {}) {
  const ac = ctx();
  if (!ac) return;
  ensureRunning(ac);
  const now = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(480, now);
  osc.frequency.exponentialRampToValueAtTime(620, now + 0.07);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.connect(gain).connect(ac.destination);
  osc.start(now);
  osc.stop(now + 0.18);
}

// Completion arpeggio — C5 · E5 · G5 · C6 ascending at ~110ms intervals
// with bell-like exponential decay. Celebratory but short (~0.7s).
export function playCompletionChime({ volume = 0.11 }: PlayOptions = {}) {
  const ac = ctx();
  if (!ac) return;
  ensureRunning(ac);
  const now = ac.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.50]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    // Slight detuned partial for warmth
    const partial = ac.createOscillator();
    const partialGain = ac.createGain();
    partial.type = "sine";
    partial.frequency.value = freq * 2;
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
    partialGain.gain.setValueAtTime(0, start);
    partialGain.gain.linearRampToValueAtTime(volume * 0.35, start + 0.015);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    osc.connect(gain).connect(ac.destination);
    partial.connect(partialGain).connect(ac.destination);
    osc.start(start);
    partial.start(start);
    osc.stop(start + 0.6);
    partial.stop(start + 0.5);
  });
}
