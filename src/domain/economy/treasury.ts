export const applyTreasuryTransfer = (
  walletAmount: number,
  treasuryAmount: number,
  transferToTreasury: number
): { wallet: number; treasury: number } => {
  if (transferToTreasury < 0) throw new Error('transferToTreasury must be non-negative');
  if (walletAmount < transferToTreasury) throw new Error('insufficient wallet funds');
  return {
    wallet: walletAmount - transferToTreasury,
    treasury: treasuryAmount + transferToTreasury
  };
};
