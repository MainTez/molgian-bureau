import { DAILY_EGG_TARGET, EGG_RESCHEDULE_MAX_MS, EGG_RESCHEDULE_MIN_MS } from '../gameConfig.js';
import { randomIntInclusive } from '../../utils/time.js';

export const canUserWinEgg = (lastWinnerUserId: string | null, candidateUserId: string): boolean =>
  !lastWinnerUserId || lastWinnerUserId !== candidateUserId;

export const remainingEggWinsToday = (alreadyWonCount: number): number =>
  Math.max(0, DAILY_EGG_TARGET - alreadyWonCount);

export const nextEggRescheduleDelayMs = (): number =>
  randomIntInclusive(EGG_RESCHEDULE_MIN_MS, EGG_RESCHEDULE_MAX_MS);
