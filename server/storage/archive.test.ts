import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { archiveStoryboard, buildStoryboardArchivePath } from "./archive";

describe("storyboard archive", () => {
  it("creates a sanitized Chinese version path", () => {
    expect(
      buildStoryboardArchivePath("D:\\素材", "余烬:回声.", "场次 01 ", 2),
    ).toBe("D:\\素材\\余烬_回声\\场次 01\\故事板\\v2");
  });

  it("writes image and metadata without secrets", async () => {
    const root = await mkdtemp(join(tmpdir(), "cinegen-archive-"));
    const imageBytes = Buffer.from("image-data");
    const result = await archiveStoryboard({
      root,
      projectTitle: "余烬回声",
      sceneName: "场次 01",
      version: 1,
      imageBytes,
      metadata: {
        model: "gpt-image-2",
        timestamp: "2026-08-14T00:00:00.000Z",
        taskId: "task-1",
        version: 1,
        style: "日漫赛璐路",
        shotIds: ["shot-1"],
        attempts: 1,
        apiKey: "sk-secret-must-not-leak",
      },
    });

    expect(await readFile(result.imagePath)).toEqual(imageBytes);
    expect(result.imagePath).toMatch(/故事板\.png$/);
    const metadata = await readFile(result.metadataPath, "utf8");
    expect(metadata).toContain("gpt-image-2");
    expect(metadata).not.toContain("sk-secret-must-not-leak");
    expect(metadata).not.toContain("apiKey");
  });

  it("allocates a fresh version without changing an existing completed version", async () => {
    const root = await mkdtemp(join(tmpdir(), "cinegen-archive-versions-"));
    const first = await archiveStoryboard(archiveInput(root, "first-image", "first-task"));
    const second = await archiveStoryboard(archiveInput(root, "second-image", "second-task"));

    expect(first.version).toBe(1);
    expect(second.version).toBe(2);
    expect(await readFile(first.imagePath, "utf8")).toBe("first-image");
    expect(await readFile(second.imagePath, "utf8")).toBe("second-image");
  });

  it("atomically keeps each concurrent image paired with its own metadata", async () => {
    const root = await mkdtemp(join(tmpdir(), "cinegen-archive-concurrent-"));
    const results = await Promise.all([
      archiveStoryboard(archiveInput(root, "image-a", "task-a")),
      archiveStoryboard(archiveInput(root, "image-b", "task-b")),
    ]);

    expect(results.map((result) => result.version).sort()).toEqual([1, 2]);
    for (const result of results) {
      const image = await readFile(result.imagePath, "utf8");
      const metadata = JSON.parse(await readFile(result.metadataPath, "utf8")) as { taskId: string };
      expect([`${image.replace("image-", "task-")}`]).toContain(metadata.taskId);
    }
  });
});

function archiveInput(root: string, image: string, taskId: string) {
  return {
    root,
    projectTitle: "并发项目",
    sceneName: "场次 01",
    version: 1,
    imageBytes: Buffer.from(image),
    metadata: {
      model: "gpt-image-2",
      timestamp: "2026-08-15T00:00:00.000Z",
      taskId,
      version: 1,
      style: "日漫赛璐路",
      shotIds: ["shot-1"],
      attempts: 1,
    },
  };
}
