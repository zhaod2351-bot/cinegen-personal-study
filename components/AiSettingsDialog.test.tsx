// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicAiSettings } from "../services/aiSettingsService";
import AiSettingsDialog from "./AiSettingsDialog";

const getAiSettings = vi.fn();
const saveAiSettings = vi.fn();
const clearAiKey = vi.fn();
const testAiConnection = vi.fn();

vi.mock("../services/aiSettingsService", () => ({
  getAiSettings: (...args: unknown[]) => getAiSettings(...args),
  saveAiSettings: (...args: unknown[]) => saveAiSettings(...args),
  clearAiKey: (...args: unknown[]) => clearAiKey(...args),
  testAiConnection: (...args: unknown[]) => testAiConnection(...args),
}));

const settings: PublicAiSettings = {
  text: {
    baseUrl: "https://text.example/v1",
    model: "gpt-5",
    hasKey: true,
    keyMask: "sk-****3456",
  },
  image: {
    baseUrl: "https://image.example/v1",
    model: "gpt-image-2",
    hasKey: true,
    keyMask: "im-****cdef",
  },
};

describe("AiSettingsDialog", () => {
  beforeEach(() => {
    getAiSettings.mockReset().mockResolvedValue(settings);
    saveAiSettings.mockReset().mockResolvedValue(settings);
    clearAiKey.mockReset();
    testAiConnection.mockReset();
  });
  afterEach(cleanup);

  it("shows independent provider forms without placing saved secrets in password inputs", async () => {
    render(<AiSettingsDialog onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "AI 设置中心" })).toBeInTheDocument();
    expect(await screen.findByRole("group", { name: "大语言模型" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "图片模型" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "视频模型" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("暂未配置")).toBeInTheDocument();
    expect(screen.getByText(/第三方中转服务可能处理你提交的内容与密钥/)).toBeVisible();
    expect(screen.getByText(/图片连接测试可能产生费用/)).toBeVisible();

    const textKey = screen.getByLabelText("文本 API Key") as HTMLInputElement;
    const imageKey = screen.getByLabelText("图片 API Key") as HTMLInputElement;
    expect(textKey).toHaveValue("");
    expect(imageKey).toHaveValue("");
    expect(screen.getByText("sk-****3456")).toBeVisible();
    expect(screen.getByText("im-****cdef")).toBeVisible();

    fireEvent.change(textKey, { target: { value: "sk-new-secret" } });
    fireEvent.click(screen.getByRole("button", { name: "显示文本 API Key" }));
    expect(textKey).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "隐藏文本 API Key" }));
    expect(textKey).toHaveAttribute("type", "password");
  });

  it("saves each provider independently without changing the other provider's unsaved form", async () => {
    let finishSave: ((value: PublicAiSettings) => void) | undefined;
    saveAiSettings.mockReturnValue(new Promise<PublicAiSettings>((resolve) => { finishSave = resolve; }));
    render(<AiSettingsDialog onClose={vi.fn()} />);
    await screen.findByDisplayValue("https://text.example/v1");

    fireEvent.change(screen.getByLabelText("文本 Base URL"), { target: { value: "https://text-new.example/v1" } });
    fireEvent.change(screen.getByLabelText("文本模型名称"), { target: { value: "gpt-5.1" } });
    fireEvent.change(screen.getByLabelText("文本 API Key"), { target: { value: "sk-new-text" } });
    fireEvent.change(screen.getByLabelText("图片 Base URL"), { target: { value: "https://image-draft.example/v2" } });
    fireEvent.change(screen.getByLabelText("图片模型名称"), { target: { value: "image-draft" } });
    fireEvent.change(screen.getByLabelText("图片 API Key"), { target: { value: "im-new-image" } });
    fireEvent.click(screen.getByRole("button", { name: "保存文本设置" }));

    expect(screen.getByRole("button", { name: "保存文本中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试图片连接" })).toBeEnabled();
    expect(saveAiSettings).toHaveBeenCalledWith({
      text: { baseUrl: "https://text-new.example/v1", model: "gpt-5.1", apiKey: "sk-new-text" },
    });

    finishSave?.({
      ...settings,
      text: { ...settings.text, baseUrl: "https://text-new.example/v1", model: "gpt-5.1", keyMask: "sk-****text" },
    });
    expect(await screen.findByText("文本设置已安全保存")).toBeVisible();
    expect(screen.getByLabelText("文本 API Key")).toHaveValue("");
    expect(screen.getByLabelText("图片 Base URL")).toHaveValue("https://image-draft.example/v2");
    expect(screen.getByLabelText("图片模型名称")).toHaveValue("image-draft");
    expect(screen.getByLabelText("图片 API Key")).toHaveValue("im-new-image");

    saveAiSettings.mockResolvedValueOnce({
      ...settings,
      image: { ...settings.image, baseUrl: "https://image-draft.example/v2", model: "image-draft", keyMask: "im-****mage" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存图片设置" }));
    await waitFor(() => expect(saveAiSettings).toHaveBeenLastCalledWith({
      image: { baseUrl: "https://image-draft.example/v2", model: "image-draft", apiKey: "im-new-image" },
    }));
    expect(await screen.findByText("图片设置已安全保存")).toBeVisible();
    expect(screen.getByLabelText("图片 API Key")).toHaveValue("");
  });

  it("tests the current provider form and retains its password after a failed request", async () => {
    let failTextTest: ((reason: Error) => void) | undefined;
    testAiConnection
      .mockReturnValueOnce(new Promise((_, reject) => { failTextTest = reject; }))
      .mockResolvedValueOnce({ ok: true, message: "图片模型连接正常" });
    render(<AiSettingsDialog onClose={vi.fn()} />);
    await screen.findByDisplayValue("https://text.example/v1");

    fireEvent.change(screen.getByLabelText("文本 API Key"), { target: { value: "bad-text-key" } });
    fireEvent.click(screen.getByRole("button", { name: "测试文本连接" }));
    expect(screen.getByRole("button", { name: "测试中…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "测试图片连接" })).toBeEnabled();
    failTextTest?.(new Error("认证失败，请检查密钥"));
    expect(await screen.findByText("认证失败，请检查密钥")).toBeVisible();
    expect(screen.getByLabelText("文本 API Key")).toHaveValue("bad-text-key");
    expect(testAiConnection).toHaveBeenNthCalledWith(1, "text", {
      baseUrl: "https://text.example/v1",
      model: "gpt-5",
      apiKey: "bad-text-key",
    });

    fireEvent.change(screen.getByLabelText("图片 API Key"), { target: { value: "good-image-key" } });
    fireEvent.click(screen.getByRole("button", { name: "测试图片连接" }));
    expect(await screen.findByText("图片模型连接正常")).toBeVisible();
    expect(screen.getByLabelText("图片 API Key")).toHaveValue("");
  });

  it("clears a provider's old message when its next operation starts", async () => {
    let finishSecondTest: ((value: { ok: true; message: string }) => void) | undefined;
    testAiConnection
      .mockResolvedValueOnce({ ok: true, message: "文本连接正常" })
      .mockReturnValueOnce(new Promise((resolve) => { finishSecondTest = resolve; }));
    render(<AiSettingsDialog onClose={vi.fn()} />);
    await screen.findByDisplayValue("https://text.example/v1");

    fireEvent.click(screen.getByRole("button", { name: "测试文本连接" }));
    expect(await screen.findByText("文本连接正常")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "测试文本连接" }));
    expect(screen.queryByText("文本连接正常")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "测试图片连接" })).toBeEnabled();

    finishSecondTest?.({ ok: true, message: "文本仍然连接正常" });
    expect(await screen.findByText("文本仍然连接正常")).toBeVisible();
  });

  it("clears only the selected provider key", async () => {
    clearAiKey.mockResolvedValue({
      text: { ...settings.text, hasKey: false, keyMask: null },
      image: settings.image,
    });
    render(<AiSettingsDialog onClose={vi.fn()} />);
    const textGroup = await screen.findByRole("group", { name: "大语言模型" });

    fireEvent.click(within(textGroup).getByRole("button", { name: "清除文本 Key" }));

    await waitFor(() => expect(clearAiKey).toHaveBeenCalledWith("text"));
    expect(within(textGroup).getAllByText("未保存密钥")).toHaveLength(2);
    expect(screen.getByText("im-****cdef")).toBeVisible();
  });

  it("keeps entered passwords after a failed save and closes on Escape", async () => {
    const onClose = vi.fn();
    saveAiSettings.mockRejectedValue(new Error("Base URL 无效"));
    render(<AiSettingsDialog onClose={onClose} />);
    await screen.findByDisplayValue("https://text.example/v1");

    fireEvent.change(screen.getByLabelText("文本 API Key"), { target: { value: "keep-me" } });
    fireEvent.click(screen.getByRole("button", { name: "保存文本设置" }));
    expect(await screen.findByText("Base URL 无效")).toBeVisible();
    expect(screen.getByLabelText("文本 API Key")).toHaveValue("keep-me");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("traps focus inside the modal, hides the background, and restores the launcher focus", async () => {
    const FocusHarness = () => {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>打开设置</button>
          {open && <AiSettingsDialog onClose={() => setOpen(false)} />}
        </>
      );
    };
    const { container } = render(<FocusHarness />);
    const launcher = screen.getByRole("button", { name: "打开设置" });
    launcher.focus();
    fireEvent.click(launcher);

    const dialog = screen.getByRole("dialog", { name: "AI 设置中心" });
    const headerClose = within(dialog).getByRole("button", { name: "关闭设置" });
    await waitFor(() => expect(headerClose).toHaveFocus());
    expect(container).toHaveAttribute("aria-hidden", "true");
    expect(container).toHaveAttribute("inert");

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    const footerClose = within(dialog).getByRole("button", { name: "关闭" });
    expect(footerClose).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(headerClose).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "AI 设置中心" })).not.toBeInTheDocument();
    expect(launcher).toHaveFocus();
    expect(container).not.toHaveAttribute("aria-hidden");
    expect(container).not.toHaveAttribute("inert");
  });
});
