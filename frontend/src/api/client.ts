import type {
  Brief,
  BriefAnalysis,
  BriefContextUpdate,
  BriefCreatePayload,
  BriefListItem,
  BriefUpdatePayload,
  BriefVersion,
  SectionRegenerateResponse,
} from './types'

const API_BASE = (import.meta.env.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })

  if (!res.ok) {
    let detail: string = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // тело ответа не JSON — оставляем statusText
    }
    throw new ApiError(detail || `Ошибка запроса (${res.status})`, res.status)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function download(path: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    let detail: string = res.statusText
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // тело ответа не JSON — оставляем statusText
    }
    throw new ApiError(detail || `Ошибка запроса (${res.status})`, res.status)
  }
  return res.blob()
}

export const api = {
  createBrief: (data: BriefCreatePayload = {}) =>
    request<Brief>('/api/briefs', { method: 'POST', body: JSON.stringify(data) }),

  listBriefs: () => request<BriefListItem[]>('/api/briefs'),

  getBrief: (id: number | string) => request<Brief>(`/api/briefs/${id}`),

  updateBrief: (id: number | string, data: BriefUpdatePayload) =>
    request<Brief>(`/api/briefs/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  updateBriefContext: (id: number | string, data: BriefContextUpdate) =>
    request<Brief>(`/api/briefs/${id}/context`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteBrief: (id: number | string) =>
    request<void>(`/api/briefs/${id}`, { method: 'DELETE' }),

  analyzeBrief: (id: number | string) =>
    request<BriefAnalysis>(`/api/briefs/${id}/analyze`, { method: 'POST' }),

  generateBrief: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/generate`, { method: 'POST' }),

  regenerateSection: (id: number | string, data: { section: string; instruction: string }) =>
    request<SectionRegenerateResponse>(`/api/briefs/${id}/regenerate-section`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listBriefVersions: (id: number | string) =>
    request<BriefVersion[]>(`/api/briefs/${id}/versions`),

  exportBrief: (id: number | string, format: 'markdown' | 'json') =>
    download(`/api/briefs/${id}/export/${format}`),
}
