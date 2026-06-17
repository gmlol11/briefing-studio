import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { BrandListItem } from '../api/types'
import { api } from '../api/client'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Список брендов. */
export default function BrandsListPage() {
  const [brands, setBrands] = useState<BrandListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api
      .listBrands()
      .then(setBrands)
      .catch((e) => setError((e as Error).message))
  }, [])

  return (
    <div className="briefs-page">
      <div className="briefs-page__head">
        <h1>Бренды</h1>
        <Link to="/brands/new" className="btn btn--primary">
          Создать бренд
        </Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      {brands === null && !error && <p className="state-screen__muted">Загружаем…</p>}

      {brands && brands.length === 0 && (
        <div className="card briefs-empty">
          <h3>Пока нет ни одного бренда</h3>
          <p>Создайте бренд, чтобы собирать на его основе AI-брифы.</p>
          <Link to="/brands/new" className="btn btn--primary">
            Создать бренд
          </Link>
        </div>
      )}

      {brands && brands.length > 0 && (
        <ul className="briefs-list">
          {brands.map((b) => (
            <li key={b.id} className="card brief-row">
              <Link to={`/brands/${b.id}`} className="brief-row__main">
                <span className="brief-row__title">{b.name}</span>
                <span className="brief-row__meta">
                  {b.description ? b.description + ' · ' : ''}обновлён {formatDate(b.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
