import { EventEmitter } from 'events';
import { IMarketDataProvider, ProviderStatus, SourceMode } from './types.js';
import { UpstoxV3Adapter } from './upstoxAdapter.js';
import { SimulatedAdapter } from './simulatedAdapter.js';
import { HistoricalReplayAdapter } from './replayAdapter.js';
import { TejHQAdapter, TejHQDetailedStatus } from './tejhqAdapter.js';
import { config } from '../../config/index.js';

export class ProviderManager extends EventEmitter implements IMarketDataProvider {
  public name = 'provider-manager';
  private currentMode: SourceMode;
  private currentProvider: IMarketDataProvider;
  private upstoxAdapter: UpstoxV3Adapter;
  private simAdapter: SimulatedAdapter;
  private replayAdapter: HistoricalReplayAdapter;
  private tejhqAdapter: TejHQAdapter;

  constructor(initialMode: SourceMode = 'SIMULATED') {
    super();
    this.currentMode = initialMode;
    this.upstoxAdapter = new UpstoxV3Adapter();
    this.simAdapter = new SimulatedAdapter();
    this.replayAdapter = new HistoricalReplayAdapter();
    this.tejhqAdapter = new TejHQAdapter(config.provider.tejhqBaseUrl);

    this.currentProvider = this.selectAdapter(initialMode);
    this.hookAdapter(this.currentProvider);
  }

  private selectAdapter(mode: SourceMode): IMarketDataProvider {
    switch (mode) {
      case 'END_OF_DAY':
        return this.tejhqAdapter;
      case 'LIVE':
        if (config.provider.name.toLowerCase() === 'tejhq') {
          return this.tejhqAdapter;
        }
        return this.upstoxAdapter;
      case 'HISTORICAL_REPLAY':
        return this.replayAdapter;
      case 'SIMULATED':
      default:
        return this.simAdapter;
    }
  }

  private hookAdapter(adapter: IMarketDataProvider): void {
    adapter.on('tick', (tick) => this.emit('tick', tick));
    adapter.on('status', (status) => this.emit('status', status));
  }

  async connect(): Promise<void> {
    console.log(`[Provider Manager] Starting market data provider in ${this.currentMode} mode...`);
    await this.currentProvider.connect();
  }

  async disconnect(): Promise<void> {
    await this.currentProvider.disconnect();
  }

  subscribe(symbols: string[]): void {
    this.currentProvider.subscribe(symbols);
  }

  unsubscribe(symbols: string[]): void {
    this.currentProvider.unsubscribe(symbols);
  }

  async start(): Promise<void> {
    await this.connect();
  }

  async switchMode(newMode: SourceMode, replaySpeed?: number): Promise<void> {
    if (this.currentMode === newMode && !replaySpeed) return;

    console.log(`[Provider Manager] Switching data mode from ${this.currentMode} to ${newMode}...`);
    await this.currentProvider.disconnect();

    this.currentMode = newMode;
    config.appMode = newMode;
    this.currentProvider = this.selectAdapter(newMode);

    if (newMode === 'HISTORICAL_REPLAY' && replaySpeed) {
      this.replayAdapter.setSpeed(replaySpeed);
    }

    this.hookAdapter(this.currentProvider);
    await this.currentProvider.connect();
    this.emit('status', this.getStatus());
  }

  getStatus(): ProviderStatus {
    return this.currentProvider.getStatus();
  }

  getDetailedStatus(): any {
    if (this.currentProvider === this.tejhqAdapter) {
      return this.tejhqAdapter.getDetailedStatus();
    }
    return {
      ...this.currentProvider.getStatus(),
      tradingDate: null,
      lastPublishedAt: null,
      lastPublishedIst: null,
      lastSyncAt: null,
      cachedSnapshotsCount: 0,
      cachedOhlcvCount: 0,
    };
  }

  getActiveProvider(): IMarketDataProvider {
    return this.currentProvider;
  }

  getTejHQAdapter(): TejHQAdapter {
    return this.tejhqAdapter;
  }

  getCurrentMode(): SourceMode {
    return this.currentMode;
  }
}
