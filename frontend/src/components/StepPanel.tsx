import type { ReactNode } from 'react'
import type { ReviewStep, ReviewStepStatus } from '../review/steps'

const STATUS_LABEL: Record<ReviewStepStatus, string> = {
  empty: 'не начат',
  ready: 'можно начать',
  needs_action: 'требует действия',
  processing: 'выполняется…',
  done: 'готово',
  blocked: 'заблокирован',
}

interface Props {
  step: ReviewStep
  children: ReactNode
  onPrevious: () => void
  onNext: () => void
  canPrevious: boolean
  canNext: boolean
  previousLabel?: string
  nextLabel?: string
}

/** Презентационная обёртка активного шага review: header + body + футер навигации.
 *  Не знает про brief/API — только отображает переданный шаг и контент. */
export default function StepPanel({
  step,
  children,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  previousLabel = '← Назад',
  nextLabel = 'Далее →',
}: Props) {
  return (
    <section className="card step-panel">
      <header className="step-panel-header">
        <h3>{step.title}</h3>
        <span className={`step-status step-status--${step.status}`}>
          {STATUS_LABEL[step.status]}
        </span>
      </header>
      {step.hint && <p className="step-panel-hint review-muted">{step.hint}</p>}
      <div className="step-panel-body">{children}</div>
      <footer className="step-panel-footer">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onPrevious}
          disabled={!canPrevious}
        >
          {previousLabel}
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={onNext}
          disabled={!canNext}
        >
          {nextLabel}
        </button>
      </footer>
    </section>
  )
}
