import React, { useState, useEffect } from 'react';
import { api } from '../api/client.js';
import { useSocket } from '../context/SocketContext.js';
import { Alert, Instrument } from '../types/index.js';
import { Bell, Plus, Trash2, Power, AlertTriangle, CheckCircle, Clock } from 'lucide-react';

export const Alerts: React.FC = () => {
  const { triggeredAlerts, reconnectCount } = useSocket();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [loading, setLoading] = useState(true);

  // New alert form state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedInstId, setSelectedInstId] = useState('');
  const [conditionType, setConditionType] = useState<string>('PRICE_ABOVE');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [alertRes, instRes] = await Promise.all([
          api.get('/api/alerts'),
          api.get('/api/instruments'),
        ]);
        setAlerts(alertRes.data || []);
        setInstruments(instRes.data || []);
        if (instRes.data?.length > 0) {
          setSelectedInstId(instRes.data[0].id);
        }
      } catch (err) {
        console.warn('Alerts operating in presentation preview mode:', err);
        setAlerts([
          {
            id: 'alert-rel-1',
            userId: 'usr-presentation',
            instrumentId: 'inst-rel',
            symbol: 'RELIANCE',
            exchange: 'NSE',
            conditionType: 'PRICE_ABOVE',
            threshold: 3000.00,
            active: true,
            createdAt: new Date().toISOString(),
          },
        ]);
        setInstruments([
          { id: 'inst-rel', exchange: 'NSE', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', active: true },
          { id: 'inst-tcs', exchange: 'NSE', symbol: 'TCS', name: 'Tata Consultancy Services', active: true },
        ]);
        setSelectedInstId('inst-rel');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [reconnectCount]);

  const handleCreateAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const res = await api.post('/api/alerts', {
        instrumentId: selectedInstId,
        conditionType,
        threshold: parseFloat(threshold),
      });
      setAlerts((prev) => [res.data, ...prev]);
      setShowCreateModal(false);
      setThreshold('');
    } catch (err: any) {
      alert(err.message || 'Failed to create alert');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (alertId: string, currentActive: boolean) => {
    try {
      await api.patch(`/api/alerts/${alertId}`, { active: !currentActive });
      setAlerts((prev) =>
        prev.map((a) => (a.id === alertId ? { ...a, active: !currentActive } : a))
      );
    } catch (err: any) {
      alert(err.message || 'Failed to update alert');
    }
  };

  const handleDeleteAlert = async (alertId: string) => {
    if (!confirm('Are you sure you want to delete this alert?')) return;
    try {
      await api.delete(`/api/alerts/${alertId}`);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err: any) {
      alert(err.message || 'Failed to delete alert');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 text-purple-400" />
            <h2 className="text-xl font-bold text-white tracking-tight">Market Price Alerts</h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Private, user-scoped real-time notifications dispatched via dedicated socket room
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Create New Alert
        </button>
      </div>

      {/* Triggered Alerts Recent Log */}
      {triggeredAlerts.length > 0 && (
        <div className="p-4 rounded-2xl glass-card border border-rose-500/30 bg-rose-950/15">
          <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Recently Triggered In-Session Events
          </h3>
          <div className="space-y-2">
            {triggeredAlerts.map((ta) => (
              <div
                key={ta.alertId + ta.triggeredAt}
                className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs font-mono"
              >
                <div>
                  <span className="font-bold text-white mr-2">{ta.symbol}</span>
                  <span className="text-slate-300">{ta.message}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {new Date(ta.triggeredAt).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Configured Alerts List */}
      <div className="p-5 rounded-2xl glass-card border border-slate-800">
        <h3 className="text-sm font-bold text-white mb-4">Configured Alert Rules</h3>

        {alerts.length === 0 ? (
          <div className="py-12 text-center text-slate-500 text-xs">
            No price alerts configured yet. Click "Create New Alert" to set your first alert.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px]">
                  <th className="pb-2">SYMBOL</th>
                  <th className="pb-2">CONDITION TYPE</th>
                  <th className="pb-2 text-right">THRESHOLD</th>
                  <th className="pb-2 text-center">STATUS</th>
                  <th className="pb-2">LAST TRIGGERED</th>
                  <th className="pb-2 text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {alerts.map((a) => {
                  return (
                    <tr key={a.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 font-bold text-white">
                        {a.symbol}
                        <span className="text-[10px] text-slate-500 ml-1 font-normal">
                          ({a.exchange})
                        </span>
                      </td>
                      <td className="py-3 text-cyan-400">
                        {a.conditionType === 'PRICE_ABOVE'
                          ? 'Price crosses ABOVE'
                          : a.conditionType === 'PRICE_BELOW'
                          ? 'Price crosses BELOW'
                          : a.conditionType === 'PCT_CHANGE_ABOVE'
                          ? 'Intraday change > %'
                          : a.conditionType === 'VOLUME_SPIKE'
                          ? 'Volume spike > shares'
                          : a.conditionType}
                      </td>
                      <td className="py-3 text-right font-bold text-slate-200">
                        {a.conditionType.includes('PCT') ? `${a.threshold}%` : `₹${a.threshold}`}
                      </td>
                      <td className="py-3 text-center">
                        <button
                          onClick={() => handleToggleActive(a.id, a.active)}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                            a.active
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}
                        >
                          <Power className="w-2.5 h-2.5" />
                          {a.active ? 'ACTIVE' : 'PAUSED'}
                        </button>
                      </td>
                      <td className="py-3 text-slate-400 text-[11px]">
                        {a.triggeredAt ? (
                          new Date(a.triggeredAt).toLocaleTimeString('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            hour: '2-digit',
                            minute: '2-digit',
                          }) + ' IST'
                        ) : (
                          <span className="text-slate-600">Never</span>
                        )}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => handleDeleteAlert(a.id)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors"
                          title="Delete Alert"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Alert Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#0e131f] border border-slate-800 p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
              <Bell className="w-4 h-4 text-purple-400" />
              Configure User Price Alert
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Real-time trigger alerts are scoped to your private account and delivered to your socket room.
            </p>

            <form onSubmit={handleCreateAlert} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Select Equity
                </label>
                <select
                  value={selectedInstId}
                  onChange={(e) => setSelectedInstId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  {instruments.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.symbol} — {i.name} ({i.exchange})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Trigger Condition
                </label>
                <select
                  value={conditionType}
                  onChange={(e) => setConditionType(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white"
                >
                  <option value="PRICE_ABOVE">Price Crosses ABOVE (₹ &gt;= Threshold)</option>
                  <option value="PRICE_BELOW">Price Crosses BELOW (₹ &lt;= Threshold)</option>
                  <option value="PCT_CHANGE_ABOVE">Intraday % Change Exceeds Threshold</option>
                  <option value="VOLUME_SPIKE">Volume Spike (1m Volume &gt;= Threshold)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Threshold Value
                </label>
                <input
                  type="number"
                  step="0.05"
                  required
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder="e.g. 3050 or 2.5"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold text-white"
                >
                  {saving ? 'Creating...' : 'Create Alert'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
