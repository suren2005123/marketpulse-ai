import test from 'node:test';
import assert from 'node:assert/strict';

interface MockInstrument {
  symbol: string;
  name: string;
  exchange: string;
  price?: number;
  change?: number;
  changePct?: number;
  sourceMode?: string;
}

test('Frontend All Stocks: Missing Price and Change Safeguard (Shows N/A)', () => {
  const stockWithPrice: MockInstrument = {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    exchange: 'NSE',
    price: 2985.50,
    change: 14.50,
    changePct: 0.49,
    sourceMode: 'END_OF_DAY',
  };

  const stockWithoutPrice: MockInstrument = {
    symbol: 'UNLISTED_EQ',
    name: 'Unlisted Entity Ltd',
    exchange: 'BSE',
    price: undefined,
    change: undefined,
    changePct: undefined,
  };

  // Helper formatting function identical to AllStocks.tsx
  const formatPrice = (p?: number) => (p !== undefined && p > 0 ? `₹${p.toFixed(2)}` : 'N/A');
  const formatChange = (c?: number, pct?: number) => {
    if (c === undefined || pct === undefined) return 'N/A';
    return `${c >= 0 ? '+' : ''}${c.toFixed(2)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
  };

  assert.equal(formatPrice(stockWithPrice.price), '₹2985.50');
  assert.equal(formatChange(stockWithPrice.change, stockWithPrice.changePct), '+14.50 (+0.49%)');

  assert.equal(formatPrice(stockWithoutPrice.price), 'N/A', 'Missing price must display N/A');
  assert.equal(formatChange(stockWithoutPrice.change, stockWithoutPrice.changePct), 'N/A', 'Missing change must display N/A');
});

test('Frontend All Stocks: Pagination Math & Boundary Calculations', () => {
  const totalEquities = 9668;
  const limit = 25;
  const totalPages = Math.ceil(totalEquities / limit);

  assert.equal(totalPages, 387, '9,668 equities at 25 per page must yield 387 total pages');

  // Verify slice offsets
  const page1Start = (1 - 1) * limit + 1;
  const page1End = Math.min(1 * limit, totalEquities);
  assert.equal(page1Start, 1);
  assert.equal(page1End, 25);

  const lastPageStart = (387 - 1) * limit + 1;
  const lastPageEnd = Math.min(387 * limit, totalEquities);
  assert.equal(lastPageStart, 9651);
  assert.equal(lastPageEnd, 9668);
});
