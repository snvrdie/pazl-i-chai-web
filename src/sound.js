const preference = 'pazl-i-chai-snap-sound';

export function createSnapSound() {
  const audio = new Audio(new URL('../assets/card-on-wood.wav', import.meta.url).href);
  audio.preload = 'auto';

  let enabled = true;
  try {
    enabled = localStorage.getItem(preference) !== 'off';
  } catch {
    // Sound remains available for this session when storage is unavailable.
  }

  return {
    get enabled() { return enabled; },
    toggle() {
      enabled = !enabled;
      if (!enabled) audio.pause();
      try {
        localStorage.setItem(preference, enabled ? 'on' : 'off');
      } catch {
        // The button still toggles sound for the current session.
      }
    },
    async play() {
      if (!enabled) return;
      try {
        audio.currentTime = 0;
        await audio.play();
      } catch {
        // Placement stays responsive even when playback is unavailable.
      }
    },
  };
}
