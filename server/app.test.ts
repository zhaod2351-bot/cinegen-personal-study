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
import type { RuntimeAiSettings } from "./settings/types";

async function fixtureApp() {
  const root = await mkdtemp(join(tmpdir(), "cinegen-api-"));
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
  return createApp({
    store,
    runner,
    models: { text: "gpt-test", image: "runtime-image-model" },
  });
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

const textKey = "sk-text-must-never-leak-123456";
const imageKey = "sk-image-must-never-leak-abcdef";
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
  const app = createApp({ store, runner, models: { text: "text-model", image: "image-model" } });
  return { app, root, runner };
}

describe("local AI API", () => {
  it("reports configured models without exposing the key", async () => {
    const response = await request(await fixtureApp()).get("/api/health").expect(200);
    expect(response.body.models).toEqual({ text: "gpt-test", image: "runtime-image-model" });
    expect(JSON.stringify(response.body)).not.toContain("secret");
  });

  it("creates and polls a storyboard job", async () => {
    const app = await fixtureApp();
    const created = await request(app).post("/api/storyboards").send(storyboard).expect(202);
    expect(created.body.status).toBe("queued");
    await request(app).get(`/api/jobs/${created.body.jobId}`).expect(200);
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
