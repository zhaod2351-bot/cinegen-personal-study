import type { StoryboardInput } from "../types";

export function buildAssetReferencePrompt(input: StoryboardInput): string {
  const asset = input.assets[0];
  const kind = asset?.type === "character" ? "character design" : asset?.type === "scene" ? "environment design" : "prop design";
  const visual = input.clip.shots[0]?.visualPrompt || asset?.description || asset?.name || "asset";
  return [
    `Create ONE production-ready ${kind} reference image for the same animation project.`,
    "Do not create a contact sheet, storyboard grid, split screen, collage, captions, labels, border, or watermark.",
    "",
    "PROJECT VISUAL LOCK",
    `Art style: ${input.artStyle}`,
    `Project tags: ${input.tags.join(", ") || "none"}`,
    "Keep one coherent visual language across all project assets: consistent cel-shading, line weight, material detail, atmospheric perspective and color grading.",
    "Use a restrained cool blue-gray base palette with muted warm highlights unless the asset description explicitly requires another local color.",
    "Any supplied reference image is a STYLE AND CONTINUITY ANCHOR. Preserve its rendering language, palette, contrast and world design; do not copy unrelated subject matter.",
    "",
    "TARGET ASSET",
    `Type: ${asset?.type || "asset"}`,
    `Name: ${asset?.name || input.sceneName}`,
    `Description: ${asset?.description || visual}`,
    `Visual direction: ${visual}`,
    `Asset tags: ${asset?.tags?.join(", ") || "none"}`,
    `Aspect ratio: ${input.aspectRatio}`,
    "",
    asset?.type === "character"
      ? "Show one clear full-body character design with readable face, clothing, silhouette and proportions on a simple unobtrusive background."
      : asset?.type === "scene"
        ? "Show one wide establishing environment view with coherent geography, foreground, midground and background. No repeated panels."
        : "Show one clear prop design at useful scale with readable shape, materials and functional details on a simple background.",
    "Return only the finished single reference image.",
  ].join("\n");
}

export function isAssetReferenceInput(input: StoryboardInput): boolean {
  return input.sceneName.startsWith("资产-") && input.clip.id.startsWith("asset-") && input.assets.length === 1;
}
