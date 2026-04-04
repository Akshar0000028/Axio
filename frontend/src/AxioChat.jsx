import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send, Bot, User, Loader, Upload, X, CheckCircle, AlertCircle,
  Download, Copy, BarChart2, Play, ChevronDown, Plus, MessageSquare,
  Zap, Database, FlaskConical, ArrowLeft, Sparkles
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { uploadDataset, sendChatMessage, trainModel, getExportUrl } from './api';

const QUICK_PROMPTS = [
  { icon: '🤖', label: 'Train a model on my dataset' },
  { icon: '📊', label: 'Explain overfitting vs underfitting' },
  { icon: '🐼', label: 'Pandas data cleaning tips' },
  { icon: '🎯', label: 'How do I choose the right model?' },
];

const CAPABILITIES = [
  'Machine learning guidance',
  'Python & pandas help',
  'Statistical analysis',
  'Model selection & tuning',
  'Data preprocessing tips',
  'AI & deep learning concepts',
];

const QUICK_QUESTIONS = [
  'What ML model should I use for my use case?',
  'How do I handle missing values in my dataset?',
  'Explain overfitting and how to prevent it',
  'What is the difference between RMSE and MAE?',
];

const MODEL_KEYS = [
  { key: '', label: 'Auto-select (recommended)' },
  { key: 'random_forest', label: 'Random Forest' },
  { key: 'gradient_boosting', label: 'Gradient Boosting' },
  { key: 'hist_gradient_boosting', label: 'Hist Gradient Boosting (fastest)' },
  { key: 'logistic_regression', label: 'Logistic Regression' },
  { key: 'linear_regression', label: 'Linear Regression' },
  { key: 'ridge', label: 'Ridge Regression' },
];

function MetricPill({ label, value, delta }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      background: 'rgba(255,255,255,0.05)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10, padding: '10px 14px', minWidth: 90,
    }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>{value}</span>
      {delta && <span style={{ fontSize: 11, color: '#34d399' }}>{delta}</span>}
    </div>
  );
}

function FeatureBar({ name, importance, idx }) {
  const colors = ['#4f8cff', '#a78bfa', '#34d399', '#f59e0b', '#f87171'];
  const pct = Math.round(importance * 100);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)', width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>{name}</span>
      <div style={{ flex: 1, height: 5, borderRadius: 9999, background: 'rgba(255,255,255,0.08)' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 9999, background: colors[idx % colors.length], transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 32, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
    </div>
  );
}

function TrainResultCard({ result, sessionId }) {
  const [copied, setCopied] = useState(false);
  const m = result.metrics;

  const formatMetric = (v) => {
    if (typeof v !== 'number') return '—';
    return v > 1 ? v.toFixed(4) : `${(v * 100).toFixed(1)}%`;
  };

  const handleCopy = () => {
    const text = `Model: ${result.model_name}\nType: ${result.problem_type}\n` +
      Object.entries(m)
        .filter(([k, v]) => typeof v === 'number' && !['training_time_seconds'].includes(k))
        .map(([k, v]) => `${k}: ${formatMetric(v)}`)
        .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{
      background: 'rgba(52,211,153,0.06)',
      border: '1px solid rgba(52,211,153,0.2)',
      borderRadius: 14, padding: 18, marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <CheckCircle size={15} color="#34d399" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#34d399' }}>
          {result.model_name} trained · {result.problem_type}
        </span>
        {m.training_time_seconds !== undefined && (
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginLeft: 'auto' }}>
            {m.training_time_seconds.toFixed(2)}s
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {m.accuracy    != null && <MetricPill label="Accuracy"  value={formatMetric(m.accuracy)} />}
        {m.f1_score    != null && <MetricPill label="F1 Score"  value={formatMetric(m.f1_score)} />}
        {m.precision   != null && <MetricPill label="Precision" value={formatMetric(m.precision)} />}
        {m.recall      != null && <MetricPill label="Recall"    value={formatMetric(m.recall)} />}
        {m.r2_score    != null && <MetricPill label="R² Score"  value={formatMetric(m.r2_score)} />}
        {m.rmse        != null && <MetricPill label="RMSE"      value={m.rmse.toFixed(4)} />}
        {m.mae         != null && <MetricPill label="MAE"       value={m.mae.toFixed(4)} />}
        {m.auc_roc     != null && <MetricPill label="AUC-ROC"   value={formatMetric(m.auc_roc)} />}
        {m.cv_mean     != null && <MetricPill label="CV Mean"   value={formatMetric(m.cv_mean)} delta={m.cv_std != null ? `±${(m.cv_std*100).toFixed(1)}%` : undefined} />}
      </div>

      {m.feature_importance && Object.keys(m.feature_importance).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <BarChart2 size={13} color="#4f8cff" />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Features</span>
          </div>
          {Object.entries(m.feature_importance).sort(([,a],[,b]) => b-a).slice(0,6).map(([name, imp], i) => (
            <FeatureBar key={name} name={name} importance={imp} idx={i} />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a
          href={getExportUrl('model', sessionId)}
          download
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.25)',
            color: '#4f8cff', fontSize: 13, fontWeight: 500, textDecoration: 'none',
            cursor: 'pointer', transition: 'background 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.22)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,140,255,0.12)'}
        >
          <Download size={13} />
          Download .joblib
        </a>
        <button
          onClick={handleCopy}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '7px 14px', borderRadius: 8,
            background: copied ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.05)',
            border: `1px solid ${copied ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.1)'}`,
            color: copied ? '#34d399' : 'rgba(255,255,255,0.65)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Copy size={13} />
          {copied ? 'Copied!' : 'Copy Results'}
        </button>
      </div>
    </div>
  );
}

function InlineTrainCard({ session, onTrainComplete }) {
  const [target, setTarget] = useState(session.recommended_target ?? '');
  const [modelKey, setModelKey] = useState('');
  const [testSize, setTestSize] = useState(0.2);
  const [cv, setCv] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const columns = session.features?.map(f => f.name) ?? [];

  const handleTrain = async () => {
    if (!target) { setError('Please select a target column.'); return; }
    setLoading(true); setError(null);
    try {
      const result = await trainModel(session.session_id, target, { modelKey, testSize, crossValidate: cv });
      onTrainComplete(result);
    } catch (err) {
      setError(err.message ?? 'Training failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(79,140,255,0.06)',
      border: '1px solid rgba(79,140,255,0.2)',
      borderRadius: 14, padding: 18, marginTop: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <FlaskConical size={15} color="#4f8cff" />
        <span style={{ fontSize: 14, fontWeight: 600, color: '#4f8cff' }}>Train a Model</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 }}>Target Column</label>
            <div style={{ position: 'relative' }}>
              <select value={target} onChange={e => setTarget(e.target.value)} style={{
                appearance: 'none', width: '100%',
                padding: '8px 32px 8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                <option value="">— choose target —</option>
                {columns.map(c => <option key={c} value={c} style={{ background: '#111' }}>{c}</option>)}
              </select>
              <ChevronDown size={12} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 }}>Model</label>
            <div style={{ position: 'relative' }}>
              <select value={modelKey} onChange={e => setModelKey(e.target.value)} style={{
                appearance: 'none', width: '100%',
                padding: '8px 32px 8px 12px', borderRadius: 8,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: 13, fontFamily: 'inherit', cursor: 'pointer',
              }}>
                {MODEL_KEYS.map(m => <option key={m.key} value={m.key} style={{ background: '#111' }}>{m.label}</option>)}
              </select>
              <ChevronDown size={12} color="rgba(255,255,255,0.4)" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 5 }}>
              Test Split: <span style={{ color: '#fff' }}>{Math.round(testSize * 100)}%</span>
            </label>
            <input type="range" min="0.10" max="0.40" step="0.05" value={testSize}
              onChange={e => setTestSize(parseFloat(e.target.value))}
              style={{ width: 140, accentColor: '#4f8cff', cursor: 'pointer' }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.65)', paddingTop: 18 }}>
            <input type="checkbox" checked={cv} onChange={e => setCv(e.target.checked)}
              style={{ accentColor: '#4f8cff', width: 14, height: 14, cursor: 'pointer' }} />
            5-fold cross-validation
          </label>
        </div>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle size={13} color="#ef4444" />
            <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
          </div>
        )}

        <button onClick={handleTrain} disabled={loading} style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px 20px', borderRadius: 9, alignSelf: 'flex-start',
          background: loading ? 'rgba(79,140,255,0.4)' : '#4f8cff',
          border: 'none', color: '#fff', fontSize: 14, fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', transition: 'background 0.2s',
        }}>
          {loading ? <Loader size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Play size={14} />}
          {loading ? 'Training…' : 'Train Model'}
        </button>
      </div>
    </div>
  );
}

function FileUploadBubble({ file, progress, done }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 14px', borderRadius: 12,
      background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
      maxWidth: 320,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, flexShrink: 0,
        background: done ? 'rgba(52,211,153,0.12)' : 'rgba(79,140,255,0.12)',
        border: `1px solid ${done ? 'rgba(52,211,153,0.25)' : 'rgba(79,140,255,0.25)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {done ? <CheckCircle size={16} color="#34d399" /> : <Upload size={16} color="#4f8cff" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file}</div>
        {!done && (
          <div style={{ marginTop: 6, height: 3, borderRadius: 9999, background: 'rgba(255,255,255,0.1)' }}>
            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 9999, background: '#4f8cff', transition: 'width 0.2s' }} />
          </div>
        )}
        {done && <div style={{ fontSize: 12, color: '#34d399', marginTop: 2 }}>Upload complete</div>}
      </div>
    </div>
  );
}

function ChatMessage({ msg, session, onTrainComplete, onSendMessage }) {
  const isUser = msg.role === 'user';

  if (msg.type === 'file-upload') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <FileUploadBubble file={msg.filename} progress={msg.progress ?? 100} done={msg.done} />
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      gap: 10, marginBottom: 16,
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
        }}>
          <Bot size={15} color="#4f8cff" />
        </div>
      )}

      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          padding: '11px 15px',
          borderRadius: isUser ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
          background: isUser ? '#4f8cff' : 'rgba(255,255,255,0.06)',
          border: isUser ? 'none' : '1px solid rgba(255,255,255,0.1)',
          fontSize: 14, lineHeight: 1.65,
          color: isUser ? '#fff' : 'rgba(255,255,255,0.88)',
        }}>
          {isUser ? msg.content : (
            <ReactMarkdown
              components={{
                p: ({ children }) => <div style={{ margin: '0 0 8px 0' }}>{children}</div>,
                strong: ({ children }) => <strong style={{ color: '#fff' }}>{children}</strong>,
                h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '12px 0 6px', color: '#fff' }}>{children}</h3>,
                ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: '6px 0' }}>{children}</ul>,
                li: ({ children }) => <li style={{ marginBottom: 4 }}>{children}</li>,
                code: ({ inline, children }) => inline ? (
                  <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'monospace' }}>{children}</code>
                ) : (
                  <pre style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 14px', margin: '8px 0', overflowX: 'auto' }}>
                    <code style={{ fontSize: 12, fontFamily: 'monospace', color: 'rgba(255,255,255,0.85)' }}>{children}</code>
                  </pre>
                ),
              }}
            >
              {msg.content}
            </ReactMarkdown>
          )}
        </div>

        {msg.metrics && msg.metrics.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {msg.metrics.map((m, i) => (
              <MetricPill key={i} label={m.label} value={m.value} delta={m.delta} />
            ))}
          </div>
        )}

        {msg.actions && msg.actions.length > 0 && session && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {msg.actions.map((action, i) => {
              const isTrainAction = /train|fit|build.*model/i.test(action);
              const isExportAction = /export|download|save.*model/i.test(action);
              if (isExportAction) {
                return (
                  <a key={i} href={getExportUrl('model', session.session_id)} download
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 7,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                      color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500, textDecoration: 'none',
                    }}
                  >
                    <Download size={12} />
                    {action}
                  </a>
                );
              }
              return (
                <button key={i}
                  onClick={() => {
                    if (isTrainAction) msg.onTrainClick?.();
                    else onSendMessage?.(action);
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 7,
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                >
                  {isTrainAction ? <Play size={12} /> : <Sparkles size={12} />}
                  {action}
                </button>
              );
            })}
          </div>
        )}

        {msg.showTrainCard && session && (
          <InlineTrainCard session={session} onTrainComplete={onTrainComplete} />
        )}

        {msg.trainResult && session && (
          <TrainResultCard result={msg.trainResult} sessionId={session.session_id} />
        )}
      </div>

      {isUser && (
        <div style={{
          width: 30, height: 30, borderRadius: 8, flexShrink: 0,
          background: 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2,
        }}>
          <User size={15} color="rgba(255,255,255,0.6)" />
        </div>
      )}
    </div>
  );
}

export default function AxioChat({ onBack }) {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [conversations] = useState([{ id: 1, label: 'New conversation' }]);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const uploadMsgIdRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addMessage = (msg) => {
    const id = Date.now() + Math.random();
    setMessages(prev => [...prev, { ...msg, id }]);
    return id;
  };

  const updateMessage = (id, updates) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
  };

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      addMessage({ role: 'assistant', content: '⚠️ Only CSV and Excel (.xlsx, .xls) files are supported.' });
      return;
    }
    setUploading(true);

    const uploadId = addMessage({ role: 'user', type: 'file-upload', filename: file.name, progress: 0, done: false });
    uploadMsgIdRef.current = uploadId;

    try {
      const result = await uploadDataset(file, (pct) => {
        updateMessage(uploadId, { progress: pct });
      });
      updateMessage(uploadId, { done: true });
      setSession(result);

      const summaryLines = [
        `**${result.filename}** uploaded successfully!`,
        ``,
        `📊 **Dataset Overview**`,
        `- **${result.row_count?.toLocaleString()} rows** × **${result.col_count} columns**`,
        result.recommended_target ? `- Recommended target: \`${result.recommended_target}\`` : '',
        ``,
        `**Columns detected:**`,
        result.features?.slice(0, 10).map(f => `- \`${f.name}\` (${f.dtype}${f.missing_pct > 0 ? `, ${f.missing_pct.toFixed(1)}% missing` : ''})`).join('\n'),
        result.features?.length > 10 ? `\n_...and ${result.features.length - 10} more columns_` : '',
        ``,
        `You can now ask me to **train a model**, or click "Train Model" below to configure it.`,
      ].filter(Boolean).join('\n');

      addMessage({
        role: 'assistant',
        content: summaryLines,
        actions: ['Train Model', 'Explain this dataset', 'What model should I use?'],
        showTrainCard: false,
        onTrainClick: null,
      });
    } catch (err) {
      updateMessage(uploadId, { done: true });
      addMessage({ role: 'assistant', content: `⚠️ Upload failed: ${err.message}` });
    } finally {
      setUploading(false);
    }
  }, []);

  const handleTrainClick = (msgId) => {
    updateMessage(msgId, { showTrainCard: true });
  };

  const handleTrainComplete = useCallback((msgId, result) => {
    updateMessage(msgId, { showTrainCard: false });
    const summaryContent = `✅ **${result.model_name}** trained successfully on **${result.problem_type}** task!\n\nClick "Download .joblib" to export your model, or ask me anything about the results.`;
    addMessage({ role: 'assistant', content: summaryContent, trainResult: result });
  }, []);

  const sendMessage = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    addMessage({ role: 'user', content: msg });
    setLoading(true);

    const isTrainIntent = /\b(train|fit|build|run)\b.*\bmodel\b/i.test(msg) ||
      /\bmodel\b.*\b(train|fit|build)\b/i.test(msg);

    try {
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .filter(m => m.content)
        .map(m => ({ role: m.role, content: m.content }));

      const sessionId = session?.session_id ?? 'no-session';
      const res = await sendChatMessage(sessionId, msg, history);

      const newMsgId = Date.now() + Math.random();
      const showTrain = isTrainIntent && session && !res.actions?.some(a => /train/i.test(a));

      setMessages(prev => [...prev, {
        id: newMsgId,
        role: 'assistant',
        content: res.content,
        actions: res.actions,
        metrics: res.metrics,
        showTrainCard: showTrain,
        onTrainClick: () => handleTrainClick(newMsgId),
      }]);
    } catch (err) {
      addMessage({ role: 'assistant', content: `⚠️ ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); };
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const hasMessages = messages.length > 0;

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', overflow: 'hidden' }}>

      {/* ── Left Sidebar ─────────────────────────────── */}
      <div style={{
        width: 220, flexShrink: 0,
        background: '#111', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', padding: '14px 12px',
        overflowY: 'auto',
      }}>
        {/* Logo + Exit */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, padding: '0 4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7,
              background: 'linear-gradient(135deg,#4f8cff,#a78bfa)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>AXIO <span style={{ color: '#4f8cff', fontSize: 11, fontWeight: 600 }}>AI</span></span>
          </div>
          <button onClick={onBack} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: 'none', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 6, padding: '4px 8px',
            color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
          >
            <ArrowLeft size={11} />
            Exit
          </button>
        </div>

        {/* New Chat */}
        <button onClick={() => { setMessages([]); setSession(null); setInput(''); }} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '9px 12px', borderRadius: 9, marginBottom: 20,
          background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.2)',
          color: '#4f8cff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          transition: 'background 0.2s',
        }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(79,140,255,0.18)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(79,140,255,0.1)'}
        >
          <Plus size={14} />
          New Chat
        </button>

        {/* Recent */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 4px', marginBottom: 6 }}>RECENT</p>
          {conversations.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
              background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.15)',
            }}>
              <MessageSquare size={13} color="#4f8cff" />
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
            </div>
          ))}
        </div>

        {/* Quick Prompts */}
        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 4px', marginBottom: 6 }}>QUICK PROMPTS</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {QUICK_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => sendMessage(p.label)} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8, background: 'none',
                border: 'none', color: 'rgba(255,255,255,0.65)',
                fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                textAlign: 'left', transition: 'background 0.15s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'none'}
              >
                <span style={{ fontSize: 15 }}>{p.icon}</span>
                <span style={{ lineHeight: 1.3 }}>{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Capabilities */}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0 4px', marginBottom: 6 }}>CAPABILITIES</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 4px' }}>
            {CAPABILITIES.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(79,140,255,0.6)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{c}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Model badge */}
        <div style={{
          marginTop: 16, padding: '8px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 5px rgba(52,211,153,0.5)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.3 }}>Nemotron 3 Super 120B<br />via NVIDIA NIM</span>
        </div>
      </div>

      {/* ── Main Chat Area ────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative' }}
        onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 50,
            background: 'rgba(79,140,255,0.08)',
            border: '2px dashed rgba(79,140,255,0.5)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 12, pointerEvents: 'none',
          }}>
            <Upload size={40} color="#4f8cff" strokeWidth={1.5} />
            <span style={{ fontSize: 16, fontWeight: 600, color: '#4f8cff' }}>Drop your dataset to upload</span>
          </div>
        )}

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 24px', borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0, background: '#0a0a0a',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: 'linear-gradient(135deg,rgba(79,140,255,0.2),rgba(167,139,250,0.2))',
              border: '1px solid rgba(79,140,255,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={18} color="#4f8cff" />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Axio AI</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                ML assistant · {session ? `Dataset: ${session.filename}` : 'Upload a dataset to train models'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.5)' }} />
            <span style={{ fontSize: 12, color: '#34d399', fontWeight: 500 }}>Online</span>
          </div>
        </div>

        {/* Messages / Welcome */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          {!hasMessages ? (
            /* Welcome State */
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60%', gap: 28 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 18,
                  background: 'linear-gradient(135deg,rgba(79,140,255,0.15),rgba(167,139,250,0.15))',
                  border: '1px solid rgba(79,140,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 20px',
                }}>
                  <Sparkles size={28} color="#4f8cff" strokeWidth={1.5} />
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 10 }}>Your ML workspace</h2>
                <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', maxWidth: 420, lineHeight: 1.6 }}>
                  Ask any ML question, or upload a dataset to train, evaluate, and export a model — all from chat.
                </p>
              </div>

              <button
                onClick={() => fileInputRef.current?.click()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '13px 24px', borderRadius: 12,
                  background: 'rgba(79,140,255,0.1)', border: '1px solid rgba(79,140,255,0.3)',
                  color: '#4f8cff', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'inherit', transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.18)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.5)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(79,140,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(79,140,255,0.3)'; }}
              >
                <Database size={18} />
                Upload CSV / Excel to train a model
              </button>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 580, width: '100%' }}>
                {QUICK_QUESTIONS.map((q, i) => (
                  <button key={i} onClick={() => sendMessage(q)} style={{
                    padding: '13px 16px', borderRadius: 12, textAlign: 'left',
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 1.5,
                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                  }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#fff'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <div>
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  msg={{
                    ...msg,
                    onTrainClick: () => handleTrainClick(msg.id),
                  }}
                  session={session}
                  onTrainComplete={(result) => handleTrainComplete(msg.id, result)}
                  onSendMessage={sendMessage}
                />
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 16 }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                    background: 'rgba(79,140,255,0.12)', border: '1px solid rgba(79,140,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Bot size={15} color="#4f8cff" />
                  </div>
                  <div style={{
                    padding: '11px 15px', borderRadius: '14px 14px 14px 4px',
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <Loader size={14} color="rgba(255,255,255,0.5)" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>Thinking…</span>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div style={{ padding: '12px 24px 16px', flexShrink: 0, background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: 10,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 14, padding: '10px 12px',
            transition: 'border-color 0.2s',
          }}
            onFocus={() => {}}
          >
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: uploading ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
              }}
              onMouseEnter={e => !uploading && (e.currentTarget.style.background = 'rgba(79,140,255,0.15)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
              title="Attach dataset (CSV/Excel)"
            >
              {uploading ? <Loader size={14} color="#4f8cff" style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={14} color="rgba(255,255,255,0.5)" />}
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask an ML question, or upload a dataset to get started..."
              rows={1}
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                resize: 'none', color: '#fff', fontSize: 14, fontFamily: 'inherit',
                lineHeight: 1.55, padding: '3px 0', maxHeight: 130, overflowY: 'auto',
              }}
            />

            <button
              onClick={() => sendMessage()}
              disabled={loading || (!input.trim())}
              style={{
                width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                background: loading || !input.trim() ? 'rgba(79,140,255,0.2)' : '#4f8cff',
                border: 'none', cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.2s',
              }}
            >
              <Send size={14} color="#fff" />
            </button>
          </div>

          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 8, textAlign: 'center' }}>
            Enter to send · Shift+Enter for new line · Drag & drop a file anywhere to upload
          </p>
        </div>

        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { if (e.target.files[0]) handleFile(e.target.files[0]); e.target.value = ''; }} />
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 9999px; }
        textarea::placeholder { color: rgba(255,255,255,0.3); }
        option { background: #111; }
      `}</style>
    </div>
  );
}
