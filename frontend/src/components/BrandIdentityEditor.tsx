import { useEffect, useState } from 'react'
import type { BrandIdentity, DocumentStyle } from '../api/types'

/** Пустая айдентика — fallback для нового бренда и для брендов без identity. */
export const EMPTY_IDENTITY: BrandIdentity = {
  primary_color: null,
  secondary_color: null,
  accent_color: null,
  logo_url: null,
  font_family: null,
  document_style: null,
  brand_notes: null,
}

const DOCUMENT_STYLES: { value: DocumentStyle; label: string }[] = [
  { value: 'clean_premium', label: 'Clean premium' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'bold', label: 'Bold' },
  { value: 'classic', label: 'Classic' },
]

const DOCUMENT_STYLE_LABELS: Record<DocumentStyle, string> = {
  clean_premium: 'Clean premium',
  minimal: 'Minimal',
  bold: 'Bold',
  classic: 'Classic',
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/
const HEX6_RE = /^#[0-9a-fA-F]{6}$/

/** Пустую строку трактуем как «не задано» (null), остальное — как есть. */
function emptyToNull(raw: string): string | null {
  return raw.trim() === '' ? null : raw
}

interface ColorFieldProps {
  label: string
  value: string | null
  onChange: (value: string | null) => void
}

/** Одно цветовое поле: hex-текст + native picker + «Очистить».
 *  Источник правды — nullable hex. Native picker не умеет пустое значение,
 *  поэтому при null показываем безопасный #000000, но не сохраняем его. */
function ColorField({ label, value, onChange }: ColorFieldProps) {
  const invalid = value != null && !HEX_RE.test(value)
  return (
    <div className="identity-color">
      <span className="identity-color__label">{label}</span>
      <div className="identity-color__row">
        <input
          type="color"
          className="identity-color__swatch"
          aria-label={`${label}: выбрать цвет`}
          value={value != null && HEX6_RE.test(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          type="text"
          className="identity-color__hex"
          placeholder="#FF6400"
          spellCheck={false}
          value={value ?? ''}
          onChange={(e) => onChange(emptyToNull(e.target.value))}
        />
        {value != null && (
          <button
            type="button"
            className="identity-color__clear"
            onClick={() => onChange(null)}
          >
            Очистить
          </button>
        )}
      </div>
      {invalid && (
        <p className="identity-color__warn">Ожидается hex вида #RGB или #RRGGBB</p>
      )}
    </div>
  )
}

/** Лёгкая preview-карточка настроек айдентики (не финальный branded export). */
function BrandIdentityPreview({ value }: { value: BrandIdentity }) {
  const [logoBroken, setLogoBroken] = useState(false)
  useEffect(() => setLogoBroken(false), [value.logo_url])

  const swatches: [string, string][] = []
  if (value.primary_color) swatches.push(['Основной', value.primary_color])
  if (value.secondary_color) swatches.push(['Вторичный', value.secondary_color])
  if (value.accent_color) swatches.push(['Акцент', value.accent_color])

  const hasAny = Boolean(
    value.logo_url ||
      value.primary_color ||
      value.secondary_color ||
      value.accent_color ||
      value.font_family ||
      value.document_style ||
      value.brand_notes,
  )

  return (
    <aside className="identity-preview">
      <span className="identity-preview__cap">Предпросмотр</span>

      {!hasAny && <p className="identity-preview__empty">Айдентика не задана</p>}

      {hasAny && (
        <div className="identity-preview__body">
          {value.logo_url && !logoBroken && (
            <img
              className="identity-preview__logo"
              src={value.logo_url}
              alt="Логотип бренда"
              onError={() => setLogoBroken(true)}
            />
          )}
          {value.logo_url && logoBroken && (
            <div className="identity-preview__logo-fallback">
              Логотип недоступен по URL
            </div>
          )}

          {swatches.length > 0 && (
            <div className="identity-preview__swatches">
              {swatches.map(([name, color]) => (
                <div key={name} className="identity-swatch">
                  <span
                    className="identity-swatch__chip"
                    style={{ background: color }}
                  />
                  <span className="identity-swatch__meta">
                    {name}
                    <code>{color}</code>
                  </span>
                </div>
              ))}
            </div>
          )}

          {(value.font_family || value.document_style) && (
            <div className="identity-preview__row">
              {value.font_family && (
                <span
                  className="identity-preview__sample"
                  style={{ fontFamily: value.font_family }}
                >
                  {value.font_family}
                </span>
              )}
              {value.document_style && (
                <span className="identity-preview__tag">
                  {DOCUMENT_STYLE_LABELS[value.document_style]}
                </span>
              )}
            </div>
          )}

          {value.brand_notes && (
            <p className="identity-preview__notes">{value.brand_notes}</p>
          )}
        </div>
      )}
    </aside>
  )
}

interface Props {
  value: BrandIdentity
  onChange: (value: BrandIdentity) => void
}

/** Контролируемый редактор brand identity + живой предпросмотр. */
export default function BrandIdentityEditor({ value, onChange }: Props) {
  function set<K extends keyof BrandIdentity>(key: K, v: BrandIdentity[K]) {
    onChange({ ...value, [key]: v })
  }

  return (
    <div className="identity-editor">
      <div className="identity-editor__form">
        <ColorField
          label="Основной цвет"
          value={value.primary_color}
          onChange={(v) => set('primary_color', v)}
        />
        <ColorField
          label="Вторичный цвет"
          value={value.secondary_color}
          onChange={(v) => set('secondary_color', v)}
        />
        <ColorField
          label="Акцентный цвет"
          value={value.accent_color}
          onChange={(v) => set('accent_color', v)}
        />

        <div className="field">
          <label htmlFor="identity-logo">Логотип (URL)</label>
          <input
            id="identity-logo"
            type="text"
            placeholder="https://…/logo.svg"
            value={value.logo_url ?? ''}
            onChange={(e) => set('logo_url', emptyToNull(e.target.value))}
          />
          <p className="field__hint">
            Только ссылка на изображение. Загрузка файлов появится позже.
          </p>
        </div>

        <div className="field">
          <label htmlFor="identity-font">Шрифт</label>
          <input
            id="identity-font"
            type="text"
            placeholder="Inter"
            value={value.font_family ?? ''}
            onChange={(e) => set('font_family', emptyToNull(e.target.value))}
          />
        </div>

        <div className="field">
          <label htmlFor="identity-style">Стиль документа</label>
          <select
            id="identity-style"
            value={value.document_style ?? ''}
            onChange={(e) =>
              set('document_style', (e.target.value || null) as DocumentStyle | null)
            }
          >
            <option value="">— не задано —</option>
            {DOCUMENT_STYLES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="identity-notes">Заметки по айдентике</label>
          <textarea
            id="identity-notes"
            rows={3}
            value={value.brand_notes ?? ''}
            onChange={(e) => set('brand_notes', emptyToNull(e.target.value))}
          />
        </div>
      </div>

      <BrandIdentityPreview value={value} />
    </div>
  )
}
