import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import type { BrandListItem } from '../api/types'
import { api, ApiError } from '../api/client'

const LLM_NOT_CONFIGURED =
  'LLM пока не настроена. Бриф создан, summary можно собрать позже. Добавьте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL в .env.'

/** Создание brand-aware freeform-брифа из свободного текста. */
export default function FreeformNewBriefPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [brands, setBrands] = useState<BrandListItem[] | null>(null)
  const [brandId, setBrandId] = useState<string>(params.get('brand') ?? '')
  const [rawInput, setRawInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api
      .listBrands()
      .then((list) => {
        setBrands(list)
        // если бренд не задан query-параметром — предвыбрать первый доступный
        setBrandId((cur) => cur || (list.length ? String(list[0].id) : ''))
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  const submit = async () => {
    setError(null)
    if (!brandId) {
      setError('Выберите бренд.')
      return
    }
    if (!rawInput.trim()) {
      setError('Вставьте текст клиентского брифа.')
      return
    }
    setBusy(true)
    try {
      const title = rawInput.trim().split('\n')[0].slice(0, 60) || undefined
      const brief = await api.createFreeformBrief({ brand_id: Number(brandId), title })
      // backend create не сохраняет raw input сам — сохраняем отдельно
      await api.setFreeformInput(brief.id, rawInput)
      // best-effort: summary можно пересобрать на review-экране, если здесь не вышло
      try {
        await api.summarizeInput(brief.id)
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 503)) throw e
        // LLM не настроена — не блокируем, бриф уже создан
      }
      navigate(`/brief/${brief.id}/review`)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 503 ? LLM_NOT_CONFIGURED : (e as Error).message)
      setBusy(false)
    }
  }

  return (
    <div className="brand-form">
      <h1 className="briefs-page__head">AI-бриф из свободного ввода</h1>

      {brands && brands.length === 0 ? (
        <div className="card briefs-empty">
          <h3>Сначала создайте бренд</h3>
          <p>Freeform-бриф собирается на основе контекста бренда.</p>
          <Link to="/brands/new" className="btn btn--primary">
            Создать бренд
          </Link>
        </div>
      ) : (
        <div className="card">
          <div className="wizard-card__fields">
            <div className="field">
              <label htmlFor="ff-brand">Бренд</label>
              <select
                id="ff-brand"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
              >
                {!brandId && <option value="">— выберите бренд —</option>}
                {(brands ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ff-input">Свободный клиентский бриф</label>
              <textarea
                id="ff-input"
                rows={12}
                value={rawInput}
                placeholder="Вставьте сюда письмо/бриф клиента как есть…"
                onChange={(e) => setRawInput(e.target.value)}
              />
              <p className="field__hint">
                AI сделает summary, затем структурирует бриф с источниками и уточнениями.
              </p>
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}

          <div className="wizard-card__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate('/brands')}
              disabled={busy}
            >
              К брендам
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={submit}
              disabled={busy || brands === null}
            >
              {busy ? 'Создаём…' : 'Создать и сделать summary'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
