import { useEffect, useRef, useState } from 'react'
import type { Brief, BriefAnalysis, BriefExportFormat, BriefStatus } from '../api/types'
import { api, ApiError } from '../api/client'
import { STATUS_LABELS, contextFieldLabel } from '../wizard/steps'
import BriefVersions from './BriefVersions'
import MarkdownView from './MarkdownView'

interface AiActionsProps {
  briefId: number
  status: BriefStatus
  generatedMarkdown: string | null
  isOutdated: boolean
  onGenerated: (brief: Brief) => void
}

const LLM_NOT_CONFIGURED_MESSAGE =
  'LLM пока не настроена. Добавьте LLM_API_KEY, LLM_BASE_URL и LLM_MODEL в .env.'

const GEN_STEPS = [
  'Проверяем контекст',
  'Собираем структуру',
  'Генерируем бриф',
  'Сохраняем версию',
]

type GenPhase = 'idle' | 'running' | 'done' | 'error'

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

function ChipGroup({ title, fields, tone }: { title: string; fields: string[]; tone: string }) {
  if (!fields.length) return null
  return (
    <div className="ai-group">
      <h4>{title}</h4>
      <div className="chips">
        {fields.map((f) => (
          <span key={f} className={`chip chip--${tone}`}>
            {contextFieldLabel(f)}
          </span>
        ))}
      </div>
    </div>
  )
}

function NoteCards({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null
  return (
    <div className="ai-group">
      <h4>{title}</h4>
      <div className="ai-notes">
        {items.map((item, i) => (
          <div className={`ai-note ai-note--${tone}`} key={i}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

/** AI-проверка и генерация: анализ, генерация (с gen-steps), экспорт, версии. */
export default function AiActions({
  briefId,
  status,
  generatedMarkdown,
  isOutdated,
  onGenerated,
}: AiActionsProps) {
  const [analysis, setAnalysis] = useState<BriefAnalysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [generationCount, setGenerationCount] = useState(0)

  const [genPhase, setGenPhase] = useState<GenPhase>('idle')
  const [genActive, setGenActive] = useState(0)
  const intervalRef = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearInterval(intervalRef.current), [])

  const busy = analyzing || genPhase === 'running'

  const toMessage = (e: unknown) =>
    e instanceof ApiError && e.status === 503 ? LLM_NOT_CONFIGURED_MESSAGE : (e as Error).message

  const analyze = async () => {
    setAnalyzing(true)
    setError(null)
    try {
      setAnalysis(await api.analyzeBrief(briefId))
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setAnalyzing(false)
    }
  }

  const generate = async () => {
    setError(null)
    setGenPhase('running')
    setGenActive(0)
    // прогресс-индикатор пайплайна во время реального запроса (без искусственных пауз в самом запросе)
    intervalRef.current = window.setInterval(() => {
      setGenActive((a) => Math.min(a + 1, GEN_STEPS.length - 1))
    }, 650)
    try {
      const updated = await api.generateBrief(briefId)
      window.clearInterval(intervalRef.current)
      setGenActive(GEN_STEPS.length)
      setGenPhase('done')
      onGenerated(updated)
      setGenerationCount((c) => c + 1)
    } catch (e) {
      window.clearInterval(intervalRef.current)
      setGenPhase('error')
      setError(toMessage(e))
    }
  }

  const copyMarkdown = async () => {
    if (!generatedMarkdown) return
    if (await copyText(generatedMarkdown)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const downloadExport = async (format: BriefExportFormat) => {
    setError(null)
    try {
      const blob = await api.exportBrief(briefId, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = format === 'markdown' ? 'md' : format
      a.download = `brief-${briefId}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const scorePercent = analysis ? Math.round(analysis.completion_score * 100) : 0

  const genRowState = (i: number): string => {
    if (genPhase === 'done') return 'done'
    if (genPhase === 'error') return i < genActive ? 'done' : i === genActive ? 'error' : ''
    if (i < genActive) return 'done'
    if (i === genActive) return 'in-progress'
    return ''
  }

  return (
    <section className="card ai-actions">
      <div className="ai-actions__head">
        <h3>AI-проверка и генерация</h3>
        <p>Проверьте готовность брифа и соберите финальный документ.</p>
      </div>

      <div className="ai-actions__buttons">
        <button type="button" className="btn btn--ghost" onClick={analyze} disabled={busy}>
          {analyzing ? 'Анализируем…' : 'Проанализировать бриф'}
        </button>
        <button type="button" className="btn btn--primary" onClick={generate} disabled={busy}>
          {genPhase === 'running'
            ? 'Генерируем…'
            : generatedMarkdown
              ? 'Перегенерировать бриф'
              : 'Сгенерировать бриф'}
        </button>
      </div>

      {error && <div className="form-error">{error}</div>}

      {isOutdated && (
        <div className="hint-banner">
          <span className="hint-banner__icon">⟳</span>
          Контекст изменился после последней генерации. Рекомендуется сгенерировать бриф заново.
        </div>
      )}

      {genPhase !== 'idle' && (
        <div className="gen-steps">
          {GEN_STEPS.map((label, i) => {
            const st = genRowState(i)
            return (
              <div className={`gen-row ${st}`} key={label}>
                <span className="gen-icon">
                  {st === 'in-progress' ? (
                    <span className="spinner" />
                  ) : st === 'done' ? (
                    '✓'
                  ) : st === 'error' ? (
                    '!'
                  ) : (
                    i + 1
                  )}
                </span>
                <span className="gen-text">{label}</span>
              </div>
            )
          })}
        </div>
      )}

      {analysis && (
        <div className="ai-analysis">
          <div className="ai-score">
            <div className="ai-score__track">
              <div className="ai-score__fill" style={{ width: `${scorePercent}%` }} />
            </div>
            <span className="ai-score__value">{scorePercent}%</span>
          </div>

          {analysis.summary && <p className="ai-analysis__summary">{analysis.summary}</p>}

          <ChipGroup title="Что уже хорошо" fields={analysis.strong_fields} tone="good" />
          <ChipGroup title="Что стоит уточнить" fields={analysis.weak_fields} tone="warn" />
          <ChipGroup title="Не хватает" fields={analysis.missing_fields} tone="bad" />

          {analysis.clarifying_questions.length > 0 && (
            <div className="ai-group">
              <h4>Вопросы для усиления брифа</h4>
              <div className="ai-questions">
                {analysis.clarifying_questions.map((q, i) => (
                  <div className="ai-question" key={i}>
                    <div className="ai-question__field">{contextFieldLabel(q.field)}</div>
                    <div className="ai-question__text">{q.question}</div>
                    {q.options.length > 0 && (
                      <div className="chips">
                        {q.options.map((opt) => (
                          <span key={opt} className="chip">
                            {opt}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <NoteCards title="Допущения" items={analysis.assumptions} tone="assume" />
          <NoteCards title="Риски" items={analysis.risks} tone="risk" />
        </div>
      )}

      {generatedMarkdown && (
        <div className="ai-markdown">
          <div className="ai-markdown__head">
            <h4>Сгенерированный бриф</h4>
            <div className="ai-markdown__controls">
              <span className="badge badge--brand">AI-generated</span>
              <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>
            </div>
          </div>
          <div className="ai-markdown__controls ai-markdown__controls--row">
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
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => downloadExport('docx')}
            >
              Download DOCX
            </button>
          </div>
          <div className="doc-frame">
            <MarkdownView markdown={generatedMarkdown} />
          </div>
        </div>
      )}

      <BriefVersions briefId={briefId} refreshToken={generationCount} />
    </section>
  )
}
