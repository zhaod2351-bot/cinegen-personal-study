import React, { ChangeEvent, useRef, useState } from "react";
import {
  Box,
  Download,
  Eye,
  Grid2X2,
  ImageUp,
  List,
  MapPin,
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
import { Character, ProjectState, PropAsset, Scene } from "../types";

type AssetKind = "character" | "scene" | "prop";
type AssetItem = Character | Scene | PropAsset;
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
  const [generating, setGenerating] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
  const tags = selected?.tags || [];

  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const save = (changes: Record<string, unknown>) => {
    if (!selected) return;
    updateProject({
      scriptData: {
        ...data,
        characters: data.characters.map((item) =>
          kind === "character" && item.id === selected.id
            ? { ...item, ...changes }
            : item,
        ),
        scenes: data.scenes.map((item) =>
          kind === "scene" && item.id === selected.id
            ? { ...item, ...changes }
            : item,
        ),
        props: (data.props || []).map((item) =>
          kind === "prop" && item.id === selected.id
            ? { ...item, ...changes }
            : item,
        ),
      },
    });
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
                personality: "请填写角色备注。",
                variations: [],
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
                  time: "未设置",
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
    if (!selected || generating) return;
    setGenerating(true);
    setNotice("正在生成参考图，请稍候……");
    try {
      const asset: DirectorAsset = {
        id: selected.id,
        type: kind,
        name,
        description: selected.visualPrompt || note || `${typeName}${name}`,
        tags,
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
        aspectRatio: project.aspectRatio || "16:9",
        version: 1,
      });
      const complete = await pollAiJob<{ imagePath: string }>(created.jobId);
      if (complete.status === "failed") throw new Error(complete.error || "参考图生成失败");
      const imageResponse = await localApiFetch(`/api/jobs/${encodeURIComponent(created.jobId)}/image`);
      if (!imageResponse.ok) throw new Error("生成成功，但读取参考图失败");
      save({ referenceImage: await blobToDataUrl(await imageResponse.blob()) });
      notify(`${name}参考图已生成并保存。`);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "参考图生成失败");
    } finally {
      setGenerating(false);
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
                本集（{allItems.filter(isLinkedToEpisode).length}）
              </button>
              <button
                onClick={() => switchScope("all")}
                className={scope === "all" ? "selected" : ""}
              >
                全部（{allItems.length}）
              </button>
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
                    disabled={generating}
                  >
                    <Sparkles size={19} />
                    {generating ? "生成中…" : "重新生成"}
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
                        <button onClick={() => fileRef.current?.click()}>
                          <ImageUp size={16} />
                          替换参考图
                        </button>
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
                            </>
                          ) : isScene ? (
                            <p>
                              <label>时间</label>
                              {editing ? (
                                <input
                                  aria-label="场景时间"
                                  value={(selected as Scene).time || ""}
                                  onChange={(event) =>
                                    save({ time: event.target.value })
                                  }
                                />
                              ) : (
                                <span>
                                  {(selected as Scene).time || "未设置"}
                                </span>
                              )}
                            </p>
                          ) : (
                            <p>
                              <label>名称</label>
                              <span>{name}</span>
                            </p>
                          )}
                          <p className="tag-row">
                            <label>标签</label>
                            {editing ? (
                              <input
                                aria-label="资产标签"
                                value={tags.join("，")}
                                onChange={(event) =>
                                  save({
                                    tags: event.target.value
                                      .split(/[，,]/)
                                      .map((tag) => tag.trim())
                                      .filter(Boolean),
                                  })
                                }
                                placeholder="用逗号分隔"
                              />
                            ) : (
                              <span>
                                {tags.length
                                  ? tags.map((tag) => <i key={tag}>#{tag}</i>)
                                  : "未设置"}
                              </span>
                            )}
                          </p>
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
            </>
          ) : (
            <div className="director-empty">
              暂无{typeName}，点击左侧加号创建。
            </div>
          )}
        </main>
      </div>
      {notice && (
        <div className="director-notice" role="status">
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
    </section>
  );
};

export default StageAssets;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("无法读取生成的图片"));
    reader.readAsDataURL(blob);
  });
}
