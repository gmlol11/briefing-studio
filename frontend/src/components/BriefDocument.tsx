import type { ReactNode } from 'react'
import type { BriefContext, BriefType } from '../api/types'
import { BRIEF_TYPE_LABELS } from '../wizard/steps'

interface BriefDocumentProps {
  title: string
  briefType: BriefType
  context: BriefContext
}

const clean = (items: string[]) => items.map((s) => s.trim()).filter(Boolean)

function Para({ value }: { value: string }) {
  return value.trim() ? (
    <p>{value}</p>
  ) : (
    <p className="doc-empty">Не заполнено</p>
  )
}

function Bullets({ items, empty = 'Не заполнено' }: { items: string[]; empty?: string }) {
  const list = clean(items)
  if (!list.length) return <p className="doc-empty">{empty}</p>
  return (
    <ul>
      {list.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  if (!value.trim()) return null
  return (
    <p className="doc-meta-row">
      <span className="doc-meta-label">{label}:</span> {value}
    </p>
  )
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="doc-section">
      <h2>
        <span className="doc-section__num">{String(n).padStart(2, '0')}</span>
        {title}
      </h2>
      <div className="doc-section__body">{children}</div>
    </section>
  )
}

/** Черновой бриф из context_json в документном виде (17 разделов). */
export default function BriefDocument({ title, briefType, context }: BriefDocumentProps) {
  const c = context
  const mh = c.message_hierarchy
  const hierarchyEmpty =
    !mh.primary.trim() && !clean(mh.secondary).length && !clean(mh.background).length

  return (
    <div className="doc">
      <div className="doc__meta">
        <span>{BRIEF_TYPE_LABELS[briefType]} · черновик</span>
      </div>
      <h1 className="doc__title">{title || 'Без названия'}</h1>

      <Section n={1} title="Контекст">
        <Para value={c.usage_context} />
        <MetaRow label="Роль автора" value={c.author_role} />
        <MetaRow label="Формат результата" value={c.result_format} />
      </Section>

      <Section n={2} title="Главная цель">
        <Para value={c.main_goal} />
      </Section>

      <Section n={3} title="Коммуникационная задача">
        <Para value={c.task_type} />
      </Section>

      <Section n={4} title="Объект продвижения">
        <Para value={c.promotion_object} />
      </Section>

      <Section n={5} title="Ключевые сообщения">
        <Bullets items={c.key_messages} />
      </Section>

      <Section n={6} title="Иерархия сообщений">
        {hierarchyEmpty ? (
          <p className="doc-empty">Не заполнено</p>
        ) : (
          <>
            {mh.primary.trim() && (
              <p>
                <span className="doc-meta-label">Главное:</span> {mh.primary}
              </p>
            )}
            {clean(mh.secondary).length > 0 && (
              <>
                <p className="doc-sub">Вторичные</p>
                <Bullets items={mh.secondary} />
              </>
            )}
            {clean(mh.background).length > 0 && (
              <>
                <p className="doc-sub">Фоновые</p>
                <Bullets items={mh.background} />
              </>
            )}
          </>
        )}
      </Section>

      <Section n={7} title="Роль AI / технологии">
        <Para value={c.technology_role} />
      </Section>

      <Section n={8} title="Визуальный подход">
        <Para value={c.visual_context} />
      </Section>

      <Section n={9} title="Тональность">
        <Para value={c.tone} />
        <MetaRow label="Избегать" value={c.anti_tone} />
      </Section>

      <Section n={10} title="Must have">
        <Bullets items={c.must_have} />
      </Section>

      <Section n={11} title="Don’t">
        <Bullets items={c.restrictions} />
      </Section>

      <Section n={12} title="Драматургия">
        <Para value={c.dramaturgy} />
      </Section>

      <Section n={13} title="Финальный кадр / CTA">
        <Para value={c.final_frame_or_cta} />
      </Section>

      <Section n={14} title="Production-принцип">
        <Para value={c.production_principle} />
      </Section>

      <Section n={15} title="Deliverables">
        <Bullets items={c.deliverables} />
      </Section>

      <Section n={16} title="KPI">
        <Bullets items={c.kpi} />
      </Section>

      <Section n={17} title="Допущения и открытые вопросы">
        {clean(c.assumptions).length === 0 && clean(c.open_questions).length === 0 ? (
          <p className="doc-empty">Не заполнено</p>
        ) : (
          <>
            {clean(c.assumptions).length > 0 && (
              <>
                <p className="doc-sub">Допущения</p>
                <Bullets items={c.assumptions} />
              </>
            )}
            {clean(c.open_questions).length > 0 && (
              <>
                <p className="doc-sub">Открытые вопросы</p>
                <Bullets items={c.open_questions} />
              </>
            )}
          </>
        )}
      </Section>
    </div>
  )
}
