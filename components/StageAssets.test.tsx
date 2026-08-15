// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StageAssets from "./StageAssets";

const createStoryboardJob = vi.fn();
const pollAiJob = vi.fn();
const localApiFetch = vi.fn();

vi.mock("../services/aiApiService", () => ({
  createStoryboardJob: (...args: unknown[]) => createStoryboardJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
}));
vi.mock("../services/localApiSession", () => ({
  localApiFetch: (...args: unknown[]) => localApiFetch(...args),
}));

const project = {
  id: "project-1",
  title: "地球进化",
  artStyle: "日漫赛璐路",
  styleTags: ["末世"],
  aspectRatio: "16:9",
  shots: [{ id: "shot-1", sceneId: "scene-1", characters: ["character-1"], props: [], keyframes: [] }],
  scriptData: {
    genre: "末世",
    logline: "苏林救下小狐狸",
    characters: [{ id: "character-1", name: "苏林", personality: "果断的冒险者", variations: [] }],
    scenes: [{ id: "scene-1", location: "废墟", time: "黄昏", atmosphere: "寂静" }],
    props: [],
  },
} as never;

describe("StageAssets image generation", () => {
  afterEach(() => cleanup());
  beforeEach(() => {
    localStorage.clear();
    createStoryboardJob.mockReset().mockResolvedValue({ jobId: "image-job-1", status: "queued" });
    pollAiJob.mockReset().mockResolvedValue({ status: "completed", result: { imagePath: "asset.webp" } });
    localApiFetch.mockReset().mockResolvedValue(new Response(new Blob(["image"], { type: "image/webp" }), { status: 200 }));
  });

  it("starts a real image job from the regenerate action", async () => {
    render(<StageAssets project={project} updateProject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledTimes(1));
    expect(createStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      assets: [expect.objectContaining({ id: "character-1", type: "character", name: "苏林" })],
    }));
    await waitFor(() => expect(localApiFetch).toHaveBeenCalledWith("/api/jobs/image-job-1/image"));
  });

  it("removes only the selected reference image after confirmation", () => {
    const withImage = structuredClone(project) as typeof project;
    (withImage as never as { scriptData: { characters: Array<{ referenceImage?: string }> } }).scriptData.characters[0].referenceImage = "data:image/png;base64,aW1hZ2U=";
    const updateProject = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StageAssets project={withImage} updateProject={updateProject} />);

    fireEvent.click(screen.getByRole("button", { name: "删除图片" }));

    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({
        characters: [expect.objectContaining({ id: "character-1", referenceImage: undefined })],
      }),
    }));
  });

  it("resumes and retrieves a persisted asset image job after refresh", async () => {
    localStorage.setItem("cinegen_asset_job:project-1", JSON.stringify({
      jobId: "persisted-image-job",
      kind: "character",
      assetId: "character-1",
      assetName: "苏林",
    }));
    render(<StageAssets project={project} updateProject={vi.fn()} />);

    await waitFor(() => expect(pollAiJob).toHaveBeenCalledWith("persisted-image-job", expect.any(Object)));
    await waitFor(() => expect(localApiFetch).toHaveBeenCalledWith("/api/jobs/persisted-image-job/image"));
    await waitFor(() => expect(localStorage.getItem("cinegen_asset_job:project-1")).toBeNull());
  });

  it("allows a different asset to generate while the first asset is still running", async () => {
    createStoryboardJob
      .mockResolvedValueOnce({ jobId: "character-job", status: "queued" })
      .mockResolvedValueOnce({ jobId: "scene-job", status: "queued" });
    pollAiJob.mockImplementation(() => new Promise(() => undefined));
    render(<StageAssets project={project} updateProject={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "场景" }));
    const sceneGenerate = screen.getByRole("button", { name: "重新生成" });
    expect((sceneGenerate as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sceneGenerate);

    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledTimes(2));
  });
});
