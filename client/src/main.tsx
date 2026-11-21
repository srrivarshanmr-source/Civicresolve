import { createRoot } from 'react-dom/client'
import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { Activity, Building2, ClipboardPen, Globe2, House, Search, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { initializeLanguage, selectLanguage } from './i18n'
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
  { path: '/staff', label: 'staff', info: 'staffInfo', Icon: ShieldCheck },
]

function Overview() {
  const { t } = useTranslation()
  return <>
    <section className="hero">
      <div><p className="portal">{t('portal')}</p><h1>{t('headline')}</h1><p>{t('intro')}</p>
        <div className="actions"><Link className="button primary" to="/report"><ClipboardPen size={19}/>{t('report')}</Link><Link className="button secondary" to="/track">{t('track')}</Link></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="ring"><Building2 size={112} strokeWidth={1.15}/></div></div>
    </section>
    <h2>{t('shortcuts')}</h2>
    <div className="cards">{pages.slice(1).map(({ path, label, info, Icon }) =>
      <Link className="card" to={path} key={path}><span className="tile"><Icon size={22}/></span><h3>{t(label)}</h3><p>{t(info!)}</p></Link>
    )}</div>
  </>
}

function App() {
  const { t, i18n } = useTranslation()
  return <>
    <a className="skip-link" href="#main-content">{t('skipNavigation')}</a>
    <header>
      <Link to="/" className="brand"><span className="brand-icon"><Building2 size={23}/></span>CivicResolve</Link>
      <div className="languages" role="group" aria-label={t('language')}><Globe2 size={17} aria-hidden="true"/>
        <button type="button" lang="ta" aria-pressed={i18n.language === 'ta'} onClick={() => void selectLanguage('ta')}>தமிழ்</button>
        <button type="button" lang="en" aria-pressed={i18n.language === 'en'} onClick={() => void selectLanguage('en')}>English</button>
      </div>
    </header>
    <div className="layout">
      <nav aria-label={t('navigation')}>{pages.map(({ path, label, Icon }) => <NavLink key={path} to={path} end><Icon size={19}/>{t(label)}</NavLink>)}</nav>
      <main id="main-content" tabIndex={-1}><Routes>
        <Route path="/" element={<Overview/>}/>
        <Route path="/report" element={<Report/>}/>
        <Route path="/track" element={<Tracking/>}/>
        <Route path="/public" element={<PublicDashboard/>}/>
        <Route path="/staff" element={<Staff/>}/>
        <Route path="*" element={<Overview/>}/>
      </Routes></main>
    </div>
  </>
}
void initializeLanguage().then(() => {
  createRoot(document.getElementById('root')!).render(<BrowserRouter><App/></BrowserRouter>)
})

