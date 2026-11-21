import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Outlet, Route, Routes } from 'react-router-dom'
import { Activity, Building2, ClipboardPen, Globe2, House, Search, ShieldCheck, ArrowRight, LayoutDashboard, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { initializeLanguage, selectLanguage } from './i18n'
import { AuthProvider, useAuth } from './auth'
import Tracking from './Tracking'
import Report from './Report'
import Staff from './Staff'
import PublicDashboard from './PublicDashboard'
import './style.css'

const pages = [
  { path: '/', label: 'home', Icon: House },
  { path: '/report', label: 'report', info: 'reportInfo', Icon: ClipboardPen },
  { path: '/track', label: 'track', info: 'trackInfo', Icon: Search },
  { path: '/public', label: 'public', info: 'publicInfo', Icon: Activity },
]

function Overview() {
  const { t } = useTranslation()
  const { user } = useAuth()

  return <>
    {user && (
      <div className="admin-status-banner">
        <div className="admin-banner-content">
          <ShieldCheck size={18} className="admin-banner-icon" />
          <span>Signed in as <strong>{user.email}</strong> (Administrator)</span>
        </div>
        <Link to="/staff" className="admin-banner-btn">
          Open Admin Command Center <ArrowRight size={15} />
        </Link>
      </div>
    )}
    <section className="hero">
      <div>
        <p className="portal">{t('portal')}</p>
        <h1>{t('headline')}</h1>
        <p>{t('intro')}</p>
        <div className="actions">
          <Link className="button primary" to="/report">
            <ClipboardPen size={19}/>{t('report')}
          </Link>
          <Link className="button secondary" to="/track">
            {t('track')}
          </Link>
        </div>
      </div>
      <div className="hero-art" aria-hidden="true">
        <div className="ring"><Building2 size={112} strokeWidth={1.15}/></div>
      </div>
    </section>
    <h2>{t('shortcuts')}</h2>
    <div className="cards">
      {pages.slice(1).map(({ path, label, info, Icon }) =>
        <Link className="card" to={path} key={path}>
          <span className="tile"><Icon size={22}/></span>
          <h3>{t(label)}</h3>
          <p>{t(info!)}</p>
        </Link>
      )}
    </div>
  </>
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
    <div className="public-shell">
      <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>
      <header>
        <Link to="/" className="brand">
          <span className="brand-icon"><Building2 size={23}/></span>
          <span>CivicResolve</span>
        </Link>
        <div className="header-right-tools">
          {user && (
            <Link to="/staff" className="header-admin-pill" title="Go to Admin Dashboard">
              <LayoutDashboard size={15} />
              <span>{t('adminConsole')}</span>
            </Link>
          )}
          <div className="languages" role="group" aria-label={t('language')}>
            <Globe2 size={17} aria-hidden="true"/>
            <button type="button" lang="ta" aria-pressed={i18n.language === 'ta'} onClick={() => void selectLanguage('ta')}>தமிழ்</button>
            <button type="button" lang="en" aria-pressed={i18n.language === 'en'} onClick={() => void selectLanguage('en')}>English</button>
          </div>
        </div>
      </header>

      <div className="layout">
        <nav aria-label={t('navigation')}>
          {pages.map(({ path, label, Icon }) => (
            <NavLink key={path} to={path} end>
              <Icon size={19}/>{t(label)}
            </NavLink>
          ))}
          <Link className="staff-entry" to="/staff">
            <ShieldCheck size={19}/>
            <span>{user ? t('adminConsole') : t('staff')}</span>
            {user && <span className="active-dot" title="Signed in"></span>}
          </Link>
        </nav>
        <main id="main-content" tabIndex={-1}><Outlet/></main>
      </div>
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
