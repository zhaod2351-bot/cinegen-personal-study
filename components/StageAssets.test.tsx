// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StageAssets from "./StageAssets";

const createStoryboardJob = vi.fn();
const pollAiJob = vi.fn();
const localApiFetch = vi.fn();
const getFixedCharacters = vi.fn();
const saveCharacterToFixedLibrary = vi.fn();
const deleteFixedCharacter = vi.fn();

vi.mock("../services/aiApiService", () => ({
  createStoryboardJob: (...args: unknown[]) => createStoryboardJob(...args),
  pollAiJob: (...args: unknown[]) => pollAiJob(...args),
}));
vi.mock("../services/localApiSession", () => ({
  localApiFetch: (...args: unknown[]) => localApiFetch(...args),
}));
vi.mock("../services/storageService", () => ({
  getFixedCharacters: (...args: unknown[]) => getFixedCharacters(...args),
  saveCharacterToFixedLibrary: (...args: unknown[]) => saveCharacterToFixedLibrary(...args),
  deleteFixedCharacter: (...args: unknown[]) => deleteFixedCharacter(...args),
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
    getFixedCharacters.mockReset().mockResolvedValue([]);
    saveCharacterToFixedLibrary.mockReset();
    deleteFixedCharacter.mockReset().mockResolvedValue(undefined);
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

  it("saves per-asset aspect ratio and sends the selected resolution", async () => {
    const updateProject = vi.fn();
    render(<StageAssets project={project} updateProject={updateProject} />);
    fireEvent.change(screen.getByRole("combobox", { name: "图片比例" }), { target: { value: "9:16" } });
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({ characters: [expect.objectContaining({ imageAspectRatio: "9:16" })] }),
    }));

    const configured = structuredClone(project) as unknown as { scriptData: { characters: Array<Record<string, unknown>> } };
    Object.assign(configured.scriptData.characters[0], { imageAspectRatio: "9:16", imageResolution: "4K" });
    cleanup();
    render(<StageAssets project={configured as never} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({
      aspectRatio: "9:16",
      imageResolution: "4K",
    })));
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
    expect((screen.getByRole("button", { name: "生成中…" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "场景" }));
    const sceneGenerate = screen.getByRole("button", { name: "重新生成" });
    expect((sceneGenerate as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(sceneGenerate);

    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledTimes(2));
  });

  it("shows editable scene continuity controls and sends them to image generation", async () => {
    const sceneProject = structuredClone(project) as unknown as { scriptData: { scenes: Array<Record<string, unknown>> } };
    Object.assign(sceneProject.scriptData.scenes[0], {
      weather: "薄雾",
      lighting: "右前方暖色斜射光",
      palette: "冷蓝灰、青色阴影",
    });
    render(<StageAssets project={sceneProject as never} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "场景" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));

    expect((screen.getByRole("combobox", { name: "场景天气" }) as HTMLSelectElement).value).toBe("薄雾");
    expect((screen.getByRole("combobox", { name: "场景光线" }) as HTMLSelectElement).value).toBe("右前方暖色斜射光");
    expect((screen.getByRole("combobox", { name: "场景色卡" }) as HTMLSelectElement).value).toBe("冷蓝灰、青色阴影");
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));

    await waitFor(() => expect(createStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({
      assets: [expect.objectContaining({
        type: "scene",
        sceneContinuity: expect.objectContaining({ weather: "薄雾", lighting: "右前方暖色斜射光", palette: "冷蓝灰、青色阴影" }),
      })],
    })));
  });

  it("does not show asset tags as a competing image prompt field", () => {
    render(<StageAssets project={project} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    expect(screen.queryByRole("textbox", { name: "资产标签" })).toBeNull();
    expect(screen.queryByText("标签")).toBeNull();
  });

  it("shows physical details and allows a persistent character skill to be added", () => {
    const updateProject = vi.fn();
    render(<StageAssets project={project} updateProject={updateProject} />);
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.change(screen.getByRole("textbox", { name: "身高" }), { target: { value: "182cm" } });
    fireEvent.change(screen.getByRole("textbox", { name: "体重" }), { target: { value: "76kg" } });
    fireEvent.click(screen.getByRole("button", { name: "添加技能" }));

    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({ characters: [expect.objectContaining({ height: "182cm" })] }),
    }));
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({ characters: [expect.objectContaining({ weight: "76kg" })] }),
    }));
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({ characters: [expect.objectContaining({ skills: [expect.objectContaining({ name: "新技能" })] })] }),
    }));
  });

  it("supports preview, download and deletion for a saved skill reference image", () => {
    const configured = structuredClone(project) as unknown as { scriptData: { characters: Array<Record<string, unknown>> } };
    configured.scriptData.characters[0].skills = [{ id: "skill-1", name: "青芒", description: "三道刀芒", visualPrompt: "青色弧光", referenceImage: "data:image/png;base64,aW1hZ2U=" }];
    const updateProject = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<StageAssets project={configured as never} updateProject={updateProject} />);

    expect(screen.getByRole("link", { name: "下载保存" }).getAttribute("download")).toBe("青芒-参考图.png");
    fireEvent.click(screen.getByRole("button", { name: "查看大图" }));
    expect(screen.getByRole("dialog", { name: "青芒技能图预览" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "关闭技能图" }));
    fireEvent.click(screen.getByRole("button", { name: "编辑" }));
    fireEvent.click(screen.getByRole("button", { name: "删除图片" }));
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({
      scriptData: expect.objectContaining({ characters: [expect.objectContaining({ skills: [expect.objectContaining({ referenceImage: undefined })] })] }),
    }));
  });

  it("saves the complete character to the fixed library from the more menu", async () => {
    const saved = { id: "fixed-1", character: { id: "character-1", name: "苏林", personality: "果断的冒险者", variations: [], skills: [] }, sourceProjectId: "project-1", sourceProjectTitle: "地球进化", savedAt: 1 };
    saveCharacterToFixedLibrary.mockResolvedValue(saved);
    render(<StageAssets project={project} updateProject={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("button", { name: "加入固定资产库" }));
    await waitFor(() => expect(saveCharacterToFixedLibrary).toHaveBeenCalledWith(expect.objectContaining({ name: "苏林" }), "project-1", "地球进化"));
  });

  it("imports a fixed character with skills and images into the current story", async () => {
    getFixedCharacters.mockResolvedValue([{ id: "fixed-fox", character: { id: "old", name: "长期主角", personality: "主角", variations: [], referenceImage: "data:image/png;base64,aW1hZ2U=", skills: [{ id: "skill-1", name: "青芒", description: "刀芒", visualPrompt: "青光", referenceImage: "data:image/png;base64,c2tpbGw=" }] }, sourceProjectId: "old-project", sourceProjectTitle: "上一集", savedAt: 1 }]);
    const updateProject = vi.fn();
    render(<StageAssets project={project} updateProject={updateProject} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "固定资产库（1）" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "固定资产库（1）" }));
    fireEvent.click(screen.getByRole("button", { name: "导入当前剧情" }));
    expect(updateProject).toHaveBeenCalledWith(expect.objectContaining({ scriptData: expect.objectContaining({ characters: expect.arrayContaining([expect.objectContaining({ name: "长期主角", referenceImage: "data:image/png;base64,aW1hZ2U=", skills: [expect.objectContaining({ name: "青芒", referenceImage: "data:image/png;base64,c2tpbGw=" })] })]) }) }));
  });
});
