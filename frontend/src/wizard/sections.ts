import type { BriefContext } from '../api/types'

export type SectionState = 'empty' | 'filling' | 'filled'
export type Confidence = 'high' | 'med' | 'low'

export interface LiveSectionDef {
  id: string
  n: number
  title: string
  /** Ключи context_json, относящиеся к секции ('message_hierarchy' — особый). */
  fields: string[]
  /** id шагов wizard, при которых секция считается «заполняется сейчас». */
  steps: string[]
}

/** 8 секций live-brief. Считаются на frontend из context_json и current_step. */
export const LIVE_SECTIONS: LiveSectionDef[] = [
  { id: 'goal', n: 1, title: 'Цель', fields: ['main_goal', 'promotion_object'], steps: ['goal'] },
  {
    id: 'context',
    n: 2,
    title: 'Контекст',
    fields: ['author_role', 'task_type', 'result_format', 'usage_context'],
    steps: ['basics'],
  },
  {
    id: 'messages',
    n: 3,
    title: 'Сообщения',
    fields: ['key_messages', 'message_hierarchy'],
    steps: ['messages'],
  },
  {
    id: 'ai',
    n: 4,
    title: 'AI / технология',
    fields: ['technology_role', 'production_principle'],
    steps: ['style'],
  },
  {
    id: 'style',
    n: 5,
    title: 'Визуал и тональность',
    fields: ['visual_context', 'tone', 'anti_tone'],
    steps: ['style'],
  },
  {
    id: 'constraints',
    n: 6,
    title: "Must have / Don't",
    fields: ['must_have', 'restrictions'],
    steps: ['constraints'],
  },
  {
    id: 'result',
    n: 7,
    title: 'Результат',
    fields: ['dramaturgy', 'final_frame_or_cta', 'deliverables'],
    steps: ['output'],
  },
  {
    id: 'kpi',
    n: 8,
    title: 'KPI и вопросы',
    fields: ['kpi', 'assumptions', 'open_questions'],
    steps: ['output'],
  },
]

const LIST_KEYS = new Set([
  'key_messages',
  'must_have',
  'restrictions',
  'deliverables',
  'kpi',
  'assumptions',
  'open_questions',
])

export function isFieldFilled(context: BriefContext, key: string): boolean {
  if (key === 'message_hierarchy') {
    const mh = context.message_hierarchy
    return (
      mh.primary.trim().length > 0 ||
      mh.secondary.some((s) => s.trim()) ||
      mh.background.some((s) => s.trim())
    )
  }
  const value = context[key as keyof BriefContext]
  if (Array.isArray(value)) return value.some((s) => s.trim())
  return typeof value === 'string' && value.trim().length > 0
}

export function sectionFilledCount(context: BriefContext, sec: LiveSectionDef): number {
  return sec.fields.filter((f) => isFieldFilled(context, f)).length
}

export function sectionState(
  context: BriefContext,
  sec: LiveSectionDef,
  currentStep: string,
): SectionState {
  if (sec.steps.includes(currentStep)) return 'filling'
  return sectionFilledCount(context, sec) > 0 ? 'filled' : 'empty'
}

/** confidence по доле заполненных полей секции; null — если пусто. */
export function sectionConfidence(
  context: BriefContext,
  sec: LiveSectionDef,
): Confidence | null {
  const filled = sectionFilledCount(context, sec)
  if (filled === 0) return null
  const ratio = filled / sec.fields.length
  if (ratio >= 0.66) return 'high'
  if (ratio >= 0.34) return 'med'
  return 'low'
}

/** Общий прогресс заполнения брифа (0–100) по всем секциям. */
export function briefProgress(context: BriefContext): number {
  let filled = 0
  let total = 0
  for (const sec of LIVE_SECTIONS) {
    total += sec.fields.length
    filled += sectionFilledCount(context, sec)
  }
  return total ? Math.round((filled / total) * 100) : 0
}

export { LIST_KEYS }
