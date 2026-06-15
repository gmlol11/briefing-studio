import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Brief, BriefContext, BriefStatus, BriefType } from '../api/types'
import { api } from '../api/client'
import { STEPS, stepIndexById } from '../wizard/steps'
import { buildContextPartial, readField } from '../wizard/context'
import Field from './Field'
import LiveBriefPanel from './LiveBriefPanel'
import BriefDocument from './BriefDocument'
import AiActions from './AiActions'

interface BriefWizardProps {
  brief: Brief
}

/** Рабочий wizard: пошаговое заполнение брифа с сохранением в backend. */
export default function BriefWizard({ brief }: BriefWizardProps) {
  const navigate = useNavigate()

  const [meta, setMeta] = useState<{ title: string; brief_type: BriefType }>({
    title: brief.title,
    brief_type: brief.brief_type,
  })
  const [context, setContext] = useState<BriefContext>(brief.context_json)
  const [status, setStatus] = useState<BriefStatus>(brief.status)
  const [generatedMarkdown, setGeneratedMarkdown] = useState<string | null>(
    brief.generated_markdown,
  )
  const [isOutdated, setIsOutdated] = useState(brief.is_generated_outdated)
  const [stepIndex, setStepIndex] = useState<number>(stepIndexById(brief.current_step))
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const step = STEPS[stepIndex]
  const isFirst = stepIndex === 0
  const isLast = stepIndex === STEPS.length - 1

  const handleFieldChange = (key: string, value: string | string[]) => {
    if (key === 'title') {
      setMeta((m) => ({ ...m, title: value as string }))
    } else if (key === 'brief_type') {
      setMeta((m) => ({ ...m, brief_type: value as BriefType }))
    } else if (key.startsWith('message_hierarchy.')) {
      const sub = key.split('.')[1] as keyof BriefContext['message_hierarchy']
      setContext((c) => ({
        ...c,
        message_hierarchy: { ...c.message_hierarchy, [sub]: value },
      }))
    } else {
      setContext((c) => ({ ...c, [key]: value }))
    }
  }

  /** Сохранить данные текущего шага: мета-поля и/или context. */
  const persistStep = async () => {
    const hasTitleOrType = step.fields.some(
      (f) => f.key === 'title' || f.key === 'brief_type',
    )
    if (hasTitleOrType) {
      await api.updateBrief(brief.id, {
        title: meta.title.trim() || 'Новый бриф',
        brief_type: meta.brief_type,
      })
    }

    const contextFields = step.fields.filter(
      (f) => f.key !== 'title' && f.key !== 'brief_type',
    )
    if (contextFields.length) {
      const updated = await api.updateBriefContext(
        brief.id,
        buildContextPartial(context, contextFields),
      )
      // синхронизируем локальный контекст с нормализованным ответом backend
      setContext(updated.context_json)
      setIsOutdated(updated.is_generated_outdated)
    }
  }

  const goToStep = async (targetIndex: number) => {
    if (targetIndex === stepIndex || saving) return
    setSaving(true)
    setError(null)
    try {
      await persistStep()

      const nextStatus: BriefStatus = status === 'draft' ? 'in_progress' : status
      await api.updateBrief(brief.id, {
        current_step: STEPS[targetIndex].id,
        ...(nextStatus !== status ? { status: nextStatus } : {}),
      })
      setStatus(nextStatus)
      setStepIndex(targetIndex)
      setJustSaved(true)
      window.setTimeout(() => setJustSaved(false), 2200)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const finish = async () => {
    setSaving(true)
    setError(null)
    try {
      await persistStep()
      navigate('/briefs')
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  return (
    <div className="brief-layout">
      <div className="wizard-main">
        <div className="progress">
          <div className="progress__bar">
            <div
              className="progress__bar-fill"
              style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
            />
          </div>
          <div className="progress__steps">
            {STEPS.map((s, i) => (
              <button
                type="button"
                key={s.id}
                className={
                  'progress__step' +
                  (i === stepIndex ? ' progress__step--active' : '') +
                  (i < stepIndex ? ' progress__step--done' : '')
                }
                onClick={() => goToStep(i)}
                disabled={saving}
              >
                <span className="progress__step-num">{i + 1}</span>
                <span className="progress__step-title">{s.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="card wizard-card">
          <div className="wizard-card__head">
            <span className="wizard-card__step">
              Шаг {stepIndex + 1} из {STEPS.length}
            </span>
            <h2>{step.title}</h2>
            {step.description && <p>{step.description}</p>}
          </div>

          {step.id === 'preview' ? (
            <div className="doc-frame">
              <BriefDocument
                title={meta.title}
                briefType={meta.brief_type}
                context={context}
              />
            </div>
          ) : (
            <div className="wizard-card__fields">
              {step.fields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={readField(meta, context, field.key)}
                  onChange={(value) => handleFieldChange(field.key, value)}
                />
              ))}
            </div>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="wizard-card__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => goToStep(stepIndex - 1)}
              disabled={isFirst || saving}
            >
              Назад
            </button>
            <span className={'saved-indicator' + (justSaved ? ' saved-indicator--show' : '')}>
              Сохранено ✓
            </span>
            {isLast ? (
              <button
                type="button"
                className="btn btn--primary"
                onClick={finish}
                disabled={saving}
              >
                {saving ? 'Сохранение…' : 'Готово'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary"
                onClick={() => goToStep(stepIndex + 1)}
                disabled={saving}
              >
                {saving ? 'Сохранение…' : 'Далее'}
              </button>
            )}
          </div>
        </div>

        {step.id === 'preview' && (
          <AiActions
            briefId={brief.id}
            status={status}
            generatedMarkdown={generatedMarkdown}
            isOutdated={isOutdated}
            onGenerated={(updated) => {
              setStatus(updated.status)
              setGeneratedMarkdown(updated.generated_markdown)
              setIsOutdated(updated.is_generated_outdated)
            }}
          />
        )}
      </div>

      <LiveBriefPanel
        title={meta.title}
        briefType={meta.brief_type}
        status={status}
        context={context}
        currentStep={step.id}
      />
    </div>
  )
}
