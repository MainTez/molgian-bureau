import { describe, expect, it } from 'vitest';
import { getWorkWindowStart, isSameWorkWindow } from '../src/utils/time.js';
describe('work window reset', () => {
    const timezone = 'Europe/Oslo';
    const resetHour = 6;
    it('uses previous day window before 06:00', () => {
        const timestamp = new Date('2026-01-03T04:30:00+01:00').getTime();
        const windowStart = getWorkWindowStart(timestamp, timezone, resetHour);
        expect(new Date(windowStart).toISOString()).toBe('2026-01-02T05:00:00.000Z');
    });
    it('moves to current day window at or after 06:00', () => {
        const timestamp = new Date('2026-01-03T07:10:00+01:00').getTime();
        const windowStart = getWorkWindowStart(timestamp, timezone, resetHour);
        expect(new Date(windowStart).toISOString()).toBe('2026-01-03T05:00:00.000Z');
    });
    it('treats same reset window as cooldown active', () => {
        const firstWork = new Date('2026-01-10T09:00:00+01:00').getTime();
        const secondAttempt = new Date('2026-01-10T23:59:00+01:00').getTime();
        expect(isSameWorkWindow(firstWork, secondAttempt, timezone, resetHour)).toBe(true);
    });
    it('allows work after next reset boundary', () => {
        const firstWork = new Date('2026-01-10T09:00:00+01:00').getTime();
        const secondAttempt = new Date('2026-01-11T06:01:00+01:00').getTime();
        expect(isSameWorkWindow(firstWork, secondAttempt, timezone, resetHour)).toBe(false);
    });
});
