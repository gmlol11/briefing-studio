import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { Brief } from '../api/types'
import { api } from '../api/client'
import BriefWizard from '../components/BriefWizard'

/** Загружает существующий бриф по id и запускает wizard. */
export default function BriefEditPage() {
  const { id } = useParams<{ id: string }>()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api
      .getBrief(id)
      .then(setBrief)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="state-screen">
        <p className="state-screen__muted">Загружаем бриф…</p>
      </div>
    )
  }

  if (error || !brief) {
    return (
      <div className="state-screen">
        <h2>Бриф не найден</h2>
        <p className="state-screen__muted">{error ?? 'Такого брифа нет.'}</p>
        <Link to="/briefs" className="btn btn--primary">
          К списку брифов
        </Link>
      </div>
    )
  }

  // brand-aware freeform-брифы открываются в review-экране, а не в wizard.
  // Redirect стабилен: /brief/:id/review — отдельный роут, обратно не редиректит.
  const isFreeform =
    brief.brand_id != null ||
    !!brief.raw_input_text ||
    brief.structured_brief_json != null
  if (isFreeform) {
    return <Navigate to={`/brief/${brief.id}/review`} replace />
  }

  // key={brief.id} — пересоздаём wizard при смене брифа
  return <BriefWizard key={brief.id} brief={brief} />
}
