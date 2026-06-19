import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Brief, BriefTemplate, ClarificationImportance } from '../api/types'
import { api, ApiError } from '../api/client'
import MarkdownView from '../components/MarkdownView'
import ReviewStepper from '../components/ReviewStepper'
import SourceBadge from '../components/SourceBadge'
import StatusBadge from '../components/StatusBadge'
import TemplateEditor from '../components/TemplateEditor'
import { deriveSteps, defaultActiveStep, type ReviewStepId } from '../review/steps'

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

/** Review-flow brand-aware брифа: summary → структура → уточнения → финал. */
export default function BriefReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [brief, setBrief] = useState<Brief | null>(null)
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

  const downloadExport = async (format: 'markdown' | 'json') => {
    setError(null)
    try {
      const blob = await api.exportBrief(brief.id, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `brief-${brief.id}.${format === 'markdown' ? 'md' : 'json'}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
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

      <ReviewStepper steps={steps} activeId={activeStepId} onSelect={setActiveStepId} />

      {error && <div className="form-error">{error}</div>}

      {/* 0. Структура итогового брифа */}
      <section className="card review-section">
        <h3>Структура итогового брифа</h3>
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
      </section>

      {/* Raw input */}
      <section className="card review-section">
        <h3>Исходный клиентский бриф</h3>
        {brief.raw_input_text ? (
          <pre className="review-raw">{brief.raw_input_text}</pre>
        ) : (
          <p className="review-muted">— нет текста —</p>
        )}
      </section>

      {/* 1. Summary */}
      <section className="card review-section">
        <h3>1. Summary</h3>
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
      </section>

      {/* 2. Structured brief */}
      <section className="card review-section">
        <h3>2. Структурированный бриф</h3>
        {!structured ? (
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
                      <span className="review-card__key">{f.key || '(без ключа)'}</span>
                      <StatusBadge status={f.status} />
                    </div>
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
        )}
      </section>

      {/* 3. Clarifications */}
      {structured && (
        <section className="card review-section">
          <h3>3. Уточняющие вопросы</h3>
          {!clarifications ? (
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
                            <div className="clarification-card__field">поле: {q.field}</div>
                          )}
                          {q.options.length > 0 && (
                            <div className="review-muted">варианты: {q.options.join(', ')}</div>
                          )}
                          <textarea
                            rows={2}
                            value={answers[key] ?? ''}
                            placeholder="Ваш ответ…"
                            onChange={(e) =>
                              setAnswers((a) => ({ ...a, [key]: e.target.value }))
                            }
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
          )}
        </section>
      )}

      {/* 4. Final generation */}
      {structured && (
        <section className="card review-section">
          <h3>4. Финальный бриф</h3>
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
              onClick={() =>
                run('generate', () => api.generateFinalBrief(brief.id), CRITICAL_409)
              }
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
                <button type="button" className="btn btn--ghost" onClick={copyMarkdown}>
                  {copied ? 'Скопировано ✓' : 'Copy Markdown'}
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => downloadExport('markdown')}
                >
                  Download Markdown
                </button>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => downloadExport('json')}
                >
                  Download JSON
                </button>
              </>
            )}
          </div>
          {brief.generated_markdown && (
            <div className="doc-frame" style={{ marginTop: 16 }}>
              <MarkdownView markdown={brief.generated_markdown} />
            </div>
          )}
        </section>
      )}
    </div>
  )
}
