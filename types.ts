export interface CharacterVariation {
  id: string;
  name: string; // e.g., "Casual", "Tactical Gear", "Injured"
  visualPrompt: string;
  referenceImage?: string;
}

export interface Character {
  id: string;
  name: string;
  gender: string;
  age: string;
  personality: string;
  visualPrompt?: string;
  referenceImage?: string; // Base URL
  tags?: string[];
  variations: CharacterVariation[]; // Added: List of alternative looks
}

export interface Scene {
  id: string;
  location: string;
  time: string;
  atmosphere: string;
  visualPrompt?: string;
  referenceImage?: string; // URL
  tags?: string[];
}

export interface PropAsset {
  id: string;
  name: string;
  description: string;
  visualPrompt?: string;
  referenceImage?: string;
  tags?: string[];
}

export interface Keyframe {
  id: string;
  type: 'start' | 'end';
  visualPrompt: string;
  imageUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface VideoInterval {
  id: string;
  startKeyframeId: string;
  endKeyframeId: string;
  duration: number;
  motionStrength: number;
  videoUrl?: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
}

export interface Shot {
  id: string;
  sceneId: string;
  actionSummary: string;
  dialogue?: string; 
  cameraMovement: string;
  shotSize?: string; 
  characters: string[]; // Character IDs
  props?: string[]; // Prop asset IDs
  characterVariations?: { [characterId: string]: string }; // Added: Map char ID to variation ID for this shot
  keyframes: Keyframe[];
  interval?: VideoInterval;
}

export interface ScriptData {
  title: string;
  genre: string;
  logline: string;
  targetDuration?: string;
  language?: string; 
  characters: Character[];
  scenes: Scene[];
  props?: PropAsset[];
  storyParagraphs: { id: number; text: string; sceneRefId: string }[];
}

export interface ProjectState {
  id: string;
  title: string;
  createdAt: number;
  lastModified: number;
  stage: 'script' | 'import' | 'assets' | 'director' | 'export';
  
  // Script Phase Data
  rawScript: string;
  targetDuration: string;
  language: string; 
  artStyle?: string;
  styleTags?: string[];
  aspectRatio?: string;
  
  scriptData: ScriptData | null;
  shots: Shot[];
  isParsingScript: boolean;

  // AI workflow data (added by storage migration for older projects)
  directorClips: DirectorClipState[];
  storyboardVersions: StoryboardVersion[];
  activeAiJobs: Record<string, ActiveAiJob>;
}

export type DirectorClipState = import("./server/types").DirectorClip;

export interface StoryboardVersion {
  id: string;
  clipId: string;
  version: number;
  imagePath: string;
  metadataPath?: string;
  createdAt: number;
}

export interface ActiveAiJob {
  jobId: string;
  kind: "director-plan" | "storyboard";
  status: "queued" | "in_progress" | "completed" | "failed";
  progress: number;
  error?: string;
}
