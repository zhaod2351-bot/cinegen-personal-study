import type { StoryboardInput } from "../types";

export function buildStoryboardPrompt(input: StoryboardInput): string {
  const assets = [...input.assets]
    .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`))
    .map((asset) => `- ${asset.type}:${asset.id} | ${asset.name} | ${asset.description}`)
    .join("\n");

  const shots = input.clip.shots
    .map((shot, index) => {
      const references = shot.assets.map((asset) => `${asset.type}:${asset.id}`).join(", ");
      return [
        `PANEL ${index + 1} | ${shot.title}`,
        `Shot size: ${shot.shotSize}; camera: ${shot.cameraMovement}; duration: ${shot.duration}s`,
        `Action: ${shot.action}`,
        `Visual direction: ${shot.visualPrompt}`,
        `Bound assets: ${references || "none"}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "ROLE: You are a cinematic animation storyboard director.",
    "TASK: Generate ONE landscape cinematic storyboard contact sheet as a single image.",
    "",
    "OUTPUT FORMAT (STRICT)",
    "- Exactly six panels arranged in a clean 3x2 grid, read left-to-right and top-to-bottom.",
    "- Preserve the requested landscape aspect and consistent gutters.",
    "- Visual output only: no captions, no subtitles, no labels, no speech bubbles, no watermark.",
    "",
    "CONTINUITY RULES",
    "- Preserve character identity, face, hair, clothing, proportions and injuries across every panel.",
    "- Preserve environment layout, weather, lighting direction, time of day and recurring props.",
    "- Each panel advances the same chronological action; do not create unrelated poster images.",
    "- Use clear shot-size and camera-angle variation while maintaining spatial continuity.",
    "",
    "ART DIRECTION",
    `Project: ${input.projectTitle}`,
    `Scene: ${input.sceneName}`,
    `Clip: ${input.clip.title} — ${input.clip.summary}`,
    `Art style: ${input.artStyle}`,
    `Creative tags: ${input.tags.join(", ") || "none"}`,
    `Project aspect ratio: ${input.aspectRatio}`,
    "",
    "ASSET TRUTH",
    assets || "- No supplied assets; follow only the shot descriptions.",
    "",
    "PANEL ORDER (DO NOT CHANGE)",
    shots,
    "",
    "FINAL REQUIREMENT: Return only the finished six-panel contact sheet image.",
  ].join("\n");
}
