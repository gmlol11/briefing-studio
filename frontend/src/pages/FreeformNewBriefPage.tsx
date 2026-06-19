import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import type { BrandListItem, BriefTemplate } from '../api/types'
import { api, ApiError } from '../api/client'
import TemplateEditor from '../components/TemplateEditor'

const LLM_NOT_CONFIGURED =
  'LLM пока не настроена. Бриф создан, summary можно собрать позже. Добавьте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL в .env.'

type TemplateMode = 'default' | 'reference'

/** Создание brand-aware freeform-брифа: бренд → структура итогового брифа → свободный текст. */
export default function FreeformNewBriefPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [brands, setBrands] = useState<BrandListItem[] | null>(null)
  const [brandId, setBrandId] = useState<string>(params.get('brand') ?? '')
  const [rawInput, setRawInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // структура итогового брифа
  const [defaultTemplate, setDefaultTemplate] = useState<BriefTemplate | null>(null)
  const [template, setTemplate] = useState<BriefTemplate | null>(null)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [mode, setMode] = useState<TemplateMode>('default')
  const [referenceText, setReferenceText] = useState('')
  const [decomposing, setDecomposing] = useState(false)

  useEffect(() => {
    api
      .listBrands()
      .then((list) => {
        setBrands(list)
        setBrandId((cur) => cur || (list.length ? String(list[0].id) : ''))
      })
      .catch((e) => setError((e as Error).message))
  }, [])

  useEffect(() => {
    api
      .getDefaultTemplate()
      .then((tpl) => {
        setDefaultTemplate(tpl)
        setTemplate(tpl)
      })
      .catch(() =>
        setTemplateError('Не удалось загрузить структуру по умолчанию. Обновите страницу.'),
      )
  }, [])

  const switchMode = (next: TemplateMode) => {
    setMode(next)
    setTemplateError(null)
    if (next === 'default' && defaultTemplate) setTemplate(defaultTemplate)
  }

  const decompose = async () => {
    setTemplateError(null)
    if (!referenceText.trim()) {
      setTemplateError('Вставьте текст-референс структуры.')
      return
    }
    setDecomposing(true)
    try {
      const tpl = await api.decomposeTemplate({
        reference_text: referenceText,
        brand_id: brandId ? Number(brandId) : null,
      })
      setTemplate(tpl)
    } catch (e) {
      setTemplateError(
        e instanceof ApiError && e.status === 503 ? LLM_NOT_CONFIGURED : (e as Error).message,
      )
    } finally {
      setDecomposing(false)
    }
  }

  const submit = async () => {
    setError(null)
    if (!brandId) {
      setError('Выберите бренд.')
      return
    }
    if (!template) {
      setError('Структура итогового брифа не загружена.')
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
      await api.selectTemplate(brief.id, {
        template,
        reference_text: mode === 'reference' ? referenceText : null,
      })
      await api.setFreeformInput(brief.id, rawInput)
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

            {/* Структура итогового брифа */}
            <div className="field">
              <label>Структура итогового брифа</label>
              <div className="template-mode">
                <label className="template-mode__opt">
                  <input
                    type="radio"
                    name="tpl-mode"
                    checked={mode === 'default'}
                    onChange={() => switchMode('default')}
                  />
                  Стандартная структура
                </label>
                <label className="template-mode__opt">
                  <input
                    type="radio"
                    name="tpl-mode"
                    checked={mode === 'reference'}
                    onChange={() => switchMode('reference')}
                  />
                  Из референса
                </label>
              </div>

              {mode === 'reference' && (
                <div className="template-ref">
                  <textarea
                    rows={6}
                    value={referenceText}
                    placeholder="Вставьте пример/референс структуры брифа…"
                    onChange={(e) => setReferenceText(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={decompose}
                    disabled={decomposing}
                  >
                    {decomposing ? 'Декомпозируем…' : 'Декомпозировать структуру'}
                  </button>
                </div>
              )}

              {templateError && <div className="form-error">{templateError}</div>}

              {template ? (
                <TemplateEditor template={template} onChange={setTemplate} disabled={busy} />
              ) : (
                !templateError && <p className="review-muted">Загружаем структуру…</p>
              )}
              <p className="field__hint">
                Отметьте разделы и поля, которые должны попасть в итоговый бриф.
              </p>
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
                AI сделает summary, затем структурирует бриф под выбранную структуру.
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
              disabled={busy || brands === null || !template}
            >
              {busy ? 'Создаём…' : 'Создать и сделать summary'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
