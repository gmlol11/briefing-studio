import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { BrandIdentity } from '../api/types'
import { api } from '../api/client'
import BrandIdentityEditor, { EMPTY_IDENTITY } from '../components/BrandIdentityEditor'

/** Создание нового бренда. */
export default function BrandNewPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [contextText, setContextText] = useState('{\n  \n}')
  const [identity, setIdentity] = useState<BrandIdentity>(EMPTY_IDENTITY)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setError(null)
    if (!name.trim()) {
      setError('Укажите название бренда.')
      return
    }
    let brand_context_json: Record<string, unknown>
    try {
      const parsed = contextText.trim() ? JSON.parse(contextText) : {}
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('JSON должен быть объектом')
      }
      brand_context_json = parsed
    } catch (e) {
      setError('Контекст бренда — невалидный JSON: ' + (e as Error).message)
      return
    }
    setSaving(true)
    try {
      const brand = await api.createBrand({
        name: name.trim(),
        description: description.trim() || null,
        brand_context_json,
        brand_identity_json: identity,
      })
      navigate(`/brands/${brand.id}`)
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="brand-form">
      <h1 className="briefs-page__head">Новый бренд</h1>
      <div className="card">
        <div className="wizard-card__fields">
          <div className="field">
            <label htmlFor="brand-name">Название</label>
            <input
              id="brand-name"
              type="text"
              value={name}
              placeholder="Например: Tasty Coffee"
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
              rows={10}
              value={contextText}
              spellCheck={false}
              onChange={(e) => setContextText(e.target.value)}
            />
            <p className="field__hint">
              Произвольный JSON-объект: позиционирование, аудитория, tone of voice и т.п.
              Используется AI при структурировании брифа.
            </p>
          </div>

          <div className="identity-section">
            <h2 className="identity-section__title">Бренд-айдентика</h2>
            <BrandIdentityEditor value={identity} onChange={setIdentity} />
          </div>
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="wizard-card__actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => navigate('/brands')}
            disabled={saving}
          >
            Отмена
          </button>
          <button type="button" className="btn btn--primary" onClick={submit} disabled={saving}>
            {saving ? 'Сохранение…' : 'Создать бренд'}
          </button>
        </div>
      </div>
    </div>
  )
}
