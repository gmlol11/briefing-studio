import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Brand } from '../api/types'
import { api } from '../api/client'

/** Просмотр и редактирование бренда. */
export default function BrandEditPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [brand, setBrand] = useState<Brand | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contextText, setContextText] = useState('{}')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    api
      .getBrand(id)
      .then((b) => {
        setBrand(b)
        setName(b.name)
        setDescription(b.description ?? '')
        setContextText(JSON.stringify(b.brand_context_json ?? {}, null, 2))
      })
      .catch((e) => setLoadError((e as Error).message))
  }, [id])

  if (loadError || (brand === null && id)) {
    if (loadError) {
      return (
        <div className="state-screen">
          <h2>Бренд не найден</h2>
          <p className="state-screen__muted">{loadError}</p>
          <Link to="/brands" className="btn btn--primary">
            К списку брендов
          </Link>
        </div>
      )
    }
    return (
      <div className="state-screen">
        <p className="state-screen__muted">Загружаем…</p>
      </div>
    )
  }

  const parseContext = (): Record<string, unknown> | null => {
    try {
      const parsed = contextText.trim() ? JSON.parse(contextText) : {}
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('JSON должен быть объектом')
      }
      return parsed
    } catch (e) {
      setError('Контекст бренда — невалидный JSON: ' + (e as Error).message)
      return null
    }
  }

  const save = async () => {
    setError(null)
    setSaved(false)
    if (!name.trim()) {
      setError('Укажите название бренда.')
      return
    }
    const ctx = parseContext()
    if (ctx === null) return
    setSaving(true)
    try {
      const updated = await api.updateBrand(id!, {
        name: name.trim(),
        description: description.trim() || null,
        brand_context_json: ctx,
      })
      setBrand(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2200)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!confirm('Удалить бренд? У связанных брифов связь с брендом будет снята.')) return
    try {
      await api.deleteBrand(id!)
      navigate('/brands')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="brand-form">
      <div className="briefs-page__head">
        <h1>{brand?.name || 'Бренд'}</h1>
        <Link to={`/brief/new/freeform?brand=${id}`} className="btn btn--primary">
          Создать freeform-бриф
        </Link>
      </div>

      <div className="card">
        <div className="wizard-card__fields">
          <div className="field">
            <label htmlFor="brand-name">Название</label>
            <input
              id="brand-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="brand-desc">Описание</label>
            <textarea
              id="brand-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="brand-ctx">Контекст бренда (JSON)</label>
            <textarea
              id="brand-ctx"
              className="json-input"
              rows={12}
              value={contextText}
              spellCheck={false}
              onChange={(e) => setContextText(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="wizard-card__actions">
          <button type="button" className="btn btn--ghost" onClick={remove} disabled={saving}>
            Удалить
          </button>
          <span className={'saved-indicator' + (saved ? ' saved-indicator--show' : '')}>
            Сохранено ✓
          </span>
          <button type="button" className="btn btn--primary" onClick={save} disabled={saving}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </div>
  )
}
