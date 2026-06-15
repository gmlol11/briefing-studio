import type { ReactNode } from 'react'
import type { BriefContext, BriefStatus, BriefType } from '../api/types'
import { BRIEF_TYPE_LABELS, STATUS_LABELS, contextFieldLabel } from '../wizard/steps'
import {
  LIST_KEYS,
  LIVE_SECTIONS,
  briefProgress,
  isFieldFilled,
  sectionConfidence,
  sectionState,
  type LiveSectionDef,
} from '../wizard/sections'

interface LiveBriefPanelProps {
  title: string
  briefType: BriefType
  status: BriefStatus
  context: BriefContext
  currentStep: string
}

const CONF_LABEL = { high: 'высокая', med: 'средняя', low: 'низкая' } as const

function truncate(text: string, max = 130): string {
  const t = text.trim()
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

function Chips({ items }: { items: string[] }) {
  const list = items.map((s) => s.trim()).filter(Boolean)
  if (!list.length) return null
  return (
    <div className="lb-chips">
      {list.map((x, i) => (
        <span className="lb-chip" key={i}>
          {x}
        </span>
      ))}
    </div>
  )
}

function fieldValue(context: BriefContext, key: string): ReactNode {
  if (key === 'message_hierarchy') {
    const mh = context.message_hierarchy
    return (
      <>
        {mh.primary.trim() && <span className="lb-field-text">{truncate(mh.primary)}</span>}
        <Chips items={mh.secondary} />
      </>
    )
  }
  const value = context[key as keyof BriefContext]
  if (LIST_KEYS.has(key) && Array.isArray(value)) {
    return <Chips items={value} />
  }
  return <span className="lb-field-text">{truncate(String(value ?? ''))}</span>
}

function SectionCard({
  sec,
  context,
  currentStep,
}: {
  sec: LiveSectionDef
  context: BriefContext
  currentStep: string
}) {
  const state = sectionState(context, sec, currentStep)
  const confidence = sectionConfidence(context, sec)
  const filledFields = sec.fields.filter((f) => isFieldFilled(context, f))

  let badge: ReactNode
  if (state === 'filling') {
    badge = <span className="lb-conf lb-conf--filling">заполняется</span>
  } else if (confidence) {
    badge = (
      <span className={`lb-conf lb-conf--${confidence}`}>
        confidence · {CONF_LABEL[confidence]}
      </span>
    )
  } else {
    badge = <span className="lb-conf lb-conf--low">нет данных</span>
  }

  return (
    <div className={`lb-section lb-section--${state}`}>
      <div className="lb-section__head">
        <div className="lb-section__title">
          <span className="lb-section__num">{sec.n}</span>
          {sec.title}
        </div>
        {badge}
      </div>
      <div className="lb-section__body">
        {filledFields.length > 0 ? (
          filledFields.map((f) => (
            <div className="lb-field" key={f}>
              <span className="lb-field-label">{contextFieldLabel(f)}</span>
              {fieldValue(context, f)}
            </div>
          ))
        ) : state === 'filling' ? (
          <p className="lb-soft">Заполняется сейчас…</p>
        ) : (
          <p className="lb-soft">Пока нет данных</p>
        )}
      </div>
    </div>
  )
}

/** Live brief: правая панель с секциями, прогрессом и confidence (всё на frontend). */
export default function LiveBriefPanel({
  title,
  briefType,
  status,
  context,
  currentStep,
}: LiveBriefPanelProps) {
  const progress = briefProgress(context)

  return (
    <aside className="live-brief card">
      <div className="live-brief__head">
        <h3>Live brief</h3>
        <span className={`badge badge--${status}`}>{STATUS_LABELS[status]}</span>
      </div>

      <div className="live-brief__title">{title || 'Без названия'}</div>
      <div className="live-brief__type">{BRIEF_TYPE_LABELS[briefType]}</div>

      <div className="lb-progress">
        <div className="lb-progress__head">
          <span>Бриф заполнен</span>
          <span>
            <b>{progress}</b>%
          </span>
        </div>
        <div className="lb-progress__bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="lb-sections">
        {LIVE_SECTIONS.map((sec) => (
          <SectionCard key={sec.id} sec={sec} context={context} currentStep={currentStep} />
        ))}
      </div>
    </aside>
  )
}
