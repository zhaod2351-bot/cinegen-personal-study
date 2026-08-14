import { describe, expect, it } from "vitest";
import type { StoryboardInput } from "../types";
import { buildStoryboardPrompt } from "./storyboardPrompt";

const input: StoryboardInput = {
  projectId: "project-1",
  projectTitle: "余烬回声",
  sceneName: "废弃城市街道",
  artStyle: "日漫赛璐璐",
  tags: ["末世", "悬疑"],
  aspectRatio: "16:9",
  version: 1,
  assets: [
    { id: "c1", type: "character", name: "小狐狸", description: "年轻狐族少女，黑色战斗服" },
    { id: "s1", type: "scene", name: "废弃街道", description: "藤蔓覆盖的高楼与积水路面" },
  ],
  clip: {
    id: "clip-1",
    title: "废城相遇",
    summary: "苏林在废城发现小狐狸。",
    shots: Array.from({ length: 6 }, (_, index) => ({
      id: `shot-${index + 1}`,
      title: `镜头 ${index + 1}`,
      shotSize: index === 0 ? "远景 WS" : "中景 MS",
      cameraMovement: "缓慢推进",
      duration: 5,
      action: `第 ${index + 1} 个连续动作`,
      visualPrompt: `visual prompt ${index + 1}`,
      audioItems: [],
      assets: index === 0 ? [{ type: "scene" as const, id: "s1" }] : [{ type: "character" as const, id: "c1" }],
    })),
  },
};

describe("buildStoryboardPrompt", () => {
  it("requires a 3x2 text-free contact sheet with continuity", () => {
    const prompt = buildStoryboardPrompt(input);

    expect(prompt).toContain("3x2");
    expect(prompt).toContain("six panels");
    expect(prompt).toContain("no captions");
    expect(prompt).toContain("character identity");
    expect(prompt).toContain("日漫赛璐璐");
    expect(prompt).toContain("镜头 6");
  });

  it("is deterministic for identical input", () => {
    expect(buildStoryboardPrompt(input)).toBe(buildStoryboardPrompt(structuredClone(input)));
  });
});
