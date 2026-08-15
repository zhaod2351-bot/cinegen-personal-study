import { describe, expect, it } from "vitest";
import { buildAssetReferencePrompt, isAssetReferenceInput } from "./assetReferencePrompt";

const input = {
  projectId: "project-1",
  projectTitle: "地球进化",
  sceneName: "资产-场景-藤蔓废弃城市",
  clip: {
    id: "asset-scene-1",
    title: "藤蔓废弃城市参考图",
    summary: "场景设定图",
    shots: [{ id: "asset-shot", title: "设定图", shotSize: "广角", cameraMovement: "固定", duration: 1, action: "展示场景", visualPrompt: "藤蔓覆盖的废弃城市", audioItems: [], assets: [{ type: "scene" as const, id: "scene-1" }] }],
  },
  assets: [{ id: "scene-1", type: "scene" as const, name: "藤蔓废弃城市", description: "废弃高楼与藤蔓", tags: ["末世", "藤蔓"], sceneContinuity: { time: "下午", weather: "晴朗少云", lighting: "左前方暖色斜射光", palette: "冷灰与低饱和青绿" } }],
  artStyle: "日漫赛璐璐",
  tags: ["末世", "赛博朋克"],
  aspectRatio: "16:9",
  version: 1,
};

describe("asset reference prompt", () => {
  it("requests one style-locked asset image instead of a storyboard grid", () => {
    const prompt = buildAssetReferencePrompt(input);
    expect(isAssetReferenceInput(input)).toBe(true);
    expect(prompt).toContain("Create ONE");
    expect(prompt).toContain("Do not create a contact sheet");
    expect(prompt).toContain("STYLE AND CONTINUITY ANCHOR");
    expect(prompt).toContain("藤蔓覆盖的废弃城市");
    expect(prompt).toContain("Time of day: 下午");
    expect(prompt).toContain("Weather: 晴朗少云");
    expect(prompt).toContain("Lighting and direction: 左前方暖色斜射光");
    expect(prompt).toContain("Color palette: 冷灰与低饱和青绿");
  });
});
