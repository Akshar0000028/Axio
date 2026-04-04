const STATS = [
  { value: '50+', label: 'ML Models Benchmarked' },
  { value: '<2s', label: 'Average Analysis Time' },
  { value: '99.9%', label: 'Uptime SLA' },
  { value: '∞', label: 'Dataset Columns Supported' },
];

export default function StatsSection() {
  return (
    <section style={{ background: '#000', padding: '0 0 80px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px' }}>
        <div className="divider" style={{ marginBottom: 64 }} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px"
          style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
          {STATS.map((s) => (
            <div
              key={s.label}
              style={{
                background: '#000',
                padding: '32px 28px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
