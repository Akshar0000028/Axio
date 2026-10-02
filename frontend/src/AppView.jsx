import { useState } from 'react';
import { ArrowLeft, Database, Table, AlertCircle } from 'lucide-react';
import DataUploader from './DataUploader';
import TrainPanel from './TrainPanel';
import ChatPanel from './ChatPanel';
import PredictPanel from './PredictPanel';

const TABS = [
  { id: 'train',   label: 'Train',   icon: '⚡' },
  { id: 'predict', label: 'Predict', icon: '🎯' },
  { id: 'chat',    label: 'AI Chat', icon: '💬' },
];

const STEPS = [
  { id: 'upload', label: 'Upload data' },
  { id: 'train', label: 'Train model' },
  { id: 'predict', label: 'Make predictions' },
];

function ColumnBadge({ f }) {
  const isCat = f.dtype === 'object' || f.dtype === 'category';
  return (
    <div
      className="flex items-center"
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        gap: 8,
        fontSize: 13,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: 2,
        background: isCat ? '#a78bfa' : '#4f8cff',
        flexShrink: 0,
      }} />
      <span style={{ color: '#fff', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {f.name}
      </span>
      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto', flexShrink: 0 }}>
        {f.dtype}
      </span>
    </div>
  );
}

export default function AppView({ onBack }) {
  const [session, setSession] = useState(null);
  const [tab, setTab]         = useState('train');

  const handleUpload = (result) => {
    setSession(result);
    setTab('train');
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Bar ─────────────────────────────────── */}
      <div
        className="flex items-center"
        style={{
          padding: '16px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          gap: 16,
          flexShrink: 0,
        }}
      >
        <button
          id="back-to-landing-btn"
          onClick={onBack}
          className="flex items-center"
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            gap: 6,
            fontSize: 14,
            fontFamily: 'inherit',
            transition: 'color 0.2s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
        >
          <ArrowLeft size={16} />
          Back
        </button>

        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />

        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>AXIO</span>
        <span style={{
          fontSize: 12, fontWeight: 500,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>ML Platform</span>

        {session && (
          <div
            className="flex items-center"
            style={{
              marginLeft: 'auto',
              gap: 8,
              padding: '6px 12px',
              borderRadius: 8,
              background: 'rgba(52,211,153,0.08)',
              border: '1px solid rgba(52,211,153,0.2)',
            }}
          >
            <Database size={13} color="#34d399" />
            <span style={{ fontSize: 13, color: '#34d399' }}>
              {session.filename}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              {session.row_count?.toLocaleString()} rows · {session.col_count} cols
            </span>
          </div>
        )}
      </div>

      {/* ── Main Area ───────────────────────────────── */}
      <div
        className="app-content flex flex-1"
        style={{ minHeight: 0, overflow: 'hidden' }}
      >
        {/* ── Left sidebar: upload / columns ──────── */}
        <div className="app-sidebar"
          style={{
            width: 300,
            flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <DataUploader onUploadSuccess={handleUpload} />

          {session && (
            <div className="animate-fade-in-up flex flex-col" style={{ gap: 12 }}>
              <div className="flex items-center" style={{ gap: 8 }}>
                <Table size={14} color="rgba(255,255,255,0.5)" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  Columns ({session.col_count})
                </span>
              </div>
              <div className="flex flex-col" style={{ gap: 6 }}>
                {session.features?.slice(0, 20).map(f => (
                  <ColumnBadge key={f.name} f={f} />
                ))}
                {session.features?.length > 20 && (
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', textAlign: 'center', padding: '4px 0' }}>
                    +{session.features.length - 20} more columns
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Right main panel ─────────────────────── */}
        <div className="app-main flex flex-col flex-1"
          style={{ minWidth: 0, overflow: 'hidden' }}
        >
          {!session ? (
            <div className="flex flex-col items-center justify-center flex-1" style={{ gap: 16, padding: 40 }}>
              <div style={{
                width: 64, height: 64, borderRadius: 16,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.10)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Database size={28} color="rgba(255,255,255,0.3)" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Upload a dataset to get started</h2>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>
                  Drop your CSV or Excel file in the panel on the left.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col flex-1" style={{ overflow: 'hidden' }}>
              <div className="workflow-stepper" aria-label="Workflow progress">
                {STEPS.map((step, index) => {
                  const active = step.id === 'upload' || (step.id === 'train' && tab === 'train') || (step.id === 'predict' && tab === 'predict');
                  return (
                    <div key={step.id} className={`workflow-step ${active ? 'is-active' : ''}`}>
                      <span className="workflow-step-number">{index + 1}</span>
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
              {/* Tabs */}
              <div className="flex items-center" style={{
                padding: '0 24px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                gap: 0,
                flexShrink: 0,
              }}>
                {TABS.map(t => (
                  <button
                    key={t.id}
                    id={`tab-${t.id}`}
                    onClick={() => setTab(t.id)}
                    style={{
                      padding: '14px 20px',
                      background: 'none',
                      border: 'none',
                      borderBottom: tab === t.id ? '2px solid #4f8cff' : '2px solid transparent',
                      color: tab === t.id ? '#fff' : 'rgba(255,255,255,0.45)',
                      fontSize: 14,
                      fontWeight: 500,
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      gap: 6,
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.2s',
                    }}
                  >
                    <span>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
                {tab === 'train'   && <TrainPanel session={session} />}
                {tab === 'predict' && <PredictPanel session={session} />}
                {tab === 'chat'    && (
                  <div style={{ height: 'calc(100vh - 200px)', minHeight: 400 }}>
                    <ChatPanel sessionId={session.session_id} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
