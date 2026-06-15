export type BriefStatus = 'draft' | 'in_progress' | 'generated' | 'archived'

export type BriefType =
  | 'creative'
  | 'client'
  | 'production'
  | 'ai_production'
  | 'landing'
  | 'video'
  | 'presentation'
  | 'campaign'
  | 'custom'

export interface MessageHierarchy {
  primary: string
  secondary: string[]
  background: string[]
}

export interface BriefContext {
  author_role: string
  task_type: string
  result_format: string
  usage_context: string
  main_goal: string
  promotion_object: string
  key_messages: string[]
  message_hierarchy: MessageHierarchy
  technology_role: string
  production_principle: string
  visual_context: string
  tone: string
  anti_tone: string
  must_have: string[]
  restrictions: string[]
  dramaturgy: string
  final_frame_or_cta: string
  deliverables: string[]
  kpi: string[]
  detail_level: string
  assumptions: string[]
  open_questions: string[]
}

export interface Brief {
  id: number
  title: string
  status: BriefStatus
  brief_type: BriefType
  current_step: string
  context_json: BriefContext
  generated_markdown: string | null
  generated_from_context_hash: string | null
  is_generated_outdated: boolean
  created_at: string
  updated_at: string
}

export interface BriefListItem {
  id: number
  title: string
  status: BriefStatus
  brief_type: BriefType
  current_step: string
  is_generated_outdated: boolean
  created_at: string
  updated_at: string
}

export interface GenerationMeta {
  model?: string
  generation_type?: string
  source?: string
}

export interface BriefVersion {
  id: number
  brief_id: number
  version_number: number
  generated_markdown: string
  context_snapshot_json: BriefContext
  generation_meta_json: GenerationMeta
  created_at: string
}

export interface BriefCreatePayload {
  title?: string
  brief_type?: BriefType
}

export interface BriefUpdatePayload {
  title?: string
  status?: BriefStatus
  brief_type?: BriefType
  current_step?: string
}

export type BriefContextUpdate = Partial<Omit<BriefContext, 'message_hierarchy'>> & {
  message_hierarchy?: Partial<MessageHierarchy>
}

export interface ClarifyingQuestion {
  field: string
  question: string
  type: 'text' | 'single_choice' | 'multi_choice' | string
  options: string[]
}

export interface BriefAnalysis {
  completion_score: number
  summary: string
  strong_fields: string[]
  weak_fields: string[]
  missing_fields: string[]
  clarifying_questions: ClarifyingQuestion[]
  assumptions: string[]
  risks: string[]
}

export interface SectionRegenerateResponse {
  section: string
  content: string
}
