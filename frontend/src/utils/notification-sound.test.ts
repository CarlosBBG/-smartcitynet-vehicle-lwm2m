import { afterEach, describe, expect, it, vi } from 'vitest';

import { playNotificationSound } from './notification-sound';

afterEach(() => vi.unstubAllGlobals());

describe('playNotificationSound', () => {
  it('programa un aviso breve de dos tonos', async () => {
    const oscillator = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
      addEventListener: vi.fn(), disconnect: vi.fn(),
    };
    const gain = {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(), disconnect: vi.fn(),
    };
    const audio = {
      state: 'running', currentTime: 1, destination: {},
      createOscillator: vi.fn(() => oscillator),
      createGain: vi.fn(() => gain),
    };
    function AudioContextStub() { return audio; }
    vi.stubGlobal('AudioContext', AudioContextStub);

    await playNotificationSound();

    expect(audio.createOscillator).toHaveBeenCalledTimes(2);
    expect(oscillator.frequency.setValueAtTime).toHaveBeenCalledWith(660, 1.02);
    expect(oscillator.frequency.setValueAtTime.mock.calls[1][0]).toBe(880);
    expect(oscillator.frequency.setValueAtTime.mock.calls[1][1]).toBeCloseTo(1.14);
    expect(oscillator.start).toHaveBeenCalledTimes(2);
    expect(oscillator.stop).toHaveBeenCalledTimes(2);
  });
});
