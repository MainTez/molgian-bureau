export const pickRandom = <T>(items: readonly T[]): T => {
  if (items.length === 0) {
    throw new Error('Cannot pick from empty list');
  }
  return items[Math.floor(Math.random() * items.length)] as T;
};

export const weightedPick = <T>(items: Array<{ item: T; weight: number }>): T => {
  const totalWeight = items.reduce((sum, current) => sum + current.weight, 0);
  let cursor = Math.random() * totalWeight;
  for (const candidate of items) {
    cursor -= candidate.weight;
    if (cursor <= 0) {
      return candidate.item;
    }
  }
  return items[items.length - 1]!.item;
};

export const shuffle = <T>(values: readonly T[]): T[] => {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
};
