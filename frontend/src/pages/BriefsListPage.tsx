import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BriefListItem } from '../api/types'
import { api } from '../api/client'
import { BRIEF_TYPE_LABELS, STATUS_LABELS } from '../wizard/steps'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Список созданных брифов. */
export default function BriefsListPage() {
  const [briefs, setBriefs] = useState<BriefListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    setError(null)
    api
      .listBriefs()
      .then(setBriefs)
      .catch((e) => setError((e as Error).message))
  }

  useEffect(load, [])

  const handleDelete = async (id: number) => {
    if (!confirm('Удалить этот бриф?')) return
    try {
      await api.deleteBrief(id)
      setBriefs((list) => (list ? list.filter((b) => b.id !== id) : list))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="briefs-page">
      <div className="briefs-page__head">
        <h1>Брифы</h1>
        <Link to="/brief/new" className="btn btn--primary">
          Создать бриф
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      {briefs === null && !error && <p className="state-screen__muted">Загружаем…</p>}

      {briefs && briefs.length === 0 && (
        <div className="card briefs-empty">
          <h3>Пока нет ни одного брифа</h3>
          <p>Создайте первый бриф, чтобы начать.</p>
          <Link to="/brief/new" className="btn btn--primary">
            Создать бриф
          </Link>
        </div>
      )}

      {briefs && briefs.length > 0 && (
        <ul className="briefs-list">
          {briefs.map((b) => {
            const isFreeform = b.brand_id != null
            return (
            <li key={b.id} className="card brief-row">
              <Link
                to={isFreeform ? `/brief/${b.id}/review` : `/brief/${b.id}`}
                className="brief-row__main"
              >
                <span className="brief-row__title">{b.title || 'Без названия'}</span>
                <span className="brief-row__meta">
                  {isFreeform ? 'Brand-aware' : BRIEF_TYPE_LABELS[b.brief_type]} · обновлён{' '}
                  {formatDate(b.updated_at)}
                </span>
              </Link>
              {isFreeform && <span className="badge badge--freeform">Freeform</span>}
              {b.is_generated_outdated && (
                <span className="badge badge--outdated">Требует перегенерации</span>
              )}
              <span className={`badge badge--${b.status}`}>{STATUS_LABELS[b.status]}</span>
              <button
                type="button"
                className="brief-row__delete"
                onClick={() => handleDelete(b.id)}
                aria-label="Удалить бриф"
              >
                Удалить
              </button>
            </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
