/**
 * Money helpers. All amounts are whole pence (integers). Never store pounds as decimals.
 */

export type Expense = {
  id: string;
  description?: string;
  amountPence: number;
  paidBy: string;
  /** uid -> pence. Always adds up to amountPence. */
  shares: Record<string, number>;
};

export type Settlement = {
  id: string;
  fromUid: string;
  toUid: string;
  amountPence: number;
};

export type PersonBalance = {uid: string; pence: number};

export type Balances = {
  /** People you owe, largest first. */
  owe: PersonBalance[];
  /** People who owe you, largest first. */
  owed: PersonBalance[];
  oweTotal: number;
  owedTotal: number;
  /** owedTotal minus oweTotal. */
  net: number;
};

/** 1050 -> "£10.50", 240000 -> "£2,400.00". Pass sign to get "+£10.50". */
export function formatPence(pence: number, sign = false): string {
  const abs = Math.abs(Math.round(pence));
  const pounds = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `£${pounds}.${(abs % 100).toString().padStart(2, '0')}`;
  if (pence < 0) {
    return `−${text}`;
  }
  return sign && pence > 0 ? `+${text}` : text;
}

/**
 * Works out who owes whom from the ledger, netted per pair.
 * Each expense: every participant except the payer owes the payer their share.
 * Each payment: the payer's debt to the receiver goes down.
 */
export function computeBalances(
  me: string,
  expenses: Expense[],
  settlements: Settlement[],
): Balances {
  // debt[a][b] = pence that a owes b
  const debt: Record<string, Record<string, number>> = {};
  const add = (from: string, to: string, pence: number) => {
    if (from === to) {
      return;
    }
    debt[from] = debt[from] ?? {};
    debt[from][to] = (debt[from][to] ?? 0) + pence;
  };

  for (const e of expenses) {
    for (const [uid, share] of Object.entries(e.shares)) {
      add(uid, e.paidBy, share);
    }
  }
  for (const s of settlements) {
    add(s.fromUid, s.toUid, -s.amountPence);
  }

  const others = new Set<string>();
  Object.keys(debt).forEach(a => {
    others.add(a);
    Object.keys(debt[a]).forEach(b => others.add(b));
  });
  others.delete(me);

  const owe: PersonBalance[] = [];
  const owed: PersonBalance[] = [];
  others.forEach(other => {
    const theyOweMe = (debt[other]?.[me] ?? 0) - (debt[me]?.[other] ?? 0);
    if (theyOweMe > 0) {
      owed.push({uid: other, pence: theyOweMe});
    } else if (theyOweMe < 0) {
      owe.push({uid: other, pence: -theyOweMe});
    }
  });
  owe.sort((a, b) => b.pence - a.pence);
  owed.sort((a, b) => b.pence - a.pence);

  const oweTotal = owe.reduce((sum, p) => sum + p.pence, 0);
  const owedTotal = owed.reduce((sum, p) => sum + p.pence, 0);
  return {owe, owed, oweTotal, owedTotal, net: owedTotal - oweTotal};
}

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