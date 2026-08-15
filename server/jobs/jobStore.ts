import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
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
  errorCode?: string;
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

  async list(): Promise<AiJob[]> {
    return this.readAll();
  }

  async retry<TPayload = unknown>(id: string): Promise<AiJob<TPayload>> {
    return this.withWrite(async (jobs) => {
      const original = jobs.find((job) => job.id === id);
      if (!original) throw new Error(`Job not found: ${id}`);
      if (original.status !== "failed") {
        throw Object.assign(new Error("只能重试失败的生成任务"), {
          status: 409,
          code: "JOB_NOT_RETRYABLE",
        });
      }
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
      await replaceFileOnWindows(temporary, this.filePath);
    });
    this.writeQueue = operation.catch(() => undefined);
    await operation;
    return output;
  }
}

async function replaceFileOnWindows(temporary: string, destination: string): Promise<void> {
  try {
    await retryTransientFileOperation(() => rename(temporary, destination));
  } catch (error) {
    if (!isTransientWindowsFileError(error)) throw error;
    await retryTransientFileOperation(() => copyFile(temporary, destination));
    await rm(temporary, { force: true });
  }
}

export async function retryTransientFileOperation(operation: () => Promise<void>, delays = [20, 50, 100, 200, 400]): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await operation();
      return;
    } catch (error) {
      if (!isTransientWindowsFileError(error) || attempt >= delays.length) throw error;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
}

function isTransientWindowsFileError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException)?.code;
  return code === "EPERM" || code === "EBUSY" || code === "EACCES";
}
