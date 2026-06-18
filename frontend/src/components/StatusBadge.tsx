import type { FieldStatus } from '../api/types'

const LABELS: Record<FieldStatus, string> = {
  confirmed: 'Подтверждено',
  confirmed_by_brand: 'Из бренда',
  needs_confirmation: 'Нужно подтвердить',
  critical_missing: 'Критично: нет данных',
  optional_missing: 'Желательно уточнить',
  conflict: 'Конфликт',
  rejected: 'Отклонено',
}

/** Бейдж статуса поля структурированного брифа с RU-подписью. */
export default function StatusBadge({ status }: { status: FieldStatus }) {
  return (
    <span className={`status-badge status-badge--${status}`}>{LABELS[status] ?? status}</span>
  )
}
