import type { SourceType } from '../api/types'

const LABELS: Record<SourceType, string> = {
  brand_bible: 'Бренд-библия',
  client_brief: 'Клиентский бриф',
  transcript: 'Транскрипт',
  manager_note: 'Заметка менеджера',
  inference: 'Домысел AI',
  internet: 'Интернет',
  user_edit: 'Правка пользователя',
  unknown: 'Неизвестно',
}

/** Бейдж происхождения значения (source_type) с RU-подписью. */
export default function SourceBadge({ source }: { source: SourceType }) {
  return (
    <span className={`source-badge source-badge--${source}`}>{LABELS[source] ?? source}</span>
  )
}
