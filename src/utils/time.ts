import { DateTime } from 'luxon';

export const nowMs = (): number => Date.now();

export const toDayKey = (timestampMs: number, timezone: string): string =>
  DateTime.fromMillis(timestampMs, { zone: timezone }).toFormat('yyyy-LL-dd');

export const getWorkWindowStart = (
  timestampMs: number,
  timezone: string,
  resetHour: number
): number => {
  const now = DateTime.fromMillis(timestampMs, { zone: timezone });
  const resetToday = now.set({ hour: resetHour, minute: 0, second: 0, millisecond: 0 });
  return (now < resetToday ? resetToday.minus({ day: 1 }) : resetToday).toMillis();
};

export const isSameWorkWindow = (
  previousTimestampMs: number | null,
  currentTimestampMs: number,
  timezone: string,
  resetHour: number
): boolean => {
  if (!previousTimestampMs) return false;
  const previousWindow = getWorkWindowStart(previousTimestampMs, timezone, resetHour);
  const currentWindow = getWorkWindowStart(currentTimestampMs, timezone, resetHour);
  return previousWindow === currentWindow;
};

export const randomIntInclusive = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;
