import { describe, expect, it } from "vitest";
import { migrateProject } from "./storageService";

describe("project migration", () => {
  it("adds empty AI collections to an existing project", () => {
    const migrated = migrateProject({
      id: "old",
      title: "旧项目",
      createdAt: 1,
      lastModified: 2,
      stage: "director",
      rawScript: "原始剧本",
      targetDuration: "60",
      language: "简体中文",
      scriptData: null,
      shots: [],
      isParsingScript: false,
    });

    expect(migrated.directorClips).toEqual([]);
    expect(migrated.storyboardVersions).toEqual([]);
    expect(migrated.activeAiJobs).toEqual({});
    expect(migrated.rawScript).toBe("原始剧本");
  });
});
