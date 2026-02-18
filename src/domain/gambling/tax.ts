import { JACKPOT_TAX_RATE, JACKPOT_TAX_THRESHOLD } from '../gameConfig.js';

export const calculateJackpotTax = (payout: number): number => {
  if (payout < JACKPOT_TAX_THRESHOLD) return 0;
  return Math.floor(payout * JACKPOT_TAX_RATE);
};
