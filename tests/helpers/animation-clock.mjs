/** Explicit frame/timer control; tests never wait on wall time or use a browser. */
export function createAnimationClock({ reducedMotion = false } = {}) {
  let sequence = 0;
  const frames = new Map(), timers = new Map();
  return {
    window: {
      matchMedia: () => ({ matches: reducedMotion }),
      requestAnimationFrame(callback) { const id = ++sequence; frames.set(id, callback); return id; },
      cancelAnimationFrame(id) { frames.delete(id); },
      setTimeout(callback) { const id = ++sequence; timers.set(id, callback); return id; },
      clearTimeout(id) { timers.delete(id); },
    },
    flushFrames() {
      const pending = [...frames]; frames.clear();
      for (const [, callback] of pending) callback();
    },
    flushTimers() {
      const pending = [...timers]; timers.clear();
      for (const [, callback] of pending) callback();
    },
    get frames() { return frames.size; },
    get timers() { return timers.size; },
  };
}
