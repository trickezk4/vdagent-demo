import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Tier 2: T2.2 - Extreme Numerical Boundary Conditions (DOM & Pricing)', () => {
  it('should safely calculate averages and variances with DOM = 0 without producing NaN', () => {
    const units = [
      { unit_id: 'UNIT-01', dom: 0, price: 2000000000 },
      { unit_id: 'UNIT-02', dom: 0, price: 3000000000 },
    ];

    const sumDom = units.reduce((acc, u) => acc + u.dom, 0);
    const avgDom = sumDom / units.length;
    assert.equal(avgDom, 0);
    assert.ok(!isNaN(avgDom));
    assert.ok(isFinite(avgDom));

    // Zero benchmark variance calculation guard
    const peerAvg = 0;
    const targetVal = 0;
    const variance = peerAvg === 0 ? 0 : ((targetVal - peerAvg) / peerAvg) * 100;
    assert.equal(variance, 0);
    assert.ok(!isNaN(variance));
  });

  it('should safely handle extreme DOM = 2500 and 100 billion VNĐ price', () => {
    const extremeUnit = {
      unit_id: 'UNIT-PENTHOUSE-ULTRA',
      dom: 2500,
      list_price: 100000000000, // 100 Billion VND
      net_price: 95000000000,
    };

    // Calculate variance
    const variancePct = ((extremeUnit.net_price - extremeUnit.list_price) / extremeUnit.list_price) * 100;
    assert.equal(variancePct, -5.0);
    assert.ok(isFinite(variancePct));

    // Mortgage calculation for 100 Billion VND
    const loanRatio = 0.70;
    const loanAmount = extremeUnit.list_price * loanRatio;
    const monthlyRate = 0.085 / 12;
    const numPayments = 20 * 12;
    const monthlyPayment = (loanAmount * monthlyRate) / (1 - (1 + monthlyRate) ** -numPayments);

    assert.ok(monthlyPayment > 0);
    assert.ok(isFinite(monthlyPayment));
    assert.ok(!isNaN(monthlyPayment));
    // Monthly payment for 70B loan should be around ~607 million VNĐ
    assert.equal(roundNum(monthlyPayment), 607476263);
  });

  function roundNum(val: number): number {
    return Math.round(val);
  }
});
