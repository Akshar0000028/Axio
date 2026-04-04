import { ChevronDown } from 'lucide-react';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260217_030345_246c0224-10a4-422c-b324-070b7c0eceda.mp4';

const NAV_LINKS = ['Get Started', 'Developers', 'Features', 'Resources'];

function PillButton({ children, variant = 'dark', onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`btn-pill-outline ${variant === 'light' ? 'btn-light' : 'btn-dark'} ${className}`}
    >
      <span className="btn-pill-inner">{children}</span>
    </button>
  );
}

export default function HeroSection({ onEnterApp }) {
  return (
    <section
      id="hero"
      className="relative w-full min-h-screen overflow-hidden"
      style={{ background: '#000' }}
    >
      {/* ── Background Video ───────────────────────────── */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 0 }}
      >
        <source src={VIDEO_URL} type="video/mp4" />
      </video>

      {/* ── 50% Black Overlay ─────────────────────────── */}
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.50)', zIndex: 1 }}
      />

      {/* ── Content Layer ─────────────────────────────── */}
      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 2 }}>

        {/* ── Navbar ──────────────────────────────────── */}
        <nav
          className="flex items-center justify-between w-full"
          style={{ padding: '20px 120px' }}
          aria-label="Main navigation"
        >
          {/* Left: Logo + Nav Links */}
          <div className="flex items-center" style={{ gap: '30px' }}>
            {/* Logo wordmark */}
            <a href="#hero" aria-label="Axio home">
              <div
                className="flex items-center justify-center"
                style={{ width: 187, height: 25 }}
              >
                <span
                  style={{
                    fontFamily: "'General Sans', sans-serif",
                    fontWeight: 700,
                    fontSize: 22,
                    letterSpacing: '-0.02em',
                    color: '#fff',
                  }}
                >
                  AXIO
                </span>
                <span
                  style={{
                    fontFamily: "'General Sans', sans-serif",
                    fontWeight: 400,
                    fontSize: 12,
                    color: 'rgba(255,255,255,0.5)',
                    marginLeft: 6,
                    letterSpacing: '0.08em',
                  }}
                >
                  ML PLATFORM
                </span>
              </div>
            </a>

            {/* Nav links – hidden on mobile */}
            <div className="hidden md:flex items-center" style={{ gap: '30px' }}>
              {NAV_LINKS.map((link) => (
                <a
                  key={link}
                  href={link === 'Features' ? '#features' : link === 'Get Started' ? '#workflow' : '#hero'}
                  className="flex items-center text-white no-underline transition-opacity hover:opacity-70"
                  style={{ fontSize: 14, fontWeight: 500, gap: 4 }}
                >
                  {link}
                  <ChevronDown size={14} strokeWidth={2} />
                </a>
              ))}
            </div>
          </div>

          {/* Right: Join Waitlist / Enter App */}
          <PillButton variant="dark" onClick={onEnterApp}>
            Launch App
          </PillButton>
        </nav>

        {/* ── Hero Content ─────────────────────────────── */}
        <div
          className="flex flex-col items-center text-center"
          style={{
            paddingTop: 'clamp(200px, 18vw, 280px)',
            paddingBottom: 102,
            paddingLeft: 24,
            paddingRight: 24,
            gap: 40,
          }}
        >
          {/* Badge */}
          <div
            className="animate-fade-in-up flex items-center"
            style={{
              borderRadius: 20,
              background: 'rgba(255,255,255,0.10)',
              border: '1px solid rgba(255,255,255,0.20)',
              padding: '6px 14px',
              gap: 8,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: '#fff',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ color: 'rgba(255,255,255,0.60)' }}>
              Early access available from
            </span>
            <span style={{ color: '#fff' }}>&nbsp;May 1, 2026</span>
          </div>

          {/* Heading */}
          <h1
            className="animate-fade-in-up delay-100 text-gradient-hero"
            style={{
              maxWidth: 613,
              fontSize: 'clamp(36px, 5vw, 56px)',
              fontWeight: 500,
              lineHeight: 1.28,
              letterSpacing: '-0.02em',
            }}
          >
            ML at the Speed of Experience
          </h1>

          {/* Subtitle */}
          <p
            className="animate-fade-in-up delay-200"
            style={{
              maxWidth: 680,
              fontSize: 15,
              fontWeight: 400,
              color: 'rgba(255,255,255,0.70)',
              lineHeight: 1.6,
              marginTop: -16,
            }}
          >
            Powering seamless ML workflows and real-time model insights, Axio is the
            base for teams who move with purpose — leveraging agentic AI, resilience,
            and scale to shape the future of data science.
          </p>

          {/* CTA */}
          <div className="animate-fade-in-up delay-300 flex items-center gap-4 flex-wrap justify-center">
            <PillButton variant="light" onClick={onEnterApp}>
              Launch App →
            </PillButton>
            <a
              href="#features"
              className="text-white no-underline transition-opacity hover:opacity-70"
              style={{ fontSize: 14, fontWeight: 500 }}
            >
              See how it works
            </a>
          </div>
        </div>
      </div>

      {/* ── Bottom fade ───────────────────────────────── */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          height: 200,
          background: 'linear-gradient(to bottom, transparent, #000)',
          zIndex: 3,
        }}
      />
    </section>
  );
}
