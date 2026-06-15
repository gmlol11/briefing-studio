import type { BriefStatus, BriefType } from '../api/types'

export type FieldKind = 'select' | 'text' | 'textarea' | 'list'

export interface FieldDef {
  /** 'title' | 'brief_type' | context-ключ | 'message_hierarchy.<sub>' */
  key: string
  label: string
  kind: FieldKind
  placeholder?: string
  hint?: string
  options?: { value: string; label: string }[]
}

export interface StepDef {
  id: string
  title: string
  description?: string
  fields: FieldDef[]
}

export const BRIEF_TYPE_OPTIONS: { value: BriefType; label: string }[] = [
  { value: 'creative', label: 'Креативный' },
  { value: 'client', label: 'Клиентский' },
  { value: 'production', label: 'Продакшн' },
  { value: 'ai_production', label: 'AI-продакшн' },
  { value: 'landing', label: 'Лендинг' },
  { value: 'video', label: 'Видео' },
  { value: 'presentation', label: 'Презентация' },
  { value: 'campaign', label: 'Кампания' },
  { value: 'custom', label: 'Другое' },
]

export const BRIEF_TYPE_LABELS: Record<BriefType, string> = Object.fromEntries(
  BRIEF_TYPE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<BriefType, string>

export const STATUS_LABELS: Record<BriefStatus, string> = {
  draft: 'Черновик',
  in_progress: 'В работе',
  generated: 'Сгенерирован',
  archived: 'В архиве',
}

export const STEPS: StepDef[] = [
  {
    id: 'brief_type',
    title: 'Тип задачи',
    description: 'Определяем формат будущего брифа и базовый сценарий работы.',
    fields: [
      {
        key: 'brief_type',
        label: 'Тип брифа',
        kind: 'select',
        options: BRIEF_TYPE_OPTIONS,
      },
      {
        key: 'title',
        label: 'Название брифа',
        kind: 'text',
        placeholder: 'Например: Промо нового продукта',
      },
    ],
  },
  {
    id: 'basics',
    title: 'Основные вводные',
    description: 'Фиксируем, кто ставит задачу, что создаём и где это будет использоваться.',
    fields: [
      {
        key: 'author_role',
        label: 'Роль автора',
        kind: 'text',
        placeholder: 'От чьего лица составляется бриф',
      },
      { key: 'task_type', label: 'Тип задачи', kind: 'text' },
      { key: 'result_format', label: 'Формат результата', kind: 'text' },
      { key: 'usage_context', label: 'Контекст использования', kind: 'textarea' },
    ],
  },
  {
    id: 'goal',
    title: 'Цель и объект',
    description: 'Отделяем главную цель от второстепенных ожиданий.',
    fields: [
      { key: 'main_goal', label: 'Главная цель', kind: 'textarea' },
      { key: 'promotion_object', label: 'Объект продвижения', kind: 'text' },
    ],
  },
  {
    id: 'messages',
    title: 'Сообщения',
    description: 'Собираем ключевые смыслы и задаём их иерархию.',
    fields: [
      { key: 'key_messages', label: 'Ключевые сообщения', kind: 'list' },
      {
        key: 'message_hierarchy.primary',
        label: 'Главное сообщение',
        kind: 'text',
      },
      {
        key: 'message_hierarchy.secondary',
        label: 'Вторичные сообщения',
        kind: 'list',
      },
      {
        key: 'message_hierarchy.background',
        label: 'Фоновые сообщения',
        kind: 'list',
      },
    ],
  },
  {
    id: 'style',
    title: 'Стиль и тональность',
    description: 'Определяем, как материал должен ощущаться визуально и по голосу.',
    fields: [
      { key: 'visual_context', label: 'Визуальный контекст', kind: 'textarea' },
      { key: 'tone', label: 'Тональность', kind: 'text' },
      {
        key: 'anti_tone',
        label: 'Анти-тональность',
        kind: 'text',
        hint: 'Чего точно нужно избегать в тоне',
      },
      { key: 'technology_role', label: 'Роль технологий', kind: 'text' },
      { key: 'production_principle', label: 'Принцип продакшна', kind: 'text' },
    ],
  },
  {
    id: 'constraints',
    title: 'Must have / Don’t',
    description: 'Фиксируем обязательные элементы и ограничения.',
    fields: [
      { key: 'must_have', label: 'Обязательно (must have)', kind: 'list' },
      { key: 'restrictions', label: 'Ограничения (don’t)', kind: 'list' },
    ],
  },
  {
    id: 'output',
    title: 'Результат',
    description: 'Описываем структуру, deliverables и критерии успеха.',
    fields: [
      { key: 'dramaturgy', label: 'Драматургия', kind: 'textarea' },
      { key: 'final_frame_or_cta', label: 'Финальный кадр / CTA', kind: 'textarea' },
      { key: 'deliverables', label: 'Деливераблы', kind: 'list' },
      { key: 'kpi', label: 'KPI', kind: 'list' },
      {
        key: 'detail_level',
        label: 'Уровень детализации',
        kind: 'text',
        hint: 'Насколько подробным должен быть итоговый бриф',
      },
    ],
  },
  {
    id: 'preview',
    title: 'Предпросмотр',
    description: 'Проверяем собранный контекст перед AI-анализом и генерацией.',
    fields: [],
  },
]

export const STEP_IDS = STEPS.map((s) => s.id)

export function stepIndexById(id: string): number {
  const idx = STEP_IDS.indexOf(id)
  return idx >= 0 ? idx : 0
}

const CONTEXT_FIELD_LABELS: Record<string, string> = {
  ...Object.fromEntries(STEPS.flatMap((s) => s.fields.map((f) => [f.key, f.label]))),
  message_hierarchy: 'Иерархия сообщений',
  assumptions: 'Допущения',
  open_questions: 'Открытые вопросы',
}

/** Русское название поля context_json (для AI-анализа); fallback — сам ключ. */
export function contextFieldLabel(key: string): string {
  return CONTEXT_FIELD_LABELS[key] ?? key
}
