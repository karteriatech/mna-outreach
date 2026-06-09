// lib/serialize.js
export function rowToProspect(r) {
  return {
    id: r.id,
    company: r.company,
    contact: r.contact,
    title: r.title,
    email: r.email,
    sector: r.sector,
    entityType: r.entity_type,
    dealType: r.deal_type,
    notes: r.notes,
    stage: r.stage,
    suppressed: r.suppressed,
    certifiedConfirmed: r.certified_confirmed,
    linkageConfirmed: r.linkage_confirmed,
    lia: r.lia,
    draft: r.draft,
    thread: r.thread,
    needsFollowup: r.needs_followup,
    lastSentAt: r.last_sent_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// Map a partial client patch to { column: value } pairs for UPDATE.
const FIELD_MAP = {
  company: "company", contact: "contact", title: "title", email: "email",
  sector: "sector", entityType: "entity_type", dealType: "deal_type",
  notes: "notes", stage: "stage", suppressed: "suppressed",
  certifiedConfirmed: "certified_confirmed", linkageConfirmed: "linkage_confirmed",
  lia: "lia", draft: "draft", thread: "thread", needsFollowup: "needs_followup",
};
const JSON_FIELDS = new Set(["lia", "draft", "thread"]);

export function patchToColumns(patch) {
  const cols = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in FIELD_MAP)) continue;
    cols.push(FIELD_MAP[k]);
    vals.push(JSON_FIELDS.has(k) ? JSON.stringify(v) : v);
  }
  return { cols, vals };
}
