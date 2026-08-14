import { afterEach, describe, expect, it, vi } from "vitest";
import { pollAiJob } from "./aiApiService";

describe("AI API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("polls until the job completes", async () => {
    const responses = [
      { id: "job_1", status: "queued", progress: 0 },
      { id: "job_1", status: "in_progress", progress: 50 },
      { id: "job_1", status: "completed", progress: 100, result: { ok: true } },
    ];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await pollAiJob("job_1", { intervalMs: 0 });

    expect(result.status).toBe("completed");
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
