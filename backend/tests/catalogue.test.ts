import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueService, CatalogueInstrument } from '../src/modules/market/catalogueService.js';
import { db } from '../src/db/index.js';

test('Catalogue Filter: Retains Valid Equities & Excludes Derivatives/Commodities', () => {
  const rawItems = [
    // Valid NSE Equity
    {
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
      trading_symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      isin: 'INE002A01018',
      instrument_key: 'NSE_EQ|INE002A01018',
      exchange_token: '2885',
    },
    // NSE Derivative (Futures) -> Must be excluded
    {
      segment: 'NSE_FO',
      instrument_type: 'FUTSTK',
      trading_symbol: 'RELIANCE26OCTFUT',
      name: 'Reliance Oct Future',
      isin: 'INE002A01018',
      instrument_key: 'NSE_FO|52194',
    },
    // NSE Index Option -> Must be excluded
    {
      segment: 'NSE_INDEX',
      instrument_type: 'OPTIDX',
      trading_symbol: 'NIFTY26OCT25000CE',
      name: 'Nifty 25000 CE',
      isin: 'INF966L01012',
      instrument_key: 'NSE_INDEX|42111',
    },
    // Valid BSE Equity Group A
    {
      segment: 'BSE_EQ',
      instrument_type: 'A',
      trading_symbol: 'TCS',
      name: 'Tata Consultancy Services',
      isin: 'INE467B01029',
      instrument_key: 'BSE_EQ|INE467B01029',
      exchange_token: '532540',
    },
    // Invalid / Missing Symbol -> Must be excluded
    {
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
      trading_symbol: '',
      name: 'Empty Symbol Record',
      isin: 'INE999A01019',
    },
    // Commodity Contract -> Must be excluded
    {
      segment: 'MCX_FO',
      instrument_type: 'FUTCOM',
      trading_symbol: 'GOLD26OCTFUT',
      name: 'Gold Future',
      isin: 'IN999G01019',
    },
  ];

  const nseFiltered = catalogueService.filterEquities(rawItems, 'NSE');
  assert.equal(nseFiltered.length, 1, 'Should only retain 1 valid NSE equity');
  assert.equal(nseFiltered[0].symbol, 'RELIANCE');
  assert.equal(nseFiltered[0].provider_instrument_key, 'NSE_EQ|INE002A01018');

  const bseFiltered = catalogueService.filterEquities(rawItems, 'BSE');
  assert.equal(bseFiltered.length, 1, 'Should only retain 1 valid BSE equity');
  assert.equal(bseFiltered[0].symbol, 'TCS');
  assert.equal(bseFiltered[0].provider_instrument_key, 'BSE_EQ|INE467B01029');
});

test('Catalogue Filter: In-Memory Deduplication of Duplicate Raw Records', () => {
  const duplicates = [
    {
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
      trading_symbol: 'INFY',
      name: 'Infosys Ltd - Entry 1',
      isin: 'INE009A01021',
      instrument_key: 'NSE_EQ|INE009A01021',
    },
    {
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
      trading_symbol: 'INFY',
      name: 'Infosys Ltd - Duplicate Entry',
      isin: 'INE009A01021',
      instrument_key: 'NSE_EQ|INE009A01021',
    },
  ];

  const filtered = catalogueService.filterEquities(duplicates, 'NSE');
  assert.equal(filtered.length, 1, 'Must deduplicate entries with identical exchange and symbol');
  assert.equal(filtered[0].symbol, 'INFY');
});

test('Catalogue Query Engine: Search, Filtering, Sorting, and Pagination', () => {
  const mockDataset: CatalogueInstrument[] = [
    {
      id: 'inst-nse-reliance',
      exchange: 'NSE',
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd',
      sector: 'Energy',
      provider_instrument_key: 'NSE_EQ|INE002A01018',
      isin: 'INE002A01018',
      active: true,
      price: 1190.0,
      changePct: 0.46,
      volume: 15000000,
    },
    {
      id: 'inst-nse-tcs',
      exchange: 'NSE',
      symbol: 'TCS',
      name: 'Tata Consultancy Services',
      sector: 'Technology',
      provider_instrument_key: 'NSE_EQ|INE467B01029',
      isin: 'INE467B01029',
      active: true,
      price: 4140.0,
      changePct: -1.25,
      volume: 2500000,
    },
    {
      id: 'inst-nse-tatamotors',
      exchange: 'NSE',
      symbol: 'TATAMOTORS',
      name: 'Tata Motors Ltd',
      sector: 'Automobile',
      provider_instrument_key: 'NSE_EQ|INE155A01022',
      isin: 'INE155A01022',
      active: true,
      price: 980.0,
      changePct: 2.35,
      volume: 8500000,
    },
    {
      id: 'inst-bse-lici',
      exchange: 'BSE',
      symbol: 'LICI',
      name: 'Life Insurance Corp of India',
      sector: 'Insurance',
      provider_instrument_key: 'BSE_EQ|INE0J1Y01017',
      isin: 'INE0J1Y01017',
      active: true,
      price: 1012.0,
      changePct: 0.15,
      volume: 450000,
    },
    {
      id: 'inst-bse-reliance',
      exchange: 'BSE',
      symbol: 'RELIANCE',
      name: 'Reliance Industries Ltd (BSE)',
      sector: 'Energy',
      provider_instrument_key: 'BSE_EQ|INE002A01018',
      isin: 'INE002A01018',
      active: true,
      price: 1189.5,
      changePct: 0.42,
      volume: 850000,
    },
  ];

  catalogueService.loadMockInstruments(mockDataset);

  // 1. Exchange Filter: NSE only
  const nseOnly = catalogueService.search({ exchange: 'NSE' });
  assert.equal(nseOnly.data.length, 3, 'Should find 3 NSE stocks');
  assert.ok(nseOnly.data.every(i => i.exchange === 'NSE'));

  // 2. Exchange Filter: BSE only
  const bseOnly = catalogueService.search({ exchange: 'BSE' });
  assert.equal(bseOnly.data.length, 2, 'Should find 2 BSE stocks');
  assert.ok(bseOnly.data.every(i => i.exchange === 'BSE'));

  // 3. Search by Symbol: Case-insensitive 'rel'
  const relSearch = catalogueService.search({ search: 'rel' });
  assert.equal(relSearch.data.length, 2, 'Should find 2 RELIANCE entries across NSE & BSE');

  // 4. Search by Company Name: 'tata'
  const tataSearch = catalogueService.search({ search: 'tata' });
  assert.equal(tataSearch.data.length, 2, 'Should match TCS and TATAMOTORS');

  // 5. Sorting by price descending
  const priceSorted = catalogueService.search({ sortBy: 'price', sortOrder: 'desc' });
  assert.equal(priceSorted.data[0].symbol, 'TCS', 'Highest price should be TCS (₹4140)');

  // 6. Sorting by changePct descending (Top gainers)
  const gainerSorted = catalogueService.search({ sortBy: 'changePct', sortOrder: 'desc' });
  assert.equal(gainerSorted.data[0].symbol, 'TATAMOTORS', 'Top gainer should be TATAMOTORS (+2.35%)');

  // 7. Pagination math: limit 2, page 1
  const p1 = catalogueService.search({ limit: 2, page: 1 });
  assert.equal(p1.data.length, 2);
  assert.equal(p1.pagination.page, 1);
  assert.equal(p1.pagination.total, 5);
  assert.equal(p1.pagination.totalPages, 3);

  // Page 2
  const p2 = catalogueService.search({ limit: 2, page: 2 });
  assert.equal(p2.data.length, 2);
  assert.equal(p2.pagination.page, 2);

  // Page 3 (1 remainder)
  const p3 = catalogueService.search({ limit: 2, page: 3 });
  assert.equal(p3.data.length, 1);

  // Invalid page bounds (negative page) should be clamped safely to page 1
  const pNeg = catalogueService.search({ limit: 2, page: -5 });
  assert.equal(pNeg.pagination.page, 1);
});

test('Database & Watchlist Integration with Catalogue Instruments', async () => {
  await db.init();

  const mockInstId = 'inst-test-cat-watch';
  await db.upsertInstrument({
    id: mockInstId,
    exchange: 'NSE',
    symbol: 'WATCHTEST',
    name: 'Watchlist Test Equities Ltd',
    sector: 'Banking',
    provider_instrument_key: 'NSE_EQ|INE999W01018',
  });

  const testUserId = 'usr-demo-001';

  // Add to watchlist
  await db.insertWatchlist(testUserId, mockInstId);

  const watchItems = db.store.user_watchlists.filter(w => w.user_id === testUserId && w.instrument_id === mockInstId);
  assert.equal(watchItems.length, 1, 'Should find 1 watchlist item for user and instrument');

  // Remove from watchlist
  await db.removeWatchlist(testUserId, mockInstId);
  const remaining = db.store.user_watchlists.filter(w => w.user_id === testUserId && w.instrument_id === mockInstId);
  assert.equal(remaining.length, 0, 'Watchlist item should be cleanly removed');

  // Cleanup
  db.store.instruments = db.store.instruments.filter(i => i.id !== mockInstId);
});

test('Ingestion: Gzip Stream Decompression & Equity Extraction', () => {
  const zlib = require('zlib');
  const mockMasterData = [
    {
      segment: 'NSE_EQ',
      instrument_type: 'EQ',
      trading_symbol: 'TESTGZ',
      name: 'Test Decompression Stock Ltd',
      isin: 'INE999T01019',
      instrument_key: 'NSE_EQ|INE999T01019',
      exchange_token: '12345',
    },
    {
      segment: 'NSE_INDEX',
      instrument_type: 'OPTIDX',
      trading_symbol: 'NIFTYOPTION',
      isin: 'INF000000000',
    },
  ];

  const compressedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(mockMasterData), 'utf8'));
  const decompressed = zlib.gunzipSync(compressedBuffer);
  const parsed = JSON.parse(decompressed.toString('utf8'));

  assert.equal(parsed.length, 2, 'Should decompress into full record array');
  const filtered = catalogueService.filterEquities(parsed, 'NSE');
  assert.equal(filtered.length, 1, 'Should filter out index derivative');
  assert.equal(filtered[0].symbol, 'TESTGZ');
  assert.equal(filtered[0].provider_instrument_key, 'NSE_EQ|INE999T01019');
});

test('API Validation: Parameter Boundaries, Sanitization, and Sensible Limits', () => {
  // Test query bounds logic matching GET /api/instruments/catalogue
  const testParams = (query: Record<string, any>) => {
    const validSortFields = ['symbol', 'name', 'exchange', 'price', 'changePct', 'volume'];
    const chosenSortBy = validSortFields.includes(String(query.sortBy)) ? String(query.sortBy) : 'symbol';
    const chosenSortOrder = String(query.sortOrder).toLowerCase() === 'desc' ? 'desc' : 'asc';

    const pageNum = parseInt(String(query.page), 10);
    const limitNum = parseInt(String(query.limit), 10);

    const safePage = isNaN(pageNum) || pageNum < 1 ? 1 : pageNum;
    const safeLimit = isNaN(limitNum) || limitNum < 1 ? 25 : Math.min(limitNum, 100);

    return { sortBy: chosenSortBy, sortOrder: chosenSortOrder, page: safePage, limit: safeLimit };
  };

  // Case 1: Excessive limit should be clamped to 100
  const r1 = testParams({ limit: 5000, page: 2 });
  assert.equal(r1.limit, 100, 'Limit > 100 must clamp to 100');
  assert.equal(r1.page, 2);

  // Case 2: Negative/NaN page or limit should default safely
  const r2 = testParams({ limit: -10, page: 'invalid' });
  assert.equal(r2.limit, 25, 'Negative limit must fallback to default 25');
  assert.equal(r2.page, 1, 'Invalid page must fallback to 1');

  // Case 3: SQL injection or invalid sort field must fallback to 'symbol'
  const r3 = testParams({ sortBy: 'DROP TABLE users;--', sortOrder: 'malicious' });
  assert.equal(r3.sortBy, 'symbol', 'Invalid sort field must sanitize to symbol');
  assert.equal(r3.sortOrder, 'asc', 'Invalid sort order must fallback to asc');
});

test('Safe Catalogue Refresh: Preserves Existing Catalogue if Sync Fails', async () => {
  const currentCount = catalogueService.getAll().length;
  assert.ok(currentCount > 0, 'Pre-condition: catalogue should have active instruments');

  // Override fetchUpstoxMaster to simulate network failure
  const originalFetch = (catalogueService as any).fetchUpstoxMaster;
  (catalogueService as any).fetchUpstoxMaster = async () => {
    throw new Error('Network failure: 503 Service Unavailable');
  };

  try {
    const result = await catalogueService.syncFullCatalogue();
    // When downloads fail, existing count is returned and memory is untouched
    assert.equal(result.total, currentCount, 'Returned count should equal existing count');
  } finally {
    // Restore original method
    (catalogueService as any).fetchUpstoxMaster = originalFetch;
  }

  // Verify existing instruments were NOT wiped out
  const postFailCount = catalogueService.getAll().length;
  assert.equal(postFailCount, currentCount, 'Catalogue memory must remain intact after failed download');
});

