import type { AiGateway } from "../openaiGateway";
import type { DirectorPlan, DirectorPlanInput, StoryboardInput } from "../types";
import { archiveStoryboard, type StoryboardArchiveResult } from "../storage/archive";
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
    const job = await this.options.store.create("storyboard", input);
    this.start(job.id, () => this.executeStoryboard(job.id, input));
    return job;
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

  private start(id: string, work: () => Promise<void>): void {
    const promise = work().finally(() => this.active.delete(id));
    this.active.set(id, promise);
  }

  private async executeDirectorPlan(id: string, input: DirectorPlanInput): Promise<void> {
    await this.options.store.update(id, { status: "in_progress", progress: 15 });
    try {
      const raw = await this.withTransientRetries(() => this.options.gateway.createDirectorPlan(input));
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

  private async executeStoryboard(id: string, input: StoryboardInput): Promise<void> {
    await this.options.store.update(id, { status: "in_progress", progress: 10 });
    let attempts = 0;
    try {
      const generated = await this.withTransientRetries(async () => {
        attempts += 1;
        await this.options.store.update(id, { progress: 20 + attempts * 15 });
        return this.options.gateway.generateStoryboard(input);
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
      });
      await this.options.store.update<StoryboardInput, StoryboardArchiveResult>(id, {
        status: "completed",
        progress: 100,
        result: archived,
        error: undefined,
      });
    } catch (error) {
      await this.fail(id, error);
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

  private isTransient(error: unknown): boolean {
    const status = (error as { status?: number }).status;
    return status === 408 || status === 409 || status === 429 || (typeof status === "number" && status >= 500);
  }

  private async fail(id: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : "Unknown AI job error";
    await this.options.store.update(id, { status: "failed", error: message });
  }
}
