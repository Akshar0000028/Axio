import { useState } from 'react';
import HeroSection from './HeroSection';
import WorkflowSection from './WorkflowSection';
import FeaturesSection from './FeaturesSection';
import StatsSection from './StatsSection';
import CTASection from './CTASection';
import AxioChat from './AxioChat';

function Footer() {
  return (
    <footer style={{
      borderTop: '1px solid rgba(255,255,255,0.08)',
      padding: '32px 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: 16,
    }}>
      <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em' }}>AXIO</span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
        © 2026 Axio ML Platform. All rights reserved.
      </span>
      <div className="flex items-center" style={{ gap: 24 }}>
        {['Privacy', 'Terms', 'Docs'].map(link => (
          <a key={link} href="#" style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
          >
            {link}
          </a>
        ))}
      </div>
    </footer>
  );
}

export default function App() {
  const [showApp, setShowApp] = useState(false);

  if (showApp) {
    return <AxioChat onBack={() => setShowApp(false)} />;
  }

  return (
    <div style={{ fontFamily: "'General Sans', system-ui, sans-serif" }}>
      <HeroSection onEnterApp={() => setShowApp(true)} />
      <WorkflowSection />
      <StatsSection />
      <FeaturesSection />
      <CTASection onEnterApp={() => setShowApp(true)} />
      <Footer />
    </div>
  );
}
