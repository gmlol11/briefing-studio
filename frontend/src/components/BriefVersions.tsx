import { useEffect, useState } from 'react'
import type { BriefVersion } from '../api/types'
import { api } from '../api/client'
import MarkdownView from './MarkdownView'

interface BriefVersionsProps {
  briefId: number
  /** Меняется после каждой генерации — триггерит перезагрузку списка. */
  refreshToken: number
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Компактная история генераций; по клику — preview версии в document-стиле. */
export default function BriefVersions({ briefId, refreshToken }: BriefVersionsProps) {
  const [versions, setVersions] = useState<BriefVersion[] | null>(null)
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    api
      .listBriefVersions(briefId)
      .then(setVersions)
      .catch(() => setVersions(null))
  }, [briefId, refreshToken])

  if (!versions || versions.length === 0) return null

  return (
    <div className="versions">
      <h4>История генераций</h4>
      <ul className="versions__list">
        {versions.map((v) => (
          <li key={v.id}>
            <button
              type="button"
              className={'version__row' + (openId === v.id ? ' version__row--open' : '')}
              onClick={() => setOpenId(openId === v.id ? null : v.id)}
            >
              <span className="version__num">v{v.version_number}</span>
              <span className="version__date">{formatDateTime(v.created_at)}</span>
              {v.generation_meta_json.model && (
                <span className="version__model">{v.generation_meta_json.model}</span>
              )}
              <span className="version__toggle">{openId === v.id ? '▴' : '▾'}</span>
            </button>
            {openId === v.id && (
              <div className="version__preview doc-frame doc-frame--sm">
                <MarkdownView markdown={v.generated_markdown} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
