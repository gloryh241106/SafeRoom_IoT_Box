/**
 * Historical telemetry explorer and client-side CSV exporter.
 * The API returns newest bounded samples in chronological order; the UI never
 * recalibrates sensor values and represents invalid MQ-2 samples as chart gaps.
 */
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, RefreshCw } from 'lucide-react';
import { apiFetch } from '../api';
import {
  MQ2_ADC_MAX,
  MQ2_ADC_MIN,
  getRawGasValue,
  hasValidRawGasValue
} from '../telemetryContract';

const TIME_RANGE_MS = Object.freeze({
  '1h': 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000
});

export default function Dashboard() {
  const [data, setData] = useState([]);
  const [timeRange, setTimeRange] = useState('24h');
  const [loading, setLoading] = useState(true);

  /** Request the selected wall-clock window; the API caps one response at 1000 samples. */
  const fetchHistoricalData = async () => {
    setLoading(true);
    try {
      const to = new Date();
      const from = new Date(to.getTime() - TIME_RANGE_MS[timeRange]);
      const query = new URLSearchParams({
        from: from.toISOString(),
        to: to.toISOString(),
        limit: '1000'
      });
      const res = await apiFetch(`/api/v1/telemetry/historical?${query}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const formatted = json.data.map((item) => ({
          timestamp: item.timestamp,
          time: new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          temperature: item.metrics.temperature,
          humidity: item.metrics.humidity,
          gasRaw: hasValidRawGasValue(item.metrics) ? getRawGasValue(item.metrics) : null
        }));
        setData(formatted);
      }
    } catch (err) {
      console.error('Error fetching historical telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistoricalData();
  }, [timeRange]);

  // Export exactly the samples currently graphed. Raw values are not rounded or
  // converted, and invalid gas samples remain empty cells instead of zeroes.
  const handleExportCSV = () => {
    if (data.length === 0) return;

    const headers = ['Timestamp', 'Temperature (C)', 'Humidity (%)', 'MQ2 Raw ADC (0-4095)'];
    const csvRows = [
      headers.join(','),
      ...data.map((row) => [row.timestamp, row.temperature, row.humidity, row.gasRaw ?? ''].join(','))
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `safebox_telemetry_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Range buttons change the API from/to bounds, not merely the chart label. */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-950 tracking-tight">Historical Telemetry Charts</h2>
          <p className="text-sm text-slate-500">Recharts time-series data analysis and CSV reporting</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium text-slate-600">
            {['1h', '6h', '24h', '7d'].map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  timeRange === range ? 'bg-white text-blue-700 font-semibold shadow-sm' : 'hover:text-slate-950'
                }`}
              >
                {range}
              </button>
            ))}
          </div>

          <button
            onClick={fetchHistoricalData}
            title="Refresh"
            className="p-2.5 rounded-md bg-white border border-slate-300 text-slate-600 hover:bg-slate-100 hover:text-slate-950 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="glass-card p-5 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-orange-600 uppercase tracking-wider">Temperature (°C)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '0.5rem', fontSize: '12px', color: '#0f172a' }} />
                  <Line type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="glass-card p-5 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wider">Humidity (%)</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '0.5rem', fontSize: '12px', color: '#0f172a' }} />
                  <Line type="monotone" dataKey="humidity" stroke="#3b82f6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Fixed 12-bit domain makes the raw MQ-2 scale explicit across ranges. */}
          <div className="glass-card p-5 rounded-lg space-y-4">
            <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wider">MQ-2 Raw ADC ({MQ2_ADC_MIN}–{MQ2_ADC_MAX})</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} domain={[MQ2_ADC_MIN, MQ2_ADC_MAX]} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '0.5rem', fontSize: '12px', color: '#0f172a' }} />
                  <Line type="monotone" dataKey="gasRaw" stroke="#ef4444" strokeWidth={2} dot={false} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
