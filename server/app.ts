import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z, ZodError, type ZodType } from "zod";
import type { JobRunner } from "./jobs/jobRunner";
import type { JobStore } from "./jobs/jobStore";
import {
  createLocalSessionToken,
  enforceLoopbackRequest,
  requireBrowserSession,
} from "./localApiSecurity";
import type { AiConnectionSettings, AiConnectionTester } from "./openaiGateway";
import type { AiSettingsStore } from "./settings/aiSettingsStore";

const assetType = z.enum(["character", "scene", "prop"]);
const maxReferenceImageBytes = 4 * 1024 * 1024;
const maxReferenceBytesPerStoryboard = 8 * 1024 * 1024;
const maxReferenceImagesPerStoryboard = 8;
const referenceImage = z.strictObject({
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  data: z.string()
    .max(Math.ceil(maxReferenceImageBytes / 3) * 4)
    .refine(isCanonicalBase64),
}).refine((value) => decodedBase64Bytes(value.data) <= maxReferenceImageBytes);
const assetReference = z.object({ type: assetType, id: z.string().min(1) });
const asset = z.object({
  id: z.string().min(1),
  type: assetType,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).optional(),
  referenceImages: z.array(referenceImage).max(maxReferenceImagesPerStoryboard).optional(),
});
const audioItem = z.object({
  type: z.enum(["对白", "旁白", "音效", "环境音", "音乐"]),
  content: z.string().min(1),
  speaker: z.string().optional(),
});
const shot = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shotSize: z.string().min(1),
  cameraMovement: z.string().min(1),
  duration: z.number().positive().max(60),
  action: z.string().min(1),
  visualPrompt: z.string().min(1),
  audioItems: z.array(audioItem),
  assets: z.array(assetReference),
});
const clip = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  shots: z.array(shot).min(1),
});
const directorPlanInput = z.object({
  lockedScript: z.string().min(1),
  artStyle: z.string().min(1),
  tags: z.array(z.string()),
  aspectRatio: z.string().min(1),
  language: z.string().min(1),
  targetDuration: z.string().min(1),
});
const storyboardInput = z.object({
  projectId: z.string().min(1),
  projectTitle: z.string().min(1),
  sceneName: z.string().min(1),
  clip,
  assets: z.array(asset),
  artStyle: z.string().min(1),
  tags: z.array(z.string()),
  aspectRatio: z.string().min(1),
  version: z.number().int().positive(),
}).superRefine((value, context) => {
  const references = value.assets.flatMap((item) => item.referenceImages ?? []);
  const totalBytes = references.reduce((sum, item) => sum + decodedBase64Bytes(item.data), 0);
  if (references.length > maxReferenceImagesPerStoryboard) {
    context.addIssue({ code: "custom", path: ["assets"], message: "too many reference images" });
  }
  if (totalBytes > maxReferenceBytesPerStoryboard) {
    context.addIssue({ code: "custom", path: ["assets"], message: "reference images are too large" });
  }
});
const providerSettingsInput = z.strictObject({
  baseUrl: z.string().trim().min(1).refine((value) => {
    try {
      const url = new URL(value);
      return (url.protocol === "http:" || url.protocol === "https:")
        && !url.username
        && !url.password;
    } catch {
      return false;
    }
  }),
  model: z.string().trim().min(1),
  apiKey: z.string().trim().min(1).optional(),
});
const aiSettingsUpdateInput = z.strictObject({
  text: providerSettingsInput.optional(),
  image: providerSettingsInput.optional(),
});

export interface AppDependencies {
  store: JobStore;
  runner: JobRunner;
  settingsStore: AiSettingsStore;
  connectionTester: AiConnectionTester;
  archiveRoot?: string;
  distPath?: string;
  sessionToken?: string;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  const sessionToken = deps.sessionToken ?? createLocalSessionToken();
  app.use("/api", enforceLoopbackRequest);
  app.get("/api/session", (_request, response) => {
    response.set({ "Cache-Control": "no-store", Pragma: "no-cache" });
    response.json({ token: sessionToken });
  });
  app.use("/api", requireBrowserSession(sessionToken));
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", settingsRoute(async (_request, response) => {
    const settings = await deps.settingsStore.getPublicSettings();
    response.json({
      ok: true,
      models: { text: settings.text.model, image: settings.image.model },
      archiveRoot: deps.archiveRoot,
    });
  }));

  app.get("/api/settings/ai", settingsRoute(async (_request, response) => {
    response.json(await deps.settingsStore.getPublicSettings());
  }));

  app.put("/api/settings/ai", settingsRoute(async (request, response) => {
    const input = parseSettingsBody(aiSettingsUpdateInput, request.body, response);
    if (!input) return;
    response.json(await deps.settingsStore.update(input));
  }));

  app.delete("/api/settings/ai/text-key", settingsRoute(async (_request, response) => {
    response.json(await deps.settingsStore.clearKey("text"));
  }));

  app.delete("/api/settings/ai/image-key", settingsRoute(async (_request, response) => {
    response.json(await deps.settingsStore.clearKey("image"));
  }));

  app.post("/api/settings/ai/test-text", settingsRoute(async (request, response) => {
    await testConnection("text", request.body, response, deps);
  }));

  app.post("/api/settings/ai/test-image", settingsRoute(async (request, response) => {
    await testConnection("image", request.body, response, deps);
  }));

  app.post("/api/director-plans", asyncRoute(async (request, response) => {
    const job = await deps.runner.runDirectorPlan(directorPlanInput.parse(request.body));
    response.status(202).json({ jobId: job.id, status: job.status });
  }));

  app.post("/api/storyboards", asyncRoute(async (request, response) => {
    const job = await deps.runner.runStoryboard(storyboardInput.parse(request.body));
    response.status(202).json({ jobId: job.id, status: job.status });
  }));

  app.get("/api/jobs/:id", asyncRoute(async (request, response) => {
    const job = await deps.store.get(String(request.params.id));
    if (!job) return response.status(404).json({ error: "未找到该生成任务" });
    return response.json(job);
  }));

  app.get("/api/jobs/:id/image", asyncRoute(async (request, response) => {
    const job = await deps.store.get<unknown, { imagePath?: string }>(String(request.params.id));
    const imagePath = job?.status === "completed" ? job.result?.imagePath : undefined;
    if (!imagePath || !existsSync(imagePath)) return response.status(404).json({ error: "未找到该故事板图像" });
    return response.sendFile(resolve(imagePath));
  }));

  app.post("/api/jobs/:id/retry", asyncRoute(async (request, response) => {
    const existing = await deps.store.get(String(request.params.id));
    if (!existing) return response.status(404).json({ error: "未找到该生成任务" });
    const job = await deps.runner.retry(existing.id);
    return response.status(202).json({ jobId: job.id, status: job.status });
  }));

  const distPath = deps.distPath ? resolve(deps.distPath) : undefined;
  if (distPath && existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((request, response, next) => {
      if (request.path.startsWith("/api/")) return next();
      return response.sendFile(resolve(distPath, "index.html"));
    });
  }

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if ((error as { type?: unknown })?.type === "entity.parse.failed") {
      return response.status(400).json({ code: "INVALID_JSON", error: "请求 JSON 格式无效" });
    }
    if (error instanceof ZodError) {
      return response.status(400).json({ error: "请求数据不完整", details: error.issues });
    }
    const httpError = error as { status?: unknown; code?: unknown; message?: unknown };
    if (typeof httpError.status === "number" && httpError.status >= 400 && httpError.status < 500) {
      return response.status(httpError.status).json({
        ...(typeof httpError.code === "string" ? { code: httpError.code } : {}),
        error: typeof httpError.message === "string" ? httpError.message : "请求失败",
      });
    }
    const message = error instanceof Error ? error.message : "未知服务器错误";
    return response.status(500).json({ error: message });
  });
  return app;
}

function asyncRoute(
  handler: (request: Request, response: Response, next: NextFunction) => Promise<unknown>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    void handler(request, response, next).catch(next);
  };
}

function settingsRoute(
  handler: (request: Request, response: Response) => Promise<unknown>,
) {
  return asyncRoute(async (request, response) => {
    try {
      return await handler(request, response);
    } catch {
      return response.status(500).json({
        code: "AI_SETTINGS_FAILED",
        error: "AI 设置操作失败",
      });
    }
  });
}

function parseSettingsBody<T>(schema: ZodType<T>, body: unknown, response: Response): T | undefined {
  const result = schema.safeParse(body);
  if (!result.success) {
    response.status(400).json({ code: "INVALID_AI_SETTINGS", error: "AI 设置输入无效" });
    return undefined;
  }
  return result.data;
}

async function testConnection(
  kind: "text" | "image",
  body: unknown,
  response: Response,
  deps: Pick<AppDependencies, "settingsStore" | "connectionTester">,
): Promise<void> {
  const input = parseSettingsBody(providerSettingsInput, body, response);
  if (!input) return;

  const saved = (await deps.settingsStore.getRuntimeSettings())[kind];
  const apiKey = input.apiKey ?? saved.apiKey;
  if (!apiKey) {
    response.status(409).json({
      code: "AI_KEY_MISSING",
      error: `尚未配置${kind === "text" ? "文本" : "图片"}服务 API Key`,
    });
    return;
  }

  const settings: AiConnectionSettings = {
    baseUrl: input.baseUrl,
    model: input.model,
    apiKey,
  };
  try {
    if (kind === "text") await deps.connectionTester.testText(settings);
    else await deps.connectionTester.testImage(settings);
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (status === 401 || status === 403) {
      response.status(401).json({ code: "AI_AUTH_FAILED", error: "认证失败，请检查 API Key" });
      return;
    }
    if (status === 429) {
      response.status(429).json({ code: "AI_RATE_LIMITED", error: "服务请求过于频繁，请稍后重试" });
      return;
    }
    response.status(502).json({
      code: "AI_CONNECTION_FAILED",
      error: `${kind === "text" ? "文本" : "图片"}服务连接失败，请检查 Base URL 和模型兼容性`,
    });
    return;
  }

  response.json({
    ok: true,
    message: `${kind === "text" ? "文本" : "图片"}服务连接成功`,
  });
}

function isCanonicalBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}
