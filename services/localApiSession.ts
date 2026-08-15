const sessionHeader = "X-CineGen-Session";

let sessionToken: Promise<string> | undefined;

export async function localApiFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getLocalSessionToken();
  const headers = new Headers(init.headers);
  headers.set(sessionHeader, token);
  return fetch(input, {
    ...init,
    headers,
    credentials: "same-origin",
  });
}

function getLocalSessionToken(): Promise<string> {
  sessionToken ??= fetch("/api/session", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { accept: "application/json" },
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    const token = (body as { token?: unknown }).token;
    if (!response.ok || typeof token !== "string" || token.length === 0) {
      throw new Error("无法建立本机 AI 会话");
    }
    return token;
  }).catch((error) => {
    sessionToken = undefined;
    throw error;
  });
  return sessionToken;
}
