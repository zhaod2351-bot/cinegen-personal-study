// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "../types";
import type { DirectorPlan } from "../server/types";
import StageScript, { convertDirectorPlan } from "./StageScript";

const createDirectorPlanJob = vi.fn();
const pollAiJob = vi.fn();
const retryAiJob = vi.fn();
vi.mock("../services/aiApiService", () => ({
  createDirectorPlanJob: (...args: unknown[]) => createDirectorPlanJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
  retryAiJob: (...args: unknown[]) => retryAiJob(...args),
}));

const project: ProjectState = {
  id: "p1",
  title: "余烬回声",
  createdAt: 1,
  lastModified: 1,
  stage: "script",
  rawScript: "小狐狸跑进废墟。",
  targetDuration: "60s",
  language: "简体中文",
  artStyle: "日漫赛璐路",
  styleTags: ["末世"],
  aspectRatio: "16:9",
  scriptData: {
    title: "余烬回声",
    genre: "末世",
    logline: "逃生",
    characters: [{
      id: "fox",
      name: "小狐狸",
      gender: "女",
      age: "18",
      personality: "坚韧",
      referenceImage: "data:image/webp;base64,old",
      variations: [],
    }],
    scenes: [],
    storyParagraphs: [],
  },
  shots: [],
  isParsingScript: false,
  directorClips: [],
  storyboardVersions: [],
  activeAiJobs: {},
};

const completedPlan = {
  polishedScript: "小狐狸踉跄地跑进废墟。",
  summary: "逃生",
  assets: [{ id: "fox", type: "character", name: "小狐狸", description: "受伤的冒险者" }],
  clips: [{ id: "clip-1", title: "逃生", summary: "穿过废墟", shots: [] }],
} satisfies DirectorPlan;

describe("StageScript GPT workflow", () => {
  afterEach(cleanup);
  beforeEach(() => {
    createDirectorPlanJob.mockReset().mockResolvedValue({ jobId: "job-1", status: "queued" });
    pollAiJob.mockReset();
    retryAiJob.mockReset().mockResolvedValue({ jobId: "job-retry", status: "queued" });
  });

  it("opens the asset workspace from a locked script", () => {
    const onOpenAssets = vi.fn();
    render(<StageScript project={project} updateProject={vi.fn()} onOpenAssets={onOpenAssets} />);
    fireEvent.click(screen.getByRole("button", { name: "进入工作台" }));
    expect(onOpenAssets).toHaveBeenCalledOnce();
  });

  it("submits the locked script and shows task progress", async () => {
    pollAiJob.mockReturnValue(new Promise(() => undefined));
    render(<StageScript project={{ ...project, scriptData: null }} updateProject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 剧本分析" }));

    expect(await screen.findByText("正在规划镜头")).toBeInTheDocument();
    expect(createDirectorPlanJob).toHaveBeenCalledWith(expect.objectContaining({ lockedScript: project.rawScript }));
  });

  it("applies a completed plan without overwriting asset reference images", async () => {
    pollAiJob.mockResolvedValue({ id: "job-1", status: "completed", progress: 100, result: completedPlan });
    const updateProject = vi.fn();
    render(<StageScript project={project} updateProject={updateProject} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 剧本分析" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认并锁定剧本" }));

    await waitFor(() => expect(updateProject).toHaveBeenCalled());
    const applied = updateProject.mock.calls.at(-1)?.[0] as Partial<ProjectState>;
    expect(applied.scriptData?.characters[0].referenceImage).toBe("data:image/webp;base64,old");
    expect(applied.rawScript).toContain("踉跄");
  });

  it("resumes a persisted director-plan job without creating a replacement", async () => {
    pollAiJob.mockImplementation(async (_id: string, options?: { onProgress?: (snapshot: unknown) => void }) => {
      options?.onProgress?.({ id: "job-persisted", status: "in_progress", progress: 55 });
      return { id: "job-persisted", status: "completed", progress: 100, result: completedPlan };
    });
    const updateProject = vi.fn();
    render(<StageScript project={{
      ...project,
      activeAiJobs: {
        directorPlan: { jobId: "job-persisted", kind: "director-plan", status: "queued", progress: 10 },
        "storyboard:clip-1": { jobId: "board-other", kind: "storyboard", status: "in_progress", progress: 40 },
      },
    }} updateProject={updateProject} />);

    expect(await screen.findByRole("dialog", { name: "AI 剧本分析预览" })).toBeInTheDocument();
    expect(createDirectorPlanJob).not.toHaveBeenCalled();
    expect(pollAiJob).toHaveBeenCalledWith("job-persisted", expect.objectContaining({ onProgress: expect.any(Function) }));
    expect(updateProject.mock.calls.some(([update]) => update.activeAiJobs?.["storyboard:clip-1"]?.jobId === "board-other")).toBe(true);
  });

  it("retries a persisted failed director-plan attempt through the retry API", async () => {
    pollAiJob
      .mockResolvedValueOnce({ id: "job-failed", status: "failed", progress: 35, error: "interrupted" })
      .mockResolvedValueOnce({ id: "job-retry", status: "completed", progress: 100, result: completedPlan });
    render(<StageScript project={{
      ...project,
      activeAiJobs: {
        directorPlan: { jobId: "job-failed", kind: "director-plan", status: "failed", progress: 35, error: "interrupted" },
      },
    }} updateProject={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(retryAiJob).toHaveBeenCalledWith("job-failed"));
    expect(createDirectorPlanJob).not.toHaveBeenCalled();
  });

  it("preserves manual character, scene and prop fields while refreshing AI-owned fields", () => {
    const source = structuredClone({
      ...project,
      scriptData: {
        ...project.scriptData!,
        characters: [{
          ...project.scriptData!.characters[0],
          personality: "manual personality",
          visualPrompt: "manual character visual",
          tags: [],
          variations: [{ id: "winter", name: "冬装", visualPrompt: "manual variation", referenceImage: "data:image/png;base64,d2ludGVy" }],
          fieldProvenance: { personality: "manual", visualPrompt: "manual", tags: "manual" },
        }],
        scenes: [{
          id: "ruin",
          location: "人工场景名",
          time: "黄昏",
          atmosphere: "manual atmosphere",
          visualPrompt: "manual scene visual",
          referenceImage: "data:image/png;base64,c2NlbmU=",
          tags: ["manual-scene-tag"],
        }],
        props: [{
          id: "map",
          name: "人工道具名",
          description: "manual prop description",
          visualPrompt: "manual prop visual",
          referenceImage: "data:image/png;base64,cHJvcA==",
          tags: ["manual-prop-tag"],
        }],
      },
    }) as ProjectState;
    const sourceBefore = structuredClone(source);
    const plan = {
      ...completedPlan,
      assets: [
        { id: "fox", type: "character" as const, name: "小狐狸", description: "new AI character", tags: ["ai-character"] },
        { id: "ruin", type: "scene" as const, name: "AI 场景名", description: "new AI scene", tags: ["ai-scene"] },
        { id: "map", type: "prop" as const, name: "AI 道具名", description: "new AI prop", tags: ["ai-prop"] },
      ],
    };

    const converted = convertDirectorPlan(source, plan);

    expect(converted.scriptData.characters[0]).toMatchObject({
      personality: "manual personality",
      visualPrompt: "manual character visual",
      tags: [],
      referenceImage: "data:image/webp;base64,old",
      variations: [{ id: "winter" }],
    });
    expect(converted.scriptData.scenes[0]).toMatchObject({
      location: "人工场景名",
      atmosphere: "manual atmosphere",
      visualPrompt: "manual scene visual",
      tags: ["manual-scene-tag"],
      referenceImage: "data:image/png;base64,c2NlbmU=",
    });
    expect(converted.scriptData.props?.[0]).toMatchObject({
      name: "人工道具名",
      description: "manual prop description",
      visualPrompt: "manual prop visual",
      tags: ["manual-prop-tag"],
      referenceImage: "data:image/png;base64,cHJvcA==",
    });
    expect(source).toEqual(sourceBefore);
  });

  it("marks new AI asset fields so a later analysis can refresh them", () => {
    const first = convertDirectorPlan({
      ...project,
      scriptData: { ...project.scriptData!, characters: [], scenes: [], props: [] },
    }, completedPlan);
    const refreshed = convertDirectorPlan({
      ...project,
      scriptData: first.scriptData,
    }, {
      ...completedPlan,
      assets: [{ id: "fox", type: "character", name: "小狐狸", description: "second AI description", tags: ["second"] }],
    });

    expect(first.scriptData.characters[0].fieldProvenance).toMatchObject({
      personality: "ai",
      visualPrompt: "ai",
      tags: "ai",
    });
    expect(refreshed.scriptData.characters[0]).toMatchObject({
      personality: "second AI description",
      visualPrompt: "second AI description",
      tags: ["second"],
    });
  });
});
