import React, { ChangeEvent, useEffect, useRef, useState } from "react";
import {
  Box,
  Download,
  Eye,
  Grid2X2,
  ImageUp,
  List,
  MapPin,
  Maximize2,
  Minimize2,
  MoreVertical,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  X,
} from "lucide-react";
import type { DirectorAsset, DirectorClip } from "../server/types";
import { createStoryboardJob, pollAiJob } from "../services/aiApiService";
import { localApiFetch } from "../services/localApiSession";
import { deleteFixedCharacter, getFixedCharacters, saveCharacterToFixedLibrary } from "../services/storageService";
import { Character, CharacterSkill, FixedCharacterAsset, ProjectState, PropAsset, Scene } from "../types";

type AssetKind = "character" | "scene" | "prop";
type AssetItem = Character | Scene | PropAsset;
interface PersistedAssetJob { jobId: string; kind: AssetKind; assetId: string; assetName: string; }
interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState>) => void;
  onOpenDirector?: (shotId?: string) => void;
}

const itemName = (item: AssetItem, kind: AssetKind) =>
  kind === "character"
    ? (item as Character).name
    : kind === "scene"
      ? (item as Scene).location
      : (item as PropAsset).name;

const StageAssets: React.FC<Props> = ({
  project,
  updateProject,
  onOpenDirector,
}) => {
  const data = project.scriptData;
  const [kind, setKind] = useState<AssetKind>("character");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    () => data?.characters[0]?.id || "",
  );
  const [view, setView] = useState<"grid" | "list">("list");
  const [scope, setScope] = useState<"episode" | "all">("episode");
  const [tab, setTab] = useState<"overview" | "shots">("overview");
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [generatingAssets, setGeneratingAssets] = useState<Set<string>>(() => new Set());
  const [previewOpen, setPreviewOpen] = useState(false);
  const [fixedLibraryOpen, setFixedLibraryOpen] = useState(false);
  const [fixedCharacters, setFixedCharacters] = useState<FixedCharacterAsset[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const resumedJobs = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!data) return;
    const candidates = [
      ...readPersistedAssetJobs(project.id),
      ...Object.entries(project.activeAiJobs || {}).filter(([key]) => key.startsWith("asset:")).map(([key, value]) => assetJobFromProject(key, value.jobId, data)).filter((job): job is PersistedAssetJob => Boolean(job)),
    ];
    for (const persisted of new Map(candidates.map((job) => [job.jobId, job])).values()) {
      if (resumedJobs.current.has(persisted.jobId)) continue;
      resumedJobs.current.add(persisted.jobId);
      void monitorAssetJob(persisted).catch((cause) => {
        markAssetGenerating(persisted, false);
        notify(cause instanceof Error ? cause.message : "参考图任务恢复失败");
      });
    }
  }, [project.id]);

  useEffect(() => {
    void getFixedCharacters().then(setFixedCharacters).catch(() => setFixedCharacters([]));
  }, []);

  if (!data)
    return <div className="director-empty">请先完成剧本分析或导入式剧本。</div>;

  const collection = (target: AssetKind): AssetItem[] =>
    target === "character"
      ? data.characters
      : target === "scene"
        ? data.scenes
        : data.props || [];
  const allItems = collection(kind);
  const isLinkedToEpisode = (item: AssetItem) =>
    project.shots.some((shot) =>
      kind === "character"
        ? shot.characters.includes(item.id)
        : kind === "scene"
          ? shot.sceneId === item.id
          : (shot.props || []).includes(item.id),
    );
  const scopedItems =
    scope === "episode" ? allItems.filter(isLinkedToEpisode) : allItems;
  const items = scopedItems.filter((item) =>
    itemName(item, kind).includes(query.trim()),
  );
  const selected = items.find((item) => item.id === selectedId) || items[0];
  const isCharacter = kind === "character";
  const isScene = kind === "scene";
  const name = selected ? itemName(selected, kind) : "";
  const note = !selected
    ? ""
    : isCharacter
      ? (selected as Character).personality
      : isScene
        ? (selected as Scene).atmosphere
        : (selected as PropAsset).description;
  const typeName = isCharacter ? "角色" : isScene ? "场景" : "道具";
  const linked = !selected
    ? []
    : project.shots.filter((shot) =>
        isCharacter
          ? shot.characters.includes(selected.id)
          : isScene
            ? shot.sceneId === selected.id
            : (shot.props || []).includes(selected.id),
      );
  const imageAspectRatio = selected?.imageAspectRatio || (isCharacter ? "2:3" : isScene ? "16:9" : "1:1");
  const imageResolution = selected?.imageResolution || "1K";
  const selectedGenerating = selected ? generatingAssets.has(assetTaskKey(kind, selected.id)) : false;

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 8000);
  };
  const save = (changes: Record<string, unknown>) => {
    if (!selected) return;
    const manualSources = Object.fromEntries(Object.keys(changes).map((field) => [field, "manual" as const]));
    const applyChanges = <T extends AssetItem>(item: T) => ({
      ...item,
      ...changes,
      fieldProvenance: { ...(item.fieldProvenance || {}), ...manualSources },
    });
    updateProject({
      scriptData: {
        ...data,
        characters: data.characters.map((item) =>
          kind === "character" && item.id === selected.id
            ? applyChanges(item)
            : item,
        ),
        scenes: data.scenes.map((item) =>
          kind === "scene" && item.id === selected.id
            ? applyChanges(item)
            : item,
        ),
        props: (data.props || []).map((item) =>
          kind === "prop" && item.id === selected.id
            ? applyChanges(item)
            : item,
        ),
      },
    });
  };

  const saveReferenceForAsset = (targetKind: AssetKind, assetId: string, referenceImage: string) => {
    updateProject({
      scriptData: {
        ...data,
        characters: data.characters.map((item) => targetKind === "character" && item.id === assetId ? { ...item, referenceImage } : item),
        scenes: data.scenes.map((item) => targetKind === "scene" && item.id === assetId ? { ...item, referenceImage } : item),
        props: (data.props || []).map((item) => targetKind === "prop" && item.id === assetId ? { ...item, referenceImage } : item),
      },
    });
  };

  const clearPersistedAssetJob = (job: PersistedAssetJob) => {
    removePersistedAssetJob(project.id, job.jobId);
    const key = `asset:${job.kind}:${job.assetId}`;
    const { [key]: _finished, ...remainingJobs } = project.activeAiJobs || {};
    updateProject({ activeAiJobs: remainingJobs });
  };

  const markAssetGenerating = (job: PersistedAssetJob, active: boolean) => {
    const key = assetTaskKey(job.kind, job.assetId);
    setGeneratingAssets((current) => {
      const next = new Set(current);
      active ? next.add(key) : next.delete(key);
      return next;
    });
  };

  const monitorAssetJob = async (job: PersistedAssetJob) => {
    markAssetGenerating(job, true);
    setNotice(`正在生成${job.assetName}参考图，请稍候……`);
    const complete = await pollAiJob<{ imagePath: string }>(job.jobId, {
      onProgress: (snapshot) => updateProject({
        activeAiJobs: {
          ...(project.activeAiJobs || {}),
          [`asset:${job.kind}:${job.assetId}`]: { jobId: job.jobId, kind: "storyboard", status: snapshot.status, progress: snapshot.progress, error: snapshot.error },
        },
      }),
    });
    if (complete.status === "failed") {
      clearPersistedAssetJob(job);
      throw new Error(complete.error || "参考图生成失败");
    }
    const imageResponse = await localApiFetch(`/api/jobs/${encodeURIComponent(job.jobId)}/image`);
    if (!imageResponse.ok) throw new Error("生成已完成，暂时无法读取图片；刷新页面将继续恢复");
    saveReferenceForAsset(job.kind, job.assetId, await blobToDataUrl(await imageResponse.blob()));
    clearPersistedAssetJob(job);
    notify(`${job.assetName}参考图已生成并保存。`);
    markAssetGenerating(job, false);
  };
  const setName = (value: string) =>
    save(isScene ? { location: value } : { name: value });
  const setDescription = (value: string) =>
    save(
      isCharacter
        ? { personality: value }
        : isScene
          ? { atmosphere: value }
          : { description: value },
    );
  const switchKind = (next: AssetKind) => {
    setKind(next);
    setQuery("");
    setTab("overview");
    setEditing(false);
    setSelectedId(collection(next)[0]?.id || "");
  };
  const switchScope = (next: "episode" | "all") => {
    setScope(next);
    setQuery("");
    setEditing(false);
    setSelectedId("");
  };
  const toggleEditing = () => {
    if (editing) notify(`${typeName}资料已保存，并同步到相关镜头。`);
    setEditing(!editing);
  };
  const addAsset = () => {
    const id = `${kind}_${Date.now().toString(36)}`;
    const next =
      kind === "character"
        ? {
            ...data,
            characters: [
              ...data.characters,
              {
                id,
                name: "新角色",
                gender: "未设置",
                age: "未设置",
                height: "未设定",
                weight: "未设定",
                personality: "请填写角色备注。",
                variations: [],
                skills: [],
              },
            ],
          }
        : kind === "scene"
          ? {
              ...data,
              scenes: [
                ...data.scenes,
                {
                  id,
                  location: "新场景",
                  time: "日间",
                  weather: "晴朗少云",
                  lighting: "自然日光，光向统一",
                  palette: "低饱和中性色",
                  atmosphere: "请填写场景氛围。",
                },
              ],
            }
          : {
              ...data,
              props: [
                ...(data.props || []),
                { id, name: "新道具", description: "请填写道具用途与外观。" },
              ],
            };
    updateProject({ scriptData: next });
    setSelectedId(id);
    setEditing(true);
    notify(`已添加${typeName}，请完善资料。`);
  };
  const removeAsset = () => {
    if (!selected) return;
    updateProject({
      scriptData: {
        ...data,
        characters: data.characters.filter(
          (item) => kind !== "character" || item.id !== selected.id,
        ),
        scenes: data.scenes.filter(
          (item) => kind !== "scene" || item.id !== selected.id,
        ),
        props: (data.props || []).filter(
          (item) => kind !== "prop" || item.id !== selected.id,
        ),
      },
    });
    setSelectedId(allItems.find((item) => item.id !== selected.id)?.id || "");
    setMenuOpen(false);
    notify(`${typeName}已删除。`);
  };
  const addToFixedLibrary = async () => {
    if (!selected || !isCharacter) return;
    const saved = await saveCharacterToFixedLibrary(selected as Character, project.id, project.title);
    setFixedCharacters((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
    setMenuOpen(false);
    notify(`“${saved.character.name}”已加入固定资产库，外观、技能和技能图片均已保存。`);
  };
  const importFixedCharacter = (fixed: FixedCharacterAsset) => {
    const existing = data.characters.find((item) => item.name === fixed.character.name);
    const imported = structuredClone(fixed.character);
    imported.id = existing?.id || `character_fixed_${fixed.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
    updateProject({ scriptData: { ...data, characters: existing ? data.characters.map((item) => item.id === existing.id ? imported : item) : [...data.characters, imported] } });
    setKind("character");
    setSelectedId(imported.id);
    setFixedLibraryOpen(false);
    notify(`“${imported.name}”已从固定资产库加入当前剧情。`);
  };
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) return notify("图片不能超过 50 MB。");
    const reader = new FileReader();
    reader.onload = () => {
      save({ referenceImage: String(reader.result) });
      notify("参考图已保存到当前资产。");
    };
    reader.readAsDataURL(file);
  };

  const generateReference = async () => {
    if (!selected || selectedGenerating) return;
    const pendingJob = { jobId: "pending", kind, assetId: selected.id, assetName: name };
    markAssetGenerating(pendingJob, true);
    setNotice("正在生成参考图，请稍候……");
    try {
      const asset: DirectorAsset = {
        id: selected.id,
        type: kind,
        name,
        description: selected.visualPrompt || note || `${typeName}${name}`,
        sceneContinuity: isScene ? {
          time: (selected as Scene).time || "日间",
          weather: (selected as Scene).weather || "晴朗少云",
          lighting: (selected as Scene).lighting || "自然日光，光向统一",
          palette: (selected as Scene).palette || "低饱和中性色",
        } : undefined,
        referenceImages: dataUrlToReferences(
          selected.referenceImage || allItems.find((item) => item.id !== selected.id && item.referenceImage)?.referenceImage,
        ),
      };
      const clip: DirectorClip = {
        id: `asset-${selected.id}`,
        title: `${name}参考图`,
        summary: `生成${typeName}${name}的视觉设定参考图`,
        shots: [{
          id: `asset-shot-${selected.id}`,
          title: `${name}设定图`,
          shotSize: kind === "character" ? "全身设定图" : "广角设定图",
          cameraMovement: "固定镜头",
          duration: 1,
          action: `清晰展示${typeName}${name}，便于后续镜头保持视觉一致性`,
          visualPrompt: selected.visualPrompt || note || `${name}，${project.artStyle || "日漫赛璐路"}，纯净构图，完整细节`,
          audioItems: [],
          assets: [{ type: kind, id: selected.id }],
        }],
      };
      const created = await createStoryboardJob({
        projectId: project.id,
        projectTitle: project.title,
        sceneName: `资产-${typeName}-${name}`,
        clip,
        assets: [asset],
        artStyle: project.artStyle || "日漫赛璐路",
        tags: project.styleTags || [],
        aspectRatio: imageAspectRatio,
        imageResolution,
        version: 1,
      });
      const job = { jobId: created.jobId, kind, assetId: selected.id, assetName: name };
      persistAssetJob(project.id, job);
      updateProject({ activeAiJobs: {
        ...(project.activeAiJobs || {}),
        [`asset:${kind}:${selected.id}`]: { jobId: created.jobId, kind: "storyboard", status: created.status, progress: 0 },
      } });
      await monitorAssetJob(job);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "参考图生成失败");
    } finally {
      markAssetGenerating(pendingJob, false);
    }
  };

  return (
    <section className="asset-studio">
      <header className="asset-category-bar">
        <div className="asset-kind-tabs">
          <button
            className={isCharacter ? "active" : ""}
            onClick={() => switchKind("character")}
          >
            <User size={18} />
            角色
          </button>
          <button
            className={isScene ? "active" : ""}
            onClick={() => switchKind("scene")}
          >
            <MapPin size={18} />
            场景
          </button>
          <button
            className={kind === "prop" ? "active" : ""}
            onClick={() => switchKind("prop")}
          >
            <Box size={18} />
            道具
          </button>
        </div>
        <div className="asset-style">
          艺术风格：<b>{project.artStyle || data.genre || "个人项目风格"}</b>
        </div>
      </header>
      <div className="asset-workbench">
        <aside className="asset-library">
          <div className="asset-search-row">
            <label>
              <Search size={20} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索素材..."
              />
            </label>
            <button className="asset-add" onClick={addAsset} title="新建资产">
              <Plus size={23} />
            </button>
          </div>
          <div className="asset-library-tools">
            <div>
              <button
                onClick={() => switchScope("episode")}
                className={scope === "episode" ? "selected" : ""}
              >
                本集 {allItems.filter(isLinkedToEpisode).length}
              </button>
              <button
                onClick={() => switchScope("all")}
                className={scope === "all" ? "selected" : ""}
              >
                全部 {allItems.length}
              </button>
              {isCharacter && <button onClick={() => setFixedLibraryOpen(true)}>固定库 {fixedCharacters.length}</button>}
            </div>
            <div>
              <button
                title="网格视图"
                onClick={() => setView("grid")}
                className={view === "grid" ? "selected" : ""}
              >
                <Grid2X2 size={18} />
              </button>
              <button
                title="列表视图"
                onClick={() => setView("list")}
                className={view === "list" ? "selected" : ""}
              >
                <List size={19} />
              </button>
            </div>
          </div>
          <div className={`asset-list ${view === "grid" ? "grid" : ""}`}>
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setSelectedId(item.id);
                  setEditing(false);
                  setTab("overview");
                }}
                className={`asset-item ${selected?.id === item.id ? "active" : ""}`}
              >
                <span className="asset-thumb">
                  {item.referenceImage ? (
                    <img src={item.referenceImage} alt="" />
                  ) : kind === "character" ? (
                    <User size={21} />
                  ) : kind === "scene" ? (
                    <MapPin size={21} />
                  ) : (
                    <Box size={21} />
                  )}
                </span>
                <span className="asset-name">
                  <b>{itemName(item, kind)}</b>
                  <small>
                    {item.referenceImage ? "LINKED" : "待补充参考图"}
                  </small>
                </span>
                <i />
              </button>
            ))}
          </div>
        </aside>
        <main className="asset-detail">
          {selected ? (
            <>
              <header className="asset-detail-header">
                <div className="asset-title">
                  <span>
                    {isCharacter ? (
                      <User size={27} />
                    ) : isScene ? (
                      <MapPin size={27} />
                    ) : (
                      <Box size={27} />
                    )}
                  </span>
                  <div>
                    <div className="asset-title-line">
                      {editing ? (
                        <input
                          aria-label="资产名称"
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          className="asset-inline-input"
                        />
                      ) : (
                        <h1>{name}</h1>
                      )}
                      <em>{selected.referenceImage ? "已完成" : "待补充"}</em>
                    </div>
                    <p>
                      类型：<b>{typeName}</b>
                      <span>状态：</span>
                      <strong>已关联剧集</strong>
                      <code>#{selected.id.slice(0, 8)}</code>
                    </p>
                  </div>
                </div>
                <div className="asset-actions">
                  <button onClick={toggleEditing}>
                    <Pencil size={20} />
                    {editing ? "完成编辑" : "编辑"}
                  </button>
                  <button
                    className="primary"
                    onClick={() => void generateReference()}
                    disabled={selectedGenerating}
                  >
                    <Sparkles size={19} />
                    {selectedGenerating ? "生成中…" : "重新生成"}
                  </button>
                  <div className="asset-more">
                    <button
                      className="icon"
                      aria-label="更多操作"
                      onClick={() => setMenuOpen(!menuOpen)}
                    >
                      <MoreVertical size={21} />
                    </button>
                    {menuOpen && (
                      <div className="asset-more-menu">
                        {isCharacter ? <button onClick={() => void addToFixedLibrary()}><User size={16} />加入固定资产库</button> : <button onClick={() => fileRef.current?.click()}><ImageUp size={16} />替换参考图</button>}
                        <button className="danger" onClick={removeAsset}>
                          <Trash2 size={16} />
                          删除资产
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>
              <div className="asset-detail-body">
                <div className="asset-reference">
                  <div className="asset-image-box">
                    {selected.referenceImage ? (
                      <img
                        src={selected.referenceImage}
                        alt={`${name}参考图`}
                      />
                    ) : (
                      <span>暂无参考图</span>
                    )}
                    <div className="asset-image-actions">
                      {selected.referenceImage && <button onClick={() => setPreviewOpen(true)}><Eye size={17} />查看大图</button>}
                      {selected.referenceImage && <a href={selected.referenceImage} download={`${name || "参考图"}.webp`}><Download size={17} />下载保存</a>}
                      <button onClick={() => fileRef.current?.click()}><ImageUp size={17} />上传 / 替换</button>
                      {selected.referenceImage && <button className="danger" onClick={() => {
                        if (!window.confirm(`确定删除“${name}”的当前参考图吗？`)) return;
                        save({ referenceImage: undefined });
                        notify("参考图已删除，资产文字资料仍然保留。 ");
                      }}><Trash2 size={17} />删除图片</button>}
                    </div>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      onChange={onUpload}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 rounded-md border border-[#e2d6c6] bg-[#fffaf2] p-3">
                    <label className="text-xs text-[#7b6c5e]">
                      <span className="mb-1 block">图片比例</span>
                      <select aria-label="图片比例" className="w-full rounded border border-[#d8cbbb] bg-white px-2 py-2 text-sm text-[#30251d]" value={imageAspectRatio} onChange={(event) => save({ imageAspectRatio: event.target.value })}>
                        <option value="1:1">1:1 方形</option>
                        <option value="3:2">3:2 横版</option>
                        <option value="2:3">2:3 竖版</option>
                        <option value="16:9">16:9 宽屏</option>
                        <option value="9:16">9:16 竖屏</option>
                      </select>
                    </label>
                    <label className="text-xs text-[#7b6c5e]">
                      <span className="mb-1 block">生成分辨率</span>
                      <select aria-label="生成分辨率" className="w-full rounded border border-[#d8cbbb] bg-white px-2 py-2 text-sm text-[#30251d]" value={imageResolution} onChange={(event) => save({ imageResolution: event.target.value })}>
                        <option value="1K">1K（快速 / 省费用）</option>
                        <option value="2K">2K（高清）</option>
                        <option value="4K">4K（超清 / 费用较高）</option>
                      </select>
                    </label>
                    <p className="col-span-2 !m-0 text-xs text-[#9a6a45]">当前生成规格：{imageAspectRatio} · {imageResolution} · {imagePixelDimensions(imageAspectRatio, imageResolution)}。分辨率越高，生成时间和中转站费用通常越高。</p>
                  </div>
                  <h3>
                    <Sparkles size={16} />
                    视觉参考
                  </h3>
                  {editing ? (
                    <textarea
                      aria-label="视觉参考描述"
                      value={selected.visualPrompt || ""}
                      onChange={(event) =>
                        save({ visualPrompt: event.target.value })
                      }
                      placeholder="填写外观、材质、光影和构图..."
                    />
                  ) : (
                    <div className="visual-copy">
                      {selected.visualPrompt || "尚未填写视觉参考描述。"}
                    </div>
                  )}
                  <p>
                    本地参考图会保存在当前个人项目中，并作为后续镜头提示词的视觉依据。
                  </p>
                  <p>
                    当前风格：
                    <b>{project.artStyle || data.genre || "个人项目风格"}</b>
                  </p>
                </div>
                <section className="asset-info">
                  <div className="asset-info-tabs">
                    <button
                      onClick={() => setTab("overview")}
                      className={tab === "overview" ? "active" : ""}
                    >
                      概览
                    </button>
                    <button
                      onClick={() => setTab("shots")}
                      className={tab === "shots" ? "active" : ""}
                    >
                      相关镜头 <b>{linked.length}</b>
                    </button>
                  </div>
                  {tab === "overview" ? (
                    <>
                      <div className="asset-note">
                        <h2>{typeName}备注</h2>
                        {editing ? (
                          <textarea
                            aria-label="资产备注"
                            value={note}
                            onChange={(event) =>
                              setDescription(event.target.value)
                            }
                          />
                        ) : (
                          <p>{note || "尚未填写备注。"}</p>
                        )}
                      </div>
                      <div className="asset-divider" />
                      <div className="asset-metadata">
                        <div>
                          <h3>基础信息</h3>
                          {isCharacter ? (
                            <>
                              <p>
                                <label>性别</label>
                                {editing ? (
                                  <input
                                    aria-label="性别"
                                    value={(selected as Character).gender || ""}
                                    onChange={(event) =>
                                      save({ gender: event.target.value })
                                    }
                                  />
                                ) : (
                                  <span>
                                    {(selected as Character).gender || "未设置"}
                                  </span>
                                )}
                              </p>
                              <p>
                                <label>年龄</label>
                                {editing ? (
                                  <input
                                    aria-label="年龄"
                                    value={(selected as Character).age || ""}
                                    onChange={(event) =>
                                      save({ age: event.target.value })
                                    }
                                  />
                                ) : (
                                  <span>
                                    {(selected as Character).age || "未设置"}
                                  </span>
                                )}
                              </p>
                              <p>
                                <label>身高</label>
                                {editing ? <input aria-label="身高" value={(selected as Character).height || ""} onChange={(event) => save({ height: event.target.value })} placeholder="例如：180cm" /> : <span>{(selected as Character).height || "未设定"}</span>}
                              </p>
                              <p>
                                <label>体重</label>
                                {editing ? <input aria-label="体重" value={(selected as Character).weight || ""} onChange={(event) => save({ weight: event.target.value })} placeholder="例如：75kg" /> : <span>{(selected as Character).weight || "未设定"}</span>}
                              </p>
                            </>
                          ) : isScene ? (
                            <SceneContinuityFields scene={selected as Scene} editing={editing} save={save} />
                          ) : (
                            <p>
                              <label>名称</label>
                              <span>{name}</span>
                            </p>
                          )}
                        </div>
                        <div>
                          <h3>统计数据</h3>
                          <p>
                            <label>关联镜头</label>
                            <span>{linked.length}</span>
                          </p>
                          <p>
                            <label>创建于</label>
                            <span>当前项目</span>
                          </p>
                          <p>
                            <label>风格预设</label>
                            <span className="preset">
                              {project.artStyle || data.genre || "个人项目风格"}
                            </span>
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="linked-shots">
                      {linked.length ? (
                        linked.map((shot, index) => (
                          <button
                            key={shot.id}
                            onClick={() => onOpenDirector?.(shot.id)}
                          >
                            <b>镜头 {String(index + 1).padStart(2, "0")}</b>
                            <span>{shot.actionSummary}</span>
                            <small>{shot.shotSize || "未设置景别"}</small>
                          </button>
                        ))
                      ) : (
                        <p>这个资产暂未关联镜头。</p>
                      )}
                    </div>
                  )}
                </section>
              </div>
              {isCharacter && <CharacterSkillsSection character={selected as Character} editing={editing} save={save} notify={notify} />}
            </>
          ) : (
            <div className="director-empty">
              暂无{typeName}，点击左侧加号创建。
            </div>
          )}
        </main>
      </div>
      {notice && (
        <div className="fixed bottom-16 right-6 z-[140] max-w-sm rounded-md border border-[#dfcfb9] bg-[#fff8eb] px-4 py-3 text-sm text-[#6f4c31] shadow-lg" role="status">
          {notice}
        </div>
      )}
      {previewOpen && selected?.referenceImage && (
        <div role="dialog" aria-label={`${name}参考图预览`} className="fixed inset-0 z-[150] grid place-items-center bg-black/75 p-8" onClick={() => setPreviewOpen(false)}>
          <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
            <img src={selected.referenceImage} alt={`${name}参考图大图`} className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-2xl" />
            <button aria-label="关闭大图" onClick={() => setPreviewOpen(false)} className="absolute -right-4 -top-4 rounded-full bg-white p-2 text-[#30251d] shadow-lg"><X size={20} /></button>
          </div>
        </div>
      )}
      {fixedLibraryOpen && (
        <div role="dialog" aria-label="固定资产库" className="fixed inset-0 z-[155] grid place-items-center bg-black/55 p-8" onClick={() => setFixedLibraryOpen(false)}>
          <section className="max-h-[86vh] w-full max-w-5xl overflow-auto rounded-xl bg-[#fffaf3] p-6 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <header className="mb-5 flex items-start justify-between border-b border-[#ded5c8] pb-4"><div><h2 className="text-2xl font-semibold">固定角色资产库</h2><p className="mt-1 text-sm text-[#86786c]">跨剧情保存人物外观、档案、技能和技能图片。</p></div><button aria-label="关闭固定资产库" onClick={() => setFixedLibraryOpen(false)}><X size={22} /></button></header>
            {fixedCharacters.length ? <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{fixedCharacters.map((fixed) => <article key={fixed.id} className="grid grid-cols-[120px_1fr] gap-4 rounded-lg border border-[#ded5c8] bg-white p-4"><div className="grid h-32 place-items-center overflow-hidden rounded border bg-[#eee9e1]">{fixed.character.referenceImage ? <img src={fixed.character.referenceImage} alt={`${fixed.character.name}固定资产图`} className="h-full w-full object-contain" /> : <User size={32} className="text-[#ad9e90]" />}</div><div className="min-w-0"><h3 className="text-xl font-semibold">{fixed.character.name}</h3><p className="mt-1 line-clamp-2 text-sm text-[#75685d]">{fixed.character.personality}</p><p className="mt-2 text-xs text-[#9a8b7c]">{fixed.character.height || "身高未设定"} · {fixed.character.weight || "体重未设定"} · 固定技能 {(fixed.character.skills || []).length} 个</p><p className="mt-1 text-xs text-[#9a8b7c]">来源：{fixed.sourceProjectTitle}</p><div className="mt-4 flex gap-2"><button onClick={() => importFixedCharacter(fixed)} className="rounded bg-[#c7530a] px-3 py-2 text-sm text-white">导入当前剧情</button><button onClick={() => { if (!window.confirm(`确定从固定资产库删除“${fixed.character.name}”吗？当前剧情中的人物不会受影响。`)) return; void deleteFixedCharacter(fixed.id).then(() => setFixedCharacters((current) => current.filter((item) => item.id !== fixed.id))); }} className="rounded border border-red-200 px-3 py-2 text-sm text-red-700">从固定库删除</button></div></div></article>)}</div> : <div className="py-16 text-center text-[#9a8b7c]">固定资产库还是空的。请从人物右上角菜单选择“加入固定资产库”。</div>}
          </section>
        </div>
      )}
    </section>
  );
};

const SCENE_CONTINUITY_OPTIONS = {
  time: ["清晨", "上午", "正午", "下午", "黄昏", "夜晚", "深夜"],
  weather: ["晴朗少云", "多云", "阴天", "薄雾", "小雨", "暴雨", "降雪", "沙尘"],
  lighting: ["左前方暖色斜射光", "右前方暖色斜射光", "顶部正午硬光", "阴天柔和漫射光", "冷色月光", "室内暖色人工光", "逆光剪影"],
  palette: ["冷灰废墟、低饱和青绿、暖金高光", "暖黄与土褐、低饱和", "冷蓝灰、青色阴影", "橙红夕照、深蓝阴影", "黑灰与暗红、低明度", "雪白、冷蓝与淡灰"],
} as const;

function imagePixelDimensions(aspectRatio: string, resolution: string): string {
  const dimensions: Record<string, Record<string, string>> = {
    "1:1": { "1K": "1024×1024", "2K": "2048×2048", "4K": "4096×4096" },
    "3:2": { "1K": "1536×1024", "2K": "2048×1365", "4K": "4096×2731" },
    "2:3": { "1K": "1024×1536", "2K": "1365×2048", "4K": "2731×4096" },
    "16:9": { "1K": "1536×1024", "2K": "2048×1152", "4K": "4096×2304" },
    "9:16": { "1K": "1024×1536", "2K": "1152×2048", "4K": "2304×4096" },
  };
  return dimensions[aspectRatio]?.[resolution] || "由中转站决定";
}

function SceneContinuityFields({ scene, editing, save }: { scene: Scene; editing: boolean; save: (changes: Record<string, unknown>) => void }) {
  const rows = [
    ["时间", "time", scene.time || "日间", SCENE_CONTINUITY_OPTIONS.time],
    ["天气", "weather", scene.weather || "晴朗少云", SCENE_CONTINUITY_OPTIONS.weather],
    ["光线", "lighting", scene.lighting || "自然日光，光向统一", SCENE_CONTINUITY_OPTIONS.lighting],
    ["色卡", "palette", scene.palette || "低饱和中性色", SCENE_CONTINUITY_OPTIONS.palette],
  ] as const;
  return <>{rows.map(([label, field, value, options]) => (
    <p key={field}>
      <label>{label}</label>
      {editing ? (
        <select aria-label={`场景${label}`} value={value} onChange={(event) => save({ [field]: event.target.value })}>
          {!options.includes(value as never) && <option value={value}>{value}（AI 建议）</option>}
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : <span>{value}</span>}
    </p>
  ))}</>;
}

function CharacterSkillsSection({ character, editing, save, notify }: { character: Character; editing: boolean; save: (changes: Record<string, unknown>) => void; notify: (message: string) => void }) {
  const skills = character.skills || [];
  const updateSkill = (id: string, changes: Partial<CharacterSkill>) => save({ skills: skills.map((skill) => skill.id === id ? { ...skill, ...changes } : skill) });
  const addSkill = () => save({ skills: [...skills, { id: `skill_${Date.now().toString(36)}`, name: "新技能", description: "请填写技能用途与限制。", visualPrompt: "请填写技能发动时的颜色、形态、光效和范围。" }] });
  const removeSkill = (id: string) => save({ skills: skills.filter((skill) => skill.id !== id) });
  return (
    <section className="mx-8 mb-10 mt-2 rounded-xl border border-[#ded5c8] bg-[#fffdf9] p-6">
      <header className="mb-5 flex items-center justify-between border-b border-[#e4dacd] pb-4">
        <div><h2 className="text-xl font-semibold text-[#30251d]">固定技能库</h2><p className="mt-1 text-sm text-[#86786c]">长期角色的能力设定与技能参考图会跟随角色保存。</p></div>
        {editing && <button type="button" onClick={addSkill} className="flex items-center gap-2 rounded-md bg-[#c7530a] px-4 py-2 text-sm text-white"><Plus size={17} />添加技能</button>}
      </header>
      {skills.length ? <div className="grid grid-cols-1 gap-5">{skills.map((skill) => <SkillCard key={skill.id} skill={skill} editing={editing} update={(changes) => updateSkill(skill.id, changes)} remove={() => removeSkill(skill.id)} notify={notify} />)}</div> : <div className="rounded-lg border border-dashed border-[#d8cbbb] py-10 text-center text-[#9a8b7c]">尚未设置固定技能。{editing ? "点击“添加技能”开始建立。" : "进入编辑模式后可以添加。"}</div>}
    </section>
  );
}

function SkillCard({ skill, editing, update, remove, notify }: { skill: CharacterSkill; editing: boolean; update: (changes: Partial<CharacterSkill>) => void; remove: () => void; notify: (message: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [visualPromptExpanded, setVisualPromptExpanded] = useState(false);
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) return notify("技能图片不能超过 4 MB，以便后续镜头生成可以正常引用。");
    const reader = new FileReader();
    reader.onload = () => { update({ referenceImage: String(reader.result) }); notify(`${skill.name}技能图片已保存。`); };
    reader.readAsDataURL(file);
  };
  return <article className="grid min-h-[360px] grid-cols-[220px_minmax(0,1fr)] gap-5 rounded-lg border border-[#e2d6c6] bg-[#fffaf2] p-4">
    <div>
      <div className="grid h-[170px] place-items-center overflow-hidden rounded-md border border-[#d8cbbb] bg-[#eee9e1]">
        {skill.referenceImage ? <img src={skill.referenceImage} alt={`${skill.name}技能图`} className="h-full w-full object-contain" /> : <Sparkles size={34} className="text-[#b7a99b]" />}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {skill.referenceImage && <button type="button" onClick={() => setPreviewOpen(true)} className="flex items-center justify-center gap-1 rounded border border-[#c9b9a7] bg-white px-1 py-2 text-xs !text-[#30251d]"><Eye size={15} />查看大图</button>}
        {skill.referenceImage && <a href={skill.referenceImage} download={`${skill.name || "技能"}-参考图.${skillImageExtension(skill.referenceImage)}`} className="flex items-center justify-center gap-1 rounded border border-[#c9b9a7] bg-white px-1 py-2 text-xs text-[#30251d]"><Download size={15} />下载保存</a>}
        {editing && <button type="button" onClick={() => inputRef.current?.click()} className={`flex items-center justify-center gap-1 rounded border border-[#c9b9a7] bg-white px-1 py-2 text-xs !text-[#30251d] ${skill.referenceImage ? "" : "col-span-2"}`}><ImageUp size={15} />{skill.referenceImage ? "上传 / 替换" : "上传技能图"}</button>}
        {editing && skill.referenceImage && <button type="button" onClick={() => { if (!window.confirm(`确定删除“${skill.name}”的技能图片吗？技能文字资料会保留。`)) return; update({ referenceImage: undefined }); notify("技能图片已删除，技能文字资料仍然保留。"); }} className="flex items-center justify-center gap-1 rounded border border-red-200 bg-white px-1 py-2 text-xs !text-red-700"><Trash2 size={15} />删除图片</button>}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={upload} />
    </div>
    <div className="min-w-0 space-y-3">
      {editing ? <input aria-label={`技能名称-${skill.id}`} value={skill.name} onChange={(event) => update({ name: event.target.value })} className="w-full rounded border border-[#d8cbbb] bg-white px-3 py-2 text-lg font-semibold" /> : <h3 className="text-lg font-semibold">{skill.name}</h3>}
      <div className="text-xs text-[#86786c]">
        <div className="flex items-center justify-between"><span>技能视觉参考</span><button type="button" aria-label={`${visualPromptExpanded ? "缩回" : "放大"}${skill.name}技能视觉参考`} aria-expanded={visualPromptExpanded} onClick={() => setVisualPromptExpanded((current) => !current)} className="flex items-center gap-1 rounded border border-[#d8cbbb] bg-white px-2 py-1 text-xs !text-[#6f4c31]">{visualPromptExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{visualPromptExpanded ? "缩回" : "放大"}</button></div>
        {editing ? <textarea aria-label={`技能视觉参考-${skill.id}`} value={skill.visualPrompt} onChange={(event) => update({ visualPrompt: event.target.value })} className={`mt-1 w-full resize-none overflow-y-auto rounded border border-[#d8cbbb] bg-white p-3 text-sm leading-6 text-[#30251d] transition-[height] ${visualPromptExpanded ? "h-72" : "h-32"}`} /> : <p className={`mt-1 overflow-y-auto whitespace-pre-wrap rounded border border-[#eadfd2] bg-white/70 p-3 text-sm leading-6 text-[#6f4c31] ${visualPromptExpanded ? "max-h-72 min-h-48" : "max-h-32 min-h-24"}`}>{skill.visualPrompt || "尚未填写技能视觉参考。"}</p>}
      </div>
    </div>
    <label className="col-span-2 block text-xs text-[#86786c]">技能说明（效果、机制、限制与冷却）{editing ? <textarea aria-label={`技能说明-${skill.id}`} value={skill.description} onChange={(event) => update({ description: event.target.value })} className="mt-1 min-h-32 w-full resize-y rounded border border-[#d8cbbb] bg-white p-3 text-sm leading-6 text-[#30251d]" /> : <p className="mt-1 min-h-24 whitespace-pre-wrap rounded border border-[#eadfd2] bg-white/70 p-3 text-sm leading-6 text-[#30251d]">{skill.description}</p>}</label>
    {editing && <button type="button" onClick={remove} className="col-span-2 flex items-center gap-1 justify-self-start text-sm text-red-700"><Trash2 size={15} />删除技能</button>}
    {previewOpen && skill.referenceImage && <div role="dialog" aria-label={`${skill.name}技能图预览`} className="fixed inset-0 z-[160] grid place-items-center bg-black/75 p-8" onClick={() => setPreviewOpen(false)}><div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}><img src={skill.referenceImage} alt={`${skill.name}技能图大图`} className="max-h-[88vh] max-w-[88vw] rounded-lg object-contain shadow-2xl" /><button type="button" aria-label="关闭技能图" onClick={() => setPreviewOpen(false)} className="absolute -right-4 -top-4 rounded-full bg-white p-2 text-[#30251d] shadow-lg"><X size={20} /></button></div></div>}
  </article>;
}

function skillImageExtension(dataUrl: string): string {
  if (dataUrl.startsWith("data:image/jpeg")) return "jpg";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  return "png";
}

export default StageAssets;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取生成的图片"));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToReferences(dataUrl?: string): DirectorAsset["referenceImages"] {
  if (!dataUrl) return undefined;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) return undefined;
  return [{ mimeType: match[1] as "image/png" | "image/jpeg" | "image/webp", data: match[2] }];
}

function assetJobStorageKey(projectId: string): string {
  return `cinegen_asset_job:${projectId}`;
}

function assetTaskKey(kind: AssetKind, assetId: string): string {
  return `${kind}:${assetId}`;
}

function readPersistedAssetJobs(projectId: string): PersistedAssetJob[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(assetJobStorageKey(projectId)) || "[]") as unknown;
    const values = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    return values.filter((value): value is PersistedAssetJob => {
      const item = value as Partial<PersistedAssetJob>;
      return typeof item.jobId === "string" && (item.kind === "character" || item.kind === "scene" || item.kind === "prop") && typeof item.assetId === "string" && typeof item.assetName === "string";
    });
  } catch {
    return [];
  }
}

function persistAssetJob(projectId: string, job: PersistedAssetJob): void {
  const jobs = readPersistedAssetJobs(projectId).filter((item) => item.jobId !== job.jobId);
  localStorage.setItem(assetJobStorageKey(projectId), JSON.stringify([...jobs, job]));
}

function removePersistedAssetJob(projectId: string, jobId: string): void {
  const jobs = readPersistedAssetJobs(projectId).filter((item) => item.jobId !== jobId);
  if (jobs.length) localStorage.setItem(assetJobStorageKey(projectId), JSON.stringify(jobs));
  else localStorage.removeItem(assetJobStorageKey(projectId));
}

function assetJobFromProject(key: string, jobId: string, data: NonNullable<ProjectState["scriptData"]>): PersistedAssetJob | null {
  const match = /^asset:(character|scene|prop):(.+)$/.exec(key);
  if (!match) return null;
  const kind = match[1] as AssetKind;
  const assetId = match[2];
  const asset = kind === "character"
    ? data.characters.find((item) => item.id === assetId)
    : kind === "scene"
      ? data.scenes.find((item) => item.id === assetId)
      : (data.props || []).find((item) => item.id === assetId);
  return asset ? { jobId, kind, assetId, assetName: itemName(asset, kind) } : null;
}
