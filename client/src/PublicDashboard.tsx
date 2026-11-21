import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiUrl } from './api'

type Metrics = {
  ward: string | null
  total: number | null
  onTimeFirstResponseRate: number | null
  escalations: number | null
  statuses: { reported: number; inProgress: number; resolved: number } | null
}
type DepartmentMetrics = Metrics & { department: string | null }
type Transparency = { minimumCount: number; wards: Metrics[]; departments: DepartmentMetrics[] }
type LoadState = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: Transparency }

const labels = {
  en: {
    attribution: 'The ward view uses the jurisdiction of each issue’s active department assignment. Issues without a jurisdiction appear as unknown.',
    wards: 'By ward', departments: 'By department', ward: 'Ward', department: 'Department',
    unknown: 'Unknown', unassigned: 'Unassigned', total: 'Total issues',
    onTime: 'On-time first response', escalations: 'Escalations',
    responseDefinition: 'The rate covers active assignments with a first response or a deadline that has passed. Escalations count active assignments with a recorded escalation.',
    unavailable: 'Public metrics are temporarily unavailable.', retry: 'Try again',
    empty: 'No groups meet the publication threshold yet.',
    privacy: (count: string) => `Groups with fewer than ${count} issues are omitted. An em dash marks counts withheld for privacy or unavailable.`,
  },
  ta: {
    attribution: 'ஒவ்வொரு பிரச்சினைக்கும் தற்போது ஒதுக்கப்பட்ட துறையின் அதிகாரப் பகுதி வார்டாகக் காட்டப்படுகிறது. அதிகாரப் பகுதி இல்லாத பிரச்சினைகள் தெரியாதவை எனக் காட்டப்படும்.',
    wards: 'வார்டு வாரியாக', departments: 'துறை வாரியாக', ward: 'வார்டு', department: 'துறை',
    unknown: 'தெரியவில்லை', unassigned: 'ஒதுக்கப்படவில்லை', total: 'மொத்தப் பிரச்சினைகள்',
    onTime: 'காலக்கெடுவுக்குள் முதல் பதில்', escalations: 'மேல்நிலைக்கு அனுப்பப்பட்டவை',
    responseDefinition: 'முதல் பதில் கிடைத்த அல்லது பதிலளிக்கும் காலக்கெடு முடிந்த செயலில் உள்ள ஒதுக்கீடுகள் இந்த விகிதத்தில் அடங்கும். மேல்நிலைக்கு அனுப்பப்பட்டதாகப் பதிவான செயலில் உள்ள ஒதுக்கீடுகள் எண்ணப்படுகின்றன.',
    unavailable: 'பொது புள்ளிவிவரங்கள் தற்காலிகமாகக் கிடைக்கவில்லை.', retry: 'மீண்டும் முயலவும்',
    empty: 'வெளியீட்டுக்கான குறைந்தபட்ச எண்ணிக்கையை இதுவரை எந்தக் குழுவும் எட்டவில்லை.',
    privacy: (count: string) => `${count} பிரச்சினைகளுக்குக் குறைவான குழுக்கள் காட்டப்படாது. தனியுரிமைக்காக மறைக்கப்பட்ட அல்லது கிடைக்காத புள்ளிவிவரங்கள் நீளக் கோட்டால் குறிக்கப்படும்.`,
  },
}

export default function PublicDashboard() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage === 'ta' ? 'ta' : 'en'
  const copy = labels[language]
  const number = new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN')
  const percent = new Intl.NumberFormat(language === 'ta' ? 'ta-IN' : 'en-IN', { style: 'percent', maximumFractionDigits: 1 })
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(apiUrl('/api/public/transparency'), { signal: controller.signal, credentials: 'omit' })
        if (!response.ok) throw new Error('Public metrics request failed')
        const data: Transparency = await response.json()
        if (!controller.signal.aborted) setState({ kind: 'ready', data })
      } catch {
        if (!controller.signal.aborted) setState({ kind: 'error' })
      }
    }
    void load()
    return () => controller.abort()
  }, [attempt])

  function renderTable(rows: Array<Metrics | DepartmentMetrics>, byDepartment: boolean) {
    const heading = byDepartment ? copy.departments : copy.wards
    const headingId = byDepartment ? 'public-department-heading' : 'public-ward-heading'

    return <section aria-labelledby={headingId}>
      <h2 id={headingId}>{heading}</h2>
      {rows.length === 0 ? <p className="notice">{copy.empty}</p> :
        <div style={{ overflowX: 'auto' }} role="region" tabIndex={0} aria-labelledby={headingId}>
          <table aria-labelledby={headingId} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'start' }}>
            <thead><tr>
              <th scope="col" style={cellStyle}>{copy.ward}</th>
              {byDepartment && <th scope="col" style={cellStyle}>{copy.department}</th>}
              <th scope="col" style={cellStyle}>{copy.total}</th>
              <th scope="col" style={cellStyle}>{t('REPORTED')}</th>
              <th scope="col" style={cellStyle}>{t('IN_PROGRESS')}</th>
              <th scope="col" style={cellStyle}>{t('RESOLVED')}</th>
              <th scope="col" style={cellStyle}>{copy.onTime}</th>
              <th scope="col" style={cellStyle}>{copy.escalations}</th>
            </tr></thead>
            <tbody>{rows.map(row => {
              const department = 'department' in row ? row.department : null
              return <tr key={JSON.stringify([row.ward, department])}>
                <th scope="row" style={cellStyle}>{row.ward ?? copy.unknown}</th>
                {byDepartment && <td style={cellStyle}>{department ?? copy.unassigned}</td>}
                <td style={cellStyle}>{row.total === null ? '—' : number.format(row.total)}</td>
                <td style={cellStyle}>{row.statuses ? number.format(row.statuses.reported) : '—'}</td>
                <td style={cellStyle}>{row.statuses ? number.format(row.statuses.inProgress) : '—'}</td>
                <td style={cellStyle}>{row.statuses ? number.format(row.statuses.resolved) : '—'}</td>
                <td style={cellStyle}>{row.onTimeFirstResponseRate == null ? '—' : percent.format(row.onTimeFirstResponseRate)}</td>
                <td style={cellStyle}>{row.escalations == null ? '—' : number.format(row.escalations)}</td>
              </tr>
            })}</tbody>
          </table>
        </div>}
    </section>
  }

  return <section className="panel staff-panel">
    <h1>{t('public')}</h1>
    <p>{copy.attribution}</p>
    {state.kind === 'loading' && <p role="status">{t('loading')}</p>}
    {state.kind === 'error' && <>
      <p className="notice" role="alert">{copy.unavailable}</p>
      <button type="button" className="button secondary" onClick={() => {
        setState({ kind: 'loading' })
        setAttempt(attempt + 1)
      }}>{copy.retry}</button>
    </>}
    {state.kind === 'ready' && <>
      <p className="notice">{copy.privacy(number.format(state.data.minimumCount))}</p>
      <p>{copy.responseDefinition}</p>
      {renderTable(state.data.wards, false)}
      {renderTable(state.data.departments, true)}
    </>}
  </section>
}

const cellStyle = { padding: '10px 12px', textAlign: 'start', borderBottom: '1px solid var(--line)' } as const
