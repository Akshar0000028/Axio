import { useState } from 'react';
import { Play, ChevronDown, BarChart2, Loader, CheckCircle, AlertCircle } from 'lucide-react';
import { trainModel } from './api';

function MetricBadge({ label, value }) {
  return (
    <div className="metric-card flex flex-col" style={{ gap: 4 }}>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff' }}>
        {typeof value === 'number' ? (value > 1 ? value.toFixed(4) : `${(value * 100).toFixed(1)}%`) : value ?? '—'}
      </span>
    </div>
  );
}

function FeatureRow({ name, importance, index }) {
  const pct = Math.round(importance * 100);
  const colors = ['#4f8cff', '#a78bfa', '#34d399', '#f59e0b', '#f87171'];
  const color = colors[index % colors.length];
  return (
    <div className="flex items-center" style={{ gap: 12, padding: '8px 0' }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.70)', width: 140, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <div style={{ flex: 1, height: 6, borderRadius: 9999, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: color, transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', width: 36, textAlign: 'right' }}>
        {pct}%
      </span>
    </div>
  );
}

export default function TrainPanel({ session, onTrained }) {
  const [target, setTarget]     = useState(session.recommended_target ?? '');
  const [testSize, setTestSize] = useState(0.2);
  const [cv, setCv]             = useState(false);
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const columns = session.features?.map(f => f.name) ?? [];

  const handleTrain = async () => {
    if (!target) { setError('Please select a target column.'); return; }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await trainModel(session.session_id, target, { testSize, crossValidate: cv });
      setResult(r);
      onTrained?.(r);
    } catch (err) {
      setError(err.message ?? 'Training failed.');
    } finally {
      setLoading(false);
    }
  };

  const metrics = result?.metrics ?? {};

  return (
    <div className="flex flex-col" style={{ gap: 24 }}>
      {/* Config panel */}
      <div className="glass-card" style={{ padding: 24, gap: 20, display: 'flex', flexDirection: 'column' }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>Training Configuration</h3>

        {/* Target column */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          <label htmlFor="target-select" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
            Target Column
          </label>
          <div style={{ position: 'relative' }}>
            <select
              id="target-select"
              value={target}
              onChange={e => setTarget(e.target.value)}
              style={{
                appearance: 'none',
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff',
                fontSize: 14,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="">— choose target —</option>
              {columns.map(c => (
                <option key={c} value={c} style={{ background: '#111' }}>{c}</option>
              ))}
            </select>
            <ChevronDown size={14} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          </div>
        </div>

        {/* Test size */}
        <div className="flex flex-col" style={{ gap: 8 }}>
          <label htmlFor="test-size" style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', fontWeight: 500 }}>
            Test Split: <span style={{ color: '#fff' }}>{Math.round(testSize * 100)}%</span>
          </label>
          <input
            id="test-size"
            type="range"
            min="0.10"
            max="0.40"
            step="0.05"
            value={testSize}
            onChange={e => setTestSize(parseFloat(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#4f8cff',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Cross validate */}
        <label className="flex items-center" style={{ gap: 10, cursor: 'pointer' }}>
          <input
            id="cross-validate"
            type="checkbox"
            checked={cv}
            onChange={e => setCv(e.target.checked)}
            style={{ accentColor: '#4f8cff', width: 16, height: 16, cursor: 'pointer' }}
          />
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.70)' }}>Enable 5-fold cross-validation</span>
        </label>

        {/* Error */}
        {error && (
          <div className="flex items-center" style={{ gap: 8, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={14} color="#ef4444" />
            <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
          </div>
        )}

        {/* Train button */}
        <button
          id="train-btn"
          onClick={handleTrain}
          disabled={loading}
          className="flex items-center justify-center"
          style={{
            padding: '12px 24px',
            borderRadius: 10,
            background: loading ? 'rgba(79,140,255,0.4)' : '#4f8cff',
            border: 'none',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
            gap: 8,
            fontFamily: 'inherit',
            transition: 'background 0.2s',
          }}
        >
          {loading ? <Loader size={16} className="animate-spin" /> : <Play size={16} />}
          {loading ? 'Training…' : 'Train Model'}
        </button>
      </div>

      {/* Results */}
      {result && (
        <div className="flex flex-col animate-fade-in-up" style={{ gap: 20 }}>
          {/* Success badge */}
          <div className="flex items-center" style={{ gap: 8 }}>
            <CheckCircle size={16} color="#34d399" />
            <span style={{ fontSize: 14, color: '#34d399', fontWeight: 500 }}>
              {result.model_name} trained · {result.problem_type}
            </span>
          </div>

          {/* Metrics grid */}
          <div className="grid grid-cols-2 gap-3">
            {metrics.accuracy    !== undefined && <MetricBadge label="Accuracy"  value={metrics.accuracy} />}
            {metrics.r2_score    !== undefined && <MetricBadge label="R² Score"  value={metrics.r2_score} />}
            {metrics.f1_score    !== undefined && <MetricBadge label="F1 Score"  value={metrics.f1_score} />}
            {metrics.mae         !== undefined && <MetricBadge label="MAE"       value={metrics.mae} />}
            {metrics.rmse        !== undefined && <MetricBadge label="RMSE"      value={metrics.rmse} />}
            {metrics.training_time_seconds !== undefined && (
              <MetricBadge label="Train Time" value={`${metrics.training_time_seconds.toFixed(2)}s`} />
            )}
          </div>

          {/* Feature importances */}
          {result.feature_importances && Object.keys(result.feature_importances).length > 0 && (
            <div className="glass-card" style={{ padding: 20 }}>
              <div className="flex items-center" style={{ gap: 8, marginBottom: 16 }}>
                <BarChart2 size={16} color="#4f8cff" />
                <h4 style={{ fontSize: 14, fontWeight: 600 }}>Feature Importances</h4>
              </div>
              <div className="flex flex-col">
                {Object.entries(result.feature_importances)
                  .sort(([, a], [, b]) => b - a)
                  .slice(0, 8)
                  .map(([name, imp], idx) => (
                    <FeatureRow key={name} name={name} importance={imp} index={idx} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
