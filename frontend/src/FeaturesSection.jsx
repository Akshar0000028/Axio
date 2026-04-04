import { Zap, Shield, Cpu, GitBranch, LineChart, Code2 } from 'lucide-react';

const FEATURES = [
  {
    icon: Zap,
    title: 'Instant Dataset Analysis',
    desc: 'Upload any CSV/Excel and get instant profiling — column types, missing values, class imbalance, and smart target recommendations.',
  },
  {
    icon: Cpu,
    title: 'Agentic AutoML',
    desc: 'Our AI agent benchmarks Random Forest, XGBoost, LightGBM, and more. It selects the best model automatically with full transparency.',
  },
  {
    icon: LineChart,
    title: 'Deep Explainability',
    desc: 'Feature importances, confusion matrices, ROC curves, and SHAP-style insights — all without writing a line of code.',
  },
  {
    icon: GitBranch,
    title: 'Cross-Validation',
    desc: 'Professional-grade cross-validation with configurable folds. Prevent overfitting and get reliable generalization estimates.',
  },
  {
    icon: Code2,
    title: 'Production Export',
    desc: 'Export a deployable Python script, FastAPI endpoint, or raw .joblib model — ready for your infrastructure.',
  },
  {
    icon: Shield,
    title: 'Session Management',
    desc: 'Each session is isolated and secure. Work on multiple datasets simultaneously with automatic cleanup.',
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" style={{ background: '#000', padding: '100px 0 120px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px' }}>

        {/* Header */}
        <div className="flex flex-col items-center text-center" style={{ marginBottom: 64, gap: 16 }}>
          <span className="section-eyebrow">Platform Features</span>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em', maxWidth: 540, lineHeight: 1.25 }}>
            Everything you need to ship ML, nothing you don't
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', maxWidth: 500, lineHeight: 1.6 }}>
            Axio gives you an end-to-end ML workflow in one clean interface — purpose-built for speed and reliability.
          </p>
        </div>

        {/* Divider */}
        <div className="divider" style={{ marginBottom: 64 }} />

        {/* Features grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px"
          style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="animate-fade-in-up"
                style={{
                  background: '#000',
                  padding: '36px 32px',
                  animationDelay: `${i * 0.08}s`,
                  animationFillMode: 'both',
                  transition: 'background 0.2s',
                  cursor: 'default',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = '#000'}
              >
                <div className="feature-icon-wrap" style={{ marginBottom: 20 }}>
                  <Icon size={20} color="#4f8cff" strokeWidth={1.5} />
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.65 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
