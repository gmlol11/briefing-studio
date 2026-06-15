interface ListInputProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
}

/** Редактор списка строк: строки-инпуты с удалением + кнопка «Добавить». */
export default function ListInput({ value, onChange, placeholder }: ListInputProps) {
  const items = value.length ? value : ['']

  const update = (index: number, next: string) => {
    const copy = [...items]
    copy[index] = next
    onChange(copy)
  }

  const remove = (index: number) => {
    const copy = items.filter((_, i) => i !== index)
    onChange(copy)
  }

  const add = () => onChange([...items, ''])

  return (
    <div className="list-input">
      {items.map((item, i) => (
        <div className="list-input__row" key={i}>
          <input
            type="text"
            value={item}
            placeholder={placeholder}
            onChange={(e) => update(i, e.target.value)}
          />
          <button
            type="button"
            className="list-input__remove"
            onClick={() => remove(i)}
            disabled={items.length === 1 && item === ''}
            aria-label="Удалить пункт"
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="list-input__add" onClick={add}>
        + Добавить
      </button>
    </div>
  )
}
