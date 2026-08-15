import { randomUUID } from "node:crypto";
import { access, mkdir, open, readdir, rename, rm, writeFile } from "node:fs/promises";
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
  version: number;
  directory: string;
  imagePath: string;
  metadataPath: string;
}

export interface StoryboardArchiveReservation {
  version: number;
  baseDirectory: string;
  directory: string;
  reservationPath: string;
}

export class StoryboardVersionConflictError extends Error {
  readonly status = 409;

  constructor(version: number) {
    super(`storyboard version v${version} already exists`);
  }
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

function buildStoryboardArchiveBasePath(
  root: string,
  projectTitle: string,
  sceneName: string,
): string {
  return joinForRoot(
    root,
    sanitizeSegment(projectTitle),
    sanitizeSegment(sceneName),
    "故事板",
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

export async function reserveStoryboardVersion(input: Pick<
  ArchiveStoryboardInput,
  "root" | "projectTitle" | "sceneName"
>): Promise<StoryboardArchiveReservation> {
  const baseDirectory = buildStoryboardArchiveBasePath(input.root, input.projectTitle, input.sceneName);
  await mkdir(baseDirectory, { recursive: true });
  const existing = await readdir(baseDirectory, { withFileTypes: true });
  const completedVersions = new Set(existing.flatMap((entry) => {
    const match = entry.isDirectory() ? /^v([1-9]\d*)$/.exec(entry.name) : null;
    return match ? [Number(match[1])] : [];
  }));

  for (let version = 1; version < Number.MAX_SAFE_INTEGER; version += 1) {
    if (completedVersions.has(version)) continue;
    const directory = joinForRoot(baseDirectory, `v${version}`);
    const reservationPath = joinForRoot(baseDirectory, `.v${version}.reserve`);
    let handle;
    try {
      handle = await open(reservationPath, "wx");
      await handle.close();
    } catch (error) {
      await handle?.close().catch(() => undefined);
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }

    if (await pathExists(directory)) {
      await rm(reservationPath, { force: true });
      completedVersions.add(version);
      continue;
    }
    return { version, baseDirectory, directory, reservationPath };
  }
  throw new Error("no storyboard archive version is available");
}

export async function releaseStoryboardReservation(
  reservation: StoryboardArchiveReservation | undefined,
): Promise<void> {
  if (reservation) await rm(reservation.reservationPath, { force: true });
}

export async function archiveStoryboard(
  input: ArchiveStoryboardInput,
  reserved?: StoryboardArchiveReservation,
): Promise<StoryboardArchiveResult> {
  const reservation = reserved ?? await reserveStoryboardVersion(input);
  const expectedBase = buildStoryboardArchiveBasePath(input.root, input.projectTitle, input.sceneName);
  if (reservation.baseDirectory !== expectedBase) {
    await releaseStoryboardReservation(reservation);
    throw new Error("storyboard archive reservation does not match the input");
  }

  const stagingDirectory = joinForRoot(
    reservation.baseDirectory,
    `.v${reservation.version}.${randomUUID()}.tmp`,
  );
  const stagingImagePath = joinForRoot(stagingDirectory, "故事板.webp");
  const stagingMetadataPath = joinForRoot(stagingDirectory, "生成信息.json");
  let committed = false;
  try {
    await mkdir(stagingDirectory, { recursive: false });
    await Promise.all([
      writeFile(stagingImagePath, input.imageBytes),
      writeFile(stagingMetadataPath, JSON.stringify(safeMetadata({
        ...input.metadata,
        version: reservation.version,
      }), null, 2)),
    ]);
    if (await pathExists(reservation.directory)) {
      throw new StoryboardVersionConflictError(reservation.version);
    }
    try {
      await rename(stagingDirectory, reservation.directory);
    } catch (error) {
      if (["EEXIST", "ENOTEMPTY", "EPERM"].includes((error as NodeJS.ErrnoException).code ?? "")) {
        throw new StoryboardVersionConflictError(reservation.version);
      }
      throw error;
    }
    committed = true;
    return {
      version: reservation.version,
      directory: reservation.directory,
      imagePath: joinForRoot(reservation.directory, "故事板.webp"),
      metadataPath: joinForRoot(reservation.directory, "生成信息.json"),
    };
  } finally {
    if (!committed) await rm(stagingDirectory, { recursive: true, force: true });
    await releaseStoryboardReservation(reservation);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
