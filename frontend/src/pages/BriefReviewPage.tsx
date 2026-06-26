import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type {
  Brand,
  Brief,
  BriefExportFormat,
  BriefTemplate,
  ClarificationImportance,
} from '../api/types'
import { api, ApiError } from '../api/client'
import BrandedDocument from '../components/BrandedDocument'
import ProcessingState from '../components/ProcessingState'
import ReviewStateSummary from '../components/ReviewStateSummary'
import ReviewStepper from '../components/ReviewStepper'
import SourceBadge from '../components/SourceBadge'
import StatusBadge from '../components/StatusBadge'
import StepPanel from '../components/StepPanel'
import TemplateEditor from '../components/TemplateEditor'
import { resolveFieldLabel } from '../review/fieldLabels'
import {
  deriveSteps,
  defaultActiveStep,
  stepIdForBusy,
  type ReviewStepId,
} from '../review/steps'

/** Расширение файла и busy-ключ для каждого формата экспорта. */
const EXPORT_EXT: Record<BriefExportFormat, string> = {
  markdown: 'md',
  json: 'json',
  docx: 'docx',
  pdf: 'pdf',
}
const EXPORT_BUSY: Record<BriefExportFormat, string> = {
  markdown: 'export-md',
  json: 'export-json',
  docx: 'export-docx',
  pdf: 'export-pdf',
}

/** Сообщения для ProcessingState по busy-ключу (export — лёгкий busy на кнопке, без панели). */
const BUSY_MESSAGES: Record<string, string> = {
  'save-template': 'Сохраняем структуру…',
  summarize: 'Готовим summary…',
  verify: 'Подтверждаем summary…',
  structure: 'Структурируем бриф…',
  clarify: 'Формируем уточняющие вопросы…',
  apply: 'Применяем ответы…',
  generate: 'Генерируем итоговый документ…',
}

const IMPORTANCE_ORDER: ClarificationImportance[] = ['critical', 'recommended', 'optional']
const IMPORTANCE_LABELS: Record<ClarificationImportance, string> = {
  critical: 'Критичные',
  recommended: 'Рекомендуемые',
  optional: 'Опциональные',
}

const CRITICAL_409 =
  'Есть критичные незаполненные или неподтверждённые поля. Ответьте на вопросы в блоке уточнений.'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function List({ items }: { items: string[] }) {
  const clean = items.filter((s) => s.trim())
  if (!clean.length) return <p className="review-muted">—</p>
  return (
    <ul className="review-list">
      {clean.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

/** Review-flow brand-aware брифа: пошагово (структура → summary → структура → уточнения → финал). */
export default function BriefReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [brand, setBrand] = useState<Brand | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [copied, setCopied] = useState(false)
  const [templateDraft, setTemplateDraft] = useState<BriefTemplate | null>(null)
  const [activeStepId, setActiveStepId] = useState<ReviewStepId>('template')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getBrief(id)
      .then((b) => {
        setBrief(b)
        setActiveStepId(defaultActiveStep(deriveSteps(b, null)))
      })
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    setTemplateDraft(brief?.selected_template_json ?? null)
  }, [brief])

  // Brand identity для brand-aware preview итогового документа. Неблокирующе:
  // ошибка/отсутствие brand_id → preview работает как обычный markdown.
  useEffect(() => {
    const brandId = brief?.brand_id
    if (brandId == null) {
      setBrand(null)
      return
    }
    let cancelled = false
    api
      .getBrand(brandId)
      .then((b) => {
        if (!cancelled) setBrand(b)
      })
      .catch(() => {
        if (!cancelled) setBrand(null)
      })
    return () => {
      cancelled = true
    }
  }, [brief?.brand_id])

  if (loading) {
    return (
      <div className="state-screen">
        <p className="state-screen__muted">Загружаем бриф…</p>
      </div>
    )
  }
  if (loadError || !brief) {
    return (
      <div className="state-screen">
        <h2>Бриф не найден</h2>
        <p className="state-screen__muted">{loadError ?? 'Такого брифа нет.'}</p>
        <Link to="/briefs" className="btn btn--primary">
          К списку брифов
        </Link>
      </div>
    )
  }

  const run = async (key: string, fn: () => Promise<Brief>, conflictMsg?: string) => {
    setBusy(key)
    setError(null)
    try {
      setBrief(await fn())
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setError(conflictMsg ?? e.message)
      else setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const saveTemplate = () => {
    if (!templateDraft) return
    run('save-template', () => api.selectTemplate(brief.id, { template: templateDraft }))
  }

  const useDefaultTemplate = () =>
    run('save-template', async () => {
      const tpl = await api.getDefaultTemplate()
      return api.selectTemplate(brief.id, { template: tpl })
    })

  const summary = brief.input_summary_json
  const structured = brief.structured_brief_json
  const clarifications = brief.clarifications_json
  const steps = deriveSteps(brief, busy)

  const applyAnswers = () => {
    const questions = clarifications?.questions ?? []
    const payload = questions
      .map((q, i) => {
        const key = q.id || q.field || `q${i}`
        const answer = (answers[key] ?? '').trim()
        return answer ? { question_id: q.id, field: q.field, answer } : null
      })
      .filter((a): a is { question_id: string; field: string; answer: string } => a !== null)
    if (!payload.length) {
      setError('Введите хотя бы один ответ перед применением.')
      return
    }
    run('apply', async () => {
      const updated = await api.applyClarifications(brief.id, { answers: payload })
      setAnswers({})
      return updated
    })
  }

  const copyMarkdown = async () => {
    if (!brief.generated_markdown) return
    if (await copyText(brief.generated_markdown)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadExport = async (format: BriefExportFormat) => {
    setError(null)
    setBusy(EXPORT_BUSY[format])
    try {
      const blob = await api.exportBrief(brief.id, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brief-${brief.id}.${EXPORT_EXT[format]}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const stepIndex = steps.findIndex((s) => s.id === activeStepId)
  const activeStep = steps[stepIndex] ?? steps[0]
  const goPrevious = () => {
    if (stepIndex > 0) setActiveStepId(steps[stepIndex - 1].id)
  }
  const goNext = () => {
    if (stepIndex < steps.length - 1) setActiveStepId(steps[stepIndex + 1].id)
  }

  // Сообщение лоадера показываем, только если busy относится к активному шагу
  // (export-* в BUSY_MESSAGES нет → у них только busy на кнопке).
  const processingMessage =
    busy && stepIdForBusy(busy) === activeStep.id ? BUSY_MESSAGES[busy] : undefined

  // Контент активного шага. Логика/handlers те же, что и раньше — меняется только то,
  // что показывается один шаг за раз внутри StepPanel.
  const renderStep = () => {
    switch (activeStep.id) {
      case 'template':
        return (
          <>
            {templateDraft ? (
              <>
                <TemplateEditor
                  template={templateDraft}
                  onChange={setTemplateDraft}
                  disabled={busy !== null}
                />
                <div className="review-actions">
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={saveTemplate}
                    disabled={busy !== null}
                  >
                    {busy === 'save-template' ? 'Сохраняем…' : 'Сохранить структуру'}
                  </button>
                </div>
              </>
            ) : (
              <div className="review-actions">
                <p className="review-muted">
                  Структура не выбрана — по умолчанию используется стандартная.
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={useDefaultTemplate}
                  disabled={busy !== null}
                >
                  {busy === 'save-template' ? '…' : 'Использовать стандартную структуру'}
                </button>
              </div>
            )}
            {brief.reference_template_text && (
              <details className="template-ref-details">
                <summary>Референс структуры</summary>
                <pre className="review-raw">{brief.reference_template_text}</pre>
              </details>
            )}
          </>
        )

      case 'summary':
        return (
          <>
            <details className="template-ref-details review-raw-details">
              <summary>Исходный клиентский бриф</summary>
              {brief.raw_input_text ? (
                <pre className="review-raw">{brief.raw_input_text}</pre>
              ) : (
                <p className="review-muted">— нет текста —</p>
              )}
            </details>
            {!summary ? (
              <div className="review-actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => run('summarize', () => api.summarizeInput(brief.id))}
                  disabled={busy !== null || !brief.raw_input_text}
                >
                  {busy === 'summarize' ? 'Генерируем…' : 'Сгенерировать summary'}
                </button>
              </div>
            ) : (
              <>
                <p>{summary.summary || '—'}</p>
                <h4>Ключевые факты</h4>
                <List items={summary.key_facts} />
                <h4>Явные требования</h4>
                <List items={summary.explicit_requirements} />
                <h4>Ограничения</h4>
                <List items={summary.constraints} />
                <h4>Неоднозначные фрагменты</h4>
                <List items={summary.uncertain_fragments} />
                <div className="review-actions">
                  {!brief.is_input_summary_verified ? (
                    <button
                      type="button"
                      className="btn btn--primary"
                      onClick={() => run('verify', () => api.verifyInputSummary(brief.id))}
                      disabled={busy !== null}
                    >
                      {busy === 'verify' ? '…' : 'Подтвердить summary'}
                    </button>
                  ) : (
                    <span className="review-ok">summary подтверждён ✓</span>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => run('summarize', () => api.summarizeInput(brief.id))}
                    disabled={busy !== null}
                  >
                    Пересобрать summary
                  </button>
                </div>
              </>
            )}
          </>
        )

      case 'structure':
        return !structured ? (
          brief.is_input_summary_verified ? (
            <div className="review-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => run('structure', () => api.structureBrief(brief.id))}
                disabled={busy !== null}
              >
                {busy === 'structure' ? 'Структурируем…' : 'Структурировать бриф'}
              </button>
            </div>
          ) : (
            <p className="review-muted">Подтвердите summary, чтобы структурировать бриф.</p>
          )
        ) : (
          <>
            <div className="review-grid">
              {structured.fields.map((f, i) => {
                const pct = Math.round((f.confidence ?? 0) * 100)
                return (
                  <div className="review-card" key={f.key || i}>
                    <div className="review-card__head">
                      <span className="review-card__key">
                        {resolveFieldLabel(f.key, brief.selected_template_json)}
                      </span>
                      <StatusBadge status={f.status} />
                    </div>
                    {f.key && <span className="review-card__keytag">{f.key}</span>}
                    <div className="review-card__value">{f.value || '—'}</div>
                    <div className="review-card__foot">
                      <SourceBadge source={f.source_type} />
                      <span className="confidence">
                        <span className="confidence-bar">
                          <span style={{ width: `${pct}%` }} />
                        </span>
                        <span className="confidence-value">{pct}%</span>
                      </span>
                    </div>
                    {f.comment && <div className="review-card__comment">{f.comment}</div>}
                  </div>
                )
              })}
            </div>
            <div className="review-actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => run('structure', () => api.structureBrief(brief.id))}
                disabled={busy !== null}
              >
                Пересобрать структуру
              </button>
            </div>
          </>
        )

      case 'clarifications':
        return !structured ? (
          <p className="review-muted">Сначала структурируйте бриф.</p>
        ) : !clarifications ? (
          <div className="review-actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => run('clarify', () => api.generateClarifications(brief.id))}
              disabled={busy !== null}
            >
              {busy === 'clarify' ? 'Генерируем…' : 'Сгенерировать вопросы'}
            </button>
          </div>
        ) : (
          <>
            {IMPORTANCE_ORDER.map((imp) => {
              const qs = clarifications.questions.filter((q) => q.importance === imp)
              if (!qs.length) return null
              return (
                <div className={`clarification-group clarification-group--${imp}`} key={imp}>
                  <h4>{IMPORTANCE_LABELS[imp]}</h4>
                  {qs.map((q, i) => {
                    const key = q.id || q.field || `q${i}`
                    return (
                      <div className="clarification-card" key={key}>
                        <div className="clarification-card__q">{q.question}</div>
                        {q.field && (
                          <div className="clarification-card__field">
                            Поле: {resolveFieldLabel(q.field, brief.selected_template_json)}{' '}
                            <span className="clarification-card__fieldkey">{q.field}</span>
                          </div>
                        )}
                        {q.options.length > 0 && (
                          <div className="clarification-options">
                            {q.options.map((opt, oi) => (
                              <button
                                type="button"
                                className="clarification-option"
                                key={oi}
                                onClick={() => setAnswers((a) => ({ ...a, [key]: opt }))}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        )}
                        <textarea
                          rows={2}
                          value={answers[key] ?? ''}
                          placeholder="Ваш ответ…"
                          onChange={(e) => setAnswers((a) => ({ ...a, [key]: e.target.value }))}
                        />
                      </div>
                    )
                  })}
                </div>
              )
            })}
            <div className="review-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={applyAnswers}
                disabled={busy !== null}
              >
                {busy === 'apply' ? 'Применяем…' : 'Применить ответы'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => run('clarify', () => api.generateClarifications(brief.id))}
                disabled={busy !== null}
              >
                Пересобрать вопросы
              </button>
            </div>
          </>
        )

      case 'final':
        return !structured ? (
          <p className="review-muted">Сначала структурируйте бриф.</p>
        ) : (
          <>
            {brief.is_generated_outdated && (
              <div className="hint-banner">
                <span className="hint-banner__icon">⟳</span>
                Структура изменилась после последней генерации. Рекомендуется сгенерировать заново.
              </div>
            )}
            <div className="review-actions">
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => run('generate', () => api.generateFinalBrief(brief.id), CRITICAL_409)}
                disabled={busy !== null}
              >
                {busy === 'generate'
                  ? 'Генерируем…'
                  : brief.generated_markdown
                    ? 'Сгенерировать заново'
                    : 'Сгенерировать финальный бриф'}
              </button>
              {brief.generated_markdown && (
                <>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={copyMarkdown}
                    disabled={busy !== null}
                  >
                    {copied ? 'Скопировано ✓' : 'Copy Markdown'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => downloadExport('markdown')}
                    disabled={busy !== null}
                  >
                    {busy === 'export-md' ? 'Скачиваем…' : 'Download Markdown'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => downloadExport('json')}
                    disabled={busy !== null}
                  >
                    {busy === 'export-json' ? 'Скачиваем…' : 'Download JSON'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => downloadExport('docx')}
                    disabled={busy !== null}
                  >
                    {busy === 'export-docx' ? 'Скачиваем…' : 'Download DOCX'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => downloadExport('pdf')}
                    disabled={busy !== null}
                  >
                    {busy === 'export-pdf' ? 'Скачиваем…' : 'Download PDF'}
                  </button>
                </>
              )}
            </div>
            {brief.generated_markdown && (
              <div className="doc-frame" style={{ marginTop: 16 }}>
                <BrandedDocument
                  markdown={brief.generated_markdown}
                  identity={brand?.brand_identity_json ?? null}
                  brandName={brand?.name ?? null}
                />
              </div>
            )}
          </>
        )

      default:
        return null
    }
  }

  return (
    <div className="review-page">
      <div className="briefs-page__head">
        <h1>{brief.title}</h1>
        <div className="review-head-right">
          <span className={`badge badge--${brief.status}`}>{brief.status}</span>
          {brief.brand_id != null && (
            <Link to={`/brands/${brief.brand_id}`} className="btn btn--ghost">
              К бренду
            </Link>
          )}
        </div>
      </div>

      <ReviewStateSummary brief={brief} steps={steps} />

      <ReviewStepper steps={steps} activeId={activeStepId} onSelect={setActiveStepId} />

      {error && <div className="form-error">{error}</div>}

      <StepPanel
        step={activeStep}
        onPrevious={goPrevious}
        onNext={goNext}
        canPrevious={stepIndex > 0}
        canNext={stepIndex < steps.length - 1}
      >
        {processingMessage && <ProcessingState message={processingMessage} />}
        {renderStep()}
      </StepPanel>
    </div>
  )
}
