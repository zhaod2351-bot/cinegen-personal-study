import { z } from "zod";
import type { DirectorPlan } from "../types";

const AssetTypeSchema = z.enum(["character", "scene", "prop"]);

const DirectorAssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
  sceneContinuity: z.object({
    time: z.string().min(1),
    weather: z.string().min(1),
    lighting: z.string().min(1),
    palette: z.string().min(1),
  }).optional(),
});

const AssetReferenceSchema = z.object({
  type: AssetTypeSchema,
  id: z.string().min(1),
});

const supportedAudioTypes = ["对白", "旁白", "音效", "环境音", "音乐"] as const;

function normalizeAudioType(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if ((supportedAudioTypes as readonly string[]).includes(value)) return value;
  if (value.includes("环境")) return "环境音";
  if (value.includes("音乐") || value.includes("配乐")) return "音乐";
  if (value.includes("旁白")) return "旁白";
  if (value.includes("对白") || value.includes("台词")) return "对白";
  return "音效";
}

const AudioItemSchema = z.object({
  type: z.preprocess(normalizeAudioType, z.enum(supportedAudioTypes)),
  content: z.string().min(1),
  speaker: z.string().min(1).optional(),
});

const DirectorShotSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  shotSize: z.string().min(1),
  cameraMovement: z.string().min(1),
  duration: z.number().positive().max(60),
  action: z.string().min(1),
  visualPrompt: z.string().min(1),
  audioItems: z.array(AudioItemSchema),
  assets: z.array(AssetReferenceSchema),
});

const DirectorClipSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  shots: z.array(DirectorShotSchema).min(1),
});

export const DirectorPlanSchema = z.object({
  polishedScript: z.string().min(1),
  summary: z.string().min(1),
  assets: z.array(DirectorAssetSchema),
  clips: z.array(DirectorClipSchema).min(1),
});

export function validateDirectorPlan(input: unknown): DirectorPlan {
  const plan = DirectorPlanSchema.parse(input) as DirectorPlan;
  const keys = new Set<string>();
  const names = new Set<string>();

  for (const asset of plan.assets) {
    const key = `${asset.type}:${asset.id}`;
    if (keys.has(key)) {
      throw new Error(`duplicate asset reference key: ${key}`);
    }
    keys.add(key);
    const normalizedName = asset.name.trim().toLocaleLowerCase();
    if (names.has(normalizedName)) throw new Error(`duplicate asset name: ${asset.name}`);
    names.add(normalizedName);
  }

  const clipIds = new Set<string>();
  const shotIds = new Set<string>();
  for (const clip of plan.clips) {
    if (clipIds.has(clip.id)) throw new Error(`duplicate clip id: ${clip.id}`);
    clipIds.add(clip.id);
    for (const shot of clip.shots) {
      if (shotIds.has(shot.id)) throw new Error(`duplicate shot id: ${shot.id}`);
      shotIds.add(shot.id);
      for (const reference of shot.assets) {
        const key = `${reference.type}:${reference.id}`;
        if (!keys.has(key)) {
          throw new Error(`missing asset reference: ${key} in shot ${shot.id}`);
        }
      }
    }
  }

  return plan;
}
