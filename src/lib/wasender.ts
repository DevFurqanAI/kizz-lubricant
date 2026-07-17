/**
 * Minimal server-side client for WasenderApi (https://wasenderapi.com).
 *
 * Sending a document is a two-step flow because the messaging endpoint only
 * accepts a *publicly reachable* URL — it cannot read a local file or a blob.
 * So we first upload the bytes to Wasender's media host (which returns a URL
 * valid for 24h), then reference that URL in the send-message call.
 *
 * The API key lives in WASENDER_API_KEY (server env only — never exposed to
 * the browser).
 */

const BASE = "https://wasenderapi.com/api";

function apiKey(): string {
  const key = process.env.WASENDER_API_KEY;
  if (!key) throw new Error("WASENDER_API_KEY is not configured on the server");
  return key;
}

/** Upload raw bytes and return the public URL Wasender hosts them at. */
export async function uploadMedia(base64DataUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/upload`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({ base64: base64DataUrl }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    publicUrl?: string;
    message?: string;
  };
  if (!res.ok || !data.publicUrl) {
    throw new Error(data.message || `Media upload failed (HTTP ${res.status})`);
  }
  return data.publicUrl;
}

/** Send a document message to a WhatsApp number (international digits, no `+`). */
export async function sendDocument(opts: {
  to: string;
  documentUrl: string;
  fileName: string;
  text?: string;
}): Promise<void> {
  const res = await fetch(`${BASE}/send-message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey()}`,
    },
    body: JSON.stringify({
      to: `+${opts.to}`,
      text: opts.text,
      documentUrl: opts.documentUrl,
      fileName: opts.fileName,
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(data.message || `WhatsApp send failed (HTTP ${res.status})`);
  }
}
