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
    const metadata = await readFile(result.metadataPath, "utf8");
    expect(metadata).toContain("gpt-image-2");
    expect(metadata).not.toContain("sk-secret-must-not-leak");
    expect(metadata).not.toContain("apiKey");
  });
});
