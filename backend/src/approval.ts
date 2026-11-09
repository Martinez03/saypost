// Who approves what, per business. The only place that decides it (no network, no database).
//
// owner_whatsapp (default): the business owner gets every proposal on WhatsApp with Yes/No buttons
//   and can also answer with a plain "yes"/"no". The dashboard can approve too.
// agency_dashboard: an agency approves in the dashboard. The owner never gets buttons and a "yes"
//   on WhatsApp approves nothing. Owner-initiated posts get one "your agency reviews it" note;
//   reviews, comments and DMs only reach the dashboard.

export type ApprovalMode = "owner_whatsapp" | "agency_dashboard";
export const APPROVAL_MODES: readonly ApprovalMode[] = ["owner_whatsapp", "agency_dashboard"];

/** Where a pending action came from (actions.source). */
export type ActionSource = "whatsapp" | "webhook" | "dashboard";

/** What the owner receives on WhatsApp when a proposal is created. */
export type ProposalDelivery = "buttons" | "agency_note" | "none";

export function isApprovalMode(v: unknown): v is ApprovalMode {
  return typeof v === "string" && (APPROVAL_MODES as readonly string[]).includes(v);
}

function mode(m: string | null | undefined): ApprovalMode {
  return isApprovalMode(m) ? m : "owner_whatsapp";
}

export function proposalDelivery(approvalMode: string | null | undefined, source: ActionSource): ProposalDelivery {
  if (mode(approvalMode) === "owner_whatsapp") return "buttons";
  return source === "whatsapp" ? "agency_note" : "none";
}

/** Whether a WhatsApp button tap or a plain "yes"/"no" from the owner may decide an action. */
export function ownerCanDecideOnWhatsapp(approvalMode: string | null | undefined): boolean {
  return mode(approvalMode) === "owner_whatsapp";
}

/** Whether the owner hears the outcome ("✅ Posted", "⚠️ I couldn't…") once an action runs. */
export function ownerGetsResult(approvalMode: string | null | undefined, source: ActionSource): boolean {
  return proposalDelivery(approvalMode, source) !== "none";
}
