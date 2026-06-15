import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

/** Создаёт новый бриф-черновик и перенаправляет на его редактирование. */
export default function NewBriefPage() {
  const navigate = useNavigate()
  const startedRef = useRef(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    api
      .createBrief()
      .then((brief) => navigate(`/brief/${brief.id}`, { replace: true }))
      .catch((e) => setError((e as Error).message))
  }, [navigate])

  return (
    <div className="state-screen">
      {error ? (
        <>
          <h2>Не удалось создать бриф</h2>
          <p className="state-screen__muted">{error}</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Попробовать снова
          </button>
        </>
      ) : (
        <p className="state-screen__muted">Создаём новый бриф…</p>
      )}
    </div>
  )
}
