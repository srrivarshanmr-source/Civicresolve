import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import {
  Activity, Building2, ClipboardPen, Globe2, House, Search, ShieldCheck,
  ArrowRight, LayoutDashboard, LogOut, Navigation, Camera,
  ThumbsUp, CheckCircle2, Clock3, Inbox, Sparkles, MapPin, Radio,
  Droplets, Wrench, AlertTriangle, Trash2, Lightbulb, Waves, ArrowUpRight
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

const pages = [
  { path: '/', label: 'home', Icon: House },
  { path: '/report', label: 'report', info: 'reportInfo', Icon: ClipboardPen },
  { path: '/track', label: 'track', info: 'trackInfo', Icon: Search },
  { path: '/community', label: 'communityReports', info: 'publicInfo', Icon: ThumbsUp },
  { path: '/public', label: 'public', info: 'publicInfo', Icon: Activity },
]

function Overview() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()

  // Quick report state on Home Page
  const [selectedCat, setSelectedCat] = useState('ROAD_DAMAGE')
  const [quickTitle, setQuickTitle] = useState('')
  const [quickLocation, setQuickLocation] = useState('')
  const [quickDesc, setQuickDesc] = useState('')
  const [quickPhoto, setQuickPhoto] = useState<File | null>(null)
  const [locating, setLocating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [quickSuccess, setQuickSuccess] = useState<StoredReport | null>(null)

  // Quick tracking state on Home Page
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
      }
    } catch (err) {
      console.warn('Quick submit failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="gov-home-container">
      {/* Admin Status Banner if logged in */}
      {user && (
        <div className="admin-status-banner">
          <div className="admin-banner-content">
            <ShieldCheck size={18} className="admin-banner-icon" />
            <span>Signed in as <strong>{user.email}</strong> (Municipal Administrator)</span>
          </div>
          <Link to="/staff" className="admin-banner-btn">
            Open Admin Command Center <ArrowRight size={15} />
          </Link>
        </div>
      )}

      {/* Hero Banner with Kerala Infrastructure Styling */}
      <section className="gov-hero-section">
        <div className="gov-hero-content">
          <span className="gov-badge-pill">
            <Building2 size={15} /> {t('governmentPortal')}
          </span>
          <h1>Report Civic Issues<br /><span className="gradient-text">Build a Better Community</span></h1>
          <p>
            Report problems like damaged roads, water leakage, streetlight issues, drainage, and waste management. Track live updates and upvote community repairs.
          </p>

          <div className="hero-action-buttons">
            <a href="#report-section" className="button primary orange-btn">
              <ClipboardPen size={18} /> {t('report')} <ArrowRight size={16} />
            </a>
            <a href="#track-section" className="button secondary dark-ghost-btn">
              <Search size={18} /> {t('track')}
            </a>
          </div>
        </div>
      </section>

      {/* Dual Interactive Modules: Left (Report a Problem) & Right (Track Your Complaint) */}
      <div className="gov-modules-row">
        {/* Module 1: Report a Problem */}
        <div id="report-section" className="gov-module-card">
          <div className="module-title-bar">
            <ClipboardPen size={22} className="module-accent-icon" />
            <h2>Report a Problem</h2>
          </div>

          {quickSuccess ? (
            <div className="quick-success-box">
              <CheckCircle2 size={42} className="success-green-icon" />
              <h3>{t('reportSaved')}!</h3>
              <p>Reference ID: <strong>{quickSuccess.reference}</strong></p>
              <p className="success-subtext">Saved to <strong>My Reports</strong> on this device. You can track progress anytime.</p>
              <div className="quick-success-actions">
                <Link
                  to={`/track#${new URLSearchParams({ ref: quickSuccess.reference, token: quickSuccess.token })}`}
                  className="button primary"
                >
                  Track Live Status
                </Link>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    setQuickSuccess(null)
                    setQuickTitle('')
                    setQuickDesc('')
                    setQuickLocation('')
                    setQuickPhoto(null)
                  }}
                >
                  Report Another Issue
                </button>
              </div>
            </div>
          ) : (
            <div className="report-module-body">
              {/* Category Grid as in Reference Image */}
              <div className="category-tiles-grid">
                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'ROAD_DAMAGE' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('ROAD_DAMAGE')}
                >
                  <Wrench size={24} />
                  <span>{t('damagedRoad')}</span>
                </button>

                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'WATER_LEAKAGE' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('WATER_LEAKAGE')}
                >
                  <Droplets size={24} />
                  <span>{t('waterLeakage')}</span>
                </button>

                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'STREETLIGHTING' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('STREETLIGHTING')}
                >
                  <Lightbulb size={24} />
                  <span>{t('streetlightIssue')}</span>
                </button>

                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'DRAINAGE' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('WASTE')}
                >
                  <Waves size={24} />
                  <span>{t('drainageIssue')}</span>
                </button>

                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'WASTE' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('WASTE')}
                >
                  <Trash2 size={24} />
                  <span>{t('wasteManagement')}</span>
                </button>

                <button
                  type="button"
                  className={`cat-tile ${selectedCat === 'UNSURE' ? 'selected' : ''}`}
                  onClick={() => setSelectedCat('UNSURE')}
                >
                  <AlertTriangle size={24} />
                  <span>{t('otherIssue')}</span>
                </button>
              </div>

              {/* Embedded Complaint Submission Form */}
              <form onSubmit={handleQuickSubmit} className="quick-submit-form">
                <div className="form-row">
                  <input
                    type="text"
                    required
                    placeholder="Problem Title (e.g. Deep pothole on main road)"
                    value={quickTitle}
                    onChange={e => setQuickTitle(e.target.value)}
                    className="gov-input"
                  />
                </div>

                <div className="form-row loc-row">
                  <input
                    type="text"
                    required
                    placeholder="Enter Location / Landmark"
                    value={quickLocation}
                    onChange={e => setQuickLocation(e.target.value)}
                    className="gov-input"
                  />
                  <button
                    type="button"
                    onClick={fetchGps}
                    className="gps-target-btn"
                    title={t('useGps')}
                    disabled={locating}
                  >
                    <Navigation size={17} className={locating ? 'animate-spin' : ''} />
                  </button>
                </div>

                <div className="form-row">
                  <textarea
                    rows={2}
                    required
                    placeholder="Describe the complaint in detail..."
                    value={quickDesc}
                    onChange={e => setQuickDesc(e.target.value)}
                    className="gov-input"
                  />
                </div>

                <div className="form-row photo-upload-box">
                  <label className="photo-label">
                    <Camera size={18} />
                    <span>{quickPhoto ? quickPhoto.name : t('uploadEvidence')}</span>
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
                  className="button primary orange-btn full-width"
                  disabled={submitting}
                >
                  {submitting ? t('sending') : `${t('submitComplaint')} →`}
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Module 2: Track Your Complaint */}
        <div id="track-section" className="gov-module-card">
          <div className="module-title-bar">
            <Search size={22} className="module-accent-icon" />
            <h2>Track Your Complaint</h2>
          </div>

          <div className="track-module-body">
            <div className="track-input-group">
              <input
                type="text"
                placeholder="Enter Complaint ID (e.g. CR-F730B229...)"
                value={trackRef}
                onChange={e => setTrackRef(e.target.value)}
                className="gov-input"
              />
              <button
                type="button"
                className="button primary orange-btn"
                onClick={() => {
                  if (trackRef.trim()) {
                    navigate(`/track#${new URLSearchParams({ ref: trackRef.trim() })}`)
                  }
                }}
              >
                Track
              </button>
            </div>

            {/* Visual Stepper as in Reference Image */}
            <div className="stepper-container">
              <h3>Complaint Status</h3>
              <div className="gov-stepper">
                <div className="gov-step completed">
                  <div className="gov-step-icon"><CheckCircle2 size={16} /></div>
                  <span className="step-name">Registered</span>
                </div>
                <div className="gov-step-connector completed"></div>

                <div className="gov-step completed">
                  <div className="gov-step-icon"><Clock3 size={16} /></div>
                  <span className="step-name">Under Review</span>
                </div>
                <div className="gov-step-connector"></div>

                <div className="gov-step">
                  <div className="gov-step-icon"><Wrench size={16} /></div>
                  <span className="step-name">In Progress</span>
                </div>
                <div className="gov-step-connector"></div>

                <div className="gov-step">
                  <div className="gov-step-icon"><CheckCircle2 size={16} /></div>
                  <span className="step-name">Resolved</span>
                </div>
              </div>
            </div>

            {/* My Reports Quick Links */}
            <div className="home-my-reports-box">
              <div className="my-reports-title">
                <strong>{t('myReports')}</strong>
                <Link to="/track" className="view-all-link">Manage All →</Link>
              </div>
              <SavedReportsQuickList />
            </div>
          </div>
        </div>
      </div>

      {/* Live Updates Banner (Section 3 as in Reference Image) */}
      <section className="live-updates-section">
        <div className="live-updates-heading">
          <Radio size={20} className="pulse-red-icon" />
          <h2>{t('liveUpdates')}</h2>
        </div>

        <div className="live-updates-cards">
          <div className="live-update-card">
            <div className="live-card-badge status-in_progress">In Progress</div>
            <h3>Road Repair Work in Progress</h3>
            <p>Pothole repair on MG Road / Avinashi Road is underway by the municipal road engineering team.</p>
            <div className="live-card-meta">
              <span><MapPin size={13} /> Coimbatore Central</span>
              <span><Clock3 size={13} /> Updated 20 mins ago</span>
            </div>
          </div>

          <div className="live-update-card">
            <div className="live-card-badge status-resolved">Resolved</div>
            <h3>Water Main Pipe Replacement</h3>
            <p>Main water pipeline leak at Sector 14 successfully sealed and pressure restored.</p>
            <div className="live-card-meta">
              <span><MapPin size={13} /> Ward 7 North</span>
              <span><Clock3 size={13} /> Completed today</span>
            </div>
          </div>
        </div>
      </section>

      {/* Recent Complaints & Community Voting Feed (Section 4) */}
      <section className="community-voting-section">
        <CommunityFeed limit={6} />
      </section>
    </div>
  )
}

function SavedReportsQuickList() {
  const [reports, setReports] = useState<StoredReport[]>([])

  useEffect(() => {
    setReports(getLocalReports().slice(0, 3))
  }, [])

  if (!reports.length) {
    return <p className="no-reports-text">No reports submitted from this device yet.</p>
  }

  return (
    <div className="home-saved-list">
      {reports.map(r => (
        <Link
          key={r.reference}
          to={`/track#${new URLSearchParams({ ref: r.reference, token: r.token })}`}
          className="home-saved-item"
        >
          <div>
            <strong>{r.title}</strong>
            <small>{r.reference}</small>
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

  if (staff) {
    return (
      <div className="staff-shell">
        <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>
        <header className="staff-header">
          <div className="staff-header-left">
            <Link to="/staff" className="brand">
              <span className="brand-icon"><ShieldCheck size={22}/></span>
              <span className="brand-text">CivicResolve</span>
            </Link>
            <span className="staff-portal-badge">{t('adminConsole')}</span>
          </div>

          <div className="staff-header-right">
            <Link to="/" className="switch-view-btn" title="View Citizen Portal">
              <Building2 size={16} />
              <span>{t('citizenView')}</span>
            </Link>

            <div className="languages" role="group" aria-label={t('language')}>
              <Globe2 size={16} aria-hidden="true"/>
              <button type="button" lang="ta" aria-pressed={i18n.language === 'ta'} onClick={() => void selectLanguage('ta')}>தமிழ்</button>
              <button type="button" lang="en" aria-pressed={i18n.language === 'en'} onClick={() => void selectLanguage('en')}>English</button>
            </div>

            {user && (
              <div className="admin-user-pill">
                <span className="user-email-text" title={user.email ?? ''}>{user.email}</span>
                <button
                  type="button"
                  className="admin-logout-btn"
                  title={t('signOut')}
                  onClick={() => void signOut()}
                >
                  <LogOut size={15} />
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="staff-layout">
          <main id="main-content" tabIndex={-1} className="staff-main-content">
            <Outlet/>
          </main>
        </div>
      </div>
    )
  }

  return (
    <div className="gov-citizen-shell">
      <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>

      {/* Top Government Navigation Header matching Reference Image */}
      <header className="gov-header">
        <div className="gov-brand-cluster">
          <Link to="/" className="gov-brand">
            <div className="gov-emblem-wrapper">
              <Building2 size={24} />
            </div>
            <div className="gov-brand-titles">
              <span className="gov-sub">{t('governmentPortal')}</span>
              <strong className="gov-title">CivicResolve</strong>
            </div>
          </Link>
        </div>

        <nav className="gov-top-nav" aria-label={t('navigation')}>
          <NavLink to="/" end><House size={16} /> {t('home')}</NavLink>
          <NavLink to="/track"><Search size={16} /> {t('track')}</NavLink>
          <NavLink to="/community"><ThumbsUp size={16} /> {t('communityReports')}</NavLink>
          <NavLink to="/public"><Activity size={16} /> {t('public')}</NavLink>
        </nav>

        <div className="gov-header-actions">
          <div className="languages" role="group" aria-label={t('language')}>
            <Globe2 size={15} aria-hidden="true"/>
            <button type="button" lang="ta" aria-pressed={i18n.language === 'ta'} onClick={() => void selectLanguage('ta')}>தமிழ்</button>
            <button type="button" lang="en" aria-pressed={i18n.language === 'en'} onClick={() => void selectLanguage('en')}>English</button>
          </div>

          <Link to="/staff" className="gov-login-btn">
            <ShieldCheck size={16} />
            <span>{user ? t('adminConsole') : 'Staff Login'}</span>
          </Link>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <Outlet/>
      </main>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route element={<Shell/>}>
        <Route path="/" element={<Overview/>}/>
        <Route path="/report" element={<Report/>}/>
        <Route path="/track" element={<Tracking/>}/>
        <Route path="/community" element={<CommunityFeed/>}/>
        <Route path="/public" element={<PublicDashboard/>}/>
        <Route path="*" element={<Overview/>}/>
      </Route>
      <Route element={<Shell staff/>}>
        <Route path="/staff" element={<Staff/>}/>
      </Route>
    </Routes>
  )
}

void initializeLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(
    <BrowserRouter>
      <AuthProvider>
        <App/>
      </AuthProvider>
    </BrowserRouter>
  )
})
