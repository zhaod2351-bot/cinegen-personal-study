import type OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeAiSettings } from "./settings/types";
import type { DirectorPlanInput, StoryboardInput } from "./types";
import { OpenAIGateway } from "./openaiGateway";

const settings: RuntimeAiSettings = {
  text: {
    baseUrl: "https://text.example/v1",
    apiKey: "text-key",
    model: "text-model",
  },
  image: {
    baseUrl: "https://image.example/v1",
    apiKey: "image-key",
    model: "gpt-image-2",
  },
};

const directorInput: DirectorPlanInput = {
  lockedScript: "小狐狸跑进废墟。",
  artStyle: "日漫赛璐璐",
  tags: ["末世"],
  aspectRatio: "16:9",
  language: "简体中文",
  targetDuration: "60",
};

const storyboardInput: StoryboardInput = {
  projectId: "project-1",
  projectTitle: "余烬回声",
  sceneName: "场次 01",
  clip: {
    id: "clip-1",
    title: "逃生",
    summary: "小狐狸穿过废墟",
    shots: [{
      id: "shot-1",
      title: "冲入废墟",
      shotSize: "远景 WS",
      cameraMovement: "缓慢推进",
      duration: 5,
      action: "小狐狸向前奔跑",
      visualPrompt: "废墟街道，逆光",
      audioItems: [],
      assets: [],
    }],
  },
  assets: [],
  artStyle: "日漫赛璐璐",
  tags: ["末世"],
  aspectRatio: "16:9",
  version: 1,
};

describe("OpenAIGateway", () => {
  it("tests a supplied text provider with a minimal non-creative request", async () => {
    const factoryInputs: Array<{ apiKey: string; baseURL: string }> = [];
    const completionInputs: unknown[] = [];
    const gateway = new OpenAIGateway(async () => settings, (input) => {
      factoryInputs.push(input);
      return {
        chat: {
          completions: {
            create: async (request: unknown) => {
              completionInputs.push(request);
              return { choices: [{ message: { content: "OK" } }] };
            },
          },
        },
      } as unknown as OpenAI;
    });

    await expect(gateway.testText({
      baseUrl: "https://temporary-text.example/v1",
      model: "temporary-text-model",
      apiKey: "temporary-text-key",
    })).resolves.toBeUndefined();

    expect(factoryInputs).toEqual([{
      apiKey: "temporary-text-key",
      baseURL: "https://temporary-text.example/v1",
    }]);
    expect(completionInputs).toEqual([{
      model: "temporary-text-model",
      stream: false,
      messages: [{ role: "user", content: "Reply with OK." }],
    }]);
  });

  it("tests a supplied image provider with one minimal image request", async () => {
    const factoryInputs: Array<{ apiKey: string; baseURL: string }> = [];
    const generationInputs: unknown[] = [];
    const gateway = new OpenAIGateway(async () => settings, (input) => {
      factoryInputs.push(input);
      return {
        images: {
          generate: async (request: unknown) => {
            generationInputs.push(request);
            return { data: [{ b64_json: Buffer.from("test-image").toString("base64") }] };
          },
        },
      } as unknown as OpenAI;
    });

    await expect(gateway.testImage({
      baseUrl: "https://temporary-image.example/v1",
      model: "temporary-image-model",
      apiKey: "temporary-image-key",
    })).resolves.toBeUndefined();

    expect(factoryInputs).toEqual([{
      apiKey: "temporary-image-key",
      baseURL: "https://temporary-image.example/v1",
    }]);
    expect(generationInputs).toEqual([{
      model: "temporary-image-model",
      prompt: "A plain white square.",
      n: 1,
      size: "1024x1024",
    }]);
  });

  it.each([
    ["text", "Text provider request failed", (gateway: OpenAIGateway) => gateway.testText({
      baseUrl: settings.text.baseUrl,
      model: settings.text.model,
      apiKey: "text-key",
    })],
    ["image", "Image provider request failed", (gateway: OpenAIGateway) => gateway.testImage({
      baseUrl: settings.image.baseUrl,
      model: settings.image.model,
      apiKey: "image-key",
    })],
  ])("sanitizes %s connection-test failures", async (_kind, safeMessage, invoke) => {
    const gateway = new OpenAIGateway(async () => settings, () => ({
      chat: {
        completions: {
          create: async () => {
            throw Object.assign(new Error("key=text-key prompt=PRIVATE_PROMPT"), { status: 401 });
          },
        },
      },
      images: {
        generate: async () => {
          throw Object.assign(new Error("key=image-key prompt=PRIVATE_PROMPT"), { status: 401 });
        },
      },
    }) as unknown as OpenAI);

    let failure: unknown;
    try {
      await invoke(gateway);
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ message: safeMessage, status: 401 });
    expect(String(failure)).not.toContain("PRIVATE_PROMPT");
    expect(String(failure)).not.toContain("text-key");
    expect(String(failure)).not.toContain("image-key");
  });

  it("routes a director plan through one text-provider snapshot", async () => {
    const factoryInputs: Array<{ apiKey: string; baseURL: string }> = [];
    const completionInputs: unknown[] = [];
    const getRuntimeSettings = vi.fn(async () => settings);
    const clientFactory = (input: { apiKey: string; baseURL: string }): OpenAI => {
      factoryInputs.push(input);
      return {
        chat: {
          completions: {
            create: async (input: unknown) => {
              completionInputs.push(input);
              return {
                choices: [{ message: { content: JSON.stringify({ summary: "text result" }) } }],
              };
            },
          },
        },
      } as unknown as OpenAI;
    };
    const gateway = new OpenAIGateway(getRuntimeSettings, clientFactory);

    await expect(gateway.createDirectorPlan(directorInput)).resolves.toEqual({ summary: "text result" });
    expect(getRuntimeSettings).toHaveBeenCalledTimes(1);
    expect(factoryInputs).toEqual([{
      apiKey: "text-key",
      baseURL: "https://text.example/v1",
    }]);
    expect(completionInputs).toEqual([
      expect.objectContaining({ model: "text-model" }),
    ]);
  });

  it("routes a storyboard through one image-provider snapshot and returns its model", async () => {
    const factoryInputs: Array<{ apiKey: string; baseURL: string }> = [];
    const generationInputs: unknown[] = [];
    const getRuntimeSettings = vi.fn(async () => settings);
    const clientFactory = (input: { apiKey: string; baseURL: string }): OpenAI => {
      factoryInputs.push(input);
      return {
        images: {
          generate: async (input: unknown) => {
            generationInputs.push(input);
            return { data: [{ b64_json: Buffer.from("storyboard").toString("base64") }] };
          },
        },
      } as unknown as OpenAI;
    };
    const gateway = new OpenAIGateway(getRuntimeSettings, clientFactory);

    const result = await gateway.generateStoryboard(storyboardInput);

    expect(result).toEqual({ image: Buffer.from("storyboard"), model: "gpt-image-2" });
    expect(getRuntimeSettings).toHaveBeenCalledTimes(1);
    expect(factoryInputs).toEqual([{
      apiKey: "image-key",
      baseURL: "https://image.example/v1",
    }]);
    expect(generationInputs).toEqual([
      expect.objectContaining({ model: "gpt-image-2" }),
    ]);
  });

  it.each([
    ["text", () => new OpenAIGateway(
      async () => ({ ...settings, text: { ...settings.text, apiKey: undefined } }),
      () => { throw new Error("client factory should not run"); },
    ).createDirectorPlan(directorInput), "Text provider API key is not configured"],
    ["image", () => new OpenAIGateway(
      async () => ({ ...settings, image: { ...settings.image, apiKey: undefined } }),
      () => { throw new Error("client factory should not run"); },
    ).generateStoryboard(storyboardInput), "Image provider API key is not configured"],
  ])("requires the %s provider key before creating a client", async (_kind, invoke, message) => {
    await expect(invoke()).rejects.toThrow(message);
  });
});
