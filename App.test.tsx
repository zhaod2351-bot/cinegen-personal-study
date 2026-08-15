// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectState } from "./types";
import App from "./App";

const getAllProjectsMetadata = vi.fn();
const subscribeToProjectSync = vi.fn();
const getAiHealth = vi.fn();
const getAiSettings = vi.fn();

const project: ProjectState = {
  id: "project-settings-test",
  title: "余烬回声",
  createdAt: 1,
  lastModified: 1,
  stage: "script",
  rawScript: "小狐狸跑进废墟。",
  targetDuration: "60 秒",
  language: "中文",
  artStyle: "日漫赛璐璐",
  styleTags: ["末世"],
  aspectRatio: "16:9",
  scriptData: null,
  shots: [],
  isParsingScript: false,
  directorClips: [],
  storyboardVersions: [],
  activeAiJobs: {},
};

vi.mock("./services/storageService", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/storageService")>();
  return {
    ...original,
    getAllProjectsMetadata: (...args: unknown[]) => getAllProjectsMetadata(...args),
    subscribeToProjectSync: (...args: unknown[]) => subscribeToProjectSync(...args),
  };
});

vi.mock("./services/aiApiService", () => ({
  getAiHealth: (...args: unknown[]) => getAiHealth(...args),
}));

vi.mock("./services/aiSettingsService", async (importOriginal) => {
  const original = await importOriginal<typeof import("./services/aiSettingsService")>();
  return { ...original, getAiSettings: (...args: unknown[]) => getAiSettings(...args) };
});

describe("App settings entry", () => {
  beforeEach(() => {
    getAllProjectsMetadata.mockReset().mockResolvedValue([]);
    subscribeToProjectSync.mockReset().mockReturnValue(() => undefined);
    getAiHealth.mockReset().mockResolvedValue(null);
    getAiSettings.mockReset().mockResolvedValue({
      text: { baseUrl: "https://text.example/v1", model: "gpt-5", hasKey: false, keyMask: null },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", hasKey: false, keyMask: null },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the dashboard accessible without reading or writing the legacy browser key", async () => {
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");

    render(<App />);

    expect(await screen.findByRole("heading", { name: "你好，创作者！" })).toBeVisible();
    await waitFor(() => expect(getAllProjectsMetadata).toHaveBeenCalled());
    const storageCalls = [...getItem.mock.calls, ...setItem.mock.calls, ...removeItem.mock.calls];
    expect(storageCalls.every(([key]) => key !== "cinegen_api_key")).toBe(true);
  });

  it("opens the settings center from the dashboard before a project exists", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "你好，创作者！" });

    fireEvent.click(screen.getByRole("button", { name: "系统设置" }));

    expect(await screen.findByRole("dialog", { name: "AI 设置中心" })).toBeVisible();
  });

  it("opens the real settings dialog from the project Sidebar", async () => {
    getAllProjectsMetadata.mockResolvedValue([project]);
    render(<App />);
    const projectHeadings = await screen.findAllByRole("heading", { name: "余烬回声" });
    const projectHeading = projectHeadings.find((heading) => heading.closest("article"));
    expect(projectHeading).toBeDefined();
    fireEvent.click(projectHeading!.closest("article") as HTMLElement);

    expect(await screen.findByText("当前项目")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "系统设置" }));

    expect(await screen.findByRole("dialog", { name: "AI 设置中心" })).toBeVisible();
  });
});
