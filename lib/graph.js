// lib/graph.js
// App-only (client credentials) access to a single dedicated Outlook mailbox.
// Requires an Azure AD app registration with the application permissions
// Mail.Send and Mail.Read, granted admin consent. See README.

const GRAPH = "https://graph.microsoft.com/v1.0";

async function token() {
  const tenant = process.env.MS_TENANT_ID;
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID,
    client_secret: process.env.MS_CLIENT_SECRET,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) throw new Error(`Graph token failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

const mailbox = () => process.env.OUTLOOK_MAILBOX; // e.g. outreach@yourfirm-capital.com

export async function sendMail({ to, subject, body, contactName }) {
  const t = await token();
  const message = {
    message: {
      subject,
      body: { contentType: "Text", content: body },
      toRecipients: [{ emailAddress: { address: to, name: contactName || to } }],
    },
    saveToSentItems: true,
  };
  const res = await fetch(`${GRAPH}/users/${encodeURIComponent(mailbox())}/sendMail`, {
    method: "POST",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });
  if (!res.ok) throw new Error(`sendMail failed: ${res.status} ${await res.text()}`);
  return true;
}

// Fetch messages received since `sinceIso` (ISO 8601), newest first.
export async function recentMessages(sinceIso) {
  const t = await token();
  const filter = encodeURIComponent(`receivedDateTime ge ${sinceIso}`);
  const url = `${GRAPH}/users/${encodeURIComponent(mailbox())}/mailFolders/inbox/messages` +
    `?$filter=${filter}&$orderby=receivedDateTime desc&$top=50` +
    `&$select=id,subject,receivedDateTime,bodyPreview,from`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${t}` } });
  if (!res.ok) throw new Error(`list messages failed: ${res.status} ${await res.text()}`);
  return (await res.json()).value || [];
}
