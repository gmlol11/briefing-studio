import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { BrandIdentity } from '../api/types'
import MarkdownView from './MarkdownView'

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function validHex(value: string | null | undefined): string | null {
  if (!value) return null
  const v = value.trim()
  return HEX_RE.test(v) ? v : null
}

interface BrandedDocumentProps {
  markdown: string
  identity?: BrandIdentity | null
  brandName?: string | null
}

/**
 * Обёртка над MarkdownView, применяющая brand identity к предпросмотру
 * итогового документа: акцентный цвет и шрифт через CSS-переменные, лёгкий
 * бренд-хедер (логотип + название + акцентная линия). Пустая/невалидная
 * identity → выглядит как обычный markdown-документ (без регрессии).
 */
export default function BrandedDocument({ markdown, identity, brandName }: BrandedDocumentProps) {
  const logoUrl = identity?.logo_url?.trim() || null
  const [logoBroken, setLogoBroken] = useState(false)
  useEffect(() => setLogoBroken(false), [logoUrl])

  // accent: accent_color, иначе primary_color; primary как отдельная var
  const accent = validHex(identity?.accent_color) ?? validHex(identity?.primary_color)
  const primary = validHex(identity?.primary_color) ?? accent
  const font = identity?.font_family?.trim() || null
  const docStyle = identity?.document_style ?? null
  const name = brandName?.trim() || null

  // CSS-переменные ставим только для заданных значений → иначе fallback на текущие
  const cssVars: Record<string, string> = {}
  if (accent) cssVars['--doc-accent'] = accent
  if (primary) cssVars['--doc-primary'] = primary
  if (font) cssVars['--doc-font'] = font

  const showLogo = Boolean(logoUrl) && !logoBroken
  // Header показываем только при визуальной identity (логотип/акцент). Одно имя
  // бренда без визуала header не вызывает — пустая identity = текущий вид документа.
  const showHeader = Boolean(logoUrl || accent)

  const className =
    'doc-branded' + (docStyle ? ` doc-branded--${docStyle.replace(/_/g, '-')}` : '')

  return (
    <div className={className} style={cssVars as CSSProperties}>
      {showHeader && (
        <div className="doc-branded__header">
          {(showLogo || name) && (
            <div className="doc-branded__brand">
              {showLogo && (
                <img
                  className="doc-branded__logo"
                  src={logoUrl as string}
                  alt={name ? `${name} — логотип` : 'Логотип бренда'}
                  onError={() => setLogoBroken(true)}
                />
              )}
              {name && <span className="doc-branded__brand-name">{name}</span>}
            </div>
          )}
          {accent && <span className="doc-branded__accent-line" />}
        </div>
      )}

      <MarkdownView markdown={markdown} />
    </div>
  )
}
