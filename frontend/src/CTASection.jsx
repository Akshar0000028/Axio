export default function CTASection({ onEnterApp }) {
  return (
    <section style={{ background: '#000', padding: '80px 0 120px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 40px', textAlign: 'center' }}>
        <div
          style={{
            borderRadius: 24,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.02)',
            padding: 'clamp(48px, 6vw, 80px) clamp(32px, 6vw, 80px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 32,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Ambient glow */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 400,
            background: 'radial-gradient(ellipse, rgba(79,140,255,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          <div className="flex flex-col items-center" style={{ gap: 16, position: 'relative' }}>
            <h2 style={{
              fontSize: 'clamp(28px, 4vw, 48px)',
              fontWeight: 500,
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              maxWidth: 540,
            }}>
              Start training models in under 60 seconds
            </h2>
            <p style={{
              fontSize: 16,
              color: 'rgba(255,255,255,0.55)',
              maxWidth: 440,
              lineHeight: 1.6,
            }}>
              No setup. No infrastructure. Just upload your data and let Axio do the rest.
            </p>
          </div>

          <button
            id="cta-launch-btn"
            onClick={onEnterApp}
            className="btn-pill-outline btn-light"
            style={{ fontSize: 15, position: 'relative' }}
          >
            <span className="btn-pill-inner" style={{ padding: '13px 36px' }}>
              Launch Axio App →
            </span>
          </button>

          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
            Free during early access · No credit card required
          </p>
        </div>
      </div>
    </section>
  );
}
