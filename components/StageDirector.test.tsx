// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "../types";
import StageDirector from "./StageDirector";

const createStoryboardJob = vi.fn();
const pollAiJob = vi.fn();
vi.mock("../services/aiApiService", () => ({
  createStoryboardJob: (...args: unknown[]) => createStoryboardJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
}));

const project: ProjectState = {
  id: "p1", title: "余烬回声", createdAt: 1, lastModified: 1, stage: "director",
  rawScript: "剧本", targetDuration: "60s", language: "简体中文", artStyle: "日漫赛璐路", styleTags: ["末世"], aspectRatio: "16:9",
  scriptData: { title: "余烬回声", genre: "末世", logline: "逃生", characters: [{ id: "fox", name: "小狐狸", gender: "女", age: "18", personality: "坚韧", variations: [] }], scenes: [{ id: "ruin", location: "废墟", time: "黄昏", atmosphere: "危险" }], storyParagraphs: [] },
  shots: [], isParsingScript: false,
  directorClips: [{ id: "clip-1", title: "逃生", summary: "穿过废墟", shots: [{ id: "shot-1", title: "奔跑", shotSize: "远景 WS", cameraMovement: "推进", duration: 5, action: "小狐狸奔跑", visualPrompt: "逆光废墟", audioItems: [], assets: [{ type: "character", id: "fox" }, { type: "scene", id: "ruin" }] }] }],
  storyboardVersions: [], activeAiJobs: {},
};

describe("StageDirector storyboard jobs", () => {
  afterEach(cleanup);
  beforeEach(() => {
    createStoryboardJob.mockReset().mockResolvedValue({ jobId: "job-1", status: "queued" });
    pollAiJob.mockReset().mockResolvedValue({ id: "job-1", status: "completed", progress: 100, result: { imagePath: "D:\\故事板.webp", metadataPath: "D:\\生成信息.json", version: 1 } });
  });

  it("creates a storyboard job for the active clip", async () => {
    render(<StageDirector project={project} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "生成新版本" }));
    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({ clip: expect.objectContaining({ id: "clip-1" }) })));
  });

  it("includes uploaded character, scene and prop references in the storyboard DTO", async () => {
    const referencedProject: ProjectState = {
      ...structuredClone(project),
      directorClips: [{
        ...structuredClone(project.directorClips[0]),
        shots: [{
          ...structuredClone(project.directorClips[0].shots[0]),
          assets: [
            ...structuredClone(project.directorClips[0].shots[0].assets),
            { type: "prop", id: "map" },
          ],
        }],
      }],
      scriptData: {
        ...structuredClone(project.scriptData!),
        characters: [{
          ...structuredClone(project.scriptData!.characters[0]),
          referenceImage: "data:image/webp;base64,Y2hhcmFjdGVy",
        }],
        scenes: [{
          ...structuredClone(project.scriptData!.scenes[0]),
          referenceImage: "data:image/png;base64,c2NlbmU=",
        }],
        props: [{
          id: "map",
          name: "地图",
          description: "旧地图",
          referenceImage: "data:image/jpeg;base64,cHJvcA==",
        }],
      },
    };
    render(<StageDirector project={referencedProject} updateProject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "生成新版本" }));

    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalled());
    const submitted = createStoryboardJob.mock.calls[0][0] as { assets: Array<{ referenceImages?: unknown[] }> };
    expect(submitted.assets.map((asset) => asset.referenceImages?.[0])).toEqual([
      { mimeType: "image/webp", data: "Y2hhcmFjdGVy" },
      { mimeType: "image/png", data: "c2NlbmU=" },
      { mimeType: "image/jpeg", data: "cHJvcA==" },
    ]);
  });

  it("shows completion and stores a completed version", async () => {
    const updateProject = vi.fn();
    render(<StageDirector project={project} updateProject={updateProject} />);
    fireEvent.click(screen.getByRole("button", { name: "生成新版本" }));
    expect(await screen.findByText("生成完成")).toBeInTheDocument();
    await waitFor(() => {
      const update = updateProject.mock.calls.map((call) => call[0]).find((value) => value.storyboardVersions?.[0]?.status === "completed");
      expect(update.storyboardVersions[0]).toMatchObject({ version: 1, status: "completed" });
    });
  });

  it("retains the previous version when regeneration fails", async () => {
    pollAiJob.mockResolvedValue({ id: "job-2", status: "failed", progress: 40, error: "rate limited" });
    const existing = { ...project, storyboardVersions: [{ id: "board-1", clipId: "clip-1", version: 1, imagePath: "old.webp", imageUrl: "old.webp", status: "completed" as const, createdAt: 1 }] };
    render(<StageDirector project={existing} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "生成新版本" }));
    expect(await screen.findByRole("option", { name: "v1" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "重试" })).toBeInTheDocument();
  });
});
