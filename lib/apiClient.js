// lib/apiClient.js
"use client";

function authHeader() {
  if (typeof window === "undefined") return {};
  const pw = window.localStorage.getItem("mna_pw");
  return pw ? { Authorization: `Bearer ${pw}` } : {};
}

async function req(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    if (typeof window !== "undefined") window.localStorage.removeItem("mna_pw");
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const api = {
  listProspects: () => req("GET", "/api/prospects"),
  createProspect: (p) => req("POST", "/api/prospects", p),
  updateProspect: (id, patch) => req("PATCH", `/api/prospects/${id}`, patch),
  deleteProspect: (id) => req("DELETE", `/api/prospects/${id}`),
  draft: (id) => req("POST", `/api/prospects/${id}/draft`),
  lia: (id) => req("POST", `/api/prospects/${id}/lia`),
  reply: (id, inbound, logInbound) => req("POST", `/api/prospects/${id}/reply`, { inbound, logInbound }),
  send: (id) => req("POST", `/api/prospects/${id}/send`),
  getSuppression: () => req("GET", "/api/suppression"),
  addSuppression: (value) => req("POST", "/api/suppression", { value }),
  removeSuppression: (value) => req("DELETE", "/api/suppression", { value }),
  getSettings: () => req("GET", "/api/settings"),
  saveSettings: (data) => req("PUT", "/api/settings", data),
};
