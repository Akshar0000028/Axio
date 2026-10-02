import { useState, useRef, useCallback } from 'react';
import { Upload, AlertCircle, CheckCircle, FileText, X, Loader } from 'lucide-react';
import { uploadDataset } from './api';

export default function DataUploader({ onUploadSuccess, projectId = '', inputId = 'dataset-input', compact = false }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      setError('Only CSV and Excel files are supported.');
      return;
    }
    setError(null);
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadDataset(file, setProgress, projectId);
      onUploadSuccess(result);
    } catch (err) {
      setError(err.message ?? 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [onUploadSuccess, projectId]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  }, [handleFile]);

  const onInputChange = (e) => handleFile(e.target.files[0]);

  if (compact) {
    return (
      <div className="compact-uploader">
        <input ref={inputRef} id={inputId} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onInputChange} aria-hidden="true" />
        <button type="button" className="conversation-change-dataset" onClick={() => !uploading && inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? `Uploading ${progress}%` : 'Change dataset'}
        </button>
        {error && <span className="compact-uploader-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ gap: 16 }}>
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload dataset file"
        onClick={() => !uploading && inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && !uploading && inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className="glass-card flex flex-col items-center justify-center text-center"
        style={{
          padding: '48px 24px',
          cursor: uploading ? 'not-allowed' : 'pointer',
          borderColor: dragOver ? 'rgba(79,140,255,0.5)' : undefined,
          background: dragOver ? 'rgba(79,140,255,0.05)' : undefined,
          transition: 'all 0.2s',
          gap: 16,
        }}
      >
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={onInputChange}
          aria-hidden="true"
        />

        {uploading ? (
          <Loader size={36} color="#4f8cff" className="animate-spin" strokeWidth={1.5} />
        ) : (
          <div style={{
            width: 56, height: 56, borderRadius: 12,
            background: 'rgba(79,140,255,0.10)',
            border: '1px solid rgba(79,140,255,0.20)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Upload size={24} color="#4f8cff" strokeWidth={1.5} />
          </div>
        )}

        <div>
          <p style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
            {uploading ? `Uploading… ${progress}%` : 'Drop your dataset here'}
          </p>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
            {uploading ? 'Analyzing data...' : 'CSV, Excel (.xlsx, .xls) · Max 50 MB'}
          </p>
        </div>

        {/* Progress bar */}
        {uploading && (
          <div style={{
            width: '100%', maxWidth: 280,
            height: 4, borderRadius: 9999,
            background: 'rgba(255,255,255,0.10)',
          }}>
            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div
          className="flex items-center"
          style={{
            gap: 10, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.2)',
          }}
        >
          <AlertCircle size={16} color="#ef4444" />
          <span style={{ fontSize: 13, color: '#ef4444' }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <X size={14} color="rgba(255,255,255,0.4)" />
          </button>
        </div>
      )}
    </div>
  );
}
