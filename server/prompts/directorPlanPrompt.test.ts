import { describe, expect, it } from "vitest";
import { buildDirectorPlanPrompt } from "./directorPlanPrompt";

describe("buildDirectorPlanPrompt", () => {
  it("includes the locked script, creative settings and typed references", () => {
    const prompt = buildDirectorPlanPrompt({
      lockedScript: "第一场：苏林进入废弃街道。",
      artStyle: "日漫赛璐璐",
      tags: ["末世", "悬疑"],
      aspectRatio: "16:9",
      language: "简体中文",
      targetDuration: "60s",
    });

    expect(prompt).toContain("第一场：苏林进入废弃街道。");
    expect(prompt).toContain("日漫赛璐璐");
    expect(prompt).toContain("末世、悬疑");
    expect(prompt).toContain("type + id");
    expect(prompt).toContain("用户时长偏好（仅供参考，不要求凑满）：60s");
    expect(prompt).toContain("实际总时长可以短于或长于用户时长偏好");
    expect(prompt).not.toContain("用较长的单镜头覆盖目标时长");
    expect(prompt).toContain("只能输出 JSON");
  });
});
