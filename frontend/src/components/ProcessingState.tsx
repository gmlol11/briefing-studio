interface Props {
  message: string
  detail?: string
}

/** Индикатор выполнения AI/API-действия внутри активного шага review. */
export default function ProcessingState({ message, detail }: Props) {
  return (
    <div className="processing-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <div>
        <div className="processing-state__msg">{message}</div>
        {detail && <div className="processing-state__detail review-muted">{detail}</div>}
      </div>
    </div>
  )
}
