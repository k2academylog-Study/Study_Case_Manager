import Link from "next/link";
import { ArrowRight, CheckCircle2, GraduationCap, ShieldCheck, UsersRound } from "lucide-react";

export function PortalHome({ passwordUpdated = false }: { passwordUpdated?: boolean }) {
  return (
    <div className="portal-wrapper">
      {/* Background Decorative Mesh & Colorful Orbs */}
      <div className="portal-bg-mesh" aria-hidden="true">
        <div className="portal-orb portal-orb-1" />
        <div className="portal-orb portal-orb-2" />
        <div className="portal-orb portal-orb-3" />
        <div className="portal-grid-pattern" />
      </div>

      {/* Top Navbar */}
      <header className="portal-navbar">
        <div className="portal-nav-brand">
          <span className="portal-logo-box">
            <GraduationCap size={24} className="text-white" />
          </span>
          <div className="portal-brand-text">
            <strong>Study Case Manager</strong>
            <small>Academic Management Workspace</small>
          </div>
        </div>
        <div className="portal-nav-badge">
          <span className="portal-pulse-dot" />
          <span>Admin &amp; staff login</span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="portal-main">
        <div className="portal-box">
          {passwordUpdated && (
            <div className="portal-alert-success">
              <CheckCircle2 size={18} />
              <span>Password updated successfully. Choose your portal below to sign in.</span>
            </div>
          )}

          {/* Center Welcome Header */}
          <div className="portal-welcome-header">
            <div className="portal-center-icon">
              <GraduationCap size={38} strokeWidth={2} />
            </div>
            <h1 className="portal-main-heading">Welcome Back</h1>
            <p className="portal-main-subheading">
              Choose your institutional portal to sign in and continue
            </p>
          </div>

          {/* The Two Portals Grid */}
          <div className="portal-cards-grid">
            
            {/* Card 1: Admin Portal (Deep Navy & Royal Purple Theme) */}
            <div className="portal-card-item portal-card-admin">
              <div className="portal-card-topbar portal-topbar-admin" />
              <div className="portal-card-inner">
                <div className="portal-card-badge-row">
                  <span className="portal-role-pill portal-pill-admin">Administrator</span>
                </div>
                
                <div className="portal-card-icon-wrap portal-icon-wrap-admin">
                  <ShieldCheck size={32} strokeWidth={2.3} />
                </div>

                <h2 className="portal-card-title">Admin Login</h2>
                <p className="portal-card-desc">
                  Manage students, staff, classes, subjects, and system settings
                </p>

                <Link href="/admin/login" className="portal-action-btn portal-btn-admin-solid">
                  <span>Login as Admin</span>
                  <ArrowRight size={17} />
                </Link>
              </div>
            </div>

            {/* Card 2: Staff Portal (Royal Purple & Violet Theme) */}
            <div className="portal-card-item portal-card-staff">
              <div className="portal-card-topbar portal-topbar-staff" />
              <div className="portal-card-inner">
                <div className="portal-card-badge-row">
                  <span className="portal-role-pill portal-pill-staff">Teaching Staff</span>
                </div>

                <div className="portal-card-icon-wrap portal-icon-wrap-staff">
                  <UsersRound size={32} strokeWidth={2.3} />
                </div>

                <h2 className="portal-card-title">Staff Login</h2>
                <p className="portal-card-desc">
                  Record attendance, topics, assessments and student scores
                </p>

                <Link href="/staff/login" className="portal-action-btn portal-btn-staff-solid">
                  <span>Login as Staff</span>
                  <ArrowRight size={17} />
                </Link>
              </div>
            </div>

          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="portal-bottom-bar">
        <span>Study Case Manager &bull; Academic Workspace &bull; All Rights Reserved</span>
      </footer>
    </div>
  );
}
