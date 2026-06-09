// lib/auth.js
// Minimal shared-secret guard for a first deployment. For production with
// multiple users, replace with SSO (e.g. Microsoft Entra ID via NextAuth).
export function authorized(req) {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return true; // not configured -> open (dev only)
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${expected}`;
}
