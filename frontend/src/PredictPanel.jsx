import { useState } from 'react';
import { predict, downloadModel } from './api';
import { Zap, Download, AlertCircle, ChevronDown, Loader } from 'lucide-react';

export default function PredictPanel({ session }) {
  const features = session.features ?? [];
  const [values, setValues]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);
  const [error, setError]       = useState(null);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await predict(session.session_id, values);
      setResult(r);
    } catch (err) {
      setError(err.message ?? 'Prediction failed.');
    } finally {
      setLoading(false);
    }
  };

  const [downloading, setDownloading] = useState(false);
  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try { await downloadModel(session.session_id); }
    catch (err) { setError(err.message ?? 'Download failed.'); }
    finally { setDownloading(false); }
  };

  return (
    <div className="flex flex-col" style={{ gap: 20 }}>
      <div className="glass-card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>Run Prediction</h3>

        <div className="flex flex-col" style={{ gap: 12, maxHeight: 320, overflowY: 'auto' }}>
          {features.map(f => (
            <div key={f.name} className="flex flex-col" style={{ gap: 6 }}>
              <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>
                {f.name}
                <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.3)' }}>({f.dtype})</span>
              </label>
              <input
                type="text"
                id={`feature-${f.name}`}
                placeholder={f.sample_values?.[0] ?? '—'}
                value={values[f.name] ?? ''}
                onChange={e => setValues(prev => ({ ...prev, [f.name]: e.target.value }))}
                style={{
                  padding: '9px 12px',
                  borderRadius: 8,
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.10)',
                  color: '#fff',
                  fontSize: 13,
                  fontFamily: 'inherit',
                  outline: 'none',
                  transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(79,140,255,0.5)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'}
              />
            </div>
          ))}
        </div>

        {error && (
          <div className="flex items-center" style={{ gap: 8, marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={14} color="#ef4444" />
            <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
          </div>
        )}

        <button
          id="predict-btn"
          onClick={handlePredict}
          disabled={loading}
          className="flex items-center justify-center"
          style={{
            marginTop: 16,
            width: '100%',
            padding: '12px',
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
          {loading ? <Loader size={16} className="animate-spin" /> : <Zap size={16} />}
          {loading ? 'Predicting…' : 'Predict'}
        </button>
      </div>

      {result && (
        <div
          className="glass-card animate-fade-in-up"
          style={{
            padding: 24,
            borderColor: 'rgba(52,211,153,0.3)',
            background: 'rgba(52,211,153,0.04)',
          }}
        >
          <div style={{ fontSize: 12, color: 'rgba(52,211,153,0.8)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
            Prediction Result
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            {String(result.prediction)}
          </div>
          {result.confidence !== undefined && result.confidence !== null && (
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
              Confidence: <span style={{ color: '#fff' }}>{(result.confidence * 100).toFixed(1)}%</span>
            </div>
          )}
          {result.probabilities && (
            <div className="flex flex-col" style={{ gap: 6, marginTop: 16 }}>
              {Object.entries(result.probabilities).sort(([,a],[,b]) => b-a).map(([cls, prob]) => (
                <div key={cls} className="flex items-center" style={{ gap: 10 }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', width: 80, flexShrink: 0 }}>{cls}</span>
                  <div style={{ flex: 1, height: 4, borderRadius: 9999, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ width: `${(prob * 100).toFixed(1)}%`, height: '100%', borderRadius: 9999, background: '#34d399', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 40, textAlign: 'right' }}>
                    {(prob * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Export */}
      <button
        onClick={handleDownload}
        disabled={downloading}
        id="export-model-btn"
        className="flex items-center justify-center glass-card"
        style={{
          padding: '14px',
          gap: 8,
          fontSize: 14,
          fontWeight: 500,
          color: '#fff',
          textDecoration: 'none',
          transition: 'border-color 0.2s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'}
      >
        <Download size={16} color="rgba(255,255,255,0.6)" />
        {downloading ? 'Preparing download…' : 'Download Model (.joblib)'}
      </button>
    </div>
  );
}
