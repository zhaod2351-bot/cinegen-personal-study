import type { AiGateway } from "../openaiGateway";
import type { DirectorPlan, DirectorPlanInput, StoryboardInput } from "../types";
import {
  archiveStoryboard,
  releaseStoryboardReservation,
  reserveStoryboardVersion,
  type StoryboardArchiveReservation,
  type StoryboardArchiveResult,
} from "../storage/archive";
import { validateDirectorPlan } from "../validation/directorPlan";
import type { AiJob } from "./jobStore";
import { JobStore } from "./jobStore";

export interface JobRunnerOptions {
  store: JobStore;
  gateway: AiGateway;
  archiveRoot: string;
  retryDelayMs?: number;
}

export class JobRunner {
  private readonly active = new Map<string, Promise<void>>();
  private readonly retryDelayMs: number;

  constructor(private readonly options: JobRunnerOptions) {
    this.retryDelayMs = options.retryDelayMs ?? 800;
  }

  async runDirectorPlan(input: DirectorPlanInput): Promise<AiJob<DirectorPlanInput>> {
    const job = await this.options.store.create("director-plan", input);
    this.start(job.id, () => this.executeDirectorPlan(job.id, input));
    return job;
  }

  async runStoryboard(input: StoryboardInput): Promise<AiJob<StoryboardInput>> {
    const reservation = await reserveStoryboardVersion({
      root: this.options.archiveRoot,
      projectTitle: input.projectTitle,
      sceneName: input.sceneName,
    });
    const reservedInput = { ...input, version: reservation.version };
    try {
      const job = await this.options.store.create("storyboard", reservedInput);
      this.start(job.id, () => this.executeStoryboard(job.id, reservedInput, reservation));
      return job;
    } catch (error) {
      await releaseStoryboardReservation(reservation);
      throw error;
    }
  }

  async waitFor(id: string): Promise<void> {
    await this.active.get(id);
  }

  async retry(id: string): Promise<AiJob> {
    const original = await this.options.store.get(id);
    if (!original) throw new Error(`Job not found: ${id}`);
    const retried = await this.options.store.retry(id);
    if (retried.kind === "director-plan") {
      this.start(retried.id, () => this.executeDirectorPlan(retried.id, retried.payload as DirectorPlanInput));
    } else {
      this.start(retried.id, () => this.executeStoryboard(retried.id, retried.payload as StoryboardInput));
    }
    return retried;
  }

  async reconcilePersistedJobs(): Promise<void> {
    const jobs = await this.options.store.list();
    await Promise.all(jobs.filter((job) => job.status === "in_progress").map((job) =>
      this.options.store.update(job.id, {
        status: "failed",
        errorCode: "JOB_INTERRUPTED",
        error: "本地服务重启，无法确认原任务状态，请重试",
      }),
    ));
    for (const job of jobs.filter((candidate) => candidate.status === "queued")) {
      if (job.kind === "director-plan") {
        this.start(job.id, () => this.executeDirectorPlan(job.id, job.payload as DirectorPlanInput));
      } else {
        this.start(job.id, () => this.executeStoryboard(job.id, job.payload as StoryboardInput));
      }
    }
  }

  private start(id: string, work: () => Promise<void>): void {
    const promise = work().finally(() => this.active.delete(id));
    this.active.set(id, promise);
  }

  private async executeDirectorPlan(id: string, input: DirectorPlanInput): Promise<void> {
    await this.options.store.update(id, { status: "in_progress", progress: 15 });
    try {
      const gateway = await this.captureGateway();
      const raw = await this.withTransientRetries(() => gateway.createDirectorPlan(input));
      const plan = validateDirectorPlan(raw);
      await this.options.store.update<DirectorPlanInput, DirectorPlan>(id, {
        status: "completed",
        progress: 100,
        result: plan,
        error: undefined,
      });
    } catch (error) {
      await this.fail(id, error);
    }
  }

  private async executeStoryboard(
    id: string,
    input: StoryboardInput,
    reservation?: StoryboardArchiveReservation,
  ): Promise<void> {
    await this.options.store.update(id, { status: "in_progress", progress: 10 });
    let attempts = 0;
    try {
      const gateway = await this.captureGateway();
      const generated = await this.withTransientRetries(async () => {
        attempts += 1;
        await this.options.store.update(id, { progress: 20 + attempts * 15 });
        return gateway.generateStoryboard(input);
      });
      await this.options.store.update(id, { progress: 85 });
      const archived = await archiveStoryboard({
        root: this.options.archiveRoot,
        projectTitle: input.projectTitle,
        sceneName: input.sceneName,
        version: input.version,
        imageBytes: generated.image,
        metadata: {
          model: generated.model,
          timestamp: new Date().toISOString(),
          taskId: id,
          version: input.version,
          style: input.artStyle,
          shotIds: input.clip.shots.map((shot) => shot.id),
          attempts,
        },
      }, reservation);
      await this.options.store.update<StoryboardInput, StoryboardArchiveResult>(id, {
        status: "completed",
        progress: 100,
        result: archived,
        error: undefined,
      });
    } catch (error) {
      await this.fail(id, error);
    } finally {
      await releaseStoryboardReservation(reservation);
    }
  }

  private async withTransientRetries<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!this.isTransient(error) || attempt === 3) throw error;
        await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * 2 ** (attempt - 1)));
      }
    }
    throw new Error("unreachable retry state");
  }

  private captureGateway(): Promise<AiGateway> {
    return this.options.gateway.captureSnapshot?.() ?? Promise.resolve(this.options.gateway);
  }

  private isTransient(error: unknown): boolean {
    const status = (error as { status?: number }).status;
    return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
  }

  private async fail(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown AI job error";
    await this.options.store.update(id, { status: "failed", error: message });
  }
}
