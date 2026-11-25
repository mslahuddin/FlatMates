
import {splitEqual, computeBalances} from '../src/libs/money';

// Helper function: Adds all the shares together to calculate the total amount.
const sum = (o: Record<string, number>) =>
  Object.values(o).reduce((a, b) => a + b, 0);


// TEST 1: Checks that splitting an expense between flatmates
// always adds up to the original total amount.
// This ensures that no money is lost or extra money is added,
// even when the amount cannot be divided equally.
test('splits always add up to the total', () => {
  for (const [total, n] of [[2000, 3], [1000, 4], [1, 3], [9999, 7]] as const) {
    const ids = Array.from({length: n}, (_, i) => `u${i}`);
    expect(sum(splitEqual(total, ids, 'seed'))).toBe(total);
  }
});


// TEST 2: Checks correct penny-level rounding when splitting £20
// equally between three flatmates.
// Since £20 / 3 = £6.666..., the amounts should be:
// £6.66, £6.67 and £6.67.
// This ensures that the extra penny is distributed correctly.
test('£20 split three ways gives 6.66 / 6.67 / 6.67', () => {
  const shares = Object.values(splitEqual(2000, ['a', 'b', 'c'], 'x')).sort();
  expect(shares).toEqual([666, 667, 667]);
});


// TEST 3: Checks whether a flatmate's outstanding debt is calculated correctly.
// Flatmate A pays £30 for an expense shared equally between A, B and C.
// Each flatmate's share is £10, so B owes A £10.
// First, check B's balance before making any payment.
test('B owes A, then a settlement clears it', () => {
  const expenses: any[] = [{
    id: 'e1', paidBy: 'A', amountPence: 3000,
    shares: {A: 1000, B: 1000, C: 1000},
  }];

  // Check B's outstanding debt before settlement.
  // B should owe £10 (1000 pence), giving a net balance of -£10.
  const before = computeBalances('B', expenses, []);
  expect(before.oweTotal).toBe(1000);
  expect(before.net).toBe(-1000);


  // TEST 4: Checks whether making a settlement clears the outstanding debt.
  // B pays £10 to A, so B should no longer owe anything.
  const settlements: any[] = [{id: 's1', fromUid: 'B', toUid: 'A', amountPence: 1000}];

  // Recalculate B's balance after the payment.
  // The outstanding amount should now be zero.
  const after = computeBalances('B', expenses, settlements);
  expect(after.oweTotal).toBe(0);
});
