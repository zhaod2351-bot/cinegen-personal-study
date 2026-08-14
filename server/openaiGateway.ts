import OpenAI from "openai";
import { z } from "zod";
import { buildDirectorPlanPrompt } from "./prompts/directorPlanPrompt";
import { buildStoryboardPrompt } from "./prompts/storyboardPrompt";
import type { DirectorPlanInput, StoryboardInput } from "./types";
import { DirectorPlanSchema } from "./validation/directorPlan";

export interface AiGateway {
  createDirectorPlan(input: DirectorPlanInput, model: string): Promise<unknown>;
  generateStoryboard(input: StoryboardInput, model: "gpt-image-2"): Promise<Buffer>;
}

export class OpenAIGateway implements AiGateway {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async createDirectorPlan(input: DirectorPlanInput, model: string): Promise<unknown> {
    const response = await this.client.chat.completions.create({
      model,
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
    } as Parameters<typeof this.client.chat.completions.create>[0]) as OpenAI.Chat.Completions.ChatCompletion;
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("OpenAI returned an empty director plan");
    return JSON.parse(content) as unknown;
  }

  async generateStoryboard(input: StoryboardInput, model: "gpt-image-2"): Promise<Buffer> {
    const response = await this.client.images.generate({
      model,
      stream: false,
      prompt: buildStoryboardPrompt(input),
      size: "1536x1024",
      quality: "high",
      output_format: "webp",
      background: "opaque",
    } as Parameters<typeof this.client.images.generate>[0]) as OpenAI.Images.ImagesResponse;
    const first = response.data?.[0];
    if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
    if (first?.url) {
      const download = await fetch(first.url);
      if (!download.ok) throw new Error(`Could not download generated image: ${download.status}`);
      return Buffer.from(await download.arrayBuffer());
    }
    throw new Error("OpenAI returned no storyboard image");
  }
}
