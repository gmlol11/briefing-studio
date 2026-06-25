import type { BriefTemplate } from '../api/types'

/**
 * Человекочитаемые подписи для технических ключей структурированных полей.
 * Используются как fallback, когда в выбранном шаблоне нет label для ключа.
 */
export const FIELD_LABELS: Record<string, string> = {
  product_or_object: 'Продукт / объект продвижения',
  tone_of_voice: 'Тон коммуникации',
  mandatories: 'Обязательные требования',
  restrictions: 'Ограничения',
  deliverables: 'Форматы / материалы',
  channels: 'Каналы коммуникации',
  budget: 'Бюджет',
  deadline: 'Сроки',
  kpi: 'KPI',
  key_message: 'Ключевое сообщение',
  target_audience: 'Целевая аудитория',
  main_goal: 'Главная цель',
}

/** snake_case / kebab-case → «Capitalized words» (sentence case), без сырого snake_case. */
export function prettifyKey(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length) return key
  return words
    .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/**
 * Подпись поля для UI: label из выбранного шаблона → fallback mapping → prettify.
 * Технический key при этом не теряется — его выводят отдельным secondary-текстом.
 */
export function resolveFieldLabel(key: string, template?: BriefTemplate | null): string {
  if (!key) return '(без ключа)'
  if (template) {
    for (const section of template.sections) {
      const field = section.fields.find((f) => f.key === key)
      if (field && field.label.trim()) return field.label.trim()
    }
  }
  return FIELD_LABELS[key] ?? prettifyKey(key)
}
