import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type OpenAI from "openai";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { OpenAIGateway, type AiGateway } from "./openaiGateway";
import { createApp } from "./app";
import { JobRunner } from "./jobs/jobRunner";
import { JobStore } from "./jobs/jobStore";
import { AiSettingsStore } from "./settings/aiSettingsStore";
import type { RuntimeAiSettings, RuntimeProviderSettings } from "./settings/types";

const textKey = "sk-text-must-never-leak-123456";
const imageKey = "sk-image-must-never-leak-abcdef";
const localSessionToken = "test-local-session-token";

class ReversibleProtector {
  async protect(value: string): Promise<string> {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  async unprotect(value: string): Promise<string> {
    return Buffer.from(value, "base64url").toString("utf8");
  }
}

class RecordingConnectionTester {
  readonly textSettings: RuntimeProviderSettings[] = [];
  readonly imageSettings: RuntimeProviderSettings[] = [];

  constructor(private readonly failure?: Error & { status?: number }) {}

  async testText(settings: RuntimeProviderSettings): Promise<void> {
    this.textSettings.push(settings);
    if (this.failure) throw this.failure;
  }

  async testImage(settings: RuntimeProviderSettings): Promise<void> {
    this.imageSettings.push(settings);
    if (this.failure) throw this.failure;
  }
}

const settingsDefaults: RuntimeAiSettings = {
  text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: textKey },
  image: { baseUrl: "https://image.example/v1", model: "image-model", apiKey: imageKey },
};

async function settingsApiFixture(options: {
  failure?: Error & { status?: number };
  defaults?: RuntimeAiSettings;
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "cinegen-settings-api-"));
  const store = new JobStore(join(root, "jobs"));
  const gateway: AiGateway = {
    async createDirectorPlan() {
      return {};
    },
    async generateStoryboard() {
      return { image: Buffer.from("image"), model: "gpt-image-2" };
    },
  };
  const runner = new JobRunner({ store, gateway, archiveRoot: join(root, "archive"), retryDelayMs: 0 });
  const settingsStore = new AiSettingsStore({
    filePath: join(root, "settings", "ai-settings.json"),
    protector: new ReversibleProtector(),
    defaults: options.defaults ?? settingsDefaults,
  });
  const connectionTester = new RecordingConnectionTester(options.failure);
  const app = createApp({
    store,
    runner,
    settingsStore,
    connectionTester,
    archiveRoot: join(root, "archive"),
    sessionToken: localSessionToken,
  });
  return { app, archiveRoot: join(root, "archive"), connectionTester, settingsStore };
}

async function fixtureApp() {
  return (await settingsApiFixture()).app;
}

const storyboard = {
  projectId: "p1",
  projectTitle: "余烬回声",
  sceneName: "场次 01",
  clip: {
    id: "clip-1",
    title: "逃生",
    summary: "小狐狸逃生",
    shots: [{
      id: "shot-1",
      title: "奔跑",
      shotSize: "远景",
      cameraMovement: "推进",
      duration: 5,
      action: "向前奔跑",
      visualPrompt: "废墟街道",
      audioItems: [],
      assets: [{ type: "character", id: "fox" }],
    }],
  },
  assets: [{ id: "fox", type: "character", name: "小狐狸", description: "冒险者" }],
  artStyle: "日漫赛璐路",
  tags: ["末世"],
  aspectRatio: "16:9",
  version: 1,
};

const lockedScript = "LOCKED_SCRIPT_MUST_NOT_APPEAR_IN_ERROR";
const imagePrompt = "IMAGE_PROMPT_MUST_NOT_APPEAR_IN_ERROR";

const directorPlan = {
  lockedScript,
  artStyle: "日漫赛璐路",
  tags: ["安全测试"],
  aspectRatio: "16:9",
  language: "简体中文",
  targetDuration: "60",
};

function upstreamError(message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status: 401 });
}

async function failingProviderFixture() {
  const root = await mkdtemp(join(tmpdir(), "cinegen-api-secrets-"));
  const store = new JobStore(join(root, "jobs"));
  const settings: RuntimeAiSettings = {
    text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: textKey },
    image: { baseUrl: "https://image.example/v1", model: "image-model", apiKey: imageKey },
  };
  const gateway = new OpenAIGateway(async () => settings, () => ({
    chat: {
      completions: {
        create: async (input: unknown) => {
          throw upstreamError(`upstream text dump key=${textKey} request=${JSON.stringify(input)}`);
        },
      },
    },
    images: {
      generate: async (input: unknown) => {
        throw upstreamError(`upstream image dump key=${imageKey} request=${JSON.stringify(input)}`);
      },
    },
  }) as unknown as OpenAI);
  const runner = new JobRunner({ store, gateway, archiveRoot: join(root, "archive"), retryDelayMs: 0 });
  const settingsStore = new AiSettingsStore({
    filePath: join(root, "settings", "ai-settings.json"),
    protector: new ReversibleProtector(),
    defaults: settings,
  });
  const app = createApp({
    store,
    runner,
    settingsStore,
    connectionTester: new RecordingConnectionTester(),
    sessionToken: localSessionToken,
  });
  return { app, root, runner };
}

describe("local AI API", () => {
  it("rejects remote hosts and origins before they can change a provider", async () => {
    const { app, settingsStore } = await settingsApiFixture();
    const maliciousUpdate = {
      text: { baseUrl: "https://attacker.example/v1", model: "stolen-key-relay" },
    };

    await request(app)
      .put("/api/settings/ai")
      .set("Host", "192.168.1.25:8787")
      .set("Origin", "http://192.168.1.25:3000")
      .set("X-CineGen-Session", localSessionToken)
      .send(maliciousUpdate)
      .expect(403);

    await request(app)
      .put("/api/settings/ai")
      .set("Host", "127.0.0.1:8787")
      .set("Origin", "https://attacker.example")
      .set("X-CineGen-Session", localSessionToken)
      .send(maliciousUpdate)
      .expect(403);

    expect((await settingsStore.getRuntimeSettings()).text).toEqual(settingsDefaults.text);
  });

  it("requires the bootstrapped in-memory session token for sensitive local API access", async () => {
    const { app, settingsStore } = await settingsApiFixture();
    const update = {
      text: { baseUrl: "https://local.example/v1", model: "local-model" },
    };

    await request(app)
      .put("/api/settings/ai")
      .set("Host", "127.0.0.1:8787")
      .set("Origin", "http://127.0.0.1:3000")
      .send(update)
      .expect(401);

    const session = await request(app)
      .get("/api/session")
      .set("Host", "127.0.0.1:8787")
      .set("Origin", "http://127.0.0.1:3000")
      .expect(200);
    expect(session.body).toEqual({ token: localSessionToken });

    await request(app)
      .put("/api/settings/ai")
      .set("Host", "127.0.0.1:8787")
      .set("Origin", "http://127.0.0.1:3000")
      .set("X-CineGen-Session", session.body.token as string)
      .send(update)
      .expect(200);

    expect((await settingsStore.getRuntimeSettings()).text).toMatchObject(update.text);
  });

  it.each([
    ["PUT", "/api/settings/ai"],
    ["POST", "/api/settings/ai/test-text"],
    ["POST", "/api/settings/ai/test-image"],
  ])("returns a fixed 400 for malformed JSON sent to %s settings routes", async (method, route) => {
    const { app } = await settingsApiFixture();
    const malformed = '{"apiKey":"LEAKME_SECRET",broken';

    const response = await request(app)[method.toLowerCase() as "put" | "post"](route)
      .set("Content-Type", "application/json")
      .send(malformed)
      .expect(400);

    expect(response.body).toEqual({ code: "INVALID_JSON", error: "请求 JSON 格式无效" });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("LEAKME_SECRET");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("broken");
  });

  it("returns only the redacted AI settings DTO", async () => {
    const { app } = await settingsApiFixture();

    const response = await request(app).get("/api/settings/ai").expect(200);

    expect(response.body).toEqual({
      text: { baseUrl: "https://text.example/v1", model: "text-model", hasKey: true, keyMask: "sk-****3456" },
      image: { baseUrl: "https://image.example/v1", model: "image-model", hasKey: true, keyMask: "sk-****cdef" },
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(textKey);
    expect(serialized).not.toContain(imageKey);
    expect(serialized).not.toContain(Buffer.from(textKey).toString("base64url"));
    expect(serialized).not.toContain("protectedKey");
  });

  it("updates providers while preserving an omitted key and returns the redacted DTO", async () => {
    const { app, settingsStore } = await settingsApiFixture();

    const response = await request(app).put("/api/settings/ai").send({
      text: { baseUrl: "https://new-text.example/v2", model: "  text-next  " },
      image: { baseUrl: "https://new-image.example/v2", model: "image-next", apiKey: "  im-new-87654321  " },
    }).expect(200);

    expect(response.body).toEqual({
      text: { baseUrl: "https://new-text.example/v2", model: "text-next", hasKey: true, keyMask: "sk-****3456" },
      image: { baseUrl: "https://new-image.example/v2", model: "image-next", hasKey: true, keyMask: "im-****4321" },
    });
    expect(await settingsStore.getRuntimeSettings()).toEqual({
      text: { baseUrl: "https://new-text.example/v2", model: "text-next", apiKey: textKey },
      image: { baseUrl: "https://new-image.example/v2", model: "image-next", apiKey: "im-new-87654321" },
    });
    expect(JSON.stringify(response.body)).not.toContain("im-new-87654321");
    expect(JSON.stringify(response.body)).not.toContain("protectedKey");
  });

  it("rejects an empty key without clearing the saved key", async () => {
    const { app, settingsStore } = await settingsApiFixture();

    const response = await request(app).put("/api/settings/ai").send({
      text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: "   " },
    }).expect(400);

    expect(response.body).toEqual({ code: "INVALID_AI_SETTINGS", error: "AI 设置输入无效" });
    expect((await settingsStore.getRuntimeSettings()).text.apiKey).toBe(textKey);
  });

  it("clears only the requested key and returns the redacted DTO", async () => {
    const { app } = await settingsApiFixture();

    const response = await request(app).delete("/api/settings/ai/text-key").expect(200);

    expect(response.body).toEqual({
      text: { baseUrl: "https://text.example/v1", model: "text-model", hasKey: false, keyMask: null },
      image: { baseUrl: "https://image.example/v1", model: "image-model", hasKey: true, keyMask: "sk-****cdef" },
    });
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain(textKey);
    expect(serialized).not.toContain(imageKey);
    expect(serialized).not.toContain("protectedKey");
  });

  it("tests text settings with a temporary key without persisting them", async () => {
    const { app, connectionTester, settingsStore } = await settingsApiFixture();

    const response = await request(app).post("/api/settings/ai/test-text").send({
      baseUrl: "https://temporary-text.example/v1",
      model: " temporary-text-model ",
      apiKey: " temporary-text-key ",
    }).expect(200);

    expect(response.body).toEqual({ ok: true, message: "文本服务连接成功" });
    expect(connectionTester.textSettings).toEqual([{
      baseUrl: "https://temporary-text.example/v1",
      model: "temporary-text-model",
      apiKey: "temporary-text-key",
    }]);
    expect(await settingsStore.getRuntimeSettings()).toEqual(settingsDefaults);
    expect(JSON.stringify(response.body)).not.toContain("temporary-text-key");
  });

  it("tests image settings with the saved key without persisting form fields", async () => {
    const { app, connectionTester, settingsStore } = await settingsApiFixture();

    const response = await request(app).post("/api/settings/ai/test-image").send({
      baseUrl: "https://temporary-image.example/v1",
      model: "temporary-image-model",
    }).expect(200);

    expect(response.body).toEqual({ ok: true, message: "图片服务连接成功" });
    expect(connectionTester.imageSettings).toEqual([{
      baseUrl: "https://temporary-image.example/v1",
      model: "temporary-image-model",
      apiKey: imageKey,
    }]);
    expect(await settingsStore.getRuntimeSettings()).toEqual(settingsDefaults);
    expect(JSON.stringify(response.body)).not.toContain(imageKey);
  });

  it("returns 409 when a connection test has neither a temporary nor saved key", async () => {
    const { app } = await settingsApiFixture();
    await request(app).delete("/api/settings/ai/image-key").expect(200);

    const response = await request(app).post("/api/settings/ai/test-image").send({
      baseUrl: "https://image.example/v1",
      model: "image-model",
    }).expect(409);

    expect(response.body).toEqual({ code: "AI_KEY_MISSING", error: "尚未配置图片服务 API Key" });
  });

  it.each([
    [401, "AI_AUTH_FAILED", "认证失败，请检查 API Key"],
    [429, "AI_RATE_LIMITED", "服务请求过于频繁，请稍后重试"],
    [500, "AI_CONNECTION_FAILED", "文本服务连接失败，请检查 Base URL 和模型兼容性"],
  ])("maps an upstream %s without exposing provider details", async (upstreamStatus, code, error) => {
    const leakedMessage = `provider dump key=${textKey} prompt=PRIVATE_CONNECTION_PROMPT`;
    const failure = Object.assign(new Error(leakedMessage), { status: upstreamStatus });
    const { app } = await settingsApiFixture({ failure });

    const response = await request(app).post("/api/settings/ai/test-text").send({
      baseUrl: "https://text.example/v1",
      model: "text-model",
    }).expect(upstreamStatus === 500 ? 502 : upstreamStatus);

    expect(response.body).toEqual({ code, error });
    expect(JSON.stringify(response.body)).not.toContain(textKey);
    expect(JSON.stringify(response.body)).not.toContain("PRIVATE_CONNECTION_PROMPT");
  });

  it.each([
    [{ baseUrl: "ftp://text.example/v1", model: "text-model" }],
    [{ baseUrl: "https://secret@text.example/v1", model: "text-model" }],
    [{ baseUrl: "https://text.example/v1", model: "   " }],
  ])("returns a stable 400 response for invalid connection settings", async (payload) => {
    const { app } = await settingsApiFixture();

    const response = await request(app).post("/api/settings/ai/test-text").send(payload).expect(400);

    expect(response.body).toEqual({ code: "INVALID_AI_SETTINGS", error: "AI 设置输入无效" });
  });

  it("reports the latest saved models without exposing the key", async () => {
    const { app, archiveRoot } = await settingsApiFixture();
    await request(app).put("/api/settings/ai").send({
      text: { baseUrl: "https://text.example/v1", model: "live-text-model" },
      image: { baseUrl: "https://image.example/v1", model: "live-image-model" },
    }).expect(200);

    const response = await request(app).get("/api/health").expect(200);

    expect(response.body).toEqual({
      ok: true,
      models: { text: "live-text-model", image: "live-image-model" },
      archiveRoot,
    });
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("creates and polls a storyboard job", async () => {
    const app = await fixtureApp();
    const created = await request(app).post("/api/storyboards").send(storyboard).expect(202);
    expect(created.body.status).toBe("queued");
    await request(app).get(`/api/jobs/${created.body.jobId}`).expect(200);
  });

  it("validates and preserves bounded asset reference images in the job payload", async () => {
    const app = await fixtureApp();
    const referenceImages = [{ mimeType: "image/webp", data: Buffer.from("reference").toString("base64") }];
    const created = await request(app).post("/api/storyboards").send({
      ...storyboard,
      assets: [{ ...storyboard.assets[0], referenceImages }],
    }).expect(202);

    const stored = await request(app).get(`/api/jobs/${created.body.jobId}`).expect(200);
    expect(stored.body.payload.assets[0].referenceImages).toEqual(referenceImages);
  });

  it.each([
    { referenceImages: [{ mimeType: "image/gif", data: "R0lGODlh" }], label: "unsupported MIME" },
    { referenceImages: [{ mimeType: "image/png", data: "not-valid-base64%%%" }], label: "invalid base64" },
    { referenceImages: Array.from({ length: 9 }, () => ({ mimeType: "image/png", data: "aW1hZ2U=" })), label: "too many references in one request" },
    { referenceImages: [{ mimeType: "image/png", data: Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64") }], label: "an oversized decoded image" },
  ])("rejects $label reference images before creating a paid job", async ({ referenceImages }) => {
    const app = await fixtureApp();
    await request(app).post("/api/storyboards").send({
      ...storyboard,
      assets: [{ ...storyboard.assets[0], referenceImages }],
    }).expect(400);
  });

  it("returns 400 for malformed requests and 404 for unknown jobs", async () => {
    const app = await fixtureApp();
    await request(app).post("/api/storyboards").send({}).expect(400);
    await request(app).get("/api/jobs/missing").expect(404);
  });

  it.each([
    ["text", "/api/director-plans", directorPlan, lockedScript, "Text provider request failed"],
    ["image", "/api/storyboards", {
      ...storyboard,
      clip: {
        ...storyboard.clip,
        shots: [{ ...storyboard.clip.shots[0], visualPrompt: imagePrompt }],
      },
    }, imagePrompt, "Image provider request failed"],
  ])("keeps %s provider failures secret in jobs, disk, and API responses", async (
    _kind,
    route,
    payload,
    promptMarker,
    safeMessage,
  ) => {
    const { app, root, runner } = await failingProviderFixture();
    const created = await request(app).post(route).send(payload).expect(202);
    await runner.waitFor(created.body.jobId as string);

    const response = await request(app).get(`/api/jobs/${created.body.jobId}`).expect(200);
    const jobsFile = await readFile(join(root, "jobs", "jobs.json"), "utf8");
    const jobs = JSON.parse(jobsFile) as Array<{ id: string; error?: string }>;
    const persisted = jobs.find((job) => job.id === created.body.jobId);

    expect(response.body.error).toBe(safeMessage);
    expect(persisted?.error).toBe(safeMessage);
    expect(response.body.error).not.toContain(promptMarker);
    expect(persisted?.error).not.toContain(promptMarker);
    for (const key of [textKey, imageKey]) {
      expect(JSON.stringify(response.body)).not.toContain(key);
      expect(jobsFile).not.toContain(key);
    }
  });
});
