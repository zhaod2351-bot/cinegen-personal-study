import OpenAI, { toFile } from "openai";
import { z } from "zod";
import { buildDirectorPlanPrompt } from "./prompts/directorPlanPrompt";
import { buildStoryboardPrompt } from "./prompts/storyboardPrompt";
import type { RuntimeAiSettings, RuntimeProviderSettings } from "./settings/types";
import type { DirectorPlanInput, StoryboardInput } from "./types";
import { DirectorPlanSchema } from "./validation/directorPlan";

export interface AiGateway {
  createDirectorPlan(input: DirectorPlanInput): Promise<unknown>;
  generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }>;
}

export type AiConnectionSettings = Omit<RuntimeProviderSettings, "apiKey"> & { apiKey: string };

export interface AiConnectionTester {
  testText(settings: AiConnectionSettings): Promise<void>;
  testImage(settings: AiConnectionSettings): Promise<void>;
}

export type OpenAIClientFactory = (options: { apiKey: string; baseURL: string }) => OpenAI;

function sanitizedProviderError(kind: "Text" | "Image", error: unknown): Error & { status?: number } {
  const sanitized = new Error(`${kind} provider request failed`) as Error & { status?: number };
  const status = (error as { status?: unknown })?.status;
  if (typeof status === "number") sanitized.status = status;
  return sanitized;
}

export class OpenAIGateway implements AiGateway, AiConnectionTester {
  constructor(
    private readonly getRuntimeSettings: () => Promise<RuntimeAiSettings>,
    private readonly createClient: OpenAIClientFactory = (options) => new OpenAI(options),
  ) {}

  async testText(settings: AiConnectionSettings): Promise<void> {
    try {
      const client = this.createClient({ apiKey: settings.apiKey, baseURL: settings.baseUrl });
      await client.chat.completions.create({
        model: settings.model,
        stream: false,
        messages: [{ role: "user", content: "Reply with OK." }],
      });
    } catch (error) {
      throw sanitizedProviderError("Text", error);
    }
  }

  async testImage(settings: AiConnectionSettings): Promise<void> {
    try {
      const client = this.createClient({ apiKey: settings.apiKey, baseURL: settings.baseUrl });
      await client.images.generate({
        model: settings.model,
        prompt: "A plain white square.",
        n: 1,
        size: "1024x1024",
      });
    } catch (error) {
      throw sanitizedProviderError("Image", error);
    }
  }

  async createDirectorPlan(input: DirectorPlanInput): Promise<unknown> {
    const settings = await this.getRuntimeSettings();
    const provider = settings.text;
    if (!provider.apiKey) throw new Error("Text provider API key is not configured");
    try {
      const client = this.createClient({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
      const response = await client.chat.completions.create({
        model: provider.model,
        stream: false,
        messages: [{ role: "user", content: buildDirectorPlanPrompt(input) }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "director_plan",
            strict: true,
            schema: z.toJSONSchema(DirectorPlanSchema),
          },
        },
      } as Parameters<typeof client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty director plan");
      return JSON.parse(content) as unknown;
    } catch (error) {
      throw sanitizedProviderError("Text", error);
    }
  }

  async generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }> {
    const settings = await this.getRuntimeSettings();
    const provider = settings.image;
    if (!provider.apiKey) throw new Error("Image provider API key is not configured");
    try {
      const client = this.createClient({ apiKey: provider.apiKey, baseURL: provider.baseUrl });
      const prompt = buildStoryboardPrompt(input);
      const references = await buildReferenceUploads(input);
      const response = references.length > 0
        ? await client.images.edit({
          image: references,
          model: provider.model,
          stream: false,
          prompt,
          input_fidelity: "high",
          size: "1536x1024",
          quality: "high",
          output_format: "webp",
          background: "opaque",
        } as Parameters<typeof client.images.edit>[0]) as OpenAI.Images.ImagesResponse
        : await client.images.generate({
          model: provider.model,
          stream: false,
          prompt,
          size: "1536x1024",
          quality: "high",
          output_format: "webp",
          background: "opaque",
        } as Parameters<typeof client.images.generate>[0]) as OpenAI.Images.ImagesResponse;
      const first = response.data?.[0];
      if (first?.b64_json) {
        return { image: Buffer.from(first.b64_json, "base64"), model: provider.model };
      }
      if (first?.url) {
        const download = await fetch(first.url);
        if (!download.ok) throw new Error(`Could not download generated image: ${download.status}`);
        return { image: Buffer.from(await download.arrayBuffer()), model: provider.model };
      }
      throw new Error("OpenAI returned no storyboard image");
    } catch (error) {
      throw sanitizedProviderError("Image", error);
    }
  }
}

async function buildReferenceUploads(input: StoryboardInput) {
  const selected = new Set(input.clip.shots.flatMap((shot) => (
    shot.assets.map((reference) => `${reference.type}:${reference.id}`)
  )));
  const uploads = [];
  for (const asset of input.assets) {
    if (!selected.has(`${asset.type}:${asset.id}`)) continue;
    for (const [index, reference] of (asset.referenceImages ?? []).entries()) {
      const extension = reference.mimeType === "image/jpeg" ? "jpg" : reference.mimeType.slice("image/".length);
      const safeId = asset.id.replace(/[^A-Za-z0-9_-]/g, "_") || "asset";
      uploads.push(await toFile(
        Buffer.from(reference.data, "base64"),
        `${asset.type}-${safeId}-${index + 1}.${extension}`,
        { type: reference.mimeType },
      ));
    }
  }
  return uploads;
}
