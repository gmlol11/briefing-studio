import { Link } from 'react-router-dom'
import type { Brief } from '../api/types'
import type { ReviewStep } from '../review/steps'

interface Props {
  brief: Brief
  steps: ReviewStep[]
}

/** Компактная сводка состояния брифа: прогресс шагов + ключевые флаги.
 *  Презентационный компонент — без API-вызовов, считает всё из brief/steps. */
export default function ReviewStateSummary({ brief, steps }: Props) {
  const done = steps.filter((s) => s.status === 'done').length
  const blockers = (brief.structured_brief_json?.fields ?? []).filter(
    (f) => f.status === 'critical_missing' || f.status === 'conflict',
  ).length
  const generated = !!brief.generated_markdown

  return (
    <div className="review-state-summary">
      <span className="summary-progress">
        {done}/{steps.length} шагов готово
      </span>
      <div className="summary-chips">
        <span className={`summary-chip${brief.selected_template_json ? ' summary-chip--ok' : ''}`}>
          {brief.selected_template_json ? 'Структура выбрана' : 'Стандартная структура'}
        </span>
        <span
          className={
            'summary-chip' +
            (brief.is_input_summary_verified ? ' summary-chip--ok' : ' summary-chip--warn')
          }
        >
          {brief.is_input_summary_verified ? 'Summary подтверждён' : 'Summary не подтверждён'}
        </span>
        {blockers > 0 && (
          <span className="summary-chip summary-chip--warn">Блокеров: {blockers}</span>
        )}
        {generated ? (
          brief.is_generated_outdated ? (
            <span className="summary-chip summary-chip--warn">Документ устарел</span>
          ) : (
            <span className="summary-chip summary-chip--ok">Документ актуален</span>
          )
        ) : (
          <span className="summary-chip">Не сгенерирован</span>
        )}
        {brief.brand_id != null && (
          <Link to={`/brands/${brief.brand_id}`} className="summary-chip summary-chip--link">
            Бренд
          </Link>
        )}
      </div>
    </div>
  )
}
