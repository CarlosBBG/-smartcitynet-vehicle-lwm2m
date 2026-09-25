let audioContext: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new window.AudioContext();
  }
  return audioContext;
}

export async function playNotificationSound(): Promise<void> {
  try {
    const audio = context();
    if (!audio) return;
    if (audio.state === 'suspended') await audio.resume();
    if (audio.state !== 'running') return;

    const start = audio.currentTime + 0.02;
    for (const [frequency, offset, duration] of [[660, 0, 0.11], [880, 0.12, 0.18]]) {
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      const noteStart = start + offset;
      const noteEnd = noteStart + duration;

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      volume.gain.setValueAtTime(0.0001, noteStart);
      volume.gain.exponentialRampToValueAtTime(0.075, noteStart + 0.02);
      volume.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(volume);
      volume.connect(audio.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd);
      oscillator.addEventListener('ended', () => {
        oscillator.disconnect();
        volume.disconnect();
      }, { once: true });
    }
  } catch {
    // El navegador puede bloquear el audio automático; la alerta visual sigue disponible.
  }
}
