import { useEffect, useState } from 'react';
import HeroSection from './HeroSection';
import WorkflowSection from './WorkflowSection';
import FeaturesSection from './FeaturesSection';
import StatsSection from './StatsSection';
import CTASection from './CTASection';
import AxioChat from './AxioChat';
import ProjectDashboard from './ProjectDashboard';
import ProjectWorkspace from './ProjectWorkspace';
import AuthScreen from './AuthScreen';
import { clearAccessToken, getAccessToken } from './api';
import LandingDetail from './LandingDetail';

function Footer({ onNavigate }) {
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
          <button key={link} onClick={() => onNavigate(link.toLowerCase())} style={{ background: 'none', border: 0, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.45)'}
          >
            {link}
          </button>
        ))}
      </div>
    </footer>
  );
}

export default function App() {
  const [showApp, setShowApp] = useState(false);
  const [activeProject, setActiveProject] = useState(null);
  const [user, setUser] = useState(null);
  const [landingPage, setLandingPage] = useState('home');

  useEffect(() => {
    const syncPage = () => setLandingPage(window.location.hash.replace('#', '') || 'home');
    window.addEventListener('popstate', syncPage);
    window.addEventListener('hashchange', syncPage);
    syncPage();
    return () => { window.removeEventListener('popstate', syncPage); window.removeEventListener('hashchange', syncPage); };
  }, []);

  useEffect(() => {
    const expire = () => { clearAccessToken(); setUser(null); setActiveProject(null); };
    window.addEventListener('axio-auth-expired', expire);
    return () => window.removeEventListener('axio-auth-expired', expire);
  }, []);

  const navigate = page => {
    if (page === 'workspace') { setShowApp(true); return; }
    setLandingPage(page);
    window.history.pushState({ page }, '', page === 'home' ? '#' : `#${page}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (showApp) {
    if (!getAccessToken() && !user) return <AuthScreen onAuthenticated={setUser} onBack={() => setShowApp(false)} />;
    if (activeProject) return <ProjectWorkspace project={activeProject} onBack={() => setActiveProject(null)} />;
    return <ProjectDashboard onBack={() => setShowApp(false)} onOpenProject={setActiveProject} />;
  }

  if (landingPage !== 'home') return <LandingDetail page={landingPage} onBack={() => navigate('home')} onNavigate={navigate} />;

  return (
    <div style={{ fontFamily: "'General Sans', system-ui, sans-serif" }}>
      <HeroSection onEnterApp={() => navigate('workspace')} onNavigate={navigate} />
      <WorkflowSection onNavigate={navigate} />
      <StatsSection />
      <FeaturesSection onNavigate={navigate} />
      <CTASection onEnterApp={() => navigate('workspace')} />
      <Footer onNavigate={navigate} />
    </div>
  );
}
