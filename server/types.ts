export type AssetType = "character" | "scene" | "prop";

export type ReferenceImageMimeType = "image/png" | "image/jpeg" | "image/webp";

export interface DirectorReferenceImage {
  mimeType: ReferenceImageMimeType;
  data: string;
}

export interface DirectorAsset {
  id: string;
  type: AssetType;
  name: string;
  description: string;
  tags?: string[];
  referenceImages?: DirectorReferenceImage[];
}

export interface DirectorAssetReference {
  type: AssetType;
  id: string;
}

export interface DirectorAudioItem {
  type: "对白" | "旁白" | "音效" | "环境音" | "音乐";
  content: string;
  speaker?: string;
}

export interface DirectorShot {
  id: string;
  title: string;
  shotSize: string;
  cameraMovement: string;
  duration: number;
  action: string;
  visualPrompt: string;
  audioItems: DirectorAudioItem[];
  assets: DirectorAssetReference[];
}

export interface DirectorClip {
  id: string;
  title: string;
  summary: string;
  shots: DirectorShot[];
}

export interface DirectorPlan {
  polishedScript: string;
  summary: string;
  assets: DirectorAsset[];
  clips: DirectorClip[];
}

export interface DirectorPlanInput {
  lockedScript: string;
  artStyle: string;
  tags: string[];
  aspectRatio: string;
  language: string;
  targetDuration: string;
}

export interface StoryboardInput {
  projectId: string;
  projectTitle: string;
  sceneName: string;
  clip: DirectorClip;
  assets: DirectorAsset[];
  artStyle: string;
  tags: string[];
  aspectRatio: string;
  version: number;
}
