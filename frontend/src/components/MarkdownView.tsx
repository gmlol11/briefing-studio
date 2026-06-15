import type { ReactNode } from 'react'

interface MarkdownViewProps {
  markdown: string
}

/** Инлайн-разметка: **жирный**. Возвращает массив React-нод (без dangerouslySetInnerHTML). */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = []
  const re = /\*\*(.+?)\*\*/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    nodes.push(<strong key={i++}>{m[1]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/**
 * Лёгкий рендер markdown в документном стиле (заголовки, списки, абзацы, **жирный**).
 * Покрывает структуру, которую отдаёт generate-промпт; код-блоки не нужны.
 */
export default function MarkdownView({ markdown }: MarkdownViewProps) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let list: string[] = []
  let key = 0

  const flushList = () => {
    if (list.length) {
      const items = [...list]
      blocks.push(
        <ul key={key++}>
          {items.map((it, i) => (
            <li key={i}>{renderInline(it)}</li>
          ))}
        </ul>,
      )
      list = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) {
      flushList()
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      list.push(trimmed.replace(/^[-*]\s+/, ''))
      continue
    }
    flushList()
    if (/^###\s+/.test(trimmed)) {
      blocks.push(<h3 key={key++}>{renderInline(trimmed.replace(/^###\s+/, ''))}</h3>)
    } else if (/^##\s+/.test(trimmed)) {
      blocks.push(<h2 key={key++}>{renderInline(trimmed.replace(/^##\s+/, ''))}</h2>)
    } else if (/^#\s+/.test(trimmed)) {
      blocks.push(<h1 key={key++}>{renderInline(trimmed.replace(/^#\s+/, ''))}</h1>)
    } else {
      blocks.push(<p key={key++}>{renderInline(trimmed)}</p>)
    }
  }
  flushList()

  return <div className="doc doc--md">{blocks}</div>
}
