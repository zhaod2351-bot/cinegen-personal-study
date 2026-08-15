import { z } from "zod";
import type { DirectorPlan } from "../types";

const AssetTypeSchema = z.enum(["character", "scene", "prop"]);

const DirectorAssetSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)).optional(),
});

const AssetReferenceSchema = z.object({
  type: AssetTypeSchema,
  id: z.string().min(1),
});

const AudioItemSchema = z.object({
  type: z.enum(["对白", "旁白", "音效", "环境音", "音乐"]),
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
