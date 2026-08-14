import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import { z, ZodError } from "zod";
import type { JobRunner } from "./jobs/jobRunner";
import type { JobStore } from "./jobs/jobStore";

const assetType = z.enum(["character", "scene", "prop"]);
const assetReference = z.object({ type: assetType, id: z.string().min(1) });
const asset = z.object({
  id: z.string().min(1),
  type: assetType,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string()).optional(),
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
});

export interface AppDependencies {
  store: JobStore;
  runner: JobRunner;
  models: { text: string; image: string };
  archiveRoot?: string;
  distPath?: string;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "25mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true, models: deps.models, archiveRoot: deps.archiveRoot });
  });

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
    if (error instanceof ZodError) {
      return response.status(400).json({ error: "请求数据不完整", details: error.issues });
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
