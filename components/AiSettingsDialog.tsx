import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Eye, EyeOff, Image, KeyRound, LoaderCircle, MessageSquareText, ShieldAlert, Video, X } from "lucide-react";
import {
  clearAiKey,
  getAiSettings,
  saveAiSettings,
  testAiConnection,
  type PublicAiSettings,
  type PublicProviderSettings,
  type ProviderSettingsInput,
} from "../services/aiSettingsService";

type ProviderKind = "text" | "image";
type ProviderAction = "save" | "test" | "clear" | null;

interface AiSettingsDialogProps {
  onClose: () => void;
}

interface ProviderFormProps {
  kind: ProviderKind;
  title: string;
  description: string;
  settings: PublicProviderSettings;
  input: ProviderSettingsInput;
  showKey: boolean;
  disabled: boolean;
  saving: boolean;
  testing: boolean;
  clearing: boolean;
  message?: string;
  onInputChange: (input: ProviderSettingsInput) => void;
  onToggleKey: () => void;
  onSave: () => void;
  onTest: () => void;
  onClear: () => void;
}

const emptyProvider: PublicProviderSettings = {
  baseUrl: "",
  model: "",
  hasKey: false,
  keyMask: null,
};

function toInput(settings: PublicProviderSettings): ProviderSettingsInput {
  return { baseUrl: settings.baseUrl, model: settings.model, apiKey: "" };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试";
}

const ProviderForm = ({
  kind,
  title,
  description,
  settings,
  input,
  showKey,
  disabled,
  saving,
  testing,
  clearing,
  message,
  onInputChange,
  onToggleKey,
  onSave,
  onTest,
  onClear,
}: ProviderFormProps) => {
  const baseId = useId();
  const labelPrefix = kind === "text" ? "文本" : "图片";
  const Icon = kind === "text" ? MessageSquareText : Image;

  return (
    <fieldset
      aria-label={title}
      className="rounded-2xl border border-[#d9e1e7] bg-white/85 p-5 shadow-[0_18px_50px_rgba(79,101,116,0.08)]"
      disabled={disabled}
    >
      <legend className="sr-only">{title}</legend>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#e7f0f5] text-[#41677b]">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-[#25333b]">{title}</h3>
            <p className="mt-1 text-xs leading-5 text-[#71818b]">{description}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-medium ${settings.hasKey ? "bg-emerald-50 text-emerald-700" : "bg-[#f5eee4] text-[#8b6d4b]"}`}>
          {settings.hasKey ? "密钥已保存" : "未保存密钥"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label htmlFor={`${baseId}-url`} className="grid gap-1.5 text-xs font-medium text-[#4c5d66]">
          {labelPrefix} Base URL
          <input
            id={`${baseId}-url`}
            value={input.baseUrl}
            onChange={(event) => onInputChange({ ...input, baseUrl: event.target.value })}
            placeholder="https://api.example.com/v1"
            className="h-10 rounded-xl border border-[#d4dde2] bg-[#fbfcfc] px-3 text-sm text-[#24333b] outline-none transition focus:border-[#7295a8] focus:ring-2 focus:ring-[#cfe0e9]"
          />
        </label>
        <label htmlFor={`${baseId}-model`} className="grid gap-1.5 text-xs font-medium text-[#4c5d66]">
          {labelPrefix}模型名称
          <input
            id={`${baseId}-model`}
            value={input.model}
            onChange={(event) => onInputChange({ ...input, model: event.target.value })}
            placeholder={kind === "text" ? "gpt-5" : "gpt-image-2"}
            className="h-10 rounded-xl border border-[#d4dde2] bg-[#fbfcfc] px-3 text-sm text-[#24333b] outline-none transition focus:border-[#7295a8] focus:ring-2 focus:ring-[#cfe0e9]"
          />
        </label>
      </div>

      <div className="mt-4">
        <label htmlFor={`${baseId}-key`} className="mb-1.5 block text-xs font-medium text-[#4c5d66]">{labelPrefix} API Key</label>
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8fa0aa]" aria-hidden="true" />
            <input
              id={`${baseId}-key`}
              type={showKey ? "text" : "password"}
              value={input.apiKey ?? ""}
              onChange={(event) => onInputChange({ ...input, apiKey: event.target.value })}
              autoComplete="new-password"
              placeholder="输入新密钥（不会回显已保存密钥）"
              className="h-10 w-full rounded-xl border border-[#d4dde2] bg-[#fbfcfc] pl-9 pr-10 text-sm text-[#24333b] outline-none transition focus:border-[#7295a8] focus:ring-2 focus:ring-[#cfe0e9]"
            />
            <button
              type="button"
              onClick={onToggleKey}
              aria-label={`${showKey ? "隐藏" : "显示"}${labelPrefix} API Key`}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#6d7d86] hover:bg-[#edf3f6]"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            type="button"
            onClick={onClear}
            disabled={disabled || clearing || !settings.hasKey}
            aria-label={`清除${labelPrefix} Key`}
            className="h-10 shrink-0 rounded-xl border border-[#e0d4c7] px-3 text-xs font-medium text-[#8b5f3d] transition hover:bg-[#fbf3e9] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {clearing ? "清除中…" : "清除 Key"}
          </button>
        </div>
        <p className="mt-1.5 text-[11px] text-[#819099]">
          当前：<span className="font-mono text-[#526670]">{settings.keyMask ?? "未保存密钥"}</span>
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[#edf0f2] pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || saving}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#ba5c2a] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#a84e20] disabled:cursor-wait disabled:opacity-60"
        >
          {saving && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {saving ? `保存${labelPrefix}中…` : `保存${labelPrefix}设置`}
        </button>
        <button
          type="button"
          onClick={onTest}
          disabled={disabled || testing}
          className="inline-flex h-9 items-center gap-2 rounded-xl bg-[#496f82] px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-[#3c6173] disabled:cursor-wait disabled:opacity-60"
        >
          {testing && <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {testing ? "测试中…" : `测试${labelPrefix}连接`}
        </button>
        {kind === "image" && <span className="inline-flex items-center gap-1.5 text-[11px] text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />图片连接测试可能产生费用</span>}
        {message && <span role="status" className="text-xs text-[#526f7d]">{message}</span>}
      </div>
    </fieldset>
  );
};

const AiSettingsDialog: React.FC<AiSettingsDialogProps> = ({ onClose }) => {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [settings, setSettings] = useState<PublicAiSettings>({ text: emptyProvider, image: emptyProvider });
  const [textInput, setTextInput] = useState<ProviderSettingsInput>(() => toInput(emptyProvider));
  const [imageInput, setImageInput] = useState<ProviderSettingsInput>(() => toInput(emptyProvider));
  const [showTextKey, setShowTextKey] = useState(false);
  const [showImageKey, setShowImageKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [providerActions, setProviderActions] = useState<Record<ProviderKind, ProviderAction>>({ text: null, image: null });
  const [globalMessage, setGlobalMessage] = useState("");
  const [providerMessages, setProviderMessages] = useState<Partial<Record<ProviderKind, string>>>({});

  useEffect(() => {
    const controller = new AbortController();
    getAiSettings(controller.signal)
      .then((loaded) => {
        setSettings(loaded);
        setTextInput(toInput(loaded.text));
        setImageInput(toInput(loaded.image));
      })
      .catch((error) => {
        if (!controller.signal.aborted) setGlobalMessage(errorMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const restoreFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = overlayRef.current;
    const background = Array.from(document.body.children).filter((element) => element !== overlay);
    const previousAttributes = background.map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      hadInert: element.hasAttribute("inert"),
    }));
    for (const element of background) {
      element.setAttribute("aria-hidden", "true");
      element.setAttribute("inert", "");
    }
    initialFocusRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => !element.matches(":disabled") && !element.hasAttribute("inert"));
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      for (const { element, ariaHidden, hadInert } of previousAttributes) {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
        if (!hadInert) element.removeAttribute("inert");
      }
      restoreFocusTo?.focus();
    };
  }, []);

  const runProviderAction = async (kind: ProviderKind, action: Exclude<ProviderAction, null>, operation: () => Promise<void>) => {
    setProviderActions((current) => ({ ...current, [kind]: action }));
    setProviderMessages((current) => ({ ...current, [kind]: undefined }));
    setGlobalMessage("");
    try {
      await operation();
    } catch (error) {
      setProviderMessages((current) => ({ ...current, [kind]: errorMessage(error) }));
    } finally {
      setProviderActions((current) => ({ ...current, [kind]: null }));
    }
  };

  const handleSave = (kind: ProviderKind) => runProviderAction(kind, "save", async () => {
    const input = kind === "text" ? textInput : imageInput;
    const saved = await saveAiSettings(kind === "text" ? { text: input } : { image: input });
    setSettings((current) => ({ ...current, [kind]: saved[kind] }));
    if (kind === "text") setTextInput(toInput(saved.text));
    else setImageInput(toInput(saved.image));
    setProviderMessages((current) => ({ ...current, [kind]: `${kind === "text" ? "文本" : "图片"}设置已安全保存` }));
  });

  const handleTest = (kind: ProviderKind) => runProviderAction(kind, "test", async () => {
    const input = kind === "text" ? textInput : imageInput;
    try {
      const result = await testAiConnection(kind, input);
      setProviderMessages((current) => ({ ...current, [kind]: result.message }));
    } finally {
      if (kind === "text") setTextInput((current) => ({ ...current, apiKey: "" }));
      else setImageInput((current) => ({ ...current, apiKey: "" }));
    }
  });

  const handleClear = (kind: ProviderKind) => runProviderAction(kind, "clear", async () => {
    const cleared = await clearAiKey(kind);
    setSettings((current) => ({ ...current, [kind]: cleared[kind] }));
    if (kind === "text") setTextInput((current) => ({ ...current, apiKey: "" }));
    else setImageInput((current) => ({ ...current, apiKey: "" }));
    setProviderMessages((current) => ({ ...current, [kind]: "已清除保存的密钥" }));
  });

  const modal = (
    <div ref={overlayRef} className="fixed inset-0 z-[120] grid place-items-center bg-[#1d2730]/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[24px] border border-white/80 bg-[#f5f4ef] text-[#25333b] shadow-[0_30px_100px_rgba(23,38,49,0.3)]"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-5 border-b border-[#dce3e7] bg-[#f5f4ef]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#78909d]">CineGen AI</p>
            <h2 id={titleId} className="text-xl font-bold tracking-tight">AI 设置中心</h2>
            <p className="mt-1 text-xs text-[#71818b]">文本与图片供应商彼此独立，保存的密钥只会显示脱敏摘要。</p>
          </div>
          <button ref={initialFocusRef} type="button" onClick={onClose} aria-label="关闭设置" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#d7dfe3] bg-white text-[#61727b] transition hover:bg-[#edf3f6]">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-5 p-6">
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-xs leading-5 text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p><strong>隐私提示：</strong>第三方中转服务可能处理你提交的内容与密钥。仅使用可信服务，并阅读其隐私与数据保留政策。</p>
          </div>

          <ProviderForm
            kind="text"
            title="大语言模型"
            description="用于剧本分析、导演规划与结构化文本生成。"
            settings={settings.text}
            input={textInput}
            showKey={showTextKey}
            disabled={loading || providerActions.text !== null}
            saving={providerActions.text === "save"}
            testing={providerActions.text === "test"}
            clearing={providerActions.text === "clear"}
            message={providerMessages.text}
            onInputChange={setTextInput}
            onToggleKey={() => setShowTextKey((current) => !current)}
            onSave={() => handleSave("text")}
            onTest={() => handleTest("text")}
            onClear={() => handleClear("text")}
          />

          <ProviderForm
            kind="image"
            title="图片模型"
            description="用于角色、场景、道具与分镜画面生成。"
            settings={settings.image}
            input={imageInput}
            showKey={showImageKey}
            disabled={loading || providerActions.image !== null}
            saving={providerActions.image === "save"}
            testing={providerActions.image === "test"}
            clearing={providerActions.image === "clear"}
            message={providerMessages.image}
            onInputChange={setImageInput}
            onToggleKey={() => setShowImageKey((current) => !current)}
            onSave={() => handleSave("image")}
            onTest={() => handleTest("image")}
            onClear={() => handleClear("image")}
          />

          <fieldset aria-label="视频模型" aria-disabled="true" disabled className="rounded-2xl border border-dashed border-[#cfd9de] bg-[#eef2f3]/70 p-5 text-[#778992]">
            <legend className="sr-only">视频模型</legend>
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e2e8eb]"><Video className="h-4 w-4" /></span>
              <div><h3 className="text-sm font-semibold">视频模型</h3><p className="mt-1 text-xs">暂未配置</p></div>
            </div>
          </fieldset>

          <section aria-label="隐藏功能" className="rounded-2xl border border-[#d7e2e7] bg-white p-5">
            <h3 className="text-sm font-semibold">隐藏功能</h3>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-xl bg-[#f4f6f6] px-4 py-3">
              <div><p className="text-sm font-medium">导入式剧本</p><p className="mt-1 text-xs text-[#71818b]">当前流程暂不使用，已从项目侧栏隐藏；功能代码和已有数据仍然保留。</p></div>
              <span className="shrink-0 rounded-full bg-[#e8edef] px-3 py-1 text-xs text-[#6b7c85]">已隐藏</span>
            </div>
          </section>

          {globalMessage && <p role="status" className="rounded-xl border border-[#d7e2e7] bg-white px-4 py-3 text-sm text-[#456473]">{globalMessage}</p>}
        </div>

        <footer className="sticky bottom-0 flex items-center justify-end gap-3 border-t border-[#dce3e7] bg-[#f5f4ef]/95 px-6 py-4 backdrop-blur">
          <button type="button" onClick={onClose} className="h-10 rounded-xl border border-[#d4dde2] bg-white px-4 text-sm font-medium text-[#556872] hover:bg-[#edf3f6]">关闭</button>
        </footer>
      </section>
    </div>
  );

  return createPortal(modal, document.body);
};

export default AiSettingsDialog;
