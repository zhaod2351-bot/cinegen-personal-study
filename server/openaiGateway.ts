import OpenAI, { toFile } from "openai";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { buildDirectorPlanPrompt } from "./prompts/directorPlanPrompt";
import { buildStoryboardPrompt } from "./prompts/storyboardPrompt";
import { buildAssetReferencePrompt, isAssetReferenceInput } from "./prompts/assetReferencePrompt";
import type { RuntimeAiSettings, RuntimeProviderSettings } from "./settings/types";
import type { DirectorPlanInput, StoryboardInput } from "./types";
import { DirectorPlanSchema } from "./validation/directorPlan";

export interface AiGateway {
  createDirectorPlan(input: DirectorPlanInput): Promise<unknown>;
  repairDirectorPlan?(input: DirectorPlanInput, invalidOutput: unknown): Promise<unknown>;
  generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }>;
  captureSnapshot?(): Promise<AiGateway>;
}

export type AiConnectionSettings = Omit<RuntimeProviderSettings, "apiKey"> & { apiKey: string };

export interface AiConnectionTester {
  testText(settings: AiConnectionSettings): Promise<void>;
  testImage(settings: AiConnectionSettings): Promise<void>;
}

export type OpenAIClientFactory = (options: { apiKey: string; baseURL: string; maxRetries: 0 }) => OpenAI;

function sanitizedProviderError(kind: "Text" | "Image", error: unknown): Error & { status?: number } {
  const status = (error as { status?: unknown })?.status;
  const name = (error as { name?: unknown })?.name;
  const suffix = typeof status === "number"
    ? ` (HTTP ${status})`
    : typeof name === "string" && /timeout/i.test(name)
      ? " (timeout)"
      : " (network or relay error)";
  const sanitized = new Error(`${kind} provider request failed${suffix}`) as Error & { status?: number };
  if (typeof status === "number") sanitized.status = status;
  return sanitized;
}

export class OpenAIGateway implements AiGateway, AiConnectionTester {
  constructor(
    private readonly getRuntimeSettings: () => Promise<RuntimeAiSettings>,
    private readonly createClient: OpenAIClientFactory = (options) => new OpenAI(options),
  ) {}

  async captureSnapshot(): Promise<AiGateway> {
    const snapshot = await this.getRuntimeSettings();
    return new OpenAIGateway(async () => snapshot, this.createClient);
  }

  async testText(settings: AiConnectionSettings): Promise<void> {
    try {
      const client = this.createClient({ apiKey: settings.apiKey, baseURL: settings.baseUrl, maxRetries: 0 });
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
      const client = this.createClient({ apiKey: settings.apiKey, baseURL: settings.baseUrl, maxRetries: 0 });
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
      const client = this.createClient({ apiKey: provider.apiKey, baseURL: provider.baseUrl, maxRetries: 0 });
      const response = await createStructuredCompletion(client, {
        model: provider.model,
        prompt: buildDirectorPlanPrompt(input),
        schemaName: "director_plan",
        // Modern OpenAI-compatible relays commonly forward JSON Schema even
        // when their own hostname is used. Requiring it first prevents a
        // valid-but-incompatible JSON object from consuming a paid request.
        preferJsonSchema: true,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty director plan");
      return parseProviderJson(content);
    } catch (error) {
      throw sanitizedProviderError("Text", error);
    }
  }

  async repairDirectorPlan(input: DirectorPlanInput, invalidOutput: unknown): Promise<unknown> {
    const settings = await this.getRuntimeSettings();
    const provider = settings.text;
    if (!provider.apiKey) throw new Error("Text provider API key is not configured");
    try {
      const client = this.createClient({ apiKey: provider.apiKey, baseURL: provider.baseUrl, maxRetries: 0 });
      const response = await createStructuredCompletion(client, {
        model: provider.model,
        prompt: `${buildDirectorPlanPrompt(input)}\n\n上一次输出未通过格式校验。只修复结构、重复 ID、重复素材名称和无效引用，不添加新剧情。上一次输出：\n${JSON.stringify(invalidOutput)}`,
        schemaName: "director_plan_repair",
        preferJsonSchema: true,
      });
      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned an empty repaired director plan");
      return parseProviderJson(content);
    } catch (error) {
      throw sanitizedProviderError("Text", error);
    }
  }

  async generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }> {
    const settings = await this.getRuntimeSettings();
    const provider = settings.image;
    if (!provider.apiKey) throw new Error("Image provider API key is not configured");
    try {
      const client = this.createClient({ apiKey: provider.apiKey, baseURL: provider.baseUrl, maxRetries: 0 });
      const prompt = isAssetReferenceInput(input) ? buildAssetReferencePrompt(input) : buildStoryboardPrompt(input);
      const references = await buildReferenceUploads(input);
      const size = isAssetReferenceInput(input) && input.assets[0]?.type === "character"
        ? "1024x1536"
        : isAssetReferenceInput(input) && input.assets[0]?.type === "prop"
          ? "1024x1024"
          : "1536x1024";
      const response = references.length > 0
        ? await client.images.edit({
          image: references,
          model: provider.model,
          stream: false,
          prompt,
          input_fidelity: "high",
          size,
          quality: "high",
          output_format: "webp",
          background: "opaque",
        } as Parameters<typeof client.images.edit>[0]) as OpenAI.Images.ImagesResponse
        : await client.images.generate({
          model: provider.model,
          stream: false,
          prompt,
          size,
          quality: "high",
          output_format: "webp",
          background: "opaque",
        } as Parameters<typeof client.images.generate>[0]) as OpenAI.Images.ImagesResponse;
      const first = response.data?.[0];
      if (first?.b64_json) {
        return { image: Buffer.from(first.b64_json, "base64"), model: provider.model };
      }
      if (first?.url) {
        return { image: await downloadGeneratedImage(first.url), model: provider.model };
      }
      throw new Error("OpenAI returned no storyboard image");
    } catch (error) {
      throw sanitizedProviderError("Image", error);
    }
  }
}

export function parseProviderJson(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // OpenAI-compatible relays commonly wrap an otherwise valid JSON response
    // in a Markdown fence even when JSON mode was requested.
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)?.[1];
    if (fenced) return JSON.parse(fenced) as unknown;

    // Some relays prepend a short explanation. Only accept a single complete
    // top-level object; validation later still enforces the director schema.
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as unknown;
    }
    throw new Error("Text provider returned invalid JSON");
  }
}

async function createStructuredCompletion(
  client: OpenAI,
  input: { model: string; prompt: string; schemaName: string; preferJsonSchema: boolean },
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const common = {
    model: input.model,
    // Keep relay/Cloudflare connections active while long director plans are
    // generated. Non-streaming requests commonly hit a 100-second HTTP 524.
    stream: true as const,
    max_completion_tokens: 3_500,
    reasoning_effort: "low" as const,
    messages: [{ role: "user" as const, content: input.prompt }],
  };
  if (!input.preferJsonSchema) {
    return await collectStreamingCompletion(await client.chat.completions.create({
      ...common,
      response_format: { type: "json_object" },
    } as Parameters<typeof client.chat.completions.create>[0]));
  }
  try {
    return await collectStreamingCompletion(await client.chat.completions.create({
      ...common,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: z.toJSONSchema(DirectorPlanSchema),
        },
      },
    } as Parameters<typeof client.chat.completions.create>[0]));
  } catch (error) {
    const status = (error as { status?: unknown })?.status;
    if (status !== 400 && status !== 404 && status !== 422) throw error;
    return await collectStreamingCompletion(await client.chat.completions.create({
      ...common,
      response_format: { type: "json_object" },
    } as Parameters<typeof client.chat.completions.create>[0]));
  }
}

async function collectStreamingCompletion(response: unknown): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  if (response && typeof (response as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === "function") {
    let content = "";
    for await (const chunk of response as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>) {
      content += chunk.choices[0]?.delta?.content ?? "";
    }
    return { choices: [{ message: { role: "assistant", content } }] } as OpenAI.Chat.Completions.ChatCompletion;
  }
  // Allows compatible providers that ignore stream=true and return a normal
  // completion, and keeps lightweight client fakes straightforward.
  return response as OpenAI.Chat.Completions.ChatCompletion;
}

const MAX_GENERATED_IMAGE_BYTES = 20 * 1024 * 1024;

export async function downloadGeneratedImage(
  initialUrl: string,
  options: { fetchImpl?: typeof fetch; lookupImpl?: typeof lookup; timeoutMs?: number } = {},
): Promise<Buffer> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const lookupImpl = options.lookupImpl ?? lookup;
  let current = new URL(initialUrl);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    if (current.protocol !== "https:" && current.protocol !== "http:") throw new Error("Generated image URL must use HTTP(S)");
    const hostname = current.hostname.replace(/^\[|\]$/g, "");
    const addresses = isIP(hostname)
      ? [{ address: hostname }]
      : await lookupImpl(hostname, { all: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new Error("Generated image URL resolves to a private address");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 10_000);
    try {
      const response = await fetchImpl(current, { redirect: "manual", signal: controller.signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location || redirect === 3) throw new Error("Too many generated image redirects");
        current = new URL(location, current);
        continue;
      }
      if (!response.ok) throw new Error(`Could not download generated image: ${response.status}`);
      const declared = Number(response.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > MAX_GENERATED_IMAGE_BYTES) throw new Error("Generated image is too large");
      const reader = response.body?.getReader();
      if (!reader) return Buffer.alloc(0);
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_GENERATED_IMAGE_BYTES) {
          await reader.cancel();
          throw new Error("Generated image is too large");
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks);
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("Too many generated image redirects");
}

function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) return false;
  const [a, b] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
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
