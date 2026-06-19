import type { ReviewStep, ReviewStepId, ReviewStepStatus } from '../review/steps'

const STATUS_ICON: Record<ReviewStepStatus, string> = {
  empty: '○',
  ready: '◆',
  needs_action: '!',
  processing: '⟳',
  done: '✓',
  blocked: '🔒',
}

const STATUS_LABEL: Record<ReviewStepStatus, string> = {
  empty: 'не начат',
  ready: 'можно начать',
  needs_action: 'требует действия',
  processing: 'выполняется…',
  done: 'готово',
  blocked: 'заблокирован',
}

interface Props {
  steps: ReviewStep[]
  activeId: ReviewStepId
  onSelect: (id: ReviewStepId) => void
}

/** Горизонтальный stepper для review-flow: статус каждого шага + переход кликом. */
export default function ReviewStepper({ steps, activeId, onSelect }: Props) {
  return (
    <nav className="review-stepper" aria-label="Шаги работы над брифом">
      {steps.map((step, i) => (
        <button
          key={step.id}
          type="button"
          className={
            `review-step review-step--${step.status}` +
            (step.id === activeId ? ' review-step--active' : '')
          }
          onClick={() => onSelect(step.id)}
          title={step.hint ?? STATUS_LABEL[step.status]}
          aria-current={step.id === activeId ? 'step' : undefined}
        >
          <span className="review-step__num">{i + 1}</span>
          <span className="review-step__title">{step.title}</span>
          <span
            className={`review-step__status review-step__status--${step.status}`}
            aria-label={STATUS_LABEL[step.status]}
          >
            {STATUS_ICON[step.status]}
          </span>
        </button>
      ))}
    </nav>
  )
}
