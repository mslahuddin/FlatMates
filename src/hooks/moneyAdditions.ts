export function parseAmountToPence(text: string): number | null {
  const match = /^(\d*)(?:\.(\d{0,2}))?$/.exec(text.trim());
  if (!match || (match[1] === '' && !match[2])) {
    return null;
  }
  const pounds = parseInt(match[1] || '0', 10);
  const pence = parseInt((match[2] ?? '').padEnd(2, '0') || '0', 10);
  return pounds * 100 + pence;
}

/**
 * Splits a total equally in whole pence. Leftover pennies go one each to people
 * chosen in a fixed order seeded by `seed` (the expense id), so nobody always
 * pays the extra penny. The shares always add up to the total.
 */
export function splitEqual(
  totalPence: number,
  uids: string[],
  seed: string,
): Record<string, number> {
  const ids = [...uids].sort();
  const n = ids.length;
  if (n === 0) {
    return {};
  }
  const base = Math.floor(totalPence / n);
  const extra = totalPence - base * n;

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000003;
  }
  const start = hash % n;

  const shares: Record<string, number> = {};
  ids.forEach((uid, i) => {
    const position = (i - start + n) % n; // 0 = first to get an extra penny
    shares[uid] = base + (position < extra ? 1 : 0);
  });
  return shares;
}