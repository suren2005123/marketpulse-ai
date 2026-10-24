import { db } from '../../db/index.js';

export interface TriggeredAlertEvent {
  alertId: string;
  userId: string;
  symbol: string;
  exchange: string;
  conditionType: string;
  threshold: number;
  currentValue: number;
  message: string;
  triggeredAt: string;
}

export class AlertEngine {
  private triggeredAlertCache: Map<string, boolean> = new Map();

  evaluate(quote: any): TriggeredAlertEvent[] {
    const triggered: TriggeredAlertEvent[] = [];
    const inst = db.store.instruments.find(i => i.symbol === quote.symbol);
    if (!inst) return triggered;

    const activeAlerts = db.store.price_alerts.filter(
      a => a.instrument_id === inst.id && a.active === true
    );

    for (const alert of activeAlerts) {
      const cacheKey = `${alert.id}:${alert.condition_type}`;
      let conditionMet = false;
      let message = '';
      const currentPrice = Number(quote.price);

      switch (alert.condition_type) {
        case 'PRICE_ABOVE':
          if (currentPrice >= Number(alert.threshold)) {
            conditionMet = true;
            message = `${quote.symbol} crossed ABOVE threshold of ₹${alert.threshold} (Current: ₹${currentPrice})`;
          }
          break;

        case 'PRICE_BELOW':
          if (currentPrice <= Number(alert.threshold)) {
            conditionMet = true;
            message = `${quote.symbol} crossed BELOW threshold of ₹${alert.threshold} (Current: ₹${currentPrice})`;
          }
          break;

        case 'PCT_CHANGE_ABOVE': {
          const open = Number(quote.open || currentPrice);
          const pctChange = Math.abs(((currentPrice - open) / open) * 100);
          if (pctChange >= Number(alert.threshold)) {
            conditionMet = true;
            message = `${quote.symbol} intraday change reached ${pctChange.toFixed(2)}% (Threshold: ${alert.threshold}%)`;
          }
          break;
        }

        case 'VOLUME_SPIKE': {
          const vol = Number(quote.volume || 0);
          if (vol >= Number(alert.threshold)) {
            conditionMet = true;
            message = `${quote.symbol} volume spike detected: ${vol.toLocaleString()} shares (Threshold: ${alert.threshold})`;
          }
          break;
        }
      }

      const wasAlreadyTriggered = this.triggeredAlertCache.get(cacheKey) || false;

      if (conditionMet && !wasAlreadyTriggered) {
        // Mark as triggered and deduplicate
        this.triggeredAlertCache.set(cacheKey, true);
        alert.triggered_at = new Date().toISOString();
        db.saveLocalData();

        triggered.push({
          alertId: alert.id,
          userId: alert.user_id,
          symbol: quote.symbol,
          exchange: quote.exchange,
          conditionType: alert.condition_type,
          threshold: Number(alert.threshold),
          currentValue: currentPrice,
          message,
          triggeredAt: alert.triggered_at,
        });
      } else if (!conditionMet && wasAlreadyTriggered) {
        // Reset when price drops back below/above threshold
        this.triggeredAlertCache.set(cacheKey, false);
      }
    }

    return triggered;
  }
}

export const alertEngine = new AlertEngine();
