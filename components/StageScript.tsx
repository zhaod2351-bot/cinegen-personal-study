import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, LoaderCircle, Lock, Sparkles, X } from "lucide-react";
import type { DirectorPlan } from "../server/types";
import { createDirectorPlanJob, pollAiJob, retryAiJob } from "../services/aiApiService";
import { getAiSettings, saveAiSettings, type PublicProviderSettings } from "../services/aiSettingsService";
import type { Character, ProjectState, PropAsset, Scene, ScriptData, Shot } from "../types";

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState>) => void;
  onOpenAssets?: () => void;
}

type View = "source" | "breakdown";

const textModelChoices = [
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol（高质量）" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra（平衡）" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna（快速）" },
  { value: "gpt-5.5", label: "GPT-5.5" },
];

const relayChoices = [
  { value: "xingkong-wuqiong", label: "星空无穷科技" },
];

const StageScript: React.FC<Props> = ({ project, updateProject, onOpenAssets }) => {
  const [view, setView] = useState<View>(project.scriptData ? "breakdown" : "source");
  const [script, setScript] = useState(project.rawScript);
  const [preview, setPreview] = useState<DirectorPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [textProvider, setTextProvider] = useState<PublicProviderSettings | null>(null);
  const [modelNotice, setModelNotice] = useState("");
  const [savingModel, setSavingModel] = useState(false);
  const resumedJob = useRef<string | null>(null);

  useEffect(() => setScript(project.rawScript), [project.id, project.rawScript]);

  useEffect(() => {
    const controller = new AbortController();
    getAiSettings(controller.signal).then((settings) => setTextProvider(settings.text)).catch(() => undefined);
    return () => controller.abort();
  }, []);

  const selectTextModel = async (model: string) => {
    if (!textProvider || model === textProvider.model) return;
    setSavingModel(true);
    setModelNotice("正在保存模型……");
    try {
      const settings = await saveAiSettings({ text: { baseUrl: textProvider.baseUrl, model } });
      setTextProvider(settings.text);
      setModelNotice(`已选择 ${model}`);
    } catch (cause) {
      setModelNotice(cause instanceof Error ? cause.message : "模型保存失败");
    } finally {
      setSavingModel(false);
    }
  };

  const monitorJob = async (jobId: string) => {
    setStatus("running");
    const complete = await pollAiJob<DirectorPlan>(jobId, {
      onProgress: (snapshot) => {
        setProgress(snapshot.progress);
        updateProject({ activeAiJobs: { ...project.activeAiJobs, directorPlan: { jobId, kind: "director-plan", status: snapshot.status, progress: snapshot.progress, error: snapshot.error } } });
      },
    });
    setProgress(complete.progress);
    if (complete.status === "failed" || !complete.result) throw new Error(complete.error || "AI 没有返回可用的剧本方案");
    setPreview(complete.result);
    setStatus("idle");
    const { directorPlan: _finished, ...remainingJobs } = project.activeAiJobs;
    updateProject({ isParsingScript: false, activeAiJobs: remainingJobs });
  };

  useEffect(() => {
    const persisted = project.activeAiJobs.directorPlan;
    if (!persisted || resumedJob.current === persisted.jobId) return;
    resumedJob.current = persisted.jobId;
    void monitorJob(persisted.jobId).catch((cause) => {
      setStatus("failed");
      setError(readableAnalysisError(cause));
      updateProject({ isParsingScript: false });
    });
  }, [project.id]);

  const analyze = async () => {
    if (!script.trim()) {
      setError("请先输入剧本内容。");
      return;
    }
    setStatus("running");
    setError("");
    setProgress(5);
    updateProject({ rawScript: script, isParsingScript: true });
    try {
      const persisted = project.activeAiJobs.directorPlan;
      const created = persisted?.status === "failed" ? await retryAiJob(persisted.jobId) : await createDirectorPlanJob({
        lockedScript: script,
        artStyle: project.artStyle || "日漫赛璐路",
        tags: project.styleTags || [],
        aspectRatio: project.aspectRatio || "16:9",
        language: project.language || "简体中文",
        targetDuration: project.targetDuration || "60s",
      });
      updateProject({
        activeAiJobs: {
          ...project.activeAiJobs,
          directorPlan: { jobId: created.jobId, kind: "director-plan", status: created.status, progress: 0 },
        },
      });
      await monitorJob(created.jobId);
    } catch (cause) {
      setStatus("failed");
      setError(readableAnalysisError(cause));
      updateProject({ isParsingScript: false });
    }
  };

  const applyPlan = () => {
    if (!preview) return;
    const converted = convertDirectorPlan(project, preview);
    updateProject({
      ...converted,
      rawScript: preview.polishedScript,
      directorClips: preview.clips,
      isParsingScript: false,
      activeAiJobs: project.activeAiJobs,
    });
    setScript(preview.polishedScript);
    setPreview(null);
    setView("breakdown");
  };

  return (
    <div className="flex h-full flex-col bg-[#fffaf3] text-[#2c241f]">
      <header className="flex h-[76px] shrink-0 items-center justify-between border-b border-[#ded5c8] px-8">
        <div className="flex items-center gap-2 rounded-lg border border-[#ded5c8] bg-[#f7f0e5] p-1">
          <button onClick={() => setView("source")} className={`rounded-md px-6 py-3 text-sm ${view === "source" ? "bg-white shadow-sm" : "text-[#75685d]"}`}>
            <BookOpen className="mr-2 inline h-4 w-4" />原文
          </button>
          <button onClick={() => setView("breakdown")} disabled={!project.scriptData} className={`rounded-md px-6 py-3 text-sm ${view === "breakdown" ? "bg-white shadow-sm" : "text-[#75685d] disabled:opacity-40"}`}>
            镜头剧本
          </button>
        </div>
        <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-[#75685d]"><span>中转站</span><select aria-label="剧本分析中转站" value="xingkong-wuqiong" disabled={status === "running"} className="h-11 rounded-md border border-[#d8cbbb] bg-white px-3 text-sm text-[#3d3129] disabled:opacity-60">{relayChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="flex items-center gap-2 text-xs text-[#75685d]"><span>文本模型</span><select aria-label="剧本分析模型" value={textProvider?.model || ""} disabled={!textProvider || savingModel || status === "running"} onChange={(event) => void selectTextModel(event.target.value)} className="h-11 rounded-md border border-[#d8cbbb] bg-white px-3 text-sm text-[#3d3129] disabled:opacity-50">{!textProvider && <option value="">读取中……</option>}{textProvider && !textModelChoices.some((item) => item.value === textProvider.model) && <option value={textProvider.model}>{textProvider.model}（自定义）</option>}{textModelChoices.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>{project.scriptData && <button onClick={onOpenAssets} className="rounded-md border border-[#d8cbbb] bg-white px-5 py-3 text-sm font-semibold">进入工作台</button>}<button onClick={analyze} disabled={status === "running" || savingModel} className="flex items-center gap-2 rounded-md bg-[#c4510a] px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
          {status === "running" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI 剧本分析
        </button></div>
      </header>

      {modelNotice && <div role="status" className="border-b border-[#e6d5bd] bg-[#fff8eb] px-8 py-2 text-xs text-[#7d5a3d]">{modelNotice}</div>}

      {status === "running" && (
        <div className="border-b border-[#e6d5bd] bg-[#fff1d7] px-8 py-3 text-sm text-[#8a4a18]">
          <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />正在规划镜头 <span className="ml-2 text-xs">{progress}%</span>
        </div>
      )}
      {error && (
        <div role="alert" className="mx-8 mt-4 flex max-h-24 shrink-0 items-start gap-2 overflow-auto rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 break-words">{error}</span>
          {status === "failed" && <button onClick={analyze} className="shrink-0 underline">重试</button>}
          <button aria-label="关闭错误提示" onClick={() => setError("")} className="shrink-0 rounded p-0.5 hover:bg-red-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {view === "source" ? (
        <div className="flex min-h-0 flex-1">
          <aside className="w-[310px] shrink-0 border-r border-[#ded5c8] p-7">
            <h2 className="mb-6 text-lg font-semibold">项目配置</h2>
            <Info label="作品名称" value={project.title} />
            <Info label="艺术风格" value={project.artStyle || "未设置"} />
            <Info label="作品标签" value={(project.styleTags || []).join("、") || "未设置"} />
            <Info label="画幅 / 时长" value={`${project.aspectRatio || "16:9"} · ${project.targetDuration || "60s"}`} />
            <div className="mt-8 rounded-lg border border-[#e3d6c5] bg-white p-4 text-xs leading-6 text-[#837467]">
              <Lock className="mb-2 h-4 w-4 text-[#c4510a]" />
              AI 将先润色剧本，再输出人物、场景、道具、剪辑和镜头。确认后作为资产库与导演台的数据源。
            </div>
          </aside>
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden p-10">
            <div className="mx-auto flex h-full min-h-0 max-w-[1050px] flex-col overflow-hidden rounded-xl border border-[#ded5c8] bg-white p-10 shadow-sm">
              <div className="mb-5 flex items-center justify-between border-b border-[#e8dfd2] pb-5">
                <h1 className="text-2xl font-semibold">剧本</h1>
                <span className="text-xs text-[#9b8c7e]">{script.length} 字</span>
              </div>
              <textarea aria-label="剧本内容" value={script} onChange={(event) => setScript(event.target.value)} className="min-h-0 flex-1 resize-none overflow-y-auto bg-transparent pb-12 font-serif text-[17px] leading-9 outline-none" placeholder="请输入 1-1 剧本…" />
            </div>
          </main>
        </div>
      ) : (
        <Breakdown project={project} />
      )}

      {preview && (
        <div role="dialog" aria-label="AI 剧本分析预览" className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-6">
          <div className="max-h-[88vh] w-full max-w-4xl overflow-auto rounded-xl bg-[#fffaf3] p-8 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <div><h2 className="text-2xl font-semibold">AI 剧本分析预览</h2><p className="mt-2 text-sm text-[#817366]">{preview.summary}</p></div>
              <button aria-label="关闭" onClick={() => setPreview(null)}><X /></button>
            </div>
            <p className="max-h-40 overflow-auto rounded-lg border border-[#e1d5c6] bg-white p-4 text-sm leading-7">{preview.polishedScript}</p>
            <div className="mt-5 grid grid-cols-3 gap-4">
              {(["character", "scene", "prop"] as const).map((type) => (
                <section key={type} className="rounded-lg bg-[#f5eadb] p-4"><b>{type === "character" ? "人物" : type === "scene" ? "场景" : "道具"}</b><ul className="mt-3 space-y-2 text-sm">{preview.assets.filter((item) => item.type === type).map((item) => <li key={`${type}:${item.id}`} className="rounded bg-white p-2">{item.name}</li>)}</ul></section>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setPreview(null)} className="rounded-md border border-[#d8cbbb] bg-white px-5 py-3">返回修改</button>
              <button onClick={applyPlan} className="flex items-center gap-2 rounded-md bg-[#c4510a] px-5 py-3 font-semibold text-white"><CheckCircle2 className="h-4 w-4" />确认并锁定剧本</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Info = ({ label, value }: { label: string; value: string }) => <div className="mb-5"><div className="mb-1 text-xs text-[#9b8c7e]">{label}</div><div className="text-sm">{value}</div></div>;

const Breakdown = ({ project }: { project: ProjectState }) => (
  <div className="flex min-h-0 flex-1">
    <aside className="w-[300px] shrink-0 overflow-auto border-r border-[#ded5c8] p-7">
      <h3 className="mb-3 font-semibold">故事概要</h3><p className="text-sm leading-7 text-[#74675d]">{project.scriptData?.logline}</p>
      <h3 className="mb-3 mt-8 font-semibold">演员表</h3>{project.scriptData?.characters.map((item) => <div className="mb-2 flex justify-between text-sm" key={item.id}><span>{item.name}</span><span className="text-[#9b8c7e]">{item.gender}</span></div>)}
      <h3 className="mb-3 mt-8 font-semibold">场景列表</h3>{project.scriptData?.scenes.map((item) => <div className="mb-2 text-sm" key={item.id}>• {item.location}</div>)}
    </aside>
    <main className="min-w-0 flex-1 overflow-auto">
      {project.shots.map((shot, index) => <article key={shot.id} className="grid grid-cols-[150px_1fr_260px] gap-7 border-b border-[#ded5c8] p-8"><div className="text-sm">镜头 {(index + 1).toString().padStart(3, "0")}<div className="mt-4 rounded border border-[#ded5c8] bg-[#f7f0e5] p-2 text-center text-xs">{shot.shotSize}</div><div className="mt-2 rounded border border-[#ded5c8] bg-[#f7f0e5] p-2 text-center text-xs">{shot.cameraMovement}</div></div><div><p className="leading-8">{shot.actionSummary}</p>{shot.dialogue && <p className="mt-4 border-l-2 border-[#d8cbbb] pl-4 font-serif italic">“{shot.dialogue}”</p>}</div><div className="border-l border-[#ded5c8] pl-6"><b className="text-sm">画面提示词</b><p className="mt-3 rounded bg-[#eee8df] p-3 text-xs leading-6 text-[#86786c]">{shot.keyframes[0]?.visualPrompt}</p></div></article>)}
    </main>
  </div>
);

export function convertDirectorPlan(project: ProjectState, plan: DirectorPlan): Pick<ProjectState, "scriptData" | "shots" | "title"> {
  const oldCharacters = project.scriptData?.characters || [];
  const oldScenes = project.scriptData?.scenes || [];
  const oldProps = project.scriptData?.props || [];
  const characters: Character[] = plan.assets.filter((asset) => asset.type === "character").map((asset) => {
    const old = findExistingAsset(oldCharacters, asset.name, (item) => item.name);
    return { id: asset.id, name: old?.name || asset.name, gender: old?.gender || "未知", age: old?.age || "未知", personality: aiField(old, "personality", asset.description), visualPrompt: aiField(old, "visualPrompt", asset.description), referenceImage: old?.referenceImage, tags: aiField(old, "tags", asset.tags || []), variations: old?.variations || [], fieldProvenance: provenance(old, ["personality", "visualPrompt", "tags"]) };
  });
  const scenes: Scene[] = plan.assets.filter((asset) => asset.type === "scene").map((asset) => {
    const old = findExistingAsset(oldScenes, asset.name, (item) => item.location, asset.id, (item) => item.id);
    return { id: asset.id, location: old?.location || asset.name, time: aiField(old, "time", asset.sceneContinuity?.time || "日间"), weather: aiField(old, "weather", asset.sceneContinuity?.weather || "晴朗少云"), lighting: aiField(old, "lighting", asset.sceneContinuity?.lighting || "自然日光，光向统一"), palette: aiField(old, "palette", asset.sceneContinuity?.palette || "低饱和中性色"), atmosphere: aiField(old, "atmosphere", asset.description), visualPrompt: aiField(old, "visualPrompt", asset.description), referenceImage: old?.referenceImage, tags: aiField(old, "tags", asset.tags || []), fieldProvenance: provenance(old, ["time", "weather", "lighting", "palette", "atmosphere", "visualPrompt", "tags"]) };
  });
  const props: PropAsset[] = plan.assets.filter((asset) => asset.type === "prop").map((asset) => {
    const old = findExistingAsset(oldProps, asset.name, (item) => item.name, asset.id, (item) => item.id);
    return { id: asset.id, name: old?.name || asset.name, description: aiField(old, "description", asset.description), visualPrompt: aiField(old, "visualPrompt", asset.description), referenceImage: old?.referenceImage, tags: aiField(old, "tags", asset.tags || []), fieldProvenance: provenance(old, ["description", "visualPrompt", "tags"]) };
  });
  const shots: Shot[] = plan.clips.flatMap((clip) => clip.shots.map((shot) => ({
    id: shot.id,
    sceneId: shot.assets.find((asset) => asset.type === "scene")?.id || scenes[0]?.id || "scene-default",
    actionSummary: shot.action,
    dialogue: shot.audioItems.find((audio) => audio.type === "对白")?.content,
    cameraMovement: shot.cameraMovement,
    shotSize: shot.shotSize,
    characters: shot.assets.filter((asset) => asset.type === "character").map((asset) => asset.id),
    props: shot.assets.filter((asset) => asset.type === "prop").map((asset) => asset.id),
    keyframes: [{ id: `${shot.id}-start`, type: "start" as const, visualPrompt: shot.visualPrompt, status: "pending" as const }],
  })));
  const scriptData: ScriptData = { title: project.title, genre: [project.artStyle, ...(project.styleTags || [])].filter(Boolean).join(" · "), logline: plan.summary, targetDuration: project.targetDuration, language: project.language, characters, scenes, props, storyParagraphs: plan.clips.map((clip, index) => ({ id: index + 1, text: clip.summary, sceneRefId: clip.shots[0]?.assets.find((asset) => asset.type === "scene")?.id || scenes[0]?.id || "" })) };
  return { scriptData, shots, title: project.title };
}

function aiField<T extends object, K extends keyof T>(old: T | undefined, key: K, generated: T[K]): T[K] {
  if (!old) return generated;
  const source = (old as T & { fieldProvenance?: Record<string, string> }).fieldProvenance?.[String(key)];
  return source === "ai" ? generated : old[key];
}

function provenance<T extends { fieldProvenance?: Record<string, "manual" | "ai" | "legacy"> }>(old: T | undefined, fields: string[]) {
  return Object.fromEntries(fields.map((field) => [field, old ? old.fieldProvenance?.[field] || "legacy" : "ai"]));
}

function findExistingAsset<T>(items: T[], generatedName: string, getName: (item: T) => string, generatedId?: string, getId?: (item: T) => string): T | undefined {
  const target = normalizeAssetName(generatedName);
  return items.find((item) => normalizeAssetName(getName(item)) === target)
    || (generatedId && getId ? items.find((item) => getId(item) === generatedId) : undefined);
}

function normalizeAssetName(value: string): string {
  return value.normalize("NFKC").replace(/[\s·•・,，。.!！?？:：;；'"“”‘’()（）【】\[\]]/g, "").toLocaleLowerCase();
}

function readableAnalysisError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause || "");
  if (/invalid_type|expected string|expected array|Zod/i.test(message)) {
    return "AI 返回的剧本结构不兼容。请更换模型，或关闭此提示后修改剧本。";
  }
  return message || "AI 剧本分析失败";
}

export default StageScript;
