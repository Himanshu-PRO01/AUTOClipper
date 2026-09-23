import type { ReactNode } from "react";
import { useState } from "react";
import "./Layout.css";

interface Props {
  children: ReactNode;
  projectTitle?: string;
}

export function Layout({ children, projectTitle }: Props) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="layout">
      <header className="layout-header glass">
        <div className="layout-header-inner">
          <a className="layout-wordmark" href="/">
            <span className="wordmark-auto gradient-text">Auto</span>
            <span className="wordmark-clip-hd">Clip</span>
          </a>

          {projectTitle && (
            <div className="layout-breadcrumb">
              <span className="layout-chevron">›</span>
              <span className="layout-project-name">{projectTitle}</span>
            </div>
          )}

          <div className="layout-spacer" />

          {/* Mobile menu button */}
          <button 
            className="mobile-menu-toggle" 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle navigation menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMobileMenuOpen ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </>
              ) : (
                <>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="3" y1="6" x2="21" y2="6"></line>
                  <line x1="3" y1="18" x2="21" y2="18"></line>
                </>
              )}
            </svg>
          </button>

          {/* Navigation links (hidden on mobile unless open) */}
          <nav className={`layout-header-actions ${isMobileMenuOpen ? "open" : ""}`}>
            <a href="/" className="nav-link">Home</a>
            <a href="#features" className="nav-link">Features</a>
            <a href="#pricing" className="nav-link">Pricing</a>
          </nav>
        </div>
      </header>

      <main className="layout-main">
        {children}
      </main>

      <footer className="layout-footer">
        <div className="footer-content">
          <p className="copyright">&copy; {new Date().getFullYear()} AutoClip. All rights reserved.</p>
          <div className="footer-links">
            <a href="/privacy">Privacy Policy</a>
            <a href="/terms">Terms of Service</a>
            <a href="/contact">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
