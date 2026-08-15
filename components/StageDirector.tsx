import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clapperboard, Image as ImageIcon, Layers3, LoaderCircle, Pencil, Play, Plus, Sparkles } from "lucide-react";
import type { DirectorAsset, DirectorAudioItem, DirectorClip, DirectorShot } from "../server/types";
import { createStoryboardJob, pollAiJob, retryAiJob } from "../services/aiApiService";
import type { ProjectState, StoryboardVersion } from "../types";

interface Props { project: ProjectState; updateProject: (updates: Partial<ProjectState>) => void; initialShotId?: string; }

const StageDirector: React.FC<Props> = ({ project, updateProject, initialShotId }) => {
  const clips = useMemo(() => project.directorClips.length ? project.directorClips : legacyClips(project), [project]);
  const initialClipId = clips.find((clip) => clip.shots.some((shot) => shot.id === initialShotId))?.id;
  const [activeClipId, setActiveClipId] = useState(initialClipId || clips[0]?.id || "");
  const [editingShotId, setEditingShotId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [generation, setGeneration] = useState<{ status: "idle" | "running" | "completed" | "failed"; progress: number; error?: string }>({ status: "idle", progress: 0 });
  const [organizing, setOrganizing] = useState(false);
  const [notice, setNotice] = useState("");
  const resumedJob = useRef<string | null>(null);
  const activeClip = clips.find((clip) => clip.id === activeClipId) || clips[0];
  const totalDuration = clips.reduce((total, clip) => total + clip.shots.reduce((clipTotal, shot) => clipTotal + shot.duration, 0), 0);
  const versions = project.storyboardVersions.filter((version) => version.clipId === activeClip?.id);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId) || versions.at(-1);

  const monitorJob = async (jobId: string, clip: DirectorClip) => {
    setGeneration({ status: "running", progress: 5 });
    const complete = await pollAiJob<{ imagePath: string; metadataPath: string; version: number }>(jobId, {
      onProgress: (snapshot) => {
        setGeneration({ status: "running", progress: snapshot.progress });
        updateProject({ activeAiJobs: { ...project.activeAiJobs, [`storyboard:${clip.id}`]: { jobId, kind: "storyboard", status: snapshot.status, progress: snapshot.progress, error: snapshot.error } } });
      },
    });
    if (complete.status === "failed" || !complete.result) throw new Error(complete.error || "故事板生成失败");
    const stored: StoryboardVersion = { id: `board-${jobId}`, clipId: clip.id, version: complete.result.version, jobId, status: "completed", imagePath: complete.result.imagePath, imageUrl: `/api/jobs/${jobId}/image`, metadataPath: complete.result.metadataPath, createdAt: Date.now() };
    const { [`storyboard:${clip.id}`]: _finished, ...remainingJobs } = project.activeAiJobs;
    updateProject({ storyboardVersions: [...project.storyboardVersions, stored], activeAiJobs: remainingJobs });
    setSelectedVersionId(stored.id);
    setGeneration({ status: "completed", progress: 100 });
  };

  useEffect(() => {
    if (!activeClip) return;
    const persisted = project.activeAiJobs[`storyboard:${activeClip.id}`];
    if (!persisted || resumedJob.current === persisted.jobId) return;
    resumedJob.current = persisted.jobId;
    void monitorJob(persisted.jobId, activeClip).catch((cause) => {
      setGeneration({ status: "failed", progress: persisted.progress, error: cause instanceof Error ? cause.message : "故事板生成失败" });
    });
  }, [project.id, activeClip?.id]);

  if (!activeClip) return <div className="grid h-full place-items-center bg-[#fffaf3] text-[#86786d]">请先通过 AI 剧本分析或导入式剧本生成镜头。</div>;

  const updateShot = (shotId: string, patch: Partial<DirectorShot>) => {
    updateProject({ directorClips: clips.map((clip) => clip.id === activeClip.id ? { ...clip, shots: clip.shots.map((shot) => shot.id === shotId ? { ...shot, ...patch } : shot) } : clip) });
  };

  const updateAudio = (shot: DirectorShot, index: number, patch: Partial<DirectorAudioItem>) => {
    updateShot(shot.id, { audioItems: shot.audioItems.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) });
  };

  const addAudio = (shot: DirectorShot) => {
    updateShot(shot.id, { audioItems: [...shot.audioItems, { type: "环境音", content: "请描述音频内容。" }] });
  };

  const moveShot = (shotId: string, direction: -1 | 1) => {
    const index = activeClip.shots.findIndex((shot) => shot.id === shotId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeClip.shots.length) return;
    const shots = [...activeClip.shots];
    [shots[index], shots[target]] = [shots[target], shots[index]];
    updateProject({ directorClips: clips.map((clip) => clip.id === activeClip.id ? { ...clip, shots } : clip) });
  };

  const addShot = () => {
    const id = `shot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const sceneId = project.scriptData?.scenes[0]?.id;
    const shot: DirectorShot = {
      id,
      title: `新镜头 ${activeClip.shots.length + 1}`,
      shotSize: "中景 (MS)",
      cameraMovement: "固定镜头",
      duration: 5,
      action: "请描述画面中的行动。",
      visualPrompt: "请补充画面提示词。",
      audioItems: [],
      assets: sceneId ? [{ type: "scene", id: sceneId }] : [],
    };
    updateProject({ directorClips: clips.map((clip) => clip.id === activeClip.id ? { ...clip, shots: [...clip.shots, shot] } : clip) });
    setEditingShotId(id);
    setNotice("已添加镜头，请完善画面、时长和提示词。");
  };

  const generate = async () => {
    if (generation.status === "running") return;
    const version = Math.max(0, ...versions.map((item) => item.version)) + 1;
    setGeneration({ status: "running", progress: 5 });
    try {
      const persisted = project.activeAiJobs[`storyboard:${activeClip.id}`];
      const created = persisted?.status === "failed" ? await retryAiJob(persisted.jobId) : await createStoryboardJob({
        projectId: project.id,
        projectTitle: project.title,
        sceneName: activeClip.title || `场次 ${activeClip.id}`,
        clip: activeClip,
        assets: buildAssets(project, activeClip),
        artStyle: project.artStyle || "日漫赛璐路",
        tags: project.styleTags || [],
        aspectRatio: project.aspectRatio || "16:9",
        version,
      });
      updateProject({ activeAiJobs: { ...project.activeAiJobs, [`storyboard:${activeClip.id}`]: { jobId: created.jobId, kind: "storyboard", status: created.status, progress: 0 } } });
      await monitorJob(created.jobId, activeClip);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "故事板生成失败";
      const failedVersion: StoryboardVersion = { id: `board-failed-${Date.now()}`, clipId: activeClip.id, version, status: "failed", error: message, createdAt: Date.now() };
      updateProject({ storyboardVersions: [...project.storyboardVersions, failedVersion] });
      setGeneration({ status: "failed", progress: 0, error: message });
    }
  };

  return <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[#fffaf3] text-[#2d251f]">
    <header className="flex h-[94px] shrink-0 items-center justify-between border-b border-[#ded5c8] px-8"><div><h1 className="text-2xl font-semibold">导演工作室</h1><p className="mt-2 text-xs text-[#8b7b6e]">当前生产来源：已锁定剧本 · {activeClip.title}</p><p className="mt-1 text-xs text-[#a45118]">时长偏好：{project.targetDuration || "未设置"}（仅参考） · AI 当前估算总时长：{formatDirectorDuration(totalDuration)} · 可逐镜头编辑</p></div><button onClick={() => setOrganizing(true)} className="flex items-center gap-2 rounded-md border border-[#d9cdbc] bg-white px-4 py-2 text-sm"><Layers3 size={16}/>整理镜头</button></header>
    {generation.status !== "idle" && <div role="status" className={`border-b px-8 py-2 text-sm ${generation.status === "failed" ? "border-red-200 bg-red-50 text-red-700" : "border-[#ead8bd] bg-[#fff1d7] text-[#8a4a18]"}`}>{generation.status === "running" && <LoaderCircle className="mr-2 inline h-4 w-4 animate-spin" />}{generation.status === "running" ? `故事板生成中 ${generation.progress}%` : generation.status === "completed" ? "生成完成" : generation.error}{generation.status === "failed" && <button onClick={generate} className="ml-4 underline">重试</button>}</div>}
    <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(430px,1fr)_minmax(390px,42%)] overflow-hidden">
      <aside className="min-h-0 overflow-y-auto overscroll-contain border-r border-[#ded5c8]"><ColumnTitle title="剪辑列表" count={clips.length}/><div className="p-3">{clips.map((clip, index) => <button key={clip.id} onClick={() => { setActiveClipId(clip.id); setEditingShotId(null); }} className={`mb-2 flex w-full items-center gap-4 rounded-lg border p-4 text-left ${clip.id === activeClip.id ? "border-[#e9b58f] bg-white" : "border-transparent"}`}><span className="rounded bg-[#f4e9d7] px-2 py-1 text-sm">{index + 1}</span><span><b className="block">Clip {String(index + 1).padStart(2, "0")}</b><small className="text-[#8c7c6f]">{clip.summary}</small></span></button>)}</div></aside>
      <main className="min-h-0 min-w-0 overflow-hidden border-r border-[#ded5c8]"><ColumnTitle title="镜头列表" count={activeClip.shots.length}/><div className="h-[calc(100%-54px)] overflow-y-auto overscroll-contain p-5">{activeClip.shots.map((shot, index) => { const editing = editingShotId === shot.id; return <article key={shot.id} className="mb-5 rounded-xl border border-[#ded5c8] bg-white p-6 shadow-sm"><header className="mb-5 flex items-center gap-3"><span className="rounded bg-[#f7eddd] px-2 py-1 text-sm"># {index + 1}</span>{editing ? <><input aria-label="镜头标题" className="min-w-0 flex-1 rounded border p-2" value={shot.title} onChange={(event) => updateShot(shot.id, { title: event.target.value })}/><input aria-label="景别" className="w-28 rounded border p-2" value={shot.shotSize} onChange={(event) => updateShot(shot.id, { shotSize: event.target.value })}/></> : <><b className="min-w-0 flex-1 truncate">{shot.title}</b><b className="rounded border border-[#ded5c8] bg-[#fffaf3] px-3 py-1 text-sm">{shot.shotSize}</b></>}<button onClick={() => setEditingShotId(editing ? null : shot.id)} className="flex items-center gap-2 text-sm"><Pencil size={15}/>{editing ? "完成" : "编辑"}</button></header><div className="grid grid-cols-[1fr_82px] gap-5"><section><small className="text-[#8f8073]">画面</small>{editing ? <textarea aria-label="画面内容" className="mt-2 w-full rounded border border-[#d8cbbb] p-3" value={shot.action} onChange={(event) => updateShot(shot.id, { action: event.target.value })}/> : <p className="mt-2 leading-7">{shot.action}</p>}</section><aside><small className="text-[#8f8073]">时长</small>{editing ? <label className="mt-2 flex items-center gap-1"><input aria-label="时长（秒）" type="number" min="1" max="60" step="0.5" className="w-full rounded border border-[#ded5c8] p-2 text-center" value={shot.duration} onChange={(event) => updateShot(shot.id, { duration: Math.max(1, Number(event.target.value) || 1) })}/><span className="text-xs">秒</span></label> : <b className="mt-2 block rounded border border-[#ded5c8] p-2 text-center">{shot.duration} 秒</b>}</aside></div><div className="mt-5 border-t border-[#eee4d8] pt-4"><small className="text-[#8f8073]">运镜 / 画面提示词</small>{editing ? <><input aria-label="运镜" className="mt-2 w-full rounded border p-2" value={shot.cameraMovement} onChange={(event) => updateShot(shot.id, { cameraMovement: event.target.value })}/><textarea aria-label="画面提示词" className="mt-2 w-full rounded border p-2" value={shot.visualPrompt} onChange={(event) => updateShot(shot.id, { visualPrompt: event.target.value })}/></> : <p className="mt-2 text-sm leading-6 text-[#75685d]">{shot.cameraMovement} · {shot.visualPrompt}</p>}</div><section className="mt-5 border-t border-[#eee4d8] pt-4"><div className="flex items-center justify-between"><small className="text-[#8f8073]">音频（对白 / 旁白 / 音效 / 环境音 / 音乐）</small>{editing && <button onClick={() => addAudio(shot)} className="flex items-center gap-1 text-xs text-[#a64a0e]"><Plus size={13}/>添加音频</button>}</div>{shot.audioItems.length === 0 ? <p className="mt-2 text-sm text-[#a6988a]">无</p> : <div className="mt-2 space-y-2">{shot.audioItems.map((audio, audioIndex) => editing ? <div key={audioIndex} className="grid grid-cols-[92px_1fr] gap-2"><select aria-label={`音频类型 ${audioIndex + 1}`} className="rounded border p-2 text-sm" value={audio.type} onChange={(event) => updateAudio(shot, audioIndex, { type: event.target.value as DirectorAudioItem["type"] })}>{["对白", "旁白", "音效", "环境音", "音乐"].map((type) => <option key={type}>{type}</option>)}</select><input aria-label={`音频内容 ${audioIndex + 1}`} className="rounded border p-2 text-sm" value={audio.content} onChange={(event) => updateAudio(shot, audioIndex, { content: event.target.value })}/></div> : <p key={audioIndex} className="flex gap-2 text-sm"><b className="rounded bg-[#f7eddd] px-2 py-1 text-xs">{audio.type}</b><span className="leading-6 text-[#655449]">{audio.speaker ? `${audio.speaker}：` : ""}{audio.content}</span></p>)}</div>}</section><footer className="mt-5 flex flex-wrap gap-2">{shot.assets.map((asset) => <span key={`${asset.type}:${asset.id}`} className="rounded bg-[#eff8ef] px-2 py-1 text-xs text-[#44704d]">{assetName(project, asset.type, asset.id)}</span>)}</footer></article>})}<button onClick={addShot} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#cdbda9] bg-white/70 py-4 text-sm font-semibold text-[#76533a] hover:border-[#c4510a] hover:text-[#c4510a]"><Plus size={16}/>添加镜头</button></div></main>
      <aside className="min-h-0 min-w-0 overflow-y-auto overscroll-contain"><header className="sticky top-0 z-10 flex h-[54px] items-center justify-between border-b border-[#ded5c8] bg-[#fffaf3] px-5"><b className="flex items-center gap-2"><ImageIcon size={17}/>故事板</b><div className="flex items-center gap-2"><select aria-label="故事板版本" value={selectedVersion?.id || ""} onChange={(event) => setSelectedVersionId(event.target.value)} className="rounded border border-[#ded5c8] bg-white px-3 py-2">{versions.length === 0 && <option value="">v0</option>}{versions.map((version) => <option key={version.id} value={version.id}>v{version.version}</option>)}</select><button onClick={generate} disabled={generation.status === "running"} className="flex items-center gap-2 rounded-md bg-[#c4510a] px-4 py-2 text-sm text-white disabled:opacity-50"><Sparkles size={15}/>生成新版本</button></div></header><div className="p-5">{selectedVersion?.imageUrl ? <img src={selectedVersion.imageUrl} alt={`故事板 v${selectedVersion.version}`} className="aspect-[3/2] w-full rounded-lg border border-[#ded5c8] object-contain bg-[#f1eadf]"/> : <div className="grid aspect-[3/2] place-items-center rounded-lg border border-dashed border-[#d8cbbb] bg-[#f5eee4] text-[#b4a89c]"><div className="text-center"><ImageIcon className="mx-auto mb-2"/><p>暂无故事板</p></div></div>}{selectedVersion?.imagePath && <p className="mt-3 break-all text-xs text-[#8e8074]">已归档：{selectedVersion.imagePath}</p>}<section className="mt-6 border-t border-[#ded5c8] pt-5"><header className="flex items-center justify-between"><b className="flex items-center gap-2"><Clapperboard size={17}/>视频</b><button onClick={() => setNotice("视频 API 尚未接入；故事板和镜头数据已保留。")} className="flex items-center gap-2 rounded-md bg-[#c4510a] px-4 py-2 text-sm text-white"><Play size={15}/>生成视频</button></header><div className="mt-4 grid h-48 place-items-center rounded-lg border border-[#e2d7c8] text-[#b5aa9e]">视频 API 待接入</div></section></div></aside>
    </div>
    {notice && <div role="status" className="fixed bottom-5 right-5 z-50 rounded-md bg-[#2d251f] px-4 py-3 text-sm text-white">{notice}</div>}
    {organizing && <div role="dialog" aria-label="整理镜头" className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-6"><section className="w-full max-w-xl rounded-xl bg-[#fffaf3] p-6"><header className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">整理镜头</h2><button onClick={() => setOrganizing(false)}>完成</button></header><div className="space-y-2">{activeClip.shots.map((shot, index) => <div key={shot.id} className="flex items-center gap-3 rounded-lg border bg-white p-3"><b>{index + 1}</b><span className="min-w-0 flex-1 truncate">{shot.title}</span><button aria-label={`上移 ${shot.title}`} disabled={index === 0} onClick={() => moveShot(shot.id, -1)}>↑</button><button aria-label={`下移 ${shot.title}`} disabled={index === activeClip.shots.length - 1} onClick={() => moveShot(shot.id, 1)}>↓</button></div>)}</div></section></div>}
  </section>;
};

const ColumnTitle = ({ title, count }: { title: string; count: number }) => <header className="sticky top-0 z-10 flex h-[54px] items-center justify-between border-b border-[#ded5c8] bg-[#fffaf3] px-5"><b>{title}</b><em className="rounded bg-[#f5ecdd] px-2 py-1 text-xs not-italic">{count}</em></header>;

export function formatDirectorDuration(seconds: number): string {
  const rounded = Math.round(seconds * 10) / 10;
  if (rounded < 60) return `${rounded} 秒`;
  const minutes = Math.floor(rounded / 60);
  const remainder = Math.round((rounded - minutes * 60) * 10) / 10;
  return remainder ? `${minutes} 分 ${remainder} 秒` : `${minutes} 分钟`;
}

function buildAssets(project: ProjectState, clip: DirectorClip): DirectorAsset[] {
  const selected = new Set(clip.shots.flatMap((shot) => shot.assets.map((asset) => `${asset.type}:${asset.id}`)));
  return [
    ...(project.scriptData?.characters || []).map((item) => withReferences({ id: item.id, type: "character" as const, name: item.name, description: item.visualPrompt || item.personality, tags: item.tags, characterProfile: { height: item.height || "未设定", weight: item.weight || "未设定", skills: (item.skills || []).map(({ id, name, description, visualPrompt }) => ({ id, name, description, visualPrompt })) } }, [item.referenceImage, ...(item.skills || []).map((skill) => skill.referenceImage)])),
    ...(project.scriptData?.scenes || []).map((item) => withReference({ id: item.id, type: "scene" as const, name: item.location, description: item.visualPrompt || item.atmosphere, tags: item.tags }, item.referenceImage)),
    ...(project.scriptData?.props || []).map((item) => withReference({ id: item.id, type: "prop" as const, name: item.name, description: item.visualPrompt || item.description, tags: item.tags }, item.referenceImage)),
  ].filter((asset) => selected.has(`${asset.type}:${asset.id}`));
}

function withReference(asset: DirectorAsset, dataUrl: string | undefined): DirectorAsset {
  return withReferences(asset, [dataUrl]);
}

function withReferences(asset: DirectorAsset, dataUrls: Array<string | undefined>): DirectorAsset {
  const referenceImages = dataUrls.flatMap((dataUrl) => {
    if (!dataUrl) return [];
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
    return match ? [{ mimeType: match[1] as "image/png" | "image/jpeg" | "image/webp", data: match[2] }] : [];
  }).slice(0, 8);
  if (!referenceImages.length) return asset;
  return {
    ...asset,
    referenceImages,
  };
}

function assetName(project: ProjectState, type: string, id: string): string {
  if (type === "character") return project.scriptData?.characters.find((item) => item.id === id)?.name || id;
  if (type === "scene") return project.scriptData?.scenes.find((item) => item.id === id)?.location || id;
  return project.scriptData?.props?.find((item) => item.id === id)?.name || id;
}

function legacyClips(project: ProjectState): DirectorClip[] {
  if (!project.shots.length) return [];
  return [{ id: "legacy-clip-1", title: "场次 01", summary: project.scriptData?.logline || "已导入镜头", shots: project.shots.map((shot) => ({ id: shot.id, title: shot.actionSummary.slice(0, 20), shotSize: shot.shotSize || "中景 MS", cameraMovement: shot.cameraMovement, duration: shot.interval?.duration || 5, action: shot.actionSummary, visualPrompt: shot.keyframes[0]?.visualPrompt || shot.actionSummary, audioItems: shot.dialogue ? [{ type: "对白", content: shot.dialogue }] : [], assets: [{ type: "scene" as const, id: shot.sceneId }, ...shot.characters.map((id) => ({ type: "character" as const, id })), ...(shot.props || []).map((id) => ({ type: "prop" as const, id }))] })) }];
}

export default StageDirector;
