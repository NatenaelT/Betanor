export const LETTER_STATUSES = ["DRAFT", "PUBLISHED", "SUBMITTED"] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

export const LETTER_CATEGORIES = [
  "General Letter", "Request Letter", "Response Letter", "Tender Letter",
  "Proposal Cover Letter", "Quotation Cover Letter", "Contract Cover Letter",
  "Employment Letter", "Experience Letter", "Recommendation Letter",
  "Invitation Letter", "HR Letter", "Financial Letter", "Technical Letter",
  "Project Letter", "Other",
] as const;

export const RELATED_TYPES = ["response_to", "follow_up_to", "correction_to", "reference_to", "replacement_for"] as const;
export type RelatedType = (typeof RELATED_TYPES)[number];

export type LetterRecord = {
  id: string;
  workspace_id: string;
  reference_number: string;
  letter_date: string;
  letter_type: string;
  department_id: string | null;
  prepared_by: string;
  approved_by: string | null;
  recipient_name: string | null;
  recipient_title: string | null;
  recipient_organization: string;
  recipient_address: string | null;
  recipient_email: string | null;
  cc: string | null;
  subject: string;
  salutation: string;
  body_html: string;
  closing: string;
  signatory: string;
  signatory_title: string | null;
  internal_notes: string | null;
  tags: string[];
  customer_id: string | null;
  employee_id: string | null;
  tender_id: string | null;
  project_id: string | null;
  contract_id: string | null;
  quotation_id: string | null;
  rfq_id: string | null;
  source_letter_id: string | null;
  related_type: RelatedType | null;
  status: LetterStatus;
  published_at: string | null;
  published_by: string | null;
  submitted_at: string | null;
  submitted_by: string | null;
  final_pdf_path: string | null;
  final_pdf_hash: string | null;
  archived_at: string | null;
  archived_by: string | null;
  created_at: string;
  updated_at: string;
};

export const LETTER_COLUMNS = [
  "id", "workspace_id", "reference_number", "letter_date", "letter_type",
  "department_id", "prepared_by", "approved_by", "recipient_name",
  "recipient_title", "recipient_organization", "recipient_address",
  "recipient_email", "cc", "subject", "salutation", "body_html", "closing",
  "signatory", "signatory_title", "internal_notes", "tags", "customer_id",
  "employee_id", "tender_id", "project_id", "contract_id", "quotation_id",
  "rfq_id", "source_letter_id", "related_type", "status", "published_at",
  "published_by", "submitted_at", "submitted_by", "final_pdf_path",
  "final_pdf_hash", "archived_at", "archived_by", "created_at", "updated_at",
].join(",");

export type LetterDraftInput = {
  letter_date?: string;
  letter_type?: string;
  department_id?: string | null;
  approved_by?: string | null;
  recipient_name?: string;
  recipient_title?: string | null;
  recipient_organization?: string;
  recipient_address?: string | null;
  recipient_email?: string | null;
  cc?: string | null;
  subject?: string;
  salutation?: string;
  body_html?: string;
  closing?: string;
  signatory?: string;
  signatory_title?: string | null;
  internal_notes?: string | null;
  tags?: string[];
  customer_id?: string | null;
  employee_id?: string | null;
  tender_id?: string | null;
  project_id?: string | null;
  contract_id?: string | null;
  quotation_id?: string | null;
  rfq_id?: string | null;
};
