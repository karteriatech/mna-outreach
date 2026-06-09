// lib/ai.js
import { DEAL } from "./compliance.js";

const MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

async function callClaude(system, user, maxTokens = 1024) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL(),
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = (data.content || []).map((b) => (b.type === "text" ? b.text : "")).join("\n");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

const exemptionGuidance = (key) =>
  ({
    art62: "This concerns a full or majority acquisition. You may reference indicative valuation thinking and synergy rationale at a high level.",
    art48_50: "This concerns a minority stake or financing. Frame it for a sophisticated counterparty and make no specific return promises.",
    art39: "This concerns a joint venture or group matter. Reference the shared commercial purpose.",
  }[key] || "");

export async function aiEmail(p, settings, exemptionKey) {
  const system = `You are ${settings.senderName}, ${settings.senderTitle} at ${settings.firmName}, an M&A advisory firm. Write ONE bespoke outreach email to a named decision-maker. It must read as a genuine one-off communication (FPO Article 28): individually tailored to this company's specific circumstances, never a mass template. It must be fair, clear and not misleading (FCA COBS 4.2.1): no guarantees, no hype, no unsubstantiated figures. ${exemptionGuidance(exemptionKey)} Keep it under 160 words, warm and specific, with a single clear call to action (a short introductory call). Do NOT add a signature, risk warning or opt-out line \u2014 the system appends those. Return ONLY JSON: {"subject":"...","body":"..."}`;
  const user = `Company: ${p.company}\nContact: ${p.contact} (${p.title})\nSector: ${p.sector}\nTransaction context: ${DEAL[p.dealType]?.label}\nOur strategy: ${settings.strategy}\nResearch on this target:\n${p.notes || "(none provided)"}`;
  return callClaude(system, user);
}

export async function aiReply(p, settings, inbound) {
  const last = (p.thread || []).slice(-4)
    .map((m) => `[${m.dir === "out" ? "Us" : "Them"}] ${m.subject ? m.subject + " \u2014 " : ""}${m.body}`)
    .join("\n\n");
  const system = `You are ${settings.senderName}, ${settings.senderTitle} at ${settings.firmName}. Draft a tailored reply to the prospect's latest message. Address their specific points, keep it concise and professional, stay fair/clear/not misleading, and move toward a short call. Do NOT add a signature or opt-out line. Return ONLY JSON: {"subject":"...","body":"..."}`;
  const user = `Company: ${p.company} \u00b7 Contact: ${p.contact} (${p.title})\nThread so far:\n${last}\n\nTheir latest message:\n${inbound}`;
  return callClaude(system, user);
}

export async function aiLIA(p, settings) {
  const system = `You produce a Legitimate Interest Assessment (UK GDPR Art. 6(1)(f)) for B2B outreach. Return ONLY JSON with three concise, specific fields: {"purpose":"...","necessity":"...","balancing":"..."}. Purpose = the legitimate commercial rationale. Necessity = why processing THIS person's professional data is required. Balancing = why the individual's rights are not overridden.`;
  const user = `Firm strategy: ${settings.strategy}\nTarget: ${p.contact}, ${p.title} at ${p.company} (${p.sector}). Transaction context: ${DEAL[p.dealType]?.label}.`;
  return callClaude(system, user);
}
