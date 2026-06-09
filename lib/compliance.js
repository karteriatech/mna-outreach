// lib/compliance.js
// Pure, dependency-free logic. Imported by the client UI *and* re-run on the
// server before any email is sent, so the gate is real enforcement, not decoration.

export const STAGES = [
  { key: "sourced", label: "Sourced" },
  { key: "researched", label: "Researched" },
  { key: "cleared", label: "Cleared" },
  { key: "drafted", label: "Drafted" },
  { key: "sent", label: "Sent" },
  { key: "replied", label: "Replied" },
  { key: "meeting", label: "Meeting" },
  { key: "closed", label: "Closed" },
  { key: "passed", label: "Passed" },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label]));

export const ENTITY_TYPES = [
  { key: "ltd", label: "Limited company (Ltd)", sub: "corporate" },
  { key: "plc", label: "Public limited company (plc)", sub: "corporate" },
  { key: "llp", label: "Limited liability partnership", sub: "corporate" },
  { key: "government", label: "Government / public body", sub: "corporate" },
  { key: "sole", label: "Sole trader", sub: "individual" },
  { key: "partnership", label: "Unincorporated partnership", sub: "individual" },
  { key: "unknown", label: "Unknown / unverified", sub: "individual" },
];
export const ENTITY = Object.fromEntries(ENTITY_TYPES.map((e) => [e.key, e]));

export const EXEMPTIONS = {
  art62: { code: "FPO Art. 62", name: "Sale of body corporate", note: "Limit the proposal to a majority or complete acquisition. Indicative valuations and synergy rationale may be shared.", needRiskWarning: false, needCertified: false, needLinkage: false },
  art48_50: { code: "FPO Art. 48 / 50", name: "High-net-worth / sophisticated investor", note: "Recipient's certified status must be confirmed and a statutory risk warning attached. No specific return promises.", needRiskWarning: true, needCertified: true, needLinkage: false },
  art39: { code: "FPO Art. 39", name: "Group companies / joint enterprise", note: "Corporate linkage to your firm must be verified. The promotion must relate strictly to the shared enterprise.", needRiskWarning: false, needCertified: false, needLinkage: true },
};

export const DEAL_TYPES = [
  { key: "full_buyout", label: "Full buyout / company sale", exemption: "art62" },
  { key: "majority", label: "Majority acquisition (\u226550%)", exemption: "art62" },
  { key: "minority", label: "Minority equity stake", exemption: "art48_50" },
  { key: "financing", label: "Debt / growth financing", exemption: "art48_50" },
  { key: "jv", label: "Joint venture / partnership", exemption: "art39" },
  { key: "restructuring", label: "Group restructuring", exemption: "art39" },
];
export const DEAL = Object.fromEntries(DEAL_TYPES.map((d) => [d.key, d]));

export const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk",
  "outlook.com", "live.com", "msn.com", "icloud.com", "me.com", "aol.com", "proton.me",
  "protonmail.com", "gmx.com", "mail.com", "ymail.com", "btinternet.com", "sky.com",
]);

export const domainOf = (email) => (email || "").split("@")[1]?.toLowerCase().trim() || "";

export function evaluate(p, suppression, settings) {
  const dom = domainOf(p.email);
  const exemptionKey = DEAL[p.dealType]?.exemption || "art62";
  const ex = EXEMPTIONS[exemptionKey];
  const sub = ENTITY[p.entityType]?.sub || "individual";
  const isSuppressed =
    p.suppressed ||
    (suppression || []).some(
      (s) => s.value.toLowerCase() === (p.email || "").toLowerCase() || s.value.toLowerCase() === dom
    );

  const gates = [];

  gates.push(
    isSuppressed
      ? { id: "suppress", label: "Suppression list", status: "block", detail: "This address or domain has opted out.", fix: "Outreach is permanently blocked for this contact." }
      : { id: "suppress", label: "Suppression list", status: "pass", detail: "Not on the do-not-contact list." }
  );

  if (!p.email || !dom) {
    gates.push({ id: "email", label: "Professional address", status: "warn", detail: "No email captured yet.", fix: "Add a corporate email address." });
  } else if (PERSONAL_DOMAINS.has(dom)) {
    gates.push({ id: "email", label: "Professional address", status: "block", detail: "Personal mailbox \u2014 fails the GDPR balancing test.", fix: "Source a corporate email; personal inboxes cannot be contacted." });
  } else {
    gates.push({ id: "email", label: "Professional address", status: "pass", detail: `Corporate domain \u00b7 ${dom}` });
  }

  if (sub === "corporate") {
    gates.push({ id: "pecr", label: "PECR classification", status: "pass", detail: `${ENTITY[p.entityType].label} \u2014 corporate subscriber. Unsolicited B2B contact permitted.` });
  } else {
    gates.push({ id: "pecr", label: "PECR classification", status: "block", detail: `${ENTITY[p.entityType]?.label || "Unknown"} \u2014 individual subscriber.`, fix: "Verify a corporate structure (Ltd / plc / LLP / public body), or obtain explicit consent before contacting." });
  }

  const lia = p.lia || {};
  const liaDone = (lia.purpose || "").trim() && (lia.necessity || "").trim() && (lia.balancing || "").trim();
  gates.push(
    liaDone
      ? { id: "lia", label: "Legitimate Interest Assessment", status: "pass", detail: "Three-part test recorded." }
      : { id: "lia", label: "Legitimate Interest Assessment", status: "warn", detail: "Purpose / necessity / balancing not yet recorded.", fix: "Generate or write the LIA." }
  );

  let fcaStatus = "pass";
  let fcaFix = "";
  const fcaParts = [`${ex.code} \u2014 ${ex.name}.`];
  if (ex.needCertified && !p.certifiedConfirmed) { fcaStatus = "warn"; fcaFix = "Confirm the recipient's certified HNW / sophisticated status."; }
  if (ex.needLinkage && !p.linkageConfirmed) { fcaStatus = "warn"; fcaFix = "Confirm the corporate / joint-enterprise linkage."; }
  if (ex.needRiskWarning) fcaParts.push("Statutory risk warning will be attached.");
  gates.push({ id: "fca", label: "FCA financial promotion", status: fcaStatus, detail: fcaParts.join(" "), fix: fcaFix });

  const draft = p.draft || {};
  const hasDraft = (draft.subject || "").trim() && (draft.body || "").trim();
  const blocking = gates.some((g) => g.status === "block");
  const warning = gates.some((g) => g.status === "warn");
  const cleared = !blocking && !warning;
  const sendReady = cleared && hasDraft;

  return { gates, ex, exemptionKey, blocking, warning, cleared, hasDraft, sendReady };
}

// Build the final outbound body (risk warning + signature + opt-out appended).
export function composeBody(p, ev, settings) {
  const parts = [];
  if (ev.ex.needRiskWarning && (settings.riskWarning || "").trim())
    parts.push(`[Risk warning]\n${settings.riskWarning.trim()}\n`);
  parts.push((p.draft?.body || "").trim());
  if ((settings.signature || "").trim()) parts.push(`\n${settings.signature.trim()}`);
  parts.push(`\nIf you would prefer not to receive further correspondence, reply "unsubscribe" or email ${settings.optOutEmail} and we will remove you immediately.`);
  return parts.join("\n");
}
