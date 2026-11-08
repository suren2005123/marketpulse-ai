import { db } from '../../db/index.js';
import { CatalogueInstrument } from './catalogueService.js';

/**
 * Service providing market‑level insights used by Phase 3.
 * All calculations are performed on the in‑memory store (`db.store`).
 * No external network calls are made – we reuse existing price data
 * from the provider adapters (LIVE / SIMULATED / END_OF_DAY / HISTORICAL_REPLAY).
 */
export class InsightsService {
  /**
   * Returns a high‑level market overview for a given exchange (NSE, BSE or ALL).
   * Includes total count, advances/declines/unchanged and basic volume stats.
   */
  getMarketOverview(exchange: 'NSE' | 'BSE' | 'ALL' = 'ALL') {
    const instruments = this.filterInstruments(exchange);
    const total = instruments.length;
    let advances = 0,
      declines = 0,
      unchanged = 0,
      totalVolume = 0;
    for (const inst of instruments) {
      const change = inst.change ?? 0;
      if (change > 0) advances++;
      else if (change < 0) declines++;
      else unchanged++;
      totalVolume += inst.volume ?? 0;
    }
    return {
      exchange,
      totalInstruments: total,
      advances,
      declines,
      unchanged,
      totalVolume,
    };
  }

  /**
   * Top N gainers / losers by percentage change.
   */
  getTopMovers(exchange: 'NSE' | 'BSE' | 'ALL' = 'ALL', limit = 5) {
    const instruments = this.filterInstruments(exchange).filter((i) => typeof i.changePct === 'number');
    const sorted = instruments.sort((a, b) => (b.changePct! as number) - (a.changePct! as number));
    const topGainers = sorted.slice(0, limit);
    const topLosers = [...sorted].reverse().slice(0, limit);
    return { topGainers, topLosers };
  }

  /**
   * Most active stocks by volume.
   */
  getMostActive(exchange: 'NSE' | 'BSE' | 'ALL' = 'ALL', limit = 5) {
    const instruments = this.filterInstruments(exchange).filter((i) => typeof i.volume === 'number');
    const sorted = instruments.sort((a, b) => (b.volume! as number) - (a.volume! as number));
    return sorted.slice(0, limit);
  }

  /**
   * Sector‑wise performance – average percentage change per sector.
   */
  getSectorPerformance(exchange: 'NSE' | 'BSE' | 'ALL' = 'ALL') {
    const instruments = this.filterInstruments(exchange).filter((i) => typeof i.changePct === 'number');
    const sectorMap: Record<string, { sum: number; count: number }> = {};
    for (const inst of instruments) {
      const sector = inst.sector || 'Other';
      const val = inst.changePct as number;
      if (!sectorMap[sector]) sectorMap[sector] = { sum: 0, count: 0 };
      sectorMap[sector].sum += val;
      sectorMap[sector].count++;
    }
    const result = Object.entries(sectorMap).map(([sector, { sum, count }]) => ({
      sector,
      avgChangePct: Number((sum / count).toFixed(2)),
    }));
    // Sort descending by avg change
    result.sort((a, b) => b.avgChangePct - a.avgChangePct);
    return result;
  }

  /**
   * Helper to filter instruments by exchange, applying the live data source flags.
   * The catalogue already stores `sourceMode` and `freshness` – we simply forward them.
   */
  private filterInstruments(exchange: 'NSE' | 'BSE' | 'ALL'): CatalogueInstrument[] {
    return db.store.instruments.filter((i) => {
      if (exchange !== 'ALL' && i.exchange !== exchange) return false;
      // Ensure we have price data – otherwise treat as unavailable (skip).
      return typeof i.price === 'number';
    }) as CatalogueInstrument[];
  }
}
