import type { DirectorPlan, DirectorPlanInput, StoryboardInput } from "../server/types";

export type AiJobStatus = "queued" | "in_progress" | "completed" | "failed";

export interface AiJobSnapshot<TResult = unknown> {
  id: string;
  kind: "director-plan" | "storyboard";
  status: AiJobStatus;
  progress: number;
  attempt: number;
  result?: TResult;
  error?: string;
}

interface CreatedJob {
  jobId: string;
  status: AiJobStatus;
}

export interface AiHealth {
  ok: boolean;
  models: { text: string; image: "gpt-image-2" };
  archiveRoot?: string;
}

export async function getAiHealth(signal?: AbortSignal): Promise<AiHealth> {
  return requestJson("/api/health", { signal });
}

export async function createDirectorPlanJob(input: DirectorPlanInput): Promise<CreatedJob> {
  return requestJson("/api/director-plans", { method: "POST", body: JSON.stringify(input) });
}

export async function createStoryboardJob(input: StoryboardInput): Promise<CreatedJob> {
  return requestJson("/api/storyboards", { method: "POST", body: JSON.stringify(input) });
}

export async function getAiJob<TResult = unknown>(id: string, signal?: AbortSignal): Promise<AiJobSnapshot<TResult>> {
  return requestJson(`/api/jobs/${encodeURIComponent(id)}`, { signal });
}

export async function retryAiJob(id: string): Promise<CreatedJob> {
  return requestJson(`/api/jobs/${encodeURIComponent(id)}/retry`, { method: "POST" });
}

export async function pollAiJob<TResult = DirectorPlan>(
  id: string,
  options: { intervalMs?: number; maxIntervalMs?: number; signal?: AbortSignal } = {},
): Promise<AiJobSnapshot<TResult>> {
  const baseInterval = Math.max(0, options.intervalMs ?? 1200);
  const maxInterval = Math.max(baseInterval, options.maxIntervalMs ?? 4000);
  let interval = baseInterval;

  while (true) {
    throwIfAborted(options.signal);
    const job = await getAiJob<TResult>(id, options.signal);
    if (job.status === "completed" || job.status === "failed") return job;
    await wait(interval, options.signal);
    interval = Math.min(maxInterval, Math.max(baseInterval, interval * 1.25));
  }
}

async function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as { error?: string }).error ?? `AI API request failed: ${response.status}`);
  return body as T;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("The operation was aborted", "AbortError");
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal);
  if (milliseconds === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("The operation was aborted", "AbortError"));
    }, { once: true });
  });
}
