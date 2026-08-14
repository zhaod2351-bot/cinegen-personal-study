import { z } from "zod";

const schema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_TEXT_MODEL: z.string().min(1, "OPENAI_TEXT_MODEL is required"),
  OPENAI_IMAGE_MODEL: z.literal("gpt-image-2").default("gpt-image-2"),
  AI_ASSET_ROOT: z.string().min(1).default("D:\\AI动画创作素材"),
  AI_SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  AI_SERVER_PORT: z.coerce.number().int().positive().default(8787),
});

export interface ServerConfig {
  apiKey: string;
  textModel: string;
  imageModel: "gpt-image-2";
  assetRoot: string;
  host: string;
  port: number;
}

export function loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const value = schema.parse(env);
  return {
    apiKey: value.OPENAI_API_KEY,
    textModel: value.OPENAI_TEXT_MODEL,
    imageModel: value.OPENAI_IMAGE_MODEL,
    assetRoot: value.AI_ASSET_ROOT,
    host: value.AI_SERVER_HOST,
    port: value.AI_SERVER_PORT,
  };
}
