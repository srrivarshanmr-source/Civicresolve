import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ThumbsUp, MapPin, Camera, AlertTriangle, ShieldAlert, Sparkles, Filter, CheckCircle2, Clock3, Inbox } from 'lucide-react'
import { apiUrl } from './api'

export type PublicIncident = {
  id: string
  category: string
  status: 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'
  priority: string
  upvotes: number
  createdAt: string
  title: string
  description: string
  location: string
  hasPhoto: boolean
  reportId?: string
  isAiGenerated?: boolean
}

export default function CommunityFeed({ limit = 30 }: { limit?: number }) {
  const { t, i18n } = useTranslation()
  const [incidents, setIncidents] = useState<PublicIncident[]>([])
  const [loading, setLoading] = useState(true)
  const [votedIds, setVotedIds] = useState<Set<string>>(() => {
    try {
      const stored: string[] = JSON.parse(localStorage.getItem('civic_voted_incidents') || '[]')
      return new Set(stored)
    } catch {
      return new Set()
    }
  })
  const [filterCategory, setFilterCategory] = useState('ALL')

  const fetchIncidents = async () => {
    try {
      const res = await fetch(apiUrl('/api/public/incidents'))
      if (res.ok) {
        const data: PublicIncident[] = await res.json()
        setIncidents(data)
      }
    } catch (err) {
      console.warn('Failed to load public incidents:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void fetchIncidents()
  }, [])

  async function upvote(id: string) {
    if (votedIds.has(id)) return
    const nextSet = new Set(votedIds)
    nextSet.add(id)
    setVotedIds(nextSet)
    try {
      localStorage.setItem('civic_voted_incidents', JSON.stringify(Array.from(nextSet)))
      // Optimistic update
      setIncidents(prev => prev.map(inc => {
        if (inc.id === id) {
          const newVotes = inc.upvotes + 1
          const newPriority = newVotes >= 5 ? 'HIGH' : inc.priority
          return { ...inc, upvotes: newVotes, priority: newPriority }
        }
        return inc
      }))

      await fetch(apiUrl('/api/public/incidents/' + id + '/upvote'), { method: 'POST' })
    } catch (e) {
      console.warn('Upvote failed:', e)
    }
  }

  const filtered = incidents
    .filter(i => filterCategory === 'ALL' || i.category === filterCategory)
    .slice(0, limit)

  return (
    <div className="community-feed-container">
      <div className="community-feed-header">
        <div>
          <h2>{t('recentComplaints')}</h2>
          <p>Browse issues reported across your community. Upvote issues you share to boost their municipal priority.</p>
        </div>

        <div className="community-feed-filter">
          <select
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
            className="filter-select"
          >
            <option value="ALL">{t('allCategories')}</option>
            <option value="ROAD_DAMAGE">{t('ROAD_DAMAGE')}</option>
            <option value="WATER_LEAKAGE">{t('WATER_LEAKAGE')}</option>
            <option value="STREETLIGHTING">{t('STREETLIGHTING')}</option>
            <option value="WASTE">{t('WASTE')}</option>
          </select>
        </div>
      </div>

      {loading && <p role="status">{t('loading')}</p>}

      {!loading && !filtered.length && (
        <p className="notice">No civic reports found in this category yet.</p>
      )}

      <div className="community-cards-grid">
        {filtered.map(inc => {
          const hasVoted = votedIds.has(inc.id)
          const isHotspot = inc.upvotes >= 5 || inc.priority === 'HIGH'
          const StatusIcon = inc.status === 'RESOLVED' ? CheckCircle2 : inc.status === 'IN_PROGRESS' ? Clock3 : Inbox

          return (
            <article key={inc.id} className={`community-card ${isHotspot ? 'hotspot-card' : ''}`}>
              <div className="card-top-row">
                <span className={`status-pill status-${inc.status.toLowerCase()}`}>
                  <StatusIcon size={14} />
                  {t(inc.status)}
                </span>
                <span className="card-category-badge">{t(inc.category)}</span>
                {isHotspot && (
                  <span className="hotspot-badge" title="High community urgency">
                    <Sparkles size={13} /> {t('communityPriority')}
                  </span>
                )}
                {inc.isAiGenerated && (
                  <span className="ai-flag-pill" title="Synthetic photo flagged">
                    <ShieldAlert size={13} /> AI Photo Flagged
                  </span>
                )}
              </div>

              <h3>{inc.title}</h3>
              <p className="card-desc">{inc.description}</p>

              <div className="card-meta-row">
                <div className="loc-text">
                  <MapPin size={14} />
                  <span>{inc.location}</span>
                </div>
                <span className="card-date">
                  {new Date(inc.createdAt).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                </span>
              </div>

              {inc.hasPhoto && inc.reportId && (
                <div className="card-thumbnail-wrapper">
                  <img
                    src={apiUrl(`/api/public/reports/${inc.reportId}/photo`)}
                    alt="Report photo evidence"
                    loading="lazy"
                    className="card-thumb"
                  />
                </div>
              )}

              <div className="card-bottom-row">
                <button
                  type="button"
                  className={`upvote-btn ${hasVoted ? 'voted' : ''}`}
                  disabled={hasVoted}
                  onClick={() => void upvote(inc.id)}
                >
                  <ThumbsUp size={15} />
                  <span>{hasVoted ? t('voted') : t('upvote')}</span>
                  <span className="upvote-count">{inc.upvotes}</span>
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
