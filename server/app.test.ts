import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AiGateway } from "./openaiGateway";
import { createApp } from "./app";
import { JobRunner } from "./jobs/jobRunner";
import { JobStore } from "./jobs/jobStore";

async function fixtureApp() {
  const root = await mkdtemp(join(tmpdir(), "cinegen-api-"));
  const store = new JobStore(join(root, "jobs"));
  const gateway: AiGateway = {
    async createDirectorPlan() {
      return {};
    },
    async generateStoryboard() {
      return Buffer.from("image");
    },
  };
  const runner = new JobRunner({ store, gateway, archiveRoot: join(root, "archive"), retryDelayMs: 0 });
  return createApp({
    store,
    runner,
    models: { text: "gpt-test", image: "gpt-image-2" },
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

describe("local AI API", () => {
  it("reports configured models without exposing the key", async () => {
    const response = await request(await fixtureApp()).get("/api/health").expect(200);
    expect(response.body.models).toEqual({ text: "gpt-test", image: "gpt-image-2" });
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
});
