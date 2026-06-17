import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type {
  Brief,
  ClarificationImportance,
  FieldStatus,
  SourceType,
} from '../api/types'
import { api, ApiError } from '../api/client'
import MarkdownView from '../components/MarkdownView'

const SOURCE_LABELS: Record<SourceType, string> = {
  brand_bible: 'бренд-библия',
  client_brief: 'клиентский бриф',
  transcript: 'транскрипт',
  manager_note: 'заметка менеджера',
  inference: 'домысел AI',
  internet: 'интернет',
  user_edit: 'правка пользователя',
  unknown: 'неизвестно',
}

const STATUS_LABELS: Record<FieldStatus, string> = {
  confirmed: 'подтверждено',
  confirmed_by_brand: 'из бренда',
  needs_confirmation: 'нужно подтвердить',
  critical_missing: 'критично: нет данных',
  optional_missing: 'опционально: нет данных',
  conflict: 'конфликт',
  rejected: 'отклонено',
}

const IMPORTANCE_ORDER: ClarificationImportance[] = ['critical', 'recommended', 'optional']
const IMPORTANCE_LABELS: Record<ClarificationImportance, string> = {
  critical: 'Критичные',
  recommended: 'Рекомендуемые',
  optional: 'Опциональные',
}

const CRITICAL_409 =
  'Есть критичные незаполненные или неподтверждённые поля. Ответьте на вопросы в блоке уточнений.'

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

/** Рабочий review-flow brand-aware брифа. */
export default function BriefReviewPage() {
  const { id } = useParams<{ id: string }>()
  const [brief, setBrief] = useState<Brief | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api
      .getBrief(id)
      .then(setBrief)
      .catch((e) => setLoadError((e as Error).message))
      .finally(() => setLoading(false))
  }, [id])

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
      if (e instanceof ApiError && e.status === 409) {
        setError(conflictMsg ?? e.message)
      } else {
        setError((e as Error).message)
      }
    } finally {
      setBusy(null)
    }
  }

  const summary = brief.input_summary_json
  const structured = brief.structured_brief_json
  const clarifications = brief.clarifications_json

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

      {error && <div className="form-error">{error}</div>}

      {/* A. Raw input */}
      <section className="card review-section">
        <h3>Исходный клиентский бриф</h3>
        {brief.raw_input_text ? (
          <pre className="review-raw">{brief.raw_input_text}</pre>
        ) : (
          <p className="review-muted">— нет текста —</p>
        )}
      </section>

      {/* B. Summary */}
      <section className="card review-section">
        <h3>1. Summary</h3>
        {!summary ? (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => run('summarize', () => api.summarizeInput(brief.id))}
            disabled={busy !== null || !brief.raw_input_text}
          >
            {busy === 'summarize' ? 'Генерируем…' : 'Сгенерировать summary'}
          </button>
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

      {/* C. Structured brief */}
      <section className="card review-section">
        <h3>2. Структурированный бриф</h3>
        {!structured ? (
          brief.is_input_summary_verified ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => run('structure', () => api.structureBrief(brief.id))}
              disabled={busy !== null}
            >
              {busy === 'structure' ? 'Структурируем…' : 'Структурировать бриф'}
            </button>
          ) : (
            <p className="review-muted">Подтвердите summary, чтобы структурировать бриф.</p>
          )
        ) : (
          <>
            <div className="review-fields">
              {structured.fields.map((f, i) => (
                <div className="review-field" key={f.key || i}>
                  <div className="review-field__key">{f.key || '(без ключа)'}</div>
                  <div className="review-field__value">{f.value || '—'}</div>
                  <div className="review-field__meta">
                    источник: {SOURCE_LABELS[f.source_type] ?? f.source_type} · уверенность:{' '}
                    {Math.round((f.confidence ?? 0) * 100)}% · статус:{' '}
                    {STATUS_LABELS[f.status] ?? f.status}
                  </div>
                  {f.comment && <div className="review-field__comment">{f.comment}</div>}
                </div>
              ))}
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

      {/* D. Clarifications */}
      {structured && (
        <section className="card review-section">
          <h3>3. Уточняющие вопросы</h3>
          {!clarifications ? (
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => run('clarify', () => api.generateClarifications(brief.id))}
              disabled={busy !== null}
            >
              {busy === 'clarify' ? 'Генерируем…' : 'Сгенерировать вопросы'}
            </button>
          ) : (
            <>
              {IMPORTANCE_ORDER.map((imp) => {
                const qs = clarifications.questions.filter((q) => q.importance === imp)
                if (!qs.length) return null
                return (
                  <div className="clarif-group" key={imp}>
                    <h4>{IMPORTANCE_LABELS[imp]}</h4>
                    {qs.map((q, i) => {
                      const key = q.id || q.field || `q${i}`
                      return (
                        <div className="clarif-q" key={key}>
                          <div className="clarif-q__text">{q.question}</div>
                          {q.field && <div className="clarif-q__field">поле: {q.field}</div>}
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

      {/* E. Final generation */}
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
