import { z } from "zod";
import type { RuntimeAiSettings } from "./settings/types";

const schema = z.object({
  OPENAI_TEXT_API_KEY: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().min(1).optional()),
  OPENAI_IMAGE_API_KEY: z.preprocess((value) => typeof value === "string" && value.trim() === "" ? undefined : value, z.string().min(1).optional()),
  OPENAI_TEXT_BASE_URL: z.string().min(1).default("https://api.openai.com/v1"),
  OPENAI_IMAGE_BASE_URL: z.string().min(1).default("https://api.openai.com/v1"),
  OPENAI_TEXT_MODEL: z.string().min(1).default("gpt-5.6-terra"),
  OPENAI_IMAGE_MODEL: z.string().min(1).default("gpt-image-2"),
  AI_ASSET_ROOT: z.string().min(1).default("D:\\AI动画创作素材"),
  AI_SERVER_HOST: z.enum(["127.0.0.1", "::1"]).default("127.0.0.1"),
  AI_SERVER_PORT: z.coerce.number().int().positive().default(8787),
});

export interface ServerConfig {
  aiDefaults: RuntimeAiSettings;
  assetRoot: string;
  host: string;
  port: number;
}

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const value = schema.parse(env);
  return {
    aiDefaults: {
      text: {
        baseUrl: value.OPENAI_TEXT_BASE_URL,
        model: value.OPENAI_TEXT_MODEL,
        ...(value.OPENAI_TEXT_API_KEY === undefined ? {} : { apiKey: value.OPENAI_TEXT_API_KEY }),
      },
      image: {
        baseUrl: value.OPENAI_IMAGE_BASE_URL,
        model: value.OPENAI_IMAGE_MODEL,
        ...(value.OPENAI_IMAGE_API_KEY === undefined ? {} : { apiKey: value.OPENAI_IMAGE_API_KEY }),
      },
    },
    assetRoot: value.AI_ASSET_ROOT,
    host: value.AI_SERVER_HOST,
    port: value.AI_SERVER_PORT,
  };
}
