import { afterEach, describe, expect, it, vi } from "vitest";
import { getAiHealth, pollAiJob } from "./aiApiService";

describe("AI API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("bootstraps a local session token in memory before calling the API", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (input === "/api/session") {
        return new Response(JSON.stringify({ token: "session-from-loopback" }), { status: 200 });
      }
      expect(input).toBe("/api/health");
      expect(new Headers(init?.headers).get("X-CineGen-Session")).toBe("session-from-loopback");
      return new Response(JSON.stringify({
        ok: true,
        models: { text: "text-model", image: "image-model" },
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAiHealth()).resolves.toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("polls until the job completes", async () => {
    const responses = [
      { id: "job_1", status: "queued", progress: 0 },
      { id: "job_1", status: "in_progress", progress: 50 },
      { id: "job_1", status: "completed", progress: 100, result: { ok: true } },
    ];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      new Response(JSON.stringify(input === "/api/session"
        ? { token: "poll-session-token" }
        : responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollAiJob("job_1", { intervalMs: 0 });

    expect(result.status).toBe("completed");
    expect(fetchMock.mock.calls.filter(([input]) => input !== "/api/session")).toHaveLength(3);
  });

  it("reports each persisted progress snapshot while polling", async () => {
    const snapshots = [
      { id: "job_progress", status: "queued", progress: 10 },
      { id: "job_progress", status: "in_progress", progress: 55 },
      { id: "job_progress", status: "completed", progress: 100, result: { ok: true } },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => new Response(JSON.stringify(
      input === "/api/session" ? { token: "progress-session" } : snapshots.shift(),
    ), { status: 200 })));
    const onProgress = vi.fn();

    await pollAiJob("job_progress", { intervalMs: 0, onProgress });

    expect(onProgress.mock.calls.map(([snapshot]) => snapshot.progress)).toEqual([10, 55, 100]);
  });

  it("stops polling when aborted", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ id: "job_1", status: "queued", progress: 0 })),
    ));
    const controller = new AbortController();
    controller.abort();
    await expect(pollAiJob("job_1", { intervalMs: 0, signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
