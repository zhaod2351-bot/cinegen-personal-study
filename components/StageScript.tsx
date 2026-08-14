import React, { useEffect, useState } from "react";
import { AlertCircle, BookOpen, CheckCircle2, LoaderCircle, Lock, Sparkles, X } from "lucide-react";
import type { DirectorPlan } from "../server/types";
import { createDirectorPlanJob, pollAiJob } from "../services/aiApiService";
import type { Character, ProjectState, PropAsset, Scene, ScriptData, Shot } from "../types";

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState>) => void;
}

type View = "source" | "breakdown";

const StageScript: React.FC<Props> = ({ project, updateProject }) => {
  const [view, setView] = useState<View>(project.scriptData ? "breakdown" : "source");
  const [script, setScript] = useState(project.rawScript);
  const [preview, setPreview] = useState<DirectorPlan | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "failed">("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => setScript(project.rawScript), [project.id, project.rawScript]);

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
      const created = await createDirectorPlanJob({
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
      const complete = await pollAiJob<DirectorPlan>(created.jobId);
      setProgress(complete.progress);
      if (complete.status === "failed" || !complete.result) throw new Error(complete.error || "AI 没有返回可用的剧本方案");
      setPreview(complete.result);
      setStatus("idle");
      updateProject({ isParsingScript: false });
    } catch (cause) {
      setStatus("failed");
      setError(cause instanceof Error ? cause.message : "AI 剧本分析失败");
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
      activeAiJobs: {},
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
        <button onClick={analyze} disabled={status === "running"} className="flex items-center gap-2 rounded-md bg-[#c4510a] px-5 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60">
          {status === "running" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          AI 剧本分析
        </button>
      </header>

      {status === "running" && (
        <div className="border-b border-[#e6d5bd] bg-[#fff1d7] px-8 py-3 text-sm text-[#8a4a18]">
          <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />正在规划镜头 <span className="ml-2 text-xs">{progress}%</span>
        </div>
      )}
      {error && (
        <div className="mx-8 mt-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4" />{error}
          {status === "failed" && <button onClick={analyze} className="ml-auto underline">重试</button>}
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
          <main className="min-w-0 flex-1 overflow-auto p-10">
            <div className="mx-auto flex h-full max-w-[1050px] flex-col rounded-xl border border-[#ded5c8] bg-white p-10 shadow-sm">
              <div className="mb-5 flex items-center justify-between border-b border-[#e8dfd2] pb-5">
                <h1 className="text-2xl font-semibold">剧本</h1>
                <span className="text-xs text-[#9b8c7e]">{script.length} 字</span>
              </div>
              <textarea aria-label="剧本内容" value={script} onChange={(event) => setScript(event.target.value)} className="min-h-[420px] flex-1 resize-none bg-transparent font-serif text-[17px] leading-9 outline-none" placeholder="请输入 1-1 剧本…" />
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
    const old = oldCharacters.find((item) => item.id === asset.id || item.name === asset.name);
    return { id: asset.id, name: asset.name, gender: old?.gender || "未知", age: old?.age || "未知", personality: asset.description, visualPrompt: asset.description, referenceImage: old?.referenceImage, tags: asset.tags || old?.tags, variations: old?.variations || [] };
  });
  const scenes: Scene[] = plan.assets.filter((asset) => asset.type === "scene").map((asset) => {
    const old = oldScenes.find((item) => item.id === asset.id || item.location === asset.name);
    return { id: asset.id, location: asset.name, time: old?.time || "未知", atmosphere: asset.description, visualPrompt: asset.description, referenceImage: old?.referenceImage, tags: asset.tags || old?.tags };
  });
  const props: PropAsset[] = plan.assets.filter((asset) => asset.type === "prop").map((asset) => {
    const old = oldProps.find((item) => item.id === asset.id || item.name === asset.name);
    return { id: asset.id, name: asset.name, description: asset.description, visualPrompt: asset.description, referenceImage: old?.referenceImage, tags: asset.tags || old?.tags };
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

export default StageScript;
