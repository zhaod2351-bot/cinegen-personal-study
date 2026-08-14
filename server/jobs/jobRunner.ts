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
  textModel?: string;
  imageModel?: "gpt-image-2";
  retryDelayMs?: number;
}

export class JobRunner {
  private readonly active = new Map<string, Promise<void>>();
  private readonly textModel: string;
  private readonly imageModel: "gpt-image-2";
  private readonly retryDelayMs: number;

  constructor(private readonly options: JobRunnerOptions) {
    this.textModel = options.textModel ?? "gpt-5";
    this.imageModel = options.imageModel ?? "gpt-image-2";
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

  private start(id: string, work: () => Promise<void>): void {
    const promise = work().finally(() => this.active.delete(id));
    this.active.set(id, promise);
  }

  private async executeDirectorPlan(id: string, input: DirectorPlanInput): Promise<void> {
    await this.options.store.update(id, { status: "in_progress", progress: 15 });
    try {
      const raw = await this.withTransientRetries(() =>
        this.options.gateway.createDirectorPlan(input, this.textModel),
      );
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
      const imageBytes = await this.withTransientRetries(async () => {
        attempts += 1;
        await this.options.store.update(id, { progress: 20 + attempts * 15 });
        return this.options.gateway.generateStoryboard(input, this.imageModel);
      });
      await this.options.store.update(id, { progress: 85 });
      const archived = await archiveStoryboard({
        root: this.options.archiveRoot,
        projectTitle: input.projectTitle,
        sceneName: input.sceneName,
        version: input.version,
        imageBytes,
        metadata: {
          model: this.imageModel,
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
