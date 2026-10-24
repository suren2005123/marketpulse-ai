import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueService, CatalogueInstrument } from '../src/modules/market/catalogueService.js';
import { db } from '../src/db/index.js';

test('All Stocks: Catalogue Ingestion & Total Equity Population', async () => {
  await db.init();
  await catalogueService.initializeFromDatabase();
  const all = catalogueService.getAll();
  // Ensure we have active instruments loaded from persistent database or catalogue
  assert.ok(all.length >= 5, 'Catalogue must have loaded active instruments');
  assert.ok(catalogueService.getTotalCount() >= 5, 'Total count must reflect catalogue size');
});

test('All Stocks: Server-Side Pagination & Safe Page Boundaries', () => {
  // Test with mock dataset
  const testInstruments: CatalogueInstrument[] = Array.from({ length: 65 }, (_, i) => ({
    id: `inst-test-${i}`,
    exchange: i % 2 === 0 ? 'NSE' : 'BSE',
    symbol: `STOCK${String(i).padStart(3, '0')}`,
    name: `Test Stock Company ${i} Ltd`,
    sector: i % 3 === 0 ? 'Banking' : 'Technology',
    provider_instrument_key: `NSE_EQ|INE000A0${i}`,
    isin: `INE000A0${i}`,
    active: true,
    price: i % 5 === 0 ? undefined : 100 + i * 10, // Some missing prices
  }));

  catalogueService.loadMockInstruments(testInstruments);

  // Page 1 with limit 25
  const page1 = catalogueService.search({ page: 1, limit: 25 });
  assert.equal(page1.data.length, 25);
  assert.equal(page1.pagination.page, 1);
  assert.equal(page1.pagination.limit, 25);
  assert.equal(page1.pagination.total, 65);
  assert.equal(page1.pagination.totalPages, 3);
  assert.equal(page1.data[0].symbol, 'STOCK000');

  // Page 3 with limit 25 (last page has 15 items: 65 - 50)
  const page3 = catalogueService.search({ page: 3, limit: 25 });
  assert.equal(page3.data.length, 15);
  assert.equal(page3.pagination.page, 3);

  // Out of bound page (Page 99 should return empty data slice safely)
  const pageOverflow = catalogueService.search({ page: 99, limit: 25 });
  assert.equal(pageOverflow.data.length, 0);
  assert.equal(pageOverflow.pagination.totalPages, 3);

  // Negative page input should clamp safely to page 1
  const pageNegative = catalogueService.search({ page: -10, limit: 25 });
  assert.equal(pageNegative.pagination.page, 1);
  assert.equal(pageNegative.data.length, 25);

  // Limit capped at 100 max
  const pageBigLimit = catalogueService.search({ limit: 500 });
  assert.equal(pageBigLimit.pagination.limit, 100);
});

test('All Stocks: Search by Symbol and Company Name', () => {
  const resBySymbol = catalogueService.search({ search: 'STOCK005' });
  assert.equal(resBySymbol.data.length, 1);
  assert.equal(resBySymbol.data[0].symbol, 'STOCK005');

  const resByName = catalogueService.search({ search: 'Company 12' });
  assert.ok(resByName.data.length >= 1);
  assert.ok(resByName.data.some(i => i.name.includes('Company 12')));
});

test('All Stocks: Exchange Filtering (ALL, NSE, BSE)', () => {
  const nseOnly = catalogueService.search({ exchange: 'NSE' });
  assert.ok(nseOnly.data.length > 0);
  assert.ok(nseOnly.data.every(i => i.exchange === 'NSE'), 'All returned instruments must be NSE');

  const bseOnly = catalogueService.search({ exchange: 'BSE' });
  assert.ok(bseOnly.data.length > 0);
  assert.ok(bseOnly.data.every(i => i.exchange === 'BSE'), 'All returned instruments must be BSE');

  const allEx = catalogueService.search({ exchange: 'ALL' });
  assert.equal(allEx.pagination.total, 65);
});

test('All Stocks: Multi-Column Sorting', () => {
  // Sort by name descending
  const sortedNameDesc = catalogueService.search({ sortBy: 'name', sortOrder: 'desc' });
  assert.ok(sortedNameDesc.data[0].name >= sortedNameDesc.data[1].name);

  // Sort by price descending
  const sortedPriceDesc = catalogueService.search({ sortBy: 'price', sortOrder: 'desc' });
  const p0 = sortedPriceDesc.data[0].price || 0;
  const p1 = sortedPriceDesc.data[1].price || 0;
  assert.ok(p0 >= p1);
});

test('All Stocks: Missing Price Data Handling (N/A Safeguard)', () => {
  const results = catalogueService.search({ limit: 50 });
  // Find the stock where price is intentionally missing (STOCK000)
  const missingPriceStock = results.data.find(s => s.symbol === 'STOCK000');
  assert.ok(missingPriceStock, 'STOCK000 must exist');
  assert.equal(missingPriceStock.price, undefined, 'Missing prices must be strictly undefined, never fabricated to 0 or arbitrary numbers');

  // Verify stock with price
  const pricedStock = results.data.find(s => s.symbol === 'STOCK001');
  assert.ok(pricedStock?.price && pricedStock.price > 0, 'Priced stock must have genuine numeric price');
});
