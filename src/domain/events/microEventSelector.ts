export type FundedMicroEventName = 'pickpocket' | 'claim_rush' | 'stimulus_drop';
export type MicroEventName = FundedMicroEventName | 'tax_audit';

const fundedMicroEvents: readonly FundedMicroEventName[] = ['pickpocket', 'claim_rush', 'stimulus_drop'];
const lowTreasuryMicroEvents: readonly MicroEventName[] = ['pickpocket', 'claim_rush', 'tax_audit'];
const emptyTreasuryMicroEvents: readonly MicroEventName[] = ['pickpocket', 'tax_audit'];

const pickByRoll = (pool: readonly MicroEventName[], roll: number): MicroEventName => {
  if (!Number.isFinite(roll)) throw new Error('roll must be finite');
  const bounded = Math.max(0, Math.min(0.999999, roll));
  const index = Math.floor(bounded * pool.length);
  return pool[index]!;
};

export const selectMicroEvent = (
  treasuryAmount: number,
  random: () => number = Math.random
): MicroEventName => {
  if (!Number.isFinite(treasuryAmount)) {
    throw new Error('treasuryAmount must be finite');
  }
  if (treasuryAmount <= 0) {
    return pickByRoll(emptyTreasuryMicroEvents, random());
  }
  if (treasuryAmount < 120) {
    return pickByRoll(lowTreasuryMicroEvents, random());
  }
  return pickByRoll(fundedMicroEvents, random());
};

