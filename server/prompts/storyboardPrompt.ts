import type { DirectorShot, StoryboardInput } from "../types";

export function buildStoryboardPrompt(input: StoryboardInput): string {
  const selectedAssetKeys = new Set(input.clip.shots.flatMap((shot) => (
    shot.assets.map((asset) => `${asset.type}:${asset.id}`)
  )));
  const assets = input.assets
    .filter((asset) => selectedAssetKeys.has(`${asset.type}:${asset.id}`))
    .slice()
    .sort((left, right) => `${left.type}:${left.id}`.localeCompare(`${right.type}:${right.id}`))
    .map((asset) => `- ${asset.type}:${asset.id} | ${asset.name} | ${asset.description}`)
    .join("\n");

  const shots = normalizeStoryboardFrames(input.clip.shots)
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

export function normalizeStoryboardFrames(shots: readonly DirectorShot[]): DirectorShot[] {
  if (shots.length === 0) throw new Error("storyboard requires at least one shot");
  if (shots.length >= 6) {
    return Array.from({ length: 6 }, (_, index) => {
      const sourceIndex = shots.length === 6
        ? index
        : Math.round(index * (shots.length - 1) / 5);
      return cloneShot(shots[sourceIndex]);
    });
  }

  if (shots.length === 1) {
    return Array.from({ length: 6 }, (_, index) => {
      const shot = cloneShot(shots[0]);
      if (index === 0) return shot;
      return {
        ...shot,
        id: `${shot.id}-transition-${index}`,
        title: `${shot.title} · Transition beat ${index}`,
        action: `${shot.action}; Transition beat ${index} advances the same continuous action.`,
      };
    });
  }

  return Array.from({ length: 6 }, (_, index) => {
    const position = index * (shots.length - 1) / 5;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.ceil(position);
    if (leftIndex === rightIndex) return cloneShot(shots[leftIndex]);
    const left = shots[leftIndex];
    const right = shots[rightIndex];
    return {
      ...cloneShot(left),
      id: `${left.id}-${right.id}-transition-${index}`,
      title: `Transition beat: ${left.title} → ${right.title}`,
      duration: (left.duration + right.duration) / 2,
      action: `Transition beat from “${left.action}” toward “${right.action}”.`,
      visualPrompt: `${left.visualPrompt}; preserve continuity while moving toward ${right.visualPrompt}`,
      assets: uniqueAssetReferences([...left.assets, ...right.assets]),
    };
  });
}

function cloneShot(shot: DirectorShot): DirectorShot {
  return {
    ...shot,
    audioItems: shot.audioItems.map((item) => ({ ...item })),
    assets: shot.assets.map((item) => ({ ...item })),
  };
}

function uniqueAssetReferences(references: DirectorShot["assets"]): DirectorShot["assets"] {
  const seen = new Set<string>();
  return references.filter((reference) => {
    const key = `${reference.type}:${reference.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((reference) => ({ ...reference }));
}
