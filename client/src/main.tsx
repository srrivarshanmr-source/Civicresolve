import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, Building2, ClipboardPen, Globe2, House, Search, ShieldCheck,
  ArrowRight, LayoutDashboard, LogOut, Navigation, Camera,
  ThumbsUp, CheckCircle2, Clock3, Inbox, Sparkles, MapPin, Radio,
  Droplets, Wrench, AlertTriangle, Trash2, Lightbulb, Waves, User, Phone,
  X, ExternalLink, ShieldAlert, FileText, Check
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { initializeLanguage, selectLanguage } from './i18n'
import { AuthProvider, useAuth } from './auth'
import { apiUrl } from './api'
import Tracking from './Tracking'
import Report, { saveReportToLocal, getLocalReports } from './Report'
import type { StoredReport } from './Report'
import Staff from './Staff'
import PublicDashboard from './PublicDashboard'
import CommunityFeed from './CommunityFeed'
import './style.css'

function CitizenModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { t } = useTranslation()
  const { user, signIn, signOut, signing } = useAuth()
  const [reports, setReports] = useState<StoredReport[]>([])
  const navigate = useNavigate()

  useEffect(() => {
    if (isOpen) {
      setReports(getLocalReports())
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="gov-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="gov-modal-card" onClick={e => e.stopPropagation()}>
        <div className="gov-modal-header">
          <div className="gov-modal-title">
            <User size={20} className="modal-icon-blue" />
            <div>
              <h3>{t('citizenAccount')}</h3>
              <p className="modal-subtext">Citizen Grievance Redressal Service</p>
            </div>
          </div>
          <button type="button" className="gov-modal-close" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="gov-modal-body">
          {/* User Sign In / Profile Box */}
          <div className="citizen-auth-box">
            {user ? (
              <div className="citizen-signed-in">
                <div className="citizen-avatar">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt="Profile" />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div className="citizen-details">
                  <strong>{user.displayName || 'Citizen User'}</strong>
                  <span className="citizen-email">{user.email}</span>
                  <span className="citizen-badge">Verified Citizen</span>
                </div>
                <button
                  type="button"
                  className="gov-btn-outline-danger"
                  onClick={() => void signOut()}
                >
                  <LogOut size={14} /> Sign Out
                </button>
              </div>
            ) : (
              <div className="citizen-sign-prompt">
                <div className="prompt-text">
                  <strong>Sign in with your Citizen Account</strong>
                  <p>{t('syncWithGoogle')}</p>
                </div>
                <button
                  type="button"
                  className="gov-btn-primary"
                  onClick={() => void signIn()}
                  disabled={signing}
                >
                  {signing ? t('loading') : t('signIn')}
                </button>
              </div>
            )}
          </div>

          {/* List of Filed Grievances */}
          <div className="citizen-reports-section">
            <div className="citizen-section-header">
              <h4>{t('myGrievances')} ({reports.length})</h4>
              <Link to="/report" onClick={onClose} className="link-action">
                + {t('fileGrievance')}
              </Link>
            </div>

            {reports.length === 0 ? (
              <div className="empty-reports-state">
                <Inbox size={36} className="empty-icon" />
                <p>{t('noMyReports')}</p>
                <Link to="/report" onClick={onClose} className="gov-btn-primary small-btn">
                  {t('fileGrievance')}
                </Link>
              </div>
            ) : (
              <div className="citizen-reports-list">
                {reports.map(r => (
                  <div key={r.reference} className="citizen-report-item">
                    <div className="report-item-main">
                      <div className="report-item-header">
                        <span className={`status-pill pill-${r.status.toLowerCase()}`}>
                          {t(r.status) || r.status}
                        </span>
                        <code className="report-ref-badge">{r.reference}</code>
                      </div>
                      <h5 className="report-item-title">{r.title}</h5>
                      <div className="report-item-meta">
                        <span><MapPin size={12} /> {r.location}</span>
                        <span><Clock3 size={12} /> {new Date(r.createdAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="gov-btn-secondary small-btn"
                      onClick={() => {
                        onClose()
                        navigate(`/track#${new URLSearchParams({ ref: r.reference, token: r.token })}`)
                      }}
                    >
                      Track <ArrowRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="gov-modal-footer">
          <span className="footer-notice">Need help? Dial 1800-425-0000 (Toll-Free 24x7)</span>
          <button type="button" className="gov-btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function Overview({ onOpenCitizen }: { onOpenCitizen: () => void }) {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Quick report state
  const [selectedCat, setSelectedCat] = useState('ROAD_DAMAGE')
  const [quickTitle, setQuickTitle] = useState('')
  const [quickLocation, setQuickLocation] = useState('')
  const [quickDesc, setQuickDesc] = useState('')
  const [quickPhoto, setQuickPhoto] = useState<File | null>(null)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quickSuccess, setQuickSuccess] = useState<StoredReport | null>(null)
  const [quickError, setQuickError] = useState('')

  // Quick tracking state
  const [trackRef, setTrackRef] = useState('')

  function fetchGps() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setQuickLocation(`Lat: ${pos.coords.latitude.toFixed(4)}, Long: ${pos.coords.longitude.toFixed(4)}`)
        setLocating(false)
      },
      () => setLocating(false),
      { timeout: 8000 }
    )
  }

  async function handleQuickSubmit(e: FormEvent) {
    e.preventDefault()
    if (!quickTitle.trim() || !quickLocation.trim() || !quickDesc.trim()) return
    setSubmitting(true)
    setQuickError('')
    try {
      const reference = 'CR-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

      let photoBase64: string | undefined
      if (quickPhoto) {
        photoBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
          reader.readAsDataURL(quickPhoto)
        })
      }

      const res = await fetch(apiUrl('/api/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference,
          token,
          title: quickTitle.trim(),
          location: quickLocation.trim(),
          description: quickDesc.trim(),
          category: selectedCat,
          photo: photoBase64,
          language: i18n.language === 'ta' ? 'ta' : 'en'
        }),
      })

      if (res.status === 422) {
        const body = await res.json().catch(() => ({}))
        if (body.code === 'PHOTO_AI_REJECTED') {
          setQuickError(t('photoAiRejected'))
          return
        }
      }

      if (res.ok) {
        const stored: StoredReport = {
          reference,
          token,
          title: quickTitle.trim(),
          location: quickLocation.trim(),
          category: selectedCat,
          createdAt: new Date().toISOString(),
          status: 'REPORTED',
        }
        saveReportToLocal(stored)
        setQuickSuccess(stored)
      } else {
        setQuickError(t('reportFailed'))
      }
    } catch (err) {
      console.warn('Quick submit failed:', err)
      setQuickError(t('reportFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="gov-page-container">
      {/* Official Government Officer Bar if logged in */}
      {user && (
        <div className="gov-staff-notice-bar">
          <div className="notice-left">
            <ShieldCheck size={18} className="shield-green" />
            <span>Logged in as Official Administrator: <strong>{user.email}</strong></span>
          </div>
          <Link to="/staff" className="gov-staff-portal-link">
            Open Municipal Staff Console <ArrowRight size={14} />
          </Link>
        </div>
      )}

      {/* Official Dignified Hero Section */}
      <section className="gov-portal-hero">
        <div className="gov-hero-inner">
          <div className="gov-hero-badge">
            <Building2 size={15} />
            <span>{t('nationalGrievance')}</span>
          </div>
          <h1 className="gov-hero-heading">
            Public Infrastructure & Civic Grievance Portal
          </h1>
          <p className="gov-hero-desc">
            Direct municipal redressal for road maintenance, clean water supply, streetlights, drainage, and waste management. Submit issues with authentic photo verification and track real-time resolution.
          </p>

          <div className="gov-hero-actions">
            <a href="#file-grievance" className="gov-btn-primary large">
              <ClipboardPen size={18} /> {t('fileGrievance')}
            </a>
            <a href="#track-grievance" className="gov-btn-secondary large">
              <Search size={18} /> {t('trackGrievance')}
            </a>
            <button type="button" onClick={onOpenCitizen} className="gov-btn-light large">
              <User size={18} /> {t('myGrievances')}
            </button>
          </div>
        </div>
      </section>

      {/* Quick Services Row: File Grievance (Left) & Track Grievance (Right) */}
      <div className="gov-grid-2col">
        {/* Left Card: File Grievance */}
        <section id="file-grievance" className="gov-card">
          <div className="gov-card-header">
            <div className="card-header-icon bg-blue">
              <ClipboardPen size={20} />
            </div>
            <div>
              <h2>{t('fileGrievance')}</h2>
              <p className="gov-card-subtitle">Submit details of the civic issue for department action</p>
            </div>
          </div>

          {quickSuccess ? (
            <div className="gov-success-card">
              <CheckCircle2 size={48} className="icon-success" />
              <h3>{t('reportSaved')}!</h3>
              <div className="gov-receipt-chip">
                <span>{t('reference')}:</span>
                <strong>{quickSuccess.reference}</strong>
              </div>
              <p className="success-instruction">
                Your grievance has been registered and dispatched to the department. Automatically saved to <strong>My Grievances</strong> on this device.
              </p>
              <div className="success-btn-group">
                <Link
                  to={`/track#${new URLSearchParams({ ref: quickSuccess.reference, token: quickSuccess.token })}`}
                  className="gov-btn-primary"
                >
                  Track Status Now
                </Link>
                <button
                  type="button"
                  className="gov-btn-secondary"
                  onClick={() => {
                    setQuickSuccess(null)
                    setQuickTitle('')
                    setQuickDesc('')
                    setQuickLocation('')
                    setQuickPhoto(null)
                  }}
                >
                  Submit Another
                </button>
              </div>
            </div>
          ) : (
            <div className="gov-form-wrapper">
              {quickError && (
                <div className="gov-alert-error" role="alert">
                  <AlertTriangle size={18} />
                  <span>{quickError}</span>
                </div>
              )}

              {/* Category Selector Grid */}
              <div className="gov-label-heading">{t('category')}:</div>
              <div className="gov-cat-grid">
                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'ROAD_DAMAGE' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('ROAD_DAMAGE')}
                >
                  <Wrench size={20} />
                  <span>{t('damagedRoad')}</span>
                </button>

                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'WATER_LEAKAGE' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('WATER_LEAKAGE')}
                >
                  <Droplets size={20} />
                  <span>{t('waterLeakage')}</span>
                </button>

                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'STREETLIGHTING' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('STREETLIGHTING')}
                >
                  <Lightbulb size={20} />
                  <span>{t('streetlightIssue')}</span>
                </button>

                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'WASTE' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('WASTE')}
                >
                  <Trash2 size={20} />
                  <span>{t('wasteManagement')}</span>
                </button>

                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'DRAINAGE' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('DRAINAGE')}
                >
                  <Waves size={20} />
                  <span>{t('drainageIssue')}</span>
                </button>

                <button
                  type="button"
                  className={`gov-cat-btn ${selectedCat === 'UNSURE' ? 'active' : ''}`}
                  onClick={() => setSelectedCat('UNSURE')}
                >
                  <AlertTriangle size={20} />
                  <span>{t('otherIssue')}</span>
                </button>
              </div>

              {/* Grievance Submission Inputs */}
              <form onSubmit={handleQuickSubmit} className="gov-form">
                <div className="gov-form-field">
                  <label htmlFor="quick-title">{t('title')} *</label>
                  <input
                    id="quick-title"
                    type="text"
                    required
                    placeholder="Brief title (e.g. Major pothole near market entrance)"
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    className="gov-text-input"
                  />
                </div>

                <div className="gov-form-field">
                  <label htmlFor="quick-location">{t('location')} *</label>
                  <div className="gov-input-group">
                    <input
                      id="quick-location"
                      type="text"
                      required
                      placeholder="Street name, landmark, or ward number"
                      value={quickLocation}
                      onChange={e => setQuickLocation(e.target.value)}
                      className="gov-text-input"
                    />
                    <button
                      type="button"
                      onClick={fetchGps}
                      className="gov-gps-button"
                      title={t('useGps')}
                      disabled={locating}
                    >
                      <Navigation size={16} className={locating ? 'animate-spin' : ''} />
                      <span>{locating ? 'Detecting…' : 'GPS'}</span>
                    </button>
                  </div>
                </div>

                <div className="gov-form-field">
                  <label htmlFor="quick-desc">{t('description')} *</label>
                  <textarea
                    id="quick-desc"
                    rows={3}
                    required
                    placeholder="Provide details about the issue to assist field engineers..."
                    value={quickDesc}
                    onChange={e => setQuickDesc(e.target.value)}
                    className="gov-textarea"
                  />
                </div>

                <div className="gov-form-field">
                  <label className="gov-photo-picker">
                    <div className="photo-picker-inner">
                      <Camera size={20} />
                      <div className="photo-picker-text">
                        <strong>{quickPhoto ? quickPhoto.name : t('uploadEvidence')}</strong>
                        <small>Only authentic camera photos. AI-generated images are strictly detected and rejected.</small>
                      </div>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={e => setQuickPhoto(e.target.files?.[0] ?? null)}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>

                <button
                  type="submit"
                  className="gov-btn-success full-width"
                  disabled={submitting}
                >
                  {submitting ? t('sending') : `${t('submitComplaint')} →`}
                </button>
              </form>
            </div>
          )}
        </section>

        {/* Right Card: Track Grievance Status */}
        <section id="track-grievance" className="gov-card">
          <div className="gov-card-header">
            <div className="card-header-icon bg-green">
              <Search size={20} />
            </div>
            <div>
              <h2>{t('trackGrievance')}</h2>
              <p className="gov-card-subtitle">Check real-time department response and resolution timeline</p>
            </div>
          </div>

          <div className="gov-track-body">
            <div className="gov-track-input-cluster">
              <input
                type="text"
                placeholder="Enter Complaint ID (e.g. CR-F730B229...)"
                value={trackRef}
                onChange={e => setTrackRef(e.target.value)}
                className="gov-text-input"
              />
              <button
                type="button"
                className="gov-btn-primary"
                onClick={() => {
                  if (trackRef.trim()) {
                    navigate(`/track#${new URLSearchParams({ ref: trackRef.trim() })}`)
                  }
                }}
              >
                Track Status
              </button>
            </div>

            {/* Official 4-Stage Redressal Stepper */}
            <div className="gov-timeline-stepper">
              <h3 className="stepper-title">Standard Redressal Timeline</h3>
              <div className="official-steps">
                <div className="step-item step-completed">
                  <div className="step-circle"><Check size={14} /></div>
                  <span className="step-label">1. Registered</span>
                </div>
                <div className="step-line step-active"></div>

                <div className="step-item step-completed">
                  <div className="step-circle"><Clock3 size={14} /></div>
                  <span className="step-label">2. Under Review</span>
                </div>
                <div className="step-line"></div>

                <div className="step-item">
                  <div className="step-circle"><Wrench size={14} /></div>
                  <span className="step-label">3. In Progress</span>
                </div>
                <div className="step-line"></div>

                <div className="step-item">
                  <div className="step-circle"><CheckCircle2 size={14} /></div>
                  <span className="step-label">4. Resolved</span>
                </div>
              </div>
            </div>

            {/* Quick My Reports Box on Home */}
            <div className="gov-saved-reports-box">
              <div className="saved-header">
                <strong>{t('myGrievances')} on This Device</strong>
                <button type="button" onClick={onOpenCitizen} className="link-action">
                  View All ({getLocalReports().length}) →
                </button>
              </div>
              <HomeSavedReportsList />
            </div>
          </div>
        </section>
      </div>

      {/* Section 3: Live Department Status & Field Works */}
      <section className="gov-live-section">
        <div className="section-title-strip">
          <div className="strip-title">
            <Radio size={18} className="live-dot-icon" />
            <h2>{t('liveUpdates')} — Ongoing Works</h2>
          </div>
          <span className="strip-badge">Official Municipal Feeds</span>
        </div>

        <div className="gov-works-grid">
          <div className="gov-work-card">
            <div className="work-card-top">
              <span className="status-pill pill-in_progress">In Progress</span>
              <span className="work-dept">Road Engineering</span>
            </div>
            <h4>Road Surface Milling & Pothole Patching</h4>
            <p>Patching deep road craters on Avinashi Road and Cross-Cut Road sector.</p>
            <div className="work-meta">
              <span><MapPin size={12} /> Ward 12, Central Zone</span>
              <span><Clock3 size={12} /> Updated 25 mins ago</span>
            </div>
          </div>

          <div className="gov-work-card">
            <div className="work-card-top">
              <span className="status-pill pill-resolved">Resolved</span>
              <span className="work-dept">Water Works Dept</span>
            </div>
            <h4>Main Supply Pipe Valve Restoration</h4>
            <p>Underground pipe leakage sealed, municipal water pressure restored to 400 households.</p>
            <div className="work-meta">
              <span><MapPin size={12} /> Ward 24, North Division</span>
              <span><Clock3 size={12} /> Completed today</span>
            </div>
          </div>

          <div className="gov-work-card">
            <div className="work-card-top">
              <span className="status-pill pill-in_progress">In Progress</span>
              <span className="work-dept">Electrical Division</span>
            </div>
            <h4>High-Mast Streetlight Repair</h4>
            <p>Transformer junction repaired, LED luminaire units replaced along Main Bus Route.</p>
            <div className="work-meta">
              <span><MapPin size={12} /> Sector 8 Junction</span>
              <span><Clock3 size={12} /> Field crew active</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Public Community Feed */}
      <section className="gov-community-section">
        <CommunityFeed limit={6} />
      </section>
    </div>
  )
}

function HomeSavedReportsList() {
  const [reports, setReports] = useState<StoredReport[]>([])

  useEffect(() => {
    setReports(getLocalReports().slice(0, 3))
  }, [])

  if (!reports.length) {
    return <p className="no-items-note">No complaints registered from this browser yet.</p>
  }

  return (
    <div className="home-saved-cards">
      {reports.map(r => (
        <Link
          key={r.reference}
          to={`/track#${new URLSearchParams({ ref: r.reference, token: r.token })}`}
          className="saved-mini-card"
        >
          <div className="saved-mini-info">
            <strong>{r.title}</strong>
            <small>{r.reference} • {new Date(r.createdAt).toLocaleDateString()}</small>
          </div>
          <ArrowRight size={14} />
        </Link>
      ))}
    </div>
  )
}

function Shell({ staff = false }: { staff?: boolean }) {
  const { t, i18n } = useTranslation()
  const { user, signOut } = useAuth()
  const [citizenOpen, setCitizenOpen] = useState(false)

  if (staff) {
    return (
      <div className="gov-app-wrapper">
        <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>

        {/* Official Staff Top Strip */}
        <div className="gov-tricolor-bar"></div>
        <header className="gov-official-header">
          <div className="official-header-left">
            <div className="gov-official-seal">
              <ShieldCheck size={24} />
            </div>
            <div className="official-titles">
              <span className="official-dept-title">Government Administrative Console</span>
              <strong className="official-portal-title">CivicResolve Official Command Center</strong>
            </div>
          </div>

          <div className="official-header-right">
            <Link to="/" className="gov-btn-outline-light">
              <Building2 size={16} />
              <span>Citizen Portal</span>
            </Link>

            <div className="gov-lang-group">
              <button
                type="button"
                className={i18n.language === 'ta' ? 'active' : ''}
                onClick={() => void selectLanguage('ta')}
              >
                தமிழ்
              </button>
              <button
                type="button"
                className={i18n.language === 'en' ? 'active' : ''}
                onClick={() => void selectLanguage('en')}
              >
                English
              </button>
            </div>

            {user && (
              <div className="official-user-badge">
                <span className="official-user-email">{user.email}</span>
                <button
                  type="button"
                  className="official-logout-btn"
                  title={t('signOut')}
                  onClick={() => void signOut()}
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="gov-staff-body">
          <Outlet />
        </main>
      </div>
    )
  }

  return (
    <div className="gov-app-wrapper">
      <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>

      {/* 1. Indian Government National / State Tricolor Accent Bar */}
      <div className="gov-tricolor-bar"></div>

      {/* 2. Official Utility & Helpline Header Bar */}
      <div className="gov-utility-bar">
        <div className="utility-inner">
          <div className="utility-left">
            <span className="utility-badge">Official Portal</span>
            <span className="utility-text">{t('nationalGrievance')}</span>
            <span className="utility-divider">|</span>
            <span className="utility-helpline"><Phone size={13} /> {t('helplineText')}</span>
          </div>

          <div className="utility-right">
            <div className="gov-lang-group">
              <Globe2 size={14} className="globe-icon" />
              <button
                type="button"
                className={i18n.language === 'ta' ? 'active' : ''}
                onClick={() => void selectLanguage('ta')}
              >
                தமிழ்
              </button>
              <button
                type="button"
                className={i18n.language === 'en' ? 'active' : ''}
                onClick={() => void selectLanguage('en')}
              >
                English
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Main Government Header with Clean Navigation & Distinct Logins */}
      <header className="gov-main-header">
        <div className="gov-header-inner">
          {/* Brand Seal & Titles */}
          <Link to="/" className="gov-brand-link">
            <div className="gov-national-seal">
              <Building2 size={24} />
            </div>
            <div className="gov-brand-copy">
              <span className="gov-state-name">{t('governmentPortal')}</span>
              <strong className="gov-system-title">CivicResolve</strong>
            </div>
          </Link>

          {/* Primary Navigation Menu */}
          <nav className="gov-nav-menu" aria-label="Main Navigation">
            <NavLink to="/" end className={({ isActive }) => `gov-nav-item ${isActive ? 'active' : ''}`}>
              <House size={16} /> <span>{t('home')}</span>
            </NavLink>
            <NavLink to="/report" className={({ isActive }) => `gov-nav-item ${isActive ? 'active' : ''}`}>
              <ClipboardPen size={16} /> <span>{t('fileGrievance')}</span>
            </NavLink>
            <NavLink to="/track" className={({ isActive }) => `gov-nav-item ${isActive ? 'active' : ''}`}>
              <Search size={16} /> <span>{t('trackGrievance')}</span>
            </NavLink>
            <NavLink to="/community" className={({ isActive }) => `gov-nav-item ${isActive ? 'active' : ''}`}>
              <ThumbsUp size={16} /> <span>{t('communityReports')}</span>
            </NavLink>
            <NavLink to="/public" className={({ isActive }) => `gov-nav-item ${isActive ? 'active' : ''}`}>
              <Activity size={16} /> <span>{t('public')}</span>
            </NavLink>
          </nav>

          {/* Distinct User and Staff Actions */}
          <div className="gov-actions-cluster">
            {/* Distinct Citizen Login / Account Button */}
            <button
              type="button"
              className="gov-citizen-btn"
              onClick={() => setCitizenOpen(true)}
              title="Open Citizen Account & My Reports"
            >
              <User size={16} />
              <span>{user ? user.displayName || 'My Account' : t('citizenLogin')}</span>
              {getLocalReports().length > 0 && (
                <span className="citizen-count-chip">{getLocalReports().length}</span>
              )}
            </button>

            {/* Distinct Official / Department Staff Login */}
            <Link
              to="/staff"
              className="gov-officer-btn"
              title="Official Administrative & Department Console"
            >
              <ShieldCheck size={16} />
              <span>{user ? 'Admin Console' : t('officerLogin')}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Page Content */}
      <main id="main-content" tabIndex={-1} className="gov-main-canvas">
        <Outlet />
      </main>

      {/* Clean Official Footer */}
      <footer className="gov-portal-footer">
        <div className="footer-inner">
          <div className="footer-col">
            <div className="footer-brand">
              <Building2 size={20} />
              <strong>CivicResolve Grievance Redressal</strong>
            </div>
            <p>An official public service system for civic infrastructure monitoring, road maintenance, streetlight repairs, sanitation, and municipal complaint resolution.</p>
          </div>

          <div className="footer-col">
            <h5>Quick Services</h5>
            <ul className="footer-links">
              <li><Link to="/report">{t('fileGrievance')}</Link></li>
              <li><Link to="/track">{t('trackGrievance')}</Link></li>
              <li><Link to="/community">{t('communityReports')}</Link></li>
              <li><Link to="/public">{t('public')}</Link></li>
            </ul>
          </div>

          <div className="footer-col">
            <h5>Grievance Redressal Helpline</h5>
            <p><strong>Toll-Free Helpline:</strong> 1800-425-0000</p>
            <p><strong>Operating Hours:</strong> 24x7 Citizen Assistance</p>
            <p><strong>Official Escalation:</strong> Automated 72-Hour Departmental SLA</p>
          </div>
        </div>
        <div className="footer-bottom">
          <span>Designed & Maintained for Public Civic Redressal • Standards Compliant</span>
          <span>Security & AI Image Verification Enabled</span>
        </div>
      </footer>

      {/* Citizen Account & Grievances Modal */}
      <CitizenModal isOpen={citizenOpen} onClose={() => setCitizenOpen(false)} />
    </div>
  )
}

function App() {
  const [citizenOpen, setCitizenOpen] = useState(false)

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route path="/" element={<Overview onOpenCitizen={() => setCitizenOpen(true)} />} />
        <Route path="/report" element={<Report />} />
        <Route path="/track" element={<Tracking />} />
        <Route path="/community" element={<CommunityFeed />} />
        <Route path="/public" element={<PublicDashboard />} />
        <Route path="*" element={<Overview onOpenCitizen={() => setCitizenOpen(true)} />} />
      </Route>
      <Route element={<Shell staff />}>
        <Route path="/staff" element={<Staff />} />
      </Route>
    </Routes>
  )
}

void initializeLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  )
})
