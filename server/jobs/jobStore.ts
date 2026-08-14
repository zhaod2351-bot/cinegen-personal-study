import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type JobKind = "director-plan" | "storyboard";
export type JobStatus = "queued" | "in_progress" | "completed" | "failed";

export interface AiJob<TPayload = unknown, TResult = unknown> {
  id: string;
  kind: JobKind;
  status: JobStatus;
  progress: number;
  attempt: number;
  payload: TPayload;
  result?: TResult;
  error?: string;
  createdAt: string;
  updatedAt: string;
  retriedFrom?: string;
}

export class JobStore {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly directory: string) {
    this.filePath = join(directory, "jobs.json");
  }

  async create<TPayload>(kind: JobKind, payload: TPayload): Promise<AiJob<TPayload>> {
    return this.withWrite(async (jobs) => {
      const now = new Date().toISOString();
      const job: AiJob<TPayload> = {
        id: randomUUID(),
        kind,
        status: "queued",
        progress: 0,
        attempt: 1,
        payload,
        createdAt: now,
        updatedAt: now,
      };
      jobs.push(job);
      return job;
    });
  }

  async update<TPayload, TResult>(
    id: string,
    patch: Partial<Omit<AiJob<TPayload, TResult>, "id" | "kind" | "payload" | "createdAt">>,
  ): Promise<AiJob<TPayload, TResult>> {
    return this.withWrite(async (jobs) => {
      const index = jobs.findIndex((job) => job.id === id);
      if (index < 0) throw new Error(`Job not found: ${id}`);
      const updated = {
        ...jobs[index],
        ...patch,
        updatedAt: new Date().toISOString(),
      } as AiJob<TPayload, TResult>;
      jobs[index] = updated;
      return updated;
    });
  }

  async get<TPayload = unknown, TResult = unknown>(id: string): Promise<AiJob<TPayload, TResult> | undefined> {
    const jobs = await this.readAll();
    return jobs.find((job) => job.id === id) as AiJob<TPayload, TResult> | undefined;
  }

  async retry<TPayload = unknown>(id: string): Promise<AiJob<TPayload>> {
    return this.withWrite(async (jobs) => {
      const original = jobs.find((job) => job.id === id);
      if (!original) throw new Error(`Job not found: ${id}`);
      const now = new Date().toISOString();
      const retried: AiJob<TPayload> = {
        id: randomUUID(),
        kind: original.kind,
        status: "queued",
        progress: 0,
        attempt: original.attempt + 1,
        payload: original.payload as TPayload,
        createdAt: now,
        updatedAt: now,
        retriedFrom: original.id,
      };
      jobs.push(retried);
      return retried;
    });
  }

  private async readAll(): Promise<AiJob[]> {
    try {
      return JSON.parse(await readFile(this.filePath, "utf8")) as AiJob[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  private async withWrite<T>(mutate: (jobs: AiJob[]) => Promise<T>): Promise<T> {
    let output!: T;
    const operation = this.writeQueue.then(async () => {
      const jobs = await this.readAll();
      output = await mutate(jobs);
      await mkdir(this.directory, { recursive: true });
      const temporary = `${this.filePath}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(jobs, null, 2), "utf8");
      await rename(temporary, this.filePath);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return output;
  }
}
