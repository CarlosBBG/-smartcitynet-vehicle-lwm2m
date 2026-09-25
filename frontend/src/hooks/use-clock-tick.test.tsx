import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatRelativeTime } from '../utils/format';
import { useClockTick } from './use-clock-tick';

afterEach(() => vi.useRealTimers());

describe('useClockTick', () => {
  it('hace avanzar la hora relativa sin recargar la página', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:05Z'));
    const { result } = renderHook(useClockTick);
    const lastSeen = '2026-09-23T10:00:00Z';

    expect(formatRelativeTime(lastSeen, result.current)).toContain('5');
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(formatRelativeTime(lastSeen, result.current)).toContain('10');
  });
});
