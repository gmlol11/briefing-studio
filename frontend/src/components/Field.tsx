import type { FieldDef } from '../wizard/steps'
import ListInput from './ListInput'

interface FieldProps {
  field: FieldDef
  value: string | string[]
  onChange: (value: string | string[]) => void
}

/** Рендер одного поля шага по его описанию. */
export default function Field({ field, value, onChange }: FieldProps) {
  return (
    <div className="field">
      <label htmlFor={field.key}>{field.label}</label>

      {field.kind === 'select' && (
        <select
          id={field.key}
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      )}

      {field.kind === 'text' && (
        <input
          id={field.key}
          type="text"
          value={value as string}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.kind === 'textarea' && (
        <textarea
          id={field.key}
          rows={4}
          value={value as string}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {field.kind === 'list' && (
        <ListInput
          value={value as string[]}
          placeholder={field.placeholder}
          onChange={(v) => onChange(v)}
        />
      )}

      {field.hint && <p className="field__hint">{field.hint}</p>}
    </div>
  )
}
