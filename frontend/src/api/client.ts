import type {
  ApplyClarificationsPayload,
  Brand,
  BrandCreatePayload,
  BrandListItem,
  BrandUpdatePayload,
  Brief,
  BriefAnalysis,
  BriefContextUpdate,
  BriefCreatePayload,
  BriefExportFormat,
  BriefListItem,
  BriefTemplate,
  BriefUpdatePayload,
  BriefVersion,
  DecomposeTemplateRequest,
  FreeformBriefCreatePayload,
  SectionRegenerateResponse,
  SelectTemplatePayload,
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

  exportBrief: (id: number | string, format: BriefExportFormat) =>
    download(`/api/briefs/${id}/export/${format}`),

  // --- brands ---
  listBrands: () => request<BrandListItem[]>('/api/brands'),

  createBrand: (data: BrandCreatePayload) =>
    request<Brand>('/api/brands', { method: 'POST', body: JSON.stringify(data) }),

  getBrand: (id: number | string) => request<Brand>(`/api/brands/${id}`),

  updateBrand: (id: number | string, data: BrandUpdatePayload) =>
    request<Brand>(`/api/brands/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  deleteBrand: (id: number | string) =>
    request<void>(`/api/brands/${id}`, { method: 'DELETE' }),

  // --- brand-aware freeform brief flow ---
  createFreeformBrief: (data: FreeformBriefCreatePayload) =>
    request<Brief>('/api/briefs/freeform', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  setFreeformInput: (id: number | string, raw_input_text: string) =>
    request<Brief>(`/api/briefs/${id}/freeform-input`, {
      method: 'POST',
      body: JSON.stringify({ raw_input_text }),
    }),

  summarizeInput: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/summarize-input`, { method: 'POST' }),

  verifyInputSummary: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/verify-input-summary`, { method: 'POST' }),

  structureBrief: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/structure`, { method: 'POST' }),

  generateClarifications: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/clarifications`, { method: 'POST' }),

  applyClarifications: (id: number | string, data: ApplyClarificationsPayload) =>
    request<Brief>(`/api/briefs/${id}/apply-clarifications`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  generateFinalBrief: (id: number | string) =>
    request<Brief>(`/api/briefs/${id}/generate-final`, { method: 'POST' }),

  // --- output brief template ---
  getDefaultTemplate: () => request<BriefTemplate>('/api/briefs/template/default'),

  decomposeTemplate: (data: DecomposeTemplateRequest) =>
    request<BriefTemplate>('/api/briefs/template/decompose', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  selectTemplate: (id: number | string, data: SelectTemplatePayload) =>
    request<Brief>(`/api/briefs/${id}/select-template`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}
