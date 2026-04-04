import { Upload, Brain, BarChart2, Download, ChevronRight } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    number: '01',
    title: 'Upload Your Dataset',
    desc: 'Drag and drop any CSV or Excel file. Axio instantly analyzes your data — shape, types, missing values, and recommends the best target column.',
    tag: 'Data Ingestion',
  },
  {
    icon: Brain,
    number: '02',
    title: 'Train with One Click',
    desc: 'Select your target column and hit train. Our agentic pipeline benchmarks multiple models, applies feature engineering, and picks the winner automatically.',
    tag: 'Auto-ML',
  },
  {
    icon: BarChart2,
    number: '03',
    title: 'Inspect & Chat',
    desc: 'Explore metrics, feature importances, and confusion matrices. Then ask our ML agent anything about your model in plain English.',
    tag: 'Explainability',
  },
  {
    icon: Download,
    number: '04',
    title: 'Export Production Code',
    desc: 'Download a ready-to-deploy Python script, FastAPI endpoint, or the raw model artifact — zero friction from experiment to production.',
    tag: 'Export',
  },
];

export default function WorkflowSection() {
  return (
    <section id="workflow" className="relative" style={{ background: '#000', padding: '120px 0 100px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 40px' }}>

        {/* Header */}
        <div className="flex flex-col items-center text-center" style={{ marginBottom: 72, gap: 16 }}>
          <span className="section-eyebrow">How It Works</span>
          <h2 style={{ fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 500, letterSpacing: '-0.02em', maxWidth: 520, lineHeight: 1.25 }}>
            From raw data to deployed model in minutes
          </h2>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', maxWidth: 480, lineHeight: 1.6 }}>
            No ML expertise required. Axio's agentic pipeline handles the complexity so you can focus on insights.
          </p>
        </div>

        {/* Steps grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="glass-card animate-fade-in-up"
                style={{
                  padding: '32px',
                  animationDelay: `${i * 0.1}s`,
                  animationFillMode: 'both',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'border-color 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)'}
              >
                {/* Step number watermark */}
                <span style={{
                  position: 'absolute',
                  top: 16,
                  right: 20,
                  fontSize: 48,
                  fontWeight: 700,
                  color: 'rgba(255,255,255,0.04)',
                  letterSpacing: '-0.04em',
                  lineHeight: 1,
                }}>
                  {step.number}
                </span>

                <div className="flex flex-col" style={{ gap: 20 }}>
                  <div className="flex items-start" style={{ gap: 16 }}>
                    <div className="feature-icon-wrap">
                      <Icon size={20} color="#4f8cff" strokeWidth={1.5} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: 11,
                        fontWeight: 500,
                        letterSpacing: '0.08em',
                        color: 'rgba(79, 140, 255, 0.8)',
                        marginBottom: 4,
                      }}>
                        {step.tag}
                      </div>
                      <h3 style={{ fontSize: 17, fontWeight: 600, color: '#fff' }}>
                        {step.title}
                      </h3>
                    </div>
                  </div>

                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.60)', lineHeight: 1.65 }}>
                    {step.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
