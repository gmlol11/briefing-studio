import type { BriefContext, BriefContextUpdate } from '../api/types'
import type { FieldDef } from './steps'

/** Прочитать значение поля шага по его ключу. */
export function readField(
  meta: { title: string; brief_type: string },
  context: BriefContext,
  key: string,
): string | string[] {
  if (key === 'title') return meta.title
  if (key === 'brief_type') return meta.brief_type
  if (key.startsWith('message_hierarchy.')) {
    const sub = key.split('.')[1] as keyof BriefContext['message_hierarchy']
    return context.message_hierarchy[sub]
  }
  return context[key as keyof BriefContext] as string | string[]
}

const cleanList = (v: string[]) => v.map((s) => s.trim()).filter(Boolean)

/** Собрать частичный объект для PATCH /context из контекстных полей шага. */
export function buildContextPartial(
  context: BriefContext,
  fields: FieldDef[],
): BriefContextUpdate {
  const partial: Record<string, unknown> = {}
  const meta = { title: '', brief_type: '' } // не используется для контекстных ключей

  for (const f of fields) {
    if (f.key === 'title' || f.key === 'brief_type') continue
    const raw = readField(meta, context, f.key)
    const value = f.kind === 'list' ? cleanList(raw as string[]) : raw

    if (f.key.startsWith('message_hierarchy.')) {
      const sub = f.key.split('.')[1]
      const mh = (partial.message_hierarchy as Record<string, unknown>) ?? {}
      mh[sub] = value
      partial.message_hierarchy = mh
    } else {
      partial[f.key] = value
    }
  }

  return partial as BriefContextUpdate
}
