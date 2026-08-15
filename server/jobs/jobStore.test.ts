import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { JobStore } from "./jobStore";

describe("JobStore", () => {
  it("restores a completed job after creating a new store", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cinegen-jobs-"));
    const first = new JobStore(directory);
    const job = await first.create("storyboard", { projectId: "p1" });

    await first.update(job.id, { status: "completed", progress: 100 });

    const restored = await new JobStore(directory).get(job.id);
    expect(restored?.status).toBe("completed");
    expect(restored?.progress).toBe(100);
  });

  it("retry preserves the original payload and increments attempts", async () => {
    const directory = await mkdtemp(join(tmpdir(), "cinegen-jobs-"));
    const store = new JobStore(directory);
    const failed = await store.create("director-plan", { projectId: "p1" });
    await store.update(failed.id, { status: "failed", error: "network" });

    const retried = await store.retry(failed.id);

    expect(retried.id).not.toBe(failed.id);
    expect(retried.payload).toEqual({ projectId: "p1" });
    expect(retried.attempt).toBe(2);
    expect(retried.status).toBe("queued");
    expect((await store.get(failed.id))?.status).toBe("failed");
  });

  it("creates a retry attempt only from a failed job", async () => {
    const root = await mkdtemp(join(tmpdir(), "cinegen-job-retry-"));
    const store = new JobStore(root);
    const queued = await store.create("director-plan", { script: "locked" });

    await expect(store.retry(queued.id)).rejects.toMatchObject({ status: 409 });
    await store.update(queued.id, { status: "failed", error: "provider failed" });
    const retried = await store.retry(queued.id);

    expect(retried).toMatchObject({ attempt: 2, retriedFrom: queued.id, status: "queued" });
  });
});
