import { Link } from 'react-router-dom'
import { BRIEF_TYPE_OPTIONS } from '../wizard/steps'
import type { BriefType } from '../api/types'

const TYPE_DESCRIPTIONS: Record<BriefType, string> = {
  creative: 'Креативная идея и концепция',
  client: 'Бриф от клиента агентству',
  production: 'Продакшн и съёмочный процесс',
  ai_production: 'Генеративный AI-продакшн',
  landing: 'Посадочная страница',
  video: 'Видеоролик',
  presentation: 'Презентация и питч',
  campaign: 'Рекламная кампания',
  custom: 'Свободный формат',
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="hero-mark">B</div>
        <h1>
          Briefing <b>Studio</b>
        </h1>
        <p>
          Соберите требования в структурированный бриф за несколько шагов — а затем
          превратите их в готовый документ с помощью AI.
        </p>
        <div className="hero-actions">
          <Link to="/brief/new" className="btn btn--primary">
            Создать бриф
          </Link>
          <Link to="/brands" className="btn btn--ghost">
            Бренды
          </Link>
          <Link to="/briefs" className="btn btn--ghost">
            Мои брифы
          </Link>
        </div>
      </section>

      <h2 className="section-title">
        Два способа <b>создать бриф</b>
      </h2>
      <section className="features">
        <div className="card">
          <h3>Пошаговый wizard</h3>
          <p>
            Ручное пошаговое заполнение: 8 шагов по полям брифа, затем AI-анализ и
            генерация документа.
          </p>
          <Link to="/brief/new" className="btn btn--primary">
            Создать по шагам
          </Link>
        </div>
        <div className="card">
          <h3>AI-бриф из свободного ввода</h3>
          <p>
            Вставьте клиентский текст/заметки → AI делает summary и структуру с
            источниками → уточнения → финальный бриф. Нужен бренд.
          </p>
          <Link to="/brief/new/freeform" className="btn btn--primary">
            Создать AI-бриф из свободного ввода
          </Link>
        </div>
      </section>

      <h2 className="section-title">
        Типы <b>брифов</b>
      </h2>
      <div className="type-grid">
        {BRIEF_TYPE_OPTIONS.map((opt) => (
          <Link to="/brief/new" className="type-card" key={opt.value}>
            <span className="cover">{opt.label.charAt(0)}</span>
            <h4>{opt.label}</h4>
            <p>{TYPE_DESCRIPTIONS[opt.value]}</p>
          </Link>
        ))}
      </div>
    </>
  )
}
