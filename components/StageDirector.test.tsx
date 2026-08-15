// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "../types";
import StageDirector from "./StageDirector";

const createStoryboardJob = vi.fn();
const pollAiJob = vi.fn();
const retryAiJob = vi.fn();
vi.mock("../services/aiApiService", () => ({
  createStoryboardJob: (...args: unknown[]) => createStoryboardJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
  retryAiJob: (...args: unknown[]) => retryAiJob(...args),
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
    retryAiJob.mockReset().mockResolvedValue({ jobId: "job-retry", status: "queued" });
  });

  it("opens shot organization controls and explains unavailable video generation", async () => {
    render(<StageDirector project={project} updateProject={vi.fn()} />);
    expect(screen.getByText(/时长偏好：60s（仅参考）/)).toHaveTextContent("AI 当前估算总时长：5 秒");
    fireEvent.click(screen.getByRole("button", { name: "整理镜头" }));
    expect(screen.getByRole("dialog", { name: "整理镜头" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    fireEvent.click(screen.getByRole("button", { name: "生成视频" }));
    expect(await screen.findByRole("status")).toHaveTextContent("视频 API 尚未接入");
  });

  it("adds a shot and keeps its editable fields in the project update", () => {
    const updateProject = vi.fn();
    render(<StageDirector project={project} updateProject={updateProject} />);

    fireEvent.click(screen.getByRole("button", { name: "添加镜头" }));

    const addedUpdate = updateProject.mock.calls.at(-1)?.[0] as Partial<ProjectState>;
    expect(addedUpdate.directorClips?.[0].shots).toHaveLength(2);
    expect(addedUpdate.directorClips?.[0].shots[1]).toMatchObject({
      shotSize: "中景 (MS)",
      duration: 5,
      assets: [{ type: "scene", id: "ruin" }],
    });
    expect(screen.getByRole("status")).toHaveTextContent("已添加镜头");
  });

  it("allows editing shot duration", () => {
    const updateProject = vi.fn();
    render(<StageDirector project={project} updateProject={updateProject} />);

    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "时长（秒）" }), { target: { value: "7.5" } });

    expect(updateProject).toHaveBeenLastCalledWith(expect.objectContaining({
      directorClips: [expect.objectContaining({ shots: [expect.objectContaining({ duration: 7.5 })] })],
    }));
  });

  it("shows and edits the shot title and audio items", () => {
    const updateProject = vi.fn();
    const audioProject: ProjectState = {
      ...project,
      directorClips: [{
        ...project.directorClips[0],
        shots: [{ ...project.directorClips[0].shots[0], audioItems: [{ type: "对白", speaker: "小狐狸", content: "快跑！" }] }],
      }],
    };
    render(<StageDirector project={audioProject} updateProject={updateProject} />);

    expect(screen.getByText("小狐狸：快跑！")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByRole("textbox", { name: "镜头标题" }), { target: { value: "越过废墟" } });
    fireEvent.change(screen.getByRole("textbox", { name: "音频内容 1" }), { target: { value: "跟紧我！" } });

    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      directorClips: [expect.objectContaining({ shots: [expect.objectContaining({ title: "越过废墟" })] })],
    }));
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      directorClips: [expect.objectContaining({ shots: [expect.objectContaining({ audioItems: [expect.objectContaining({ content: "跟紧我！" })] })] })],
    }));
  });

  it("opens the clip containing the linked asset shot", () => {
    const secondClip = { ...project.directorClips[0], id: "clip-2", title: "第二段", shots: [{ ...project.directorClips[0].shots[0], id: "shot-2", title: "目标镜头" }] };
    render(<StageDirector project={{ ...project, directorClips: [...project.directorClips, secondClip] }} updateProject={vi.fn()} initialShotId="shot-2" />);
    expect(screen.getByText(/当前生产来源：已锁定剧本 · 第二段/)).toBeInTheDocument();
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

  it("resumes a persisted storyboard job and removes only that active job on completion", async () => {
    pollAiJob.mockResolvedValue({ id: "board-persisted", status: "completed", progress: 100, result: { imagePath: "D:\\v2.webp", metadataPath: "D:\\v2.json", version: 2 } });
    const updateProject = vi.fn();
    render(<StageDirector project={{
      ...project,
      activeAiJobs: {
        directorPlan: { jobId: "director-other", kind: "director-plan", status: "in_progress", progress: 20 },
        "storyboard:clip-1": { jobId: "board-persisted", kind: "storyboard", status: "queued", progress: 10 },
      },
    }} updateProject={updateProject} />);

    expect(await screen.findByText("生成完成")).toBeInTheDocument();
    expect(createStoryboardJob).not.toHaveBeenCalled();
    expect(pollAiJob).toHaveBeenCalledWith("board-persisted", expect.objectContaining({ onProgress: expect.any(Function) }));
    const completedUpdate = updateProject.mock.calls.map(([update]) => update).find((update) => update.storyboardVersions?.some((version: { jobId?: string }) => version.jobId === "board-persisted"));
    expect(completedUpdate.activeAiJobs).toEqual({
      directorPlan: { jobId: "director-other", kind: "director-plan", status: "in_progress", progress: 20 },
    });
  });

  it("retries a persisted failed storyboard attempt through the retry API", async () => {
    pollAiJob
      .mockResolvedValueOnce({ id: "board-failed", status: "failed", progress: 40, error: "interrupted" })
      .mockResolvedValueOnce({ id: "job-retry", status: "completed", progress: 100, result: { imagePath: "D:\\retry.webp", metadataPath: "D:\\retry.json", version: 2 } });
    render(<StageDirector project={{
      ...project,
      activeAiJobs: {
        "storyboard:clip-1": { jobId: "board-failed", kind: "storyboard", status: "failed", progress: 40, error: "interrupted" },
      },
    }} updateProject={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "重试" }));

    await waitFor(() => expect(retryAiJob).toHaveBeenCalledWith("board-failed"));
    expect(createStoryboardJob).not.toHaveBeenCalled();
  });
});
