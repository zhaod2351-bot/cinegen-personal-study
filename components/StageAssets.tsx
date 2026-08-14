import React, { ChangeEvent, useRef, useState } from 'react';
import { Box, Grid2X2, ImageUp, List, MapPin, MoreVertical, Pencil, Plus, Search, Sparkles, User } from 'lucide-react';
import { Character, ProjectState, PropAsset, Scene } from '../types';

type AssetKind = 'character' | 'scene' | 'prop';
type AssetItem = Character | Scene | PropAsset;
interface Props { project: ProjectState; updateProject: (updates: Partial<ProjectState>) => void; onOpenDirector?: (shotId?: string) => void; }

const itemName = (item: AssetItem, kind: AssetKind) => kind === 'character' ? (item as Character).name : kind === 'scene' ? (item as Scene).location : (item as PropAsset).name;

const StageAssets: React.FC<Props> = ({ project, updateProject, onOpenDirector }) => {
  const [kind, setKind] = useState<AssetKind>('character');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(() => project.scriptData?.characters[0]?.id || '');
  const [view, setView] = useState<'grid' | 'list'>('list');
  const [tab, setTab] = useState<'overview' | 'shots'>('overview');
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const data = project.scriptData;
  if (!data) return <div className="director-empty">请先完成剧本分析或导入式剧本。</div>;

  const collection = (nextKind: AssetKind): AssetItem[] => nextKind === 'character' ? data.characters : nextKind === 'scene' ? data.scenes : (data.props || []);
  const allItems = collection(kind);
  const items = allItems.filter((item) => itemName(item, kind).includes(query.trim()));
  const selected = allItems.find((item) => item.id === selectedId) || items[0];
  const name = selected ? itemName(selected, kind) : '';
  const isCharacter = kind === 'character';
  const isScene = kind === 'scene';
  const note = !selected ? '' : isCharacter ? (selected as Character).personality : isScene ? (selected as Scene).atmosphere : (selected as PropAsset).description;
  const visualPrompt = selected?.visualPrompt || '尚未填写视觉参考描述。';
  const linked = !selected ? [] : project.shots.filter((shot) => isCharacter ? shot.characters.includes(selected.id) : isScene ? shot.sceneId === selected.id : false);
  const status = selected?.referenceImage ? '已完成' : '待补充';
  const typeName = isCharacter ? '角色' : isScene ? '场景' : '道具';
  const tags = (note || '').split(/[，、。；\s]+/).filter(Boolean).slice(0, 4);
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600); };

  const save = (changes: Record<string, unknown>) => {
    if (!selected) return;
    updateProject({ scriptData: {
      ...data,
      characters: data.characters.map((item) => kind === 'character' && item.id === selected.id ? { ...item, ...changes } : item),
      scenes: data.scenes.map((item) => kind === 'scene' && item.id === selected.id ? { ...item, ...changes } : item),
      props: (data.props || []).map((item) => kind === 'prop' && item.id === selected.id ? { ...item, ...changes } : item),
    }});
  };
  const addAsset = () => {
    const id = `${kind}_${Date.now().toString(36)}`;
    const next = kind === 'character' ? { ...data, characters: [...data.characters, { id, name: '新角色', gender: '未设置', age: '未设置', personality: '请填写角色备注。', variations: [] }] }
      : kind === 'scene' ? { ...data, scenes: [...data.scenes, { id, location: '新场景', time: '未设置', atmosphere: '请填写场景氛围。' }] }
      : { ...data, props: [...(data.props || []), { id, name: '新道具', description: '请填写道具用途与外观。' }] };
    updateProject({ scriptData: next }); setSelectedId(id); setEditing(true); notify(`已添加${typeName}，可直接编辑。`);
  };
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => { save({ referenceImage: String(reader.result) }); notify('参考图已关联到当前资产。'); }; reader.readAsDataURL(file);
  };
  const switchKind = (next: AssetKind) => { setKind(next); setQuery(''); setTab('overview'); setEditing(false); setSelectedId(collection(next)[0]?.id || ''); };
  const setDescription = (value: string) => save(isCharacter ? { personality: value } : isScene ? { atmosphere: value } : { description: value });

  return <section className="asset-studio">
    <header className="asset-category-bar"><div className="asset-kind-tabs"><button className={isCharacter ? 'active' : ''} onClick={() => switchKind('character')}><User size={18}/>角色</button><button className={isScene ? 'active' : ''} onClick={() => switchKind('scene')}><MapPin size={18}/>场景</button><button className={kind === 'prop' ? 'active' : ''} onClick={() => switchKind('prop')}><Box size={18}/>道具</button></div><div className="asset-style">艺术风格：<b>{project.artStyle || data.genre || '个人项目风格'}</b></div></header>
    <div className="asset-workbench"><aside className="asset-library"><div className="asset-search-row"><label><Search size={20}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材..."/></label><button className="asset-add" onClick={addAsset} title="新建资产"><Plus size={23}/></button></div><div className="asset-library-tools"><div><button className="selected">本集（{items.length}）</button><button>全部（{allItems.length}）</button></div><div><button title="网格视图" onClick={() => setView('grid')} className={view === 'grid' ? 'selected' : ''}><Grid2X2 size={18}/></button><button title="列表视图" onClick={() => setView('list')} className={view === 'list' ? 'selected' : ''}><List size={19}/></button></div></div><div className={`asset-list ${view === 'grid' ? 'grid' : ''}`}>{items.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setEditing(false); setTab('overview'); }} className={`asset-item ${selected?.id === item.id ? 'active' : ''}`}><span className="asset-thumb">{item.referenceImage ? <img src={item.referenceImage} alt=""/> : kind === 'character' ? <User size={21}/> : kind === 'scene' ? <MapPin size={21}/> : <Box size={21}/>}</span><span className="asset-name"><b>{itemName(item, kind)}</b><small>{item.referenceImage ? 'LINKED' : '待补充参考图'}</small></span><i/></button>)}</div></aside>
      <main className="asset-detail">{selected && <><header className="asset-detail-header"><div className="asset-title"><span>{isCharacter ? <User size={27}/> : isScene ? <MapPin size={27}/> : <Box size={27}/>}</span><div><div className="asset-title-line"><h1>{name}</h1><em>{status}</em></div><p>类型：<b>{typeName}</b><span>状态：</span><strong>已关联剧集</strong><code>#{selected.id.slice(0, 8)}</code></p></div></div><div className="asset-actions"><button onClick={() => setEditing(!editing)}><Pencil size={20}/>{editing ? '完成编辑' : '编辑'}</button><button className="primary" onClick={() => notify('已保留当前手动资产；接入生图 API 后可从此处生成变体。')}><Sparkles size={19}/>重新生成</button><button className="icon"><MoreVertical size={21}/></button></div></header><div className="asset-detail-body"><div className="asset-reference"><div className="asset-image-box">{selected.referenceImage ? <img src={selected.referenceImage} alt={`${name}参考图`}/> : <span>暂无参考图</span>}<button onClick={() => fileRef.current?.click()}><ImageUp size={19}/>上传 / 替换</button><input ref={fileRef} type="file" accept="image/*" onChange={onUpload}/></div><h3><Sparkles size={16}/>视觉参考</h3>{editing ? <textarea value={visualPrompt} onChange={(event) => save({ visualPrompt: event.target.value })}/> : <div className="visual-copy">{visualPrompt}</div>}<p>上传的本地参考图会保留在当前个人项目中，并作为后续镜头提示词的视觉依据。</p><p>当前风格：<b>{project.artStyle || data.genre || '个人项目风格'}</b></p></div><section className="asset-info"><div className="asset-info-tabs"><button onClick={() => setTab('overview')} className={tab === 'overview' ? 'active' : ''}>概览</button><button onClick={() => setTab('shots')} className={tab === 'shots' ? 'active' : ''}>相关镜头 <b>{linked.length}</b></button></div>{tab === 'overview' ? <><div className="asset-note"><h2>{typeName}备注</h2>{editing ? <textarea value={note} onChange={(event) => setDescription(event.target.value)}/> : <p>{note || '尚未填写备注。'}</p>}</div><div className="asset-divider"/><div className="asset-metadata"><div><h3>基础信息</h3>{isCharacter ? <><p><label>性别</label><span>{(selected as Character).gender || '未设置'}</span></p><p><label>年龄</label><span>{(selected as Character).age || '未设置'}</span></p></> : <p><label>{isScene ? '地点' : '名称'}</label><span>{name}</span></p>}<p className="tag-row"><label>标签</label><span>{tags.map((tag, index) => <i key={index}>#{tag}</i>)}</span></p></div><div><h3>统计数据</h3><p><label>关联镜头</label><span>{linked.length}</span></p><p><label>创建于</label><span>当前项目</span></p><p><label>风格预设</label><span className="preset">{project.artStyle || data.genre || '个人项目风格'}</span></p></div></div></> : <div className="linked-shots">{linked.length ? linked.map((shot, index) => <button key={shot.id} onClick={() => onOpenDirector?.(shot.id)}><b>镜头 {String(index + 1).padStart(2, '0')}</b><span>{shot.actionSummary}</span><small>{shot.shotSize || '未设置景别'}</small></button>) : <p>这个资产暂未关联镜头。</p>}</div>}</section></div></>}</main>
    </div>{notice && <div className="director-notice" role="status">{notice}</div>}
  </section>;
};

export default StageAssets;
