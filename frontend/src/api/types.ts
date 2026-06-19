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
  // brand-aware freeform flow (additive; null/false для wizard-брифов)
  brand_id: number | null
  raw_input_text: string | null
  input_summary_json: InputSummary | null
  is_input_summary_verified: boolean
  structured_brief_json: StructuredBrief | null
  clarifications_json: Clarifications | null
  // output template (additive; null для wizard и freeform-брифов без шаблона)
  selected_template_json?: BriefTemplate | null
  reference_template_text?: string | null
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
  brand_id: number | null
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

// --- brand-aware freeform flow -------------------------------------------

export type SourceType =
  | 'brand_bible'
  | 'client_brief'
  | 'transcript'
  | 'manager_note'
  | 'inference'
  | 'internet'
  | 'user_edit'
  | 'unknown'

export type FieldStatus =
  | 'confirmed'
  | 'confirmed_by_brand'
  | 'needs_confirmation'
  | 'critical_missing'
  | 'optional_missing'
  | 'conflict'
  | 'rejected'

export type ClarificationImportance = 'critical' | 'recommended' | 'optional'

export interface Brand {
  id: number
  name: string
  description: string | null
  brand_context_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BrandListItem {
  id: number
  name: string
  description: string | null
  created_at: string
  updated_at: string
}

export interface BrandCreatePayload {
  name: string
  description?: string | null
  brand_context_json?: Record<string, unknown>
}

export interface BrandUpdatePayload {
  name?: string
  description?: string | null
  brand_context_json?: Record<string, unknown>
}

export interface InputSummary {
  summary: string
  key_facts: string[]
  explicit_requirements: string[]
  constraints: string[]
  uncertain_fragments: string[]
}

export interface StructuredField {
  key: string
  value: string
  source_type: SourceType
  source_ref: string
  confidence: number
  status: FieldStatus
  comment: string
}

export interface StructuredBrief {
  fields: StructuredField[]
}

export interface ClarificationQuestion {
  id: string
  field: string
  question: string
  importance: ClarificationImportance
  options: string[]
}

export interface Clarifications {
  questions: ClarificationQuestion[]
}

export interface FreeformBriefCreatePayload {
  brand_id: number
  title?: string
}

export interface ClarificationAnswer {
  question_id?: string
  field?: string
  answer: string
}

export interface ApplyClarificationsPayload {
  answers: ClarificationAnswer[]
}

// --- output brief template ------------------------------------------------

export type TemplateSource = 'default' | 'reference' | 'custom'

export interface TemplateField {
  key: string
  label: string
  selected: boolean
  required: boolean
  hint: string
}

export interface TemplateSection {
  key: string
  title: string
  description: string
  selected: boolean
  fields: TemplateField[]
}

export interface BriefTemplate {
  name: string
  source: TemplateSource
  sections: TemplateSection[]
}

export interface DecomposeTemplateRequest {
  reference_text: string
  brand_id?: number | null
}

export interface SelectTemplatePayload {
  template: BriefTemplate
  reference_text?: string | null
}
