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
          <Link to="/briefs" className="btn btn--ghost">
            Мои брифы
          </Link>
        </div>
      </section>

      <section className="features">
        <div className="card">
          <h3>Пошаговый wizard</h3>
          <p>Последовательные вопросы вместо пустого документа.</p>
        </div>
        <div className="card">
          <h3>Структура из коробки</h3>
          <p>Цели, сообщения, тональность и результат — ничего не потеряется.</p>
        </div>
        <div className="card">
          <h3>AI-генерация</h3>
          <p>Готовый markdown-бриф, анализ полноты и версии генераций.</p>
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
