import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type OpenAI from "openai";
import { describe, expect, it } from "vitest";
import type { OpenAIClientFactory } from "./openaiGateway";
import { createAiRuntime } from "./runtime";
import type { SecretProtector } from "./settings/windowsDpapi";
import type { StoryboardInput } from "./types";

class ReversibleProtector implements SecretProtector {
  async protect(value: string): Promise<string> {
    return Buffer.from(value, "utf8").toString("base64");
  }

  async unprotect(value: string): Promise<string> {
    return Buffer.from(value, "base64").toString("utf8");
  }
}

const storyboard: StoryboardInput = {
  projectId: "project-1",
  projectTitle: "动态设置",
  sceneName: "场次 01",
  clip: {
    id: "clip-1",
    title: "测试",
    summary: "测试动态 provider",
    shots: [{
      id: "shot-1",
      title: "测试镜头",
      shotSize: "中景",
      cameraMovement: "固定",
      duration: 3,
      action: "站立",
      visualPrompt: "动态 provider 测试",
      audioItems: [],
      assets: [],
    }],
  },
  assets: [],
  artStyle: "赛璐璐",
  tags: [],
  aspectRatio: "16:9",
  version: 1,
};

describe("createAiRuntime", () => {
  it("routes each new job through the latest saved provider settings", async () => {
    const root = await mkdtemp(join(tmpdir(), "cinegen-runtime-"));
    const factoryInputs: Array<{ apiKey: string; baseURL: string }> = [];
    const models: string[] = [];
    const clientFactory: OpenAIClientFactory = (options) => {
      factoryInputs.push(options);
      return {
        images: {
          generate: async (input: unknown) => {
            models.push((input as { model: string }).model);
            return { data: [{ b64_json: Buffer.from("image").toString("base64") }] };
          },
        },
      } as unknown as OpenAI;
    };
    const runtime = createAiRuntime({
      settingsFilePath: join(root, "settings", "ai-settings.json"),
      jobDirectory: join(root, "jobs"),
      archiveRoot: join(root, "archive"),
      defaults: {
        text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: "text-key" },
        image: { baseUrl: "https://image-old.example/v1", model: "image-old", apiKey: "image-old-key" },
      },
      protector: new ReversibleProtector(),
      clientFactory,
      retryDelayMs: 0,
    });

    const first = await runtime.runner.runStoryboard(storyboard);
    await runtime.runner.waitFor(first.id);
    await runtime.settingsStore.update({
      image: {
        baseUrl: "https://image-new.example/v1",
        model: "image-new",
        apiKey: "image-new-key",
      },
    });
    const second = await runtime.runner.runStoryboard({ ...storyboard, version: 2 });
    await runtime.runner.waitFor(second.id);

    expect(factoryInputs).toEqual([
      { apiKey: "image-old-key", baseURL: "https://image-old.example/v1", maxRetries: 0 },
      { apiKey: "image-new-key", baseURL: "https://image-new.example/v1", maxRetries: 0 },
    ]);
    expect(models).toEqual(["image-old", "image-new"]);
  });
});
