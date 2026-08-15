import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { DirectorPlan, DirectorPlanInput, StoryboardInput } from "../types";
import type { AiGateway } from "../openaiGateway";
import { JobRunner } from "./jobRunner";
import { JobStore } from "./jobStore";

const directorInput: DirectorPlanInput = {
  lockedScript: "小狐狸跑进废墟。",
  artStyle: "日漫赛璐路",
  tags: ["末世", "悬疑"],
  aspectRatio: "16:9",
  language: "简体中文",
  targetDuration: "60",
};

const validPlan: DirectorPlan = {
  polishedScript: "小狐狸踉跄地跑进废墟。",
  summary: "废墟逃生",
  assets: [{ id: "fox", type: "character", name: "小狐狸", description: "受伤的冒险者" }],
  clips: [{
    id: "clip-1",
    title: "逃生",
    summary: "小狐狸穿过废墟",
    shots: [{
      id: "shot-1",
      title: "冲入废墟",
      shotSize: "远景 WS",
      cameraMovement: "缓慢推进",
      duration: 5,
      action: "小狐狸向前奔跑",
      visualPrompt: "废墟街道，逆光",
      audioItems: [],
      assets: [{ type: "character", id: "fox" }],
    }],
  }],
};

function storyboardFixture(root: string): StoryboardInput & { archiveRoot: string } {
  return {
    projectId: "project-1",
    projectTitle: "余烬回声",
    sceneName: "场次 01",
    clip: validPlan.clips[0],
    assets: validPlan.assets,
    artStyle: "日漫赛璐路",
    tags: ["末世"],
    aspectRatio: "16:9",
    version: 1,
    archiveRoot: root,
  };
}

class FakeGateway implements AiGateway {
  failures = 0;
  readonly storyboardVersions: number[] = [];

  constructor(private readonly failCount = 0) {}

  async createDirectorPlan(): Promise<unknown> {
    return validPlan;
  }

  async generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }> {
    this.storyboardVersions.push(input.version);
    if (this.failures < this.failCount) {
      this.failures += 1;
      const error = new Error("temporary unavailable") as Error & { status: number };
      error.status = 503;
      throw error;
    }
    return { image: Buffer.from("webp-image"), model: "runtime-image-model" };
  }
}

async function setup(gateway: AiGateway) {
  const root = await mkdtemp(join(tmpdir(), "cinegen-runner-"));
  const store = new JobStore(join(root, "jobs"));
  const runner = new JobRunner({ store, gateway, archiveRoot: join(root, "archive"), retryDelayMs: 0 });
  return { root, store, runner };
}

describe("JobRunner", () => {
  it("allows one controlled repair attempt for an invalid director plan", async () => {
    let repairs = 0;
    const gateway: AiGateway = {
      async createDirectorPlan() { return { invalid: true }; },
      async repairDirectorPlan() { repairs += 1; return validPlan; },
      async generateStoryboard() { return { image: Buffer.from("unused"), model: "unused" }; },
    };
    const { store, runner } = await setup(gateway);
    const job = await runner.runDirectorPlan(directorInput);
    await runner.waitFor(job.id);

    expect(repairs).toBe(1);
    expect((await store.get(job.id))?.status).toBe("completed");
  });

  it("rejects new work while the configured concurrency limit is full", async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const gateway: AiGateway = {
      async createDirectorPlan() { await blocked; return validPlan; },
      async generateStoryboard() { return { image: Buffer.from("unused"), model: "unused" }; },
    };
    const root = await mkdtemp(join(tmpdir(), "cinegen-limit-"));
    const store = new JobStore(join(root, "jobs"));
    const runner = new JobRunner({ store, gateway, archiveRoot: join(root, "archive"), maxConcurrentJobs: 1 });
    const first = await runner.runDirectorPlan(directorInput);

    await expect(runner.runDirectorPlan(directorInput)).rejects.toMatchObject({ status: 429, code: "AI_JOB_LIMIT_REACHED" });
    release();
    await runner.waitFor(first.id);
  });

  it("validates and completes a director plan job", async () => {
    const { store, runner } = await setup(new FakeGateway());
    const job = await runner.runDirectorPlan(directorInput);
    await runner.waitFor(job.id);

    const complete = await store.get(job.id);
    expect(complete?.status).toBe("completed");
    expect((complete?.result as DirectorPlan).polishedScript).toContain("踉跄");
  });

  it("archives a storyboard with the model reported by the gateway", async () => {
    const gateway = new FakeGateway();
    const { root, store, runner } = await setup(gateway);
    const job = await runner.runStoryboard(storyboardFixture(join(root, "archive")));
    await runner.waitFor(job.id);

    const complete = await store.get(job.id);
    expect(complete?.status).toBe("completed");
    const result = complete?.result as { imagePath: string; metadataPath: string };
    expect(result.imagePath).toContain("故事板");
    const metadata = JSON.parse(await readFile(result.metadataPath, "utf8")) as { model: string };
    expect(metadata.model).toBe("runtime-image-model");
  });

  it("reserves distinct server-side versions before concurrent paid image calls", async () => {
    const gateway = new FakeGateway();
    const { root, store, runner } = await setup(gateway);
    const input = storyboardFixture(join(root, "archive"));
    const jobs = await Promise.all([
      runner.runStoryboard({ ...input, version: 1 }),
      runner.runStoryboard({ ...input, version: 1 }),
    ]);
    await Promise.all(jobs.map((job) => runner.waitFor(job.id)));

    expect(gateway.storyboardVersions.sort()).toEqual([1, 2]);
    const completed = await Promise.all(jobs.map((job) => store.get(job.id)));
    expect(completed.map((job) => (job?.result as { version: number }).version).sort()).toEqual([1, 2]);
  });

  it("marks a third transient failure as failed", async () => {
    const gateway = new FakeGateway(3);
    const { root, store, runner } = await setup(gateway);
    const job = await runner.runStoryboard(storyboardFixture(join(root, "archive")));
    await runner.waitFor(job.id);

    expect((await store.get(job.id))?.status).toBe("failed");
    expect(gateway.failures).toBe(3);
  });

  it("resumes queued jobs by id and marks uncertain in-progress jobs interrupted", async () => {
    const gateway = new FakeGateway();
    const { store, runner } = await setup(gateway);
    const queued = await store.create("director-plan", directorInput);
    const interrupted = await store.create("director-plan", directorInput);
    await store.update(interrupted.id, { status: "in_progress", progress: 55 });

    await (runner as JobRunner & { reconcilePersistedJobs?: () => Promise<void> }).reconcilePersistedJobs?.();
    await runner.waitFor(queued.id);

    expect((await store.get(queued.id))?.status).toBe("completed");
    expect(await store.get(interrupted.id)).toMatchObject({
      status: "failed",
      errorCode: "JOB_INTERRUPTED",
    });
  });
});
