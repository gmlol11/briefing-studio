import type { BriefTemplate } from '../api/types'

interface Props {
  template: BriefTemplate
  onChange: (next: BriefTemplate) => void
  disabled?: boolean
}

/** Дерево разделов/полей шаблона итогового брифа с чекбоксами. */
export default function TemplateEditor({ template, onChange, disabled }: Props) {
  const toggleSection = (si: number) => {
    const sections = template.sections.map((s, i) =>
      i === si ? { ...s, selected: !s.selected } : s,
    )
    onChange({ ...template, sections })
  }

  const toggleField = (si: number, fi: number) => {
    const sections = template.sections.map((s, i) => {
      if (i !== si) return s
      const fields = s.fields.map((f, j) =>
        j === fi ? { ...f, selected: !f.selected } : f,
      )
      return { ...s, fields }
    })
    onChange({ ...template, sections })
  }

  if (!template.sections.length) {
    return <p className="review-muted">В шаблоне нет разделов.</p>
  }

  return (
    <div className="template-editor">
      {template.sections.map((section, si) => (
        <div
          className={`template-section${section.selected ? '' : ' template-section--off'}`}
          key={section.key || si}
        >
          <label className="template-section__head">
            <input
              type="checkbox"
              checked={section.selected}
              disabled={disabled}
              onChange={() => toggleSection(si)}
            />
            <span className="template-section__title">
              {section.title || section.key || '(раздел)'}
            </span>
          </label>
          {section.fields.length > 0 && (
            <div className="template-fields">
              {section.fields.map((field, fi) => (
                <label className="template-field" key={field.key || fi}>
                  <input
                    type="checkbox"
                    checked={field.selected}
                    disabled={disabled || !section.selected}
                    onChange={() => toggleField(si, fi)}
                  />
                  <span className="template-field__label">
                    {field.label || field.key || '(поле)'}
                  </span>
                  {field.required && <span className="template-required">обязательное</span>}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
