// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "../types";
import StageScript from "./StageScript";

const createDirectorPlanJob = vi.fn();
const pollAiJob = vi.fn();
vi.mock("../services/aiApiService", () => ({
  createDirectorPlanJob: (...args: unknown[]) => createDirectorPlanJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
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
};

describe("StageScript GPT workflow", () => {
  afterEach(cleanup);
  beforeEach(() => {
    createDirectorPlanJob.mockReset().mockResolvedValue({ jobId: "job-1", status: "queued" });
    pollAiJob.mockReset();
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
});
