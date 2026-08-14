import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join, win32 } from "node:path";

export interface StoryboardArchiveMetadata {
  model: string;
  timestamp: string;
  taskId: string;
  version: number;
  style: string;
  shotIds: string[];
  attempts: number;
  [key: string]: unknown;
}

export interface ArchiveStoryboardInput {
  root: string;
  projectTitle: string;
  sceneName: string;
  version: number;
  imageBytes: Uint8Array;
  metadata: StoryboardArchiveMetadata;
}

export interface StoryboardArchiveResult {
  directory: string;
  imagePath: string;
  metadataPath: string;
}

function sanitizeSegment(value: string): string {
  const sanitized = value.replace(/[<>:"/\\|?*]/g, "_").replace(/[. ]+$/g, "").trim();
  return sanitized || "未命名";
}

function joinForRoot(root: string, ...segments: string[]): string {
  return /^[A-Za-z]:[\\/]/.test(root) ? win32.join(root, ...segments) : join(root, ...segments);
}

export function buildStoryboardArchivePath(
  root: string,
  projectTitle: string,
  sceneName: string,
  version: number,
): string {
  if (!Number.isInteger(version) || version < 1) throw new Error("version must be a positive integer");
  return joinForRoot(
    root,
    sanitizeSegment(projectTitle),
    sanitizeSegment(sceneName),
    "故事板",
    `v${version}`,
  );
}

function safeMetadata(metadata: StoryboardArchiveMetadata): StoryboardArchiveMetadata {
  const allowed: StoryboardArchiveMetadata = {
    model: metadata.model,
    timestamp: metadata.timestamp,
    taskId: metadata.taskId,
    version: metadata.version,
    style: metadata.style,
    shotIds: metadata.shotIds,
    attempts: metadata.attempts,
  };
  return allowed;
}

async function atomicWrite(path: string, content: Uint8Array | string): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

export async function archiveStoryboard(input: ArchiveStoryboardInput): Promise<StoryboardArchiveResult> {
  const directory = buildStoryboardArchivePath(
    input.root,
    input.projectTitle,
    input.sceneName,
    input.version,
  );
  await mkdir(directory, { recursive: true });
  const imagePath = joinForRoot(directory, "故事板.webp");
  const metadataPath = joinForRoot(directory, "生成信息.json");
  await Promise.all([
    atomicWrite(imagePath, input.imageBytes),
    atomicWrite(metadataPath, JSON.stringify(safeMetadata(input.metadata), null, 2)),
  ]);
  return { directory, imagePath, metadataPath };
}
