import type {
  AiSettingsUpdate,
  PublicAiSettings,
  ProviderSettingsInput,
} from "../server/settings/types";

export type {
  AiSettingsUpdate,
  PublicAiSettings,
  PublicProviderSettings,
  ProviderSettingsInput,
} from "../server/settings/types";

export interface AiConnectionTestResult {
  ok: true;
  message: string;
}

export async function getAiSettings(signal?: AbortSignal): Promise<PublicAiSettings> {
  return requestJson<PublicAiSettings>("/api/settings/ai", { signal });
}

export async function saveAiSettings(input: AiSettingsUpdate): Promise<PublicAiSettings> {
  const body: AiSettingsUpdate = {};
  if (input.text) body.text = withoutEmptyApiKey(input.text);
  if (input.image) body.image = withoutEmptyApiKey(input.image);
  return requestJson<PublicAiSettings>("/api/settings/ai", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function clearAiKey(kind: "text" | "image"): Promise<PublicAiSettings> {
  return requestJson<PublicAiSettings>(`/api/settings/ai/${kind}-key`, { method: "DELETE" });
}

export async function testAiConnection(
  kind: "text" | "image",
  input: ProviderSettingsInput,
): Promise<AiConnectionTestResult> {
  return requestJson<AiConnectionTestResult>(`/api/settings/ai/test-${kind}`, {
    method: "POST",
    body: JSON.stringify(withoutEmptyApiKey(input)),
  });
}

function withoutEmptyApiKey(input: ProviderSettingsInput): ProviderSettingsInput {
  const result: ProviderSettingsInput = {
    baseUrl: input.baseUrl,
    model: input.model,
  };
  if (input.apiKey?.trim()) result.apiKey = input.apiKey;
  return result;
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = (body as { error?: unknown }).error;
    throw new Error(typeof error === "string" ? error : `AI settings request failed: ${response.status}`);
  }
  return body as T;
}
