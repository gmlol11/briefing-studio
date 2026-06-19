import type { Brief } from '../api/types'

/** Статусы шага review-flow. */
export type ReviewStepStatus =
  | 'empty' // апстрим не готов, артефакта нет — шаг ещё «не наступил»
  | 'ready' // предусловия выполнены, можно действовать
  | 'needs_action' // артефакт есть, но нужно решение пользователя
  | 'processing' // выполняется AI/API-действие этого шага
  | 'done' // шаг завершён
  | 'blocked' // явный гейт, который чинится в другом месте

export type ReviewStepId = 'template' | 'summary' | 'structure' | 'clarifications' | 'final'

export interface ReviewStep {
  id: ReviewStepId
  title: string
  status: ReviewStepStatus
  hint?: string
}

/** Какому шагу принадлежит busy-ключ из BriefReviewPage. */
const BUSY_STEP: Record<string, ReviewStepId> = {
  'save-template': 'template',
  decompose: 'template',
  summarize: 'summary',
  verify: 'summary',
  structure: 'structure',
  clarify: 'clarifications',
  apply: 'clarifications',
  generate: 'final',
}

function hasBlockingFields(brief: Brief): boolean {
  const fields = brief.structured_brief_json?.fields ?? []
  return fields.some((f) => f.status === 'critical_missing' || f.status === 'conflict')
}

/**
 * Чистая функция: статусы 5 шагов review-flow из состояния брифа и текущего
 * busy-ключа. Без зависимостей от DOM — пригодна для будущих юнит-тестов.
 */
export function deriveSteps(brief: Brief, busy: string | null): ReviewStep[] {
  const proc = busy ? BUSY_STEP[busy] : null
  const hasRaw = !!brief.raw_input_text?.trim()
  const summary = brief.input_summary_json
  const verified = brief.is_input_summary_verified
  const structured = brief.structured_brief_json
  const clarifications = brief.clarifications_json
  const generated = !!brief.generated_markdown
  const outdated = brief.is_generated_outdated
  const blocking = hasBlockingFields(brief)

  // 1. Структура документа (шаблон)
  let template: ReviewStepStatus
  if (proc === 'template') template = 'processing'
  else if (brief.selected_template_json) template = 'done'
  else template = 'needs_action'

  // 2. Исходный бриф + Summary
  let summaryStatus: ReviewStepStatus
  if (proc === 'summary') summaryStatus = 'processing'
  else if (!hasRaw) summaryStatus = 'blocked'
  else if (!summary) summaryStatus = 'ready'
  else if (!verified) summaryStatus = 'needs_action'
  else summaryStatus = 'done'

  // 3. Структурирование
  let structure: ReviewStepStatus
  if (proc === 'structure') structure = 'processing'
  else if (!verified) structure = summary ? 'blocked' : 'empty'
  else if (!structured) structure = 'ready'
  else if (blocking) structure = 'needs_action'
  else structure = 'done'

  // 4. Уточнения (опционально)
  let clar: ReviewStepStatus
  if (proc === 'clarifications') clar = 'processing'
  else if (!structured) clar = 'empty'
  else if (!clarifications) clar = blocking ? 'needs_action' : 'ready'
  else clar = 'done'

  // 5. Финальный бриф
  let final: ReviewStepStatus
  if (proc === 'final') final = 'processing'
  else if (!structured) final = 'empty'
  else if (blocking) final = 'blocked'
  else if (!generated) final = 'ready'
  else if (outdated) final = 'needs_action'
  else final = 'done'

  return [
    { id: 'template', title: 'Структура документа', status: template,
      hint: 'Выберите/отредактируйте структуру итогового брифа' },
    { id: 'summary', title: 'Исходный бриф и summary', status: summaryStatus,
      hint: 'AI-summary клиентского ввода, требует подтверждения' },
    { id: 'structure', title: 'Структурирование', status: structure,
      hint: 'Поля брифа с источниками и статусами' },
    { id: 'clarifications', title: 'Уточнения', status: clar,
      hint: 'Уточняющие вопросы по пробелам и конфликтам' },
    { id: 'final', title: 'Финальный бриф', status: final,
      hint: 'Генерация итогового документа и экспорт' },
  ]
}

/** Шаг, на котором стоит сфокусироваться по умолчанию (первый незавершённый). */
export function defaultActiveStep(steps: ReviewStep[]): ReviewStepId {
  const open = steps.find((s) => s.status !== 'done')
  return (open ?? steps[steps.length - 1]).id
}
