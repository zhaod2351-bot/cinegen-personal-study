import { describe, expect, it } from "vitest";
import { validateDirectorPlan } from "./directorPlan";

const validPlan = {
  polishedScript: "苏林在废弃街道发现小狐狸。",
  summary: "幸存者在废城中救下小狐狸。",
  assets: [
    { id: "character-su", type: "character", name: "苏林", description: "年轻幸存者" },
    { id: "scene-street", type: "scene", name: "废弃街道", description: "被藤蔓覆盖的街区" },
    { id: "prop-bomb", type: "prop", name: "浓缩炸弹", description: "橙绿色药剂炸弹" },
  ],
  clips: [
    {
      id: "clip-1",
      title: "相遇",
      summary: "苏林进入街道并发现小狐狸。",
      shots: [
        {
          id: "shot-1",
          title: "废城建立",
          shotSize: "远景 WS",
          cameraMovement: "缓慢推进",
          duration: 5,
          action: "镜头掠过废弃街道。",
          visualPrompt: "cinematic abandoned street",
          audioItems: [{ type: "环境音", content: "风声" }],
          assets: [{ type: "scene", id: "scene-street" }],
        },
        {
          id: "shot-2",
          title: "苏林出现",
          shotSize: "中景 MS",
          cameraMovement: "跟拍",
          duration: 4,
          action: "苏林警惕前行。",
          visualPrompt: "young survivor walking",
          audioItems: [{ type: "对白", speaker: "苏林", content: "有人吗？" }],
          assets: [{ type: "character", id: "character-su" }],
        },
      ],
    },
  ],
};

describe("validateDirectorPlan", () => {
  it("accepts a complete editable plan", () => {
    expect(validateDirectorPlan(validPlan).clips[0].shots).toHaveLength(2);
  });

  it("rejects a shot that references a missing asset", () => {
    const broken = structuredClone(validPlan);
    broken.clips[0].shots[0].assets.push({ type: "prop", id: "missing" });
    expect(() => validateDirectorPlan(broken)).toThrow(/missing/);
  });

  it("allows the same display name in different asset categories", () => {
    const duplicateNames = structuredClone(validPlan);
    duplicateNames.assets.push({
      id: "prop-su",
      type: "prop",
      name: "苏林",
      description: "写有苏林名字的身份牌",
    });
    duplicateNames.clips[0].shots[1].assets.push({ type: "prop", id: "prop-su" });

    expect(validateDirectorPlan(duplicateNames).assets).toHaveLength(4);
  });

  it("rejects duplicate type and id pairs", () => {
    const duplicated = structuredClone(validPlan);
    duplicated.assets.push({ ...duplicated.assets[0] });
    expect(() => validateDirectorPlan(duplicated)).toThrow(/duplicate/);
  });
});
