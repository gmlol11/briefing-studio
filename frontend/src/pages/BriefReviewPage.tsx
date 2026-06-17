import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Brief } from '../api/types'
import { api } from '../api/client'

/**
 * Review-экран brand-aware freeform-брифа.
 * Block 3 — минимальный placeholder; полный flow (summary/structured/clarifications/
 * generate-final) добавляется в Block 4.
 */
export default function BriefReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
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

  return (
    <div className="review-page">
      <div className="briefs-page__head">
        <h1>{brief.title}</h1>
        {brief.brand_id != null && (
          <Link to={`/brands/${brief.brand_id}`} className="btn btn--ghost">
            Бренд #{brief.brand_id}
          </Link>
        )}
      </div>

      <div className="card">
        <p className="state-screen__muted">
          Это экран review brand-aware флоу. Полный review (summary → структура →
          уточнения → финальная генерация) будет добавлен в следующем блоке.
        </p>

        <h4 style={{ marginTop: 16 }}>Исходный ввод</h4>
        <pre className="review-debug">
          {brief.raw_input_text || '— нет raw_input_text —'}
        </pre>

        <h4 style={{ marginTop: 16 }}>
          Input summary {brief.is_input_summary_verified ? '(подтверждён)' : ''}
        </h4>
        <pre className="review-debug">
          {brief.input_summary_json
            ? JSON.stringify(brief.input_summary_json, null, 2)
            : '— summary ещё не сгенерирован —'}
        </pre>
      </div>
    </div>
  )
}
