import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearAiKey,
  getAiSettings,
  saveAiSettings,
  testAiConnection,
} from "./aiSettingsService";

const publicSettings = {
  text: {
    baseUrl: "https://text.example.test/v1",
    model: "text-model",
    hasKey: true,
    keyMask: "sk-***abcd",
  },
  image: {
    baseUrl: "https://image.example.test/v1",
    model: "image-model",
    hasKey: false,
    keyMask: null,
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("AI settings service", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("gets public settings with the optional abort signal", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/settings/ai");
      expect(init?.signal).toBe(controller.signal);
      expect(init?.body).toBeUndefined();
      return jsonResponse(publicSettings);
    });
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();

    await expect(getAiSettings(controller.signal)).resolves.toEqual(publicSettings);
  });

  it("saves settings with the literal PUT body and omits missing API keys", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/settings/ai");
      expect(init?.method).toBe("PUT");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(init?.body).toBe(JSON.stringify({
        text: { baseUrl: "https://text.example.test/v1", model: "text-model" },
        image: { baseUrl: "https://image.example.test/v1", model: "image-model" },
      }));
      return jsonResponse(publicSettings);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(saveAiSettings({
      text: { baseUrl: "https://text.example.test/v1", model: "text-model" },
      image: { baseUrl: "https://image.example.test/v1", model: "image-model", apiKey: "" },
    })).resolves.toEqual(publicSettings);
  });

  it.each(["text", "image"] as const)("clears the %s provider API key", async (kind) => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(`/api/settings/ai/${kind}-key`);
      expect(init?.method).toBe("DELETE");
      expect(init?.body).toBeUndefined();
      return jsonResponse(publicSettings);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearAiKey(kind)).resolves.toEqual(publicSettings);
  });

  it("tests the selected provider with a literal POST body", async () => {
    const input = {
      baseUrl: "https://text.example.test/v1",
      model: "text-model",
      apiKey: "sk-test",
    };
    const result = { ok: true as const, message: "文本服务连接成功" };
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      expect(request).toBe("/api/settings/ai/test-text");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(init?.body).toBe(JSON.stringify(input));
      return jsonResponse(result);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(testAiConnection("text", input)).resolves.toEqual(result);
  });

  it.each([
    { kind: "text" as const, apiKey: undefined, label: "text with an omitted key" },
    { kind: "text" as const, apiKey: "", label: "text with a blank key" },
    { kind: "image" as const, apiKey: undefined, label: "image with an omitted key" },
    { kind: "image" as const, apiKey: "   ", label: "image with a whitespace key" },
  ])("tests $label without serializing an apiKey", async ({ kind, apiKey }) => {
    const input = {
      baseUrl: `https://${kind}.example.test/v1`,
      model: `${kind}-model`,
      ...(apiKey === undefined ? {} : { apiKey }),
    };
    const result = { ok: true as const, message: `${kind} connection ok` };
    const fetchMock = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
      expect(request).toBe(`/api/settings/ai/test-${kind}`);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(init?.body).toBe(JSON.stringify({
        baseUrl: input.baseUrl,
        model: input.model,
      }));
      return jsonResponse(result);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(testAiConnection(kind, input)).resolves.toEqual(result);
  });

  it("surfaces only the sanitized backend error from failed responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      code: "AI_AUTH_FAILED",
      error: "认证失败，请检查 API Key",
      details: { requestBody: "must not be exposed" },
    }, 401)));

    await expect(clearAiKey("text")).rejects.toThrow("认证失败，请检查 API Key");
    await expect(clearAiKey("text")).rejects.not.toThrow("requestBody");
  });
});
