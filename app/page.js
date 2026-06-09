"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Settings as SettingsIcon, Shield, Check, AlertTriangle, X, Mail,
  Send, Sparkles, ChevronRight, Trash2, Building2, User, Ban, Copy,
  ArrowLeft, Loader2, ScrollText, Search, CircleDot, LogOut,
} from "lucide-react";
import { api } from "../lib/apiClient.js";
import {
  STAGES, STAGE_LABEL, ENTITY_TYPES, ENTITY, EXEMPTIONS, DEAL_TYPES, DEAL,
  domainOf, evaluate, composeBody,
} from "../lib/compliance.js";

export default function Page() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const pw = typeof window !== "undefined" && window.localStorage.getItem("mna_pw");
    if (!pw) { setChecking(false); return; }
    api.getSettings().then(() => { setAuthed(true); setChecking(false); }).catch(() => setChecking(false));
  }, []);

  if (checking) return <div className="boot"><Loader2 className="spin" size={20} /> Loading…</div>;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Console onSignOut={() => { window.localStorage.removeItem("mna_pw"); setAuthed(false); }} />;
}

function Login({ onAuthed }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    window.localStorage.setItem("mna_pw", pw);
    try { await api.getSettings(); onAuthed(); }
    catch { window.localStorage.removeItem("mna_pw"); setErr("That access key wasn't accepted."); }
    finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-card">
        <span className="seal"><Shield size={18} /></span>
        <h1 className="display">Deal Origination Console</h1>
        <p>Enter your team access key to continue.</p>
        <input type="password" value={pw} placeholder="Access key" autoFocus
          onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div className="login-err">{err}</div>}
        <button className="btn primary wide" disabled={busy || !pw} onClick={submit}>
          {busy ? <Loader2 size={14} className="spin" /> : null} Enter
        </button>
      </div>
    </div>
  );
}

function Console({ onSignOut }) {
  const [view, setView] = useState("pipeline");
  const [prospects, setProspects] = useState([]);
  const [suppression, setSuppression] = useState([]);
  const [settings, setSettings] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [stageFilter, setStageFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const pending = useRef({});
  const timers = useRef({});

  useEffect(() => {
    Promise.all([api.listProspects(), api.getSuppression(), api.getSettings()])
      .then(([p, s, cfg]) => { setProspects(p); setSuppression(s); setSettings(cfg); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

  const flush = useCallback(async (id) => {
    const patch = pending.current[id];
    if (!patch || Object.keys(patch).length === 0) return;
    pending.current[id] = {};
    setSaving(true);
    try { await api.updateProspect(id, patch); } finally { setSaving(false); }
  }, []);

  const updateProspect = useCallback((id, patch, immediate = false) => {
    setProspects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    pending.current[id] = { ...(pending.current[id] || {}), ...patch };
    clearTimeout(timers.current[id]);
    if (immediate) flush(id);
    else timers.current[id] = setTimeout(() => flush(id), 600);
  }, [flush]);

  const replaceProspect = useCallback((next) => {
    pending.current[next.id] = {};
    clearTimeout(timers.current[next.id]);
    setProspects((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }, []);

  const newProspect = async () => {
    const p = await api.createProspect({});
    setProspects((prev) => [p, ...prev]);
    setSelectedId(p.id);
  };
  const loadSamples = async () => {
    const a = await api.createProspect({ company: "Northwind Logistics Ltd", contact: "Sarah Chen", title: "CEO & Founder", email: "s.chen@northwind-logistics.com", sector: "Supply-chain software", entityType: "ltd", dealType: "full_buyout", notes: "£12m ARR, founder owns 80%, competing PE approaches rumoured." });
    const b = await api.createProspect({ company: "Halcyon Data plc", contact: "Marcus Webb", title: "Group CFO", email: "m.webb@halcyondata.com", sector: "Data analytics", entityType: "plc", dealType: "minority", notes: "Series C 18 months ago, exploring strategic minority capital." });
    setProspects((prev) => [b, a, ...prev]);
  };
  const removeProspect = async (id) => {
    await api.deleteProspect(id);
    setProspects((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const addSuppression = async (value) => {
    await api.addSuppression(value);
    setSuppression((prev) => prev.some((s) => s.value.toLowerCase() === value.toLowerCase()) ? prev : [{ value: value.toLowerCase(), at: new Date().toISOString() }, ...prev]);
  };

  const selected = prospects.find((p) => p.id === selectedId) || null;
  const counts = STAGES.reduce((a, s) => { a[s.key] = prospects.filter((p) => p.stage === s.key).length; return a; }, {});
  const filtered = prospects.filter((p) => {
    if (stageFilter !== "all" && p.stage !== stageFilter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return [p.company, p.contact, p.email, p.sector].some((v) => (v || "").toLowerCase().includes(q));
    }
    return true;
  });

  if (!loaded) return <div className="boot"><Loader2 className="spin" size={20} /> Loading console…</div>;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="seal"><Shield size={16} strokeWidth={2.2} /></span>
          <div>
            <div className="brand-name">Deal Origination Console</div>
            <div className="brand-sub mono">{settings.firmName || "—"}</div>
          </div>
        </div>
        <nav className="nav">
          <button className={`navbtn ${view === "pipeline" ? "on" : ""}`} onClick={() => { setView("pipeline"); setSelectedId(null); }}>Pipeline</button>
          <button className={`navbtn ${view === "suppression" ? "on" : ""}`} onClick={() => setView("suppression")}>Suppression</button>
          <button className={`navbtn ${view === "settings" ? "on" : ""}`} onClick={() => setView("settings")}><SettingsIcon size={14} /></button>
          <button className="navbtn" onClick={onSignOut} title="Sign out"><LogOut size={14} /></button>
        </nav>
      </header>

      {view === "pipeline" && (
        <Pipeline prospects={filtered} counts={counts} total={prospects.length}
          stageFilter={stageFilter} setStageFilter={setStageFilter} query={query} setQuery={setQuery}
          suppression={suppression} settings={settings} onOpen={setSelectedId}
          onNew={newProspect} onLoadSample={loadSamples} />
      )}
      {view === "suppression" && (
        <Suppression list={suppression} onAdd={addSuppression}
          onRemove={async (v) => { await api.removeSuppression(v); setSuppression((prev) => prev.filter((s) => s.value !== v)); }} />
      )}
      {view === "settings" && (
        <SettingsView settings={settings} onSave={async (s) => { await api.saveSettings(s); setSettings(s); }} />
      )}

      {selected && (
        <Detail key={selected.id} p={selected} suppression={suppression} settings={settings}
          onClose={() => { flush(selected.id); setSelectedId(null); }}
          onChange={(patch, immediate) => updateProspect(selected.id, patch, immediate)}
          onDelete={() => removeProspect(selected.id)}
          flushNow={() => flush(selected.id)}
          onReplace={replaceProspect}
          onSuppress={(value) => addSuppression(value)} />
      )}

      {saving && <div className="saving"><Loader2 size={13} className="spin" /> Saving…</div>}
    </>
  );
}

function Pipeline({ prospects, counts, total, stageFilter, setStageFilter, query, setQuery, suppression, settings, onOpen, onNew, onLoadSample }) {
  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow mono">Active mandate</div><h1 className="display">Origination pipeline</h1></div>
        <button className="btn primary" onClick={onNew}><Plus size={15} /> New prospect</button>
      </div>
      <div className="filterbar">
        <div className="searchwrap"><Search size={14} />
          <input className="search" placeholder="Search company, contact, sector…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="chips">
          <button className={`chip ${stageFilter === "all" ? "on" : ""}`} onClick={() => setStageFilter("all")}>All <span className="ct">{total}</span></button>
          {STAGES.filter((s) => counts[s.key] > 0 || stageFilter === s.key).map((s) => (
            <button key={s.key} className={`chip ${stageFilter === s.key ? "on" : ""}`} onClick={() => setStageFilter(s.key)}>{s.label} <span className="ct">{counts[s.key]}</span></button>
          ))}
        </div>
      </div>
      {total === 0 ? (
        <div className="empty"><ScrollText size={26} /><h3>The book is empty.</h3>
          <p>Add your first target, or load a couple of worked examples to see how clearance and drafting flow.</p>
          <div className="empty-actions">
            <button className="btn primary" onClick={onNew}><Plus size={15} /> New prospect</button>
            <button className="btn ghost" onClick={onLoadSample}>Load sample prospects</button>
          </div>
        </div>
      ) : prospects.length === 0 ? (
        <div className="empty"><p>No prospects match this view.</p></div>
      ) : (
        <div className="cards">
          {prospects.map((p) => {
            const ev = evaluate(p, suppression, settings);
            return (
              <button key={p.id} className="card" onClick={() => onOpen(p.id)}>
                {p.needsFollowup && <span className="followup">Follow up</span>}
                <div className="card-top">
                  <div className="avatar"><Building2 size={15} /></div>
                  <div className="card-id">
                    <div className="card-co">{p.company || "Untitled prospect"}</div>
                    <div className="card-meta mono">{p.contact || "—"}{p.title ? ` · ${p.title}` : ""}</div>
                  </div>
                  <ChevronRight size={16} className="card-chev" />
                </div>
                <div className="card-foot">
                  <span className={`tag stage-${p.stage}`}>{STAGE_LABEL[p.stage]}</span>
                  <span className="dealtag mono">{DEAL[p.dealType]?.label}</span>
                  <ClearLamp ev={ev} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ClearLamp({ ev }) {
  if (ev.sendReady) return <span className="lamp ok"><Check size={12} /> Send-ready</span>;
  if (ev.cleared) return <span className="lamp ok"><Check size={12} /> Cleared</span>;
  if (ev.blocking) return <span className="lamp block"><Ban size={12} /> Blocked</span>;
  return <span className="lamp warn"><AlertTriangle size={12} /> Review</span>;
}

function Detail({ p, suppression, settings, onClose, onChange, onDelete, flushNow, onReplace, onSuppress }) {
  const ev = evaluate(p, suppression, settings);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [inbound, setInbound] = useState("");

  const set = (field) => (e) => onChange({ [field]: e.target.value });
  const setLia = (field) => (e) => onChange({ lia: { ...(p.lia || {}), [field]: e.target.value } });

  const run = async (kind, fn) => {
    setBusy(kind); setErr("");
    try { await flushNow(); const next = await fn(); if (next) onReplace(next); }
    catch (e) { setErr(e.message === "unauthorized" ? "Session expired — sign in again." : "Couldn't complete that. Check the connection and try again."); }
    finally { setBusy(""); }
  };

  const genEmail = () => run("email", () => api.draft(p.id));
  const genLia = () => run("lia", () => api.lia(p.id));
  const genReply = () => run("reply", async () => { const r = await api.reply(p.id, inbound, false); return r; });
  const logInbound = () => run("loginbound", async () => { const r = await api.reply(p.id, inbound, true); setInbound(""); return r; });
  const doSend = () => run("send", async () => {
    try { return await api.send(p.id); }
    catch (e) { setErr(e.message || "Send failed."); return null; }
  });

  const fullBody = composeBody(p, ev, settings);
  const copyEmail = async () => { try { await navigator.clipboard.writeText(`Subject: ${p.draft?.subject}\n\n${fullBody}`); } catch {} };

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <button className="iconbtn" onClick={onClose}><ArrowLeft size={18} /></button>
          <div className="dh-id">
            <input className="dh-co" placeholder="Company name" value={p.company} onChange={set("company")} />
            <span className={`tag stage-${p.stage}`}>{STAGE_LABEL[p.stage]}</span>
          </div>
          <button className="iconbtn danger" onClick={onDelete} title="Delete prospect"><Trash2 size={16} /></button>
        </div>

        <div className="drawer-body">
          <Section title="Target" mono="01">
            <div className="grid2">
              <Field label="Contact"><input value={p.contact} onChange={set("contact")} placeholder="Full name" /></Field>
              <Field label="Job title"><input value={p.title} onChange={set("title")} placeholder="e.g. CEO" /></Field>
              <Field label="Corporate email"><input value={p.email} onChange={set("email")} placeholder="name@company.com" /></Field>
              <Field label="Sector"><input value={p.sector} onChange={set("sector")} placeholder="e.g. Vertical SaaS" /></Field>
              <Field label="Entity type">
                <select value={p.entityType} onChange={(e) => onChange({ entityType: e.target.value }, true)}>
                  {ENTITY_TYPES.map((e) => <option key={e.key} value={e.key}>{e.label}</option>)}
                </select>
              </Field>
              <Field label="Transaction context">
                <select value={p.dealType} onChange={(e) => onChange({ dealType: e.target.value }, true)}>
                  {DEAL_TYPES.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Research notes (feeds the AI)">
              <textarea rows={3} value={p.notes} onChange={set("notes")} placeholder="Ownership, traction, recent events, why now…" />
            </Field>
            <div className="stage-row">
              <span className="mono mini">Stage</span>
              <select className="stage-select" value={p.stage} onChange={(e) => onChange({ stage: e.target.value }, true)}>
                {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </Section>

          <Section title="Clearance gate" mono="02">
            <div className="gate">
              {ev.gates.map((g) => (
                <div key={g.id} className={`gate-row ${g.status}`}>
                  <span className="gate-lamp">{g.status === "pass" ? <Check size={13} /> : g.status === "block" ? <X size={13} /> : <AlertTriangle size={13} />}</span>
                  <div className="gate-text">
                    <div className="gate-label">{g.label}</div>
                    <div className="gate-detail">{g.detail}</div>
                    {g.fix && <div className="gate-fix">→ {g.fix}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className={`clearseal ${ev.cleared ? "lit" : ""}`}>
              <Shield size={15} /><span>{ev.cleared ? "Cleared to send" : "Not cleared"}</span>
              <span className="mono mini">{ev.ex.code}</span>
            </div>
            <p className="art28 mono">Treated as a one-off communication under FPO Art. 28 — keep volume low and content individually tailored to preserve the exemption.</p>
            {EXEMPTIONS[ev.exemptionKey].needCertified && (
              <Toggle on={p.certifiedConfirmed} onClick={() => onChange({ certifiedConfirmed: !p.certifiedConfirmed }, true)} label="Recipient's certified HNW / sophisticated status confirmed" />
            )}
            {EXEMPTIONS[ev.exemptionKey].needLinkage && (
              <Toggle on={p.linkageConfirmed} onClick={() => onChange({ linkageConfirmed: !p.linkageConfirmed }, true)} label="Corporate / joint-enterprise linkage verified" />
            )}
            <p className="hint">{ev.ex.note}</p>
          </Section>

          <Section title="Legitimate Interest Assessment" mono="03"
            action={<button className="btn tiny" disabled={busy === "lia"} onClick={genLia}>{busy === "lia" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Draft</button>}>
            <Field label="Purpose"><textarea rows={2} value={p.lia?.purpose || ""} onChange={setLia("purpose")} placeholder="Legitimate commercial rationale" /></Field>
            <Field label="Necessity"><textarea rows={2} value={p.lia?.necessity || ""} onChange={setLia("necessity")} placeholder="Why processing this data is required" /></Field>
            <Field label="Balancing"><textarea rows={2} value={p.lia?.balancing || ""} onChange={setLia("balancing")} placeholder="Why the individual's rights are not overridden" /></Field>
          </Section>

          <Section title="Outreach" mono="04"
            action={<button className="btn tiny" disabled={busy === "email"} onClick={genEmail}>{busy === "email" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {ev.hasDraft ? "Regenerate" : "Draft email"}</button>}>
            {err && <div className="errbox">{err}</div>}
            <Field label="Subject"><input value={p.draft?.subject || ""} onChange={(e) => onChange({ draft: { ...(p.draft || {}), subject: e.target.value } })} placeholder="Subject line" /></Field>
            <Field label="Body (edit freely)"><textarea rows={8} value={p.draft?.body || ""} onChange={(e) => onChange({ draft: { ...(p.draft || {}), body: e.target.value } })} placeholder="Generate a draft, or write your own." /></Field>
            {ev.hasDraft && (
              <div className="preview">
                <div className="preview-label mono">As it will send</div>
                <pre className="preview-body">{fullBody}</pre>
              </div>
            )}
            <div className="send-row">
              <button className="btn primary" disabled={!ev.sendReady || busy === "send"} onClick={doSend}>
                {busy === "send" ? <Loader2 size={15} className="spin" /> : <Send size={15} />} Send from Outlook
              </button>
              <button className="btn ghost" disabled={!ev.hasDraft} onClick={copyEmail}><Copy size={14} /> Copy</button>
            </div>
            {!ev.sendReady && <p className="hint">{!ev.hasDraft ? "Draft an email to enable sending." : "Clear all gates above before sending."}</p>}
            {ev.sendReady && <p className="hint">Sends from {settings.senderEmail} via Microsoft Graph and logs the message below.</p>}
          </Section>

          <Section title="Correspondence" mono="05">
            {(!p.thread || p.thread.length === 0) && <p className="hint">No messages logged yet. Replies are also picked up automatically by the mailbox poller.</p>}
            <div className="thread">
              {(p.thread || []).map((m) => (
                <div key={m.id} className={`msg ${m.dir}`}>
                  <div className="msg-head mono">{m.dir === "out" ? <Send size={11} /> : <User size={11} />}{m.dir === "out" ? "Sent" : "Received"} · {new Date(m.at).toLocaleDateString()}</div>
                  {m.subject && <div className="msg-sub">{m.subject}</div>}
                  <div className="msg-body">{m.body}</div>
                </div>
              ))}
            </div>
            <Field label="Log an inbound reply manually"><textarea rows={3} value={inbound} onChange={(e) => setInbound(e.target.value)} placeholder="Paste the prospect's reply here…" /></Field>
            <div className="send-row">
              <button className="btn ghost" disabled={!inbound.trim() || busy === "loginbound"} onClick={logInbound}>{busy === "loginbound" ? <Loader2 size={13} className="spin" /> : null} Log reply</button>
              <button className="btn tiny" disabled={busy === "reply" || (!inbound.trim() && (!p.thread || p.thread.length === 0))} onClick={genReply}>{busy === "reply" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Draft a reply</button>
            </div>
            <p className="hint">Drafting a reply fills the Outreach panel above so you can edit and send it the same way.</p>
          </Section>

          <Section title="Compliance actions" mono="06">
            <button className="btn ghost wide" onClick={() => { onSuppress(p.email || domainOf(p.email)); onChange({ suppressed: true, stage: "passed" }, true); }}>
              <Ban size={14} /> Add to suppression list (opt-out)
            </button>
            <p className="hint">Use this the moment a contact objects. They will be permanently blocked from outreach.</p>
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Suppression({ list, onAdd, onRemove }) {
  const [val, setVal] = useState("");
  const add = () => { const v = val.trim().toLowerCase(); if (!v) return; onAdd(v); setVal(""); };
  return (
    <main className="page">
      <div className="page-head"><div><div className="eyebrow mono">Do-not-contact</div><h1 className="display">Suppression list</h1></div></div>
      <p className="lead">Any email address or domain here is permanently excluded from outreach. The clearance gate checks every prospect against it, server-side.</p>
      <div className="addrow">
        <input placeholder="address@company.com or company.com" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn primary" onClick={add}><Plus size={15} /> Add</button>
      </div>
      {list.length === 0 ? <div className="empty small"><p>Nothing suppressed yet.</p></div> : (
        <div className="supp-list">
          {list.map((s) => (
            <div key={s.value} className="supp-row">
              <span className="mono">{s.value}</span>
              <span className="supp-date">{new Date(s.at).toLocaleDateString()}</span>
              <button className="iconbtn" onClick={() => onRemove(s.value)}><X size={15} /></button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

function SettingsView({ settings, onSave }) {
  const [s, setS] = useState(settings);
  const [savedTick, setSavedTick] = useState(false);
  useEffect(() => setS(settings), [settings]);
  const f = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);
  const save = async () => { await onSave(s); setSavedTick(true); setTimeout(() => setSavedTick(false), 1500); };
  return (
    <main className="page">
      <div className="page-head">
        <div><div className="eyebrow mono">Configuration</div><h1 className="display">Settings</h1></div>
        <button className="btn primary" disabled={!dirty} onClick={save}>{savedTick ? "Saved" : dirty ? "Save changes" : "Saved"}</button>
      </div>
      <div className="settings-grid">
        <Field label="Firm name"><input value={s.firmName || ""} onChange={f("firmName")} /></Field>
        <Field label="Sender name"><input value={s.senderName || ""} onChange={f("senderName")} /></Field>
        <Field label="Sender title"><input value={s.senderTitle || ""} onChange={f("senderTitle")} /></Field>
        <Field label="Dedicated sending mailbox (must match OUTLOOK_MAILBOX)"><input value={s.senderEmail || ""} onChange={f("senderEmail")} /></Field>
        <Field label="Opt-out address"><input value={s.optOutEmail || ""} onChange={f("optOutEmail")} /></Field>
      </div>
      <Field label="Email signature"><textarea rows={4} value={s.signature || ""} onChange={f("signature")} /></Field>
      <Field label="Origination strategy (shapes AI drafts & LIA)"><textarea rows={2} value={s.strategy || ""} onChange={f("strategy")} /></Field>
      <Field label="Statutory risk warning (attached for Art. 48/50 promotions)"><textarea rows={4} value={s.riskWarning || ""} onChange={f("riskWarning")} /></Field>
      <div className="infra">
        <div className="infra-head"><CircleDot size={13} /> Sending infrastructure checklist</div>
        <ul>
          <li>Send only from an <b>isolated secondary domain</b>, never your primary corporate domain.</li>
          <li>Configure <b>SPF, DKIM and DMARC</b> on the sending domain before any outreach.</li>
          <li><b>Warm up</b> new domains over 4–6 weeks; keep spam complaints under 0.1% and bounces under 2%.</li>
          <li>Validate every address before it enters the pipeline.</li>
          <li>Run AI generation against an <b>enterprise model with Zero Data Retention</b>.</li>
        </ul>
      </div>
    </main>
  );
}

function Section({ title, mono, action, children }) {
  return (
    <section className="sec">
      <div className="sec-head"><div className="sec-title"><span className="sec-num mono">{mono}</span> {title}</div>{action}</div>
      <div className="sec-body">{children}</div>
    </section>
  );
}
function Field({ label, children }) { return <label className="field"><span className="field-label">{label}</span>{children}</label>; }
function Toggle({ on, onClick, label }) {
  return <button className={`toggle ${on ? "on" : ""}`} onClick={onClick}><span className="toggle-box">{on && <Check size={12} />}</span>{label}</button>;
}
