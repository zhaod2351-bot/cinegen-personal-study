import type { DirectorPlanInput } from "../types";

export function buildDirectorPlanPrompt(input: DirectorPlanInput): string {
  return [
    "你是一名动画短片导演和制片数据设计师。",
    "请把锁定剧本润色并拆解为可编辑、可验证的导演制作计划。",
    "",
    "【项目设定】",
    `画风：${input.artStyle}`,
    `作品标签：${input.tags.join("、") || "无"}`,
    `画幅：${input.aspectRatio}`,
    `语言：${input.language}`,
    `目标时长：${input.targetDuration}`,
    "",
    "【锁定剧本】",
    input.lockedScript,
    "",
    "【拆解规则】",
    "1. 输出 polishedScript、summary、assets、clips。",
    "2. assets 必须区分 character、scene、prop，每项拥有稳定且唯一的 id。",
    "3. 每个镜头包含景别、运镜、时长、动作、视觉提示词、音频项和资产引用。",
    "4. 镜头资产只能通过 type + id 引用，不能只使用名称；同名不同类别是不同资产。",
    "5. 视觉提示词必须服从项目画风，并明确人物、场景、构图、光线和情绪。",
    "6. 不添加锁定剧本没有依据的重要角色、道具或剧情结局。",
    "",
    "只能输出 JSON，不要 Markdown 代码块、解释、前言或结语。",
  ].join("\n");
}
