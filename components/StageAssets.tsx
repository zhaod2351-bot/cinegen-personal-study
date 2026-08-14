import React, { ChangeEvent, useMemo, useRef, useState } from 'react';
import { Box, ImageUp, MapPin, Pencil, Search, User, Users } from 'lucide-react';
import { Character, ProjectState, Scene } from '../types';

type AssetKind = 'character' | 'scene';
interface Props { project: ProjectState; updateProject: (updates: Partial<ProjectState>) => void; onOpenDirector?: (shotId?: string) => void; }

const StageAssets: React.FC<Props> = ({ project, updateProject, onOpenDirector }) => {
  const [kind, setKind] = useState<AssetKind>('character');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string>(() => project.scriptData?.characters[0]?.id || '');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  if (!project.scriptData) return <div className="h-full grid place-items-center text-zinc-500">请先完成剧本分析或导入式剧本。</div>;
  const data = project.scriptData;
  const items = (kind === 'character' ? data.characters : data.scenes).filter(item => (kind === 'character' ? (item as Character).name : (item as Scene).location).includes(query));
  const selected = (kind === 'character' ? data.characters : data.scenes).find(item => item.id === selectedId) || items[0];
  const linked = selected ? project.shots.filter(shot => kind === 'character' ? shot.characters.includes(selected.id) : shot.sceneId === selected.id) : [];
  const name = selected ? kind === 'character' ? (selected as Character).name : (selected as Scene).location : '';
  const image = selected?.referenceImage;
  const status = image ? '已完成' : '待补充参考图';
  const save = (changes: Partial<Character & Scene>) => {
    const scriptData = { ...data, characters: data.characters.map(item => kind === 'character' && item.id === selected?.id ? { ...item, ...changes } : item), scenes: data.scenes.map(item => kind === 'scene' && item.id === selected?.id ? { ...item, ...changes } : item) };
    updateProject({ scriptData });
  };
  const onUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    const reader = new FileReader(); reader.onload = () => save({ referenceImage: String(reader.result) }); reader.readAsDataURL(file);
  };
  const updateText = (field: 'visualPrompt' | 'personality' | 'atmosphere', value: string) => save({ [field]: value });
  const typeLabel = kind === 'character' ? '角色' : '场景';
  return <div className="h-full min-h-0 flex bg-[#121212] text-zinc-200">
    <aside className="w-[340px] shrink-0 border-r border-zinc-800 bg-[#151515] flex flex-col">
      <div className="p-5 border-b border-zinc-800"><div className="flex rounded-lg overflow-hidden border border-zinc-700">
        <button onClick={() => { setKind('character'); setSelectedId(data.characters[0]?.id || ''); }} className={`flex-1 py-2 text-sm transition-colors ${kind==='character'?'bg-orange-100 text-orange-900 border border-orange-300':'text-zinc-500 hover:bg-orange-50'}`}>角色</button>
        <button onClick={() => { setKind('scene'); setSelectedId(data.scenes[0]?.id || ''); }} className={`flex-1 py-2 text-sm transition-colors ${kind==='scene'?'bg-orange-100 text-orange-900 border border-orange-300':'text-zinc-500 hover:bg-orange-50'}`}>场景</button>
        <button disabled className="flex-1 py-2 text-sm text-zinc-700">道具（即将加入）</button>
      </div><label className="mt-4 flex gap-2 items-center border border-zinc-700 rounded-lg px-3 py-2 text-zinc-400"><Search className="w-4 h-4"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索素材..." className="w-full bg-transparent outline-none text-sm"/></label></div>
      <div className="px-5 py-3 text-xs text-zinc-500 flex justify-between"><span>{typeLabel}素材</span><span>{items.length} 个</span></div>
      <div className="overflow-y-auto px-3 pb-4 space-y-2">{items.map(item => { const label=kind==='character'?(item as Character).name:(item as Scene).location; return <button key={item.id} onClick={()=>{setSelectedId(item.id);setEditing(false)}} className={`w-full flex gap-3 items-center p-3 rounded-lg border text-left ${selected?.id===item.id?'border-orange-500 bg-orange-500/10':'border-transparent hover:bg-zinc-800'}`}><div className="w-10 h-10 rounded bg-zinc-800 overflow-hidden grid place-items-center">{item.referenceImage?<img src={item.referenceImage} className="w-full h-full object-cover"/>:kind==='character'?<User className="w-4 h-4"/>:<MapPin className="w-4 h-4"/>}</div><span className="flex-1 truncate"><b className="block text-sm">{label}</b><small className="text-zinc-500">{item.referenceImage?'已关联参考图':'待补充'}</small></span><i className="w-2 h-2 rounded-full bg-blue-400"/></button>})}</div>
    </aside>
    <main className="min-w-0 flex-1 overflow-y-auto p-8 md:p-10">{selected && <><header className="flex justify-between gap-6 border-b border-zinc-800 pb-6"><div className="flex gap-4"><div className="w-12 h-12 rounded-xl bg-orange-500/15 grid place-items-center text-orange-400">{kind==='character'?<User/>:<MapPin/>}</div><div><h1 className="text-3xl font-bold text-white">{name}</h1><p className="mt-2 text-sm text-zinc-500">类型：{typeLabel}　状态：<span className="text-emerald-400">{status}</span></p></div></div><button onClick={()=>setEditing(!editing)} className="h-10 px-4 border border-zinc-700 rounded-lg hover:bg-zinc-800 flex gap-2 items-center"><Pencil className="w-4 h-4"/>{editing?'完成编辑':'编辑'}</button></header>
      <section className="grid grid-cols-1 lg:grid-cols-[300px,1fr] gap-8 py-8"><div className="relative aspect-[3/4] rounded-xl bg-zinc-900 overflow-hidden border border-zinc-800 group">{image?<img src={image} className="w-full h-full object-cover"/>:<div className="h-full grid place-items-center text-zinc-600">暂无参考图</div>}<button onClick={()=>inputRef.current?.click()} className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/60 grid place-items-center transition-opacity"><span className="px-4 py-2 bg-white text-black rounded-lg flex gap-2"><ImageUp className="w-4 h-4"/>上传 / 替换参考图</span></button><input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onUpload}/></div><div className="space-y-6"><div><h2 className="font-bold text-white mb-3">{typeLabel}备注</h2>{editing?<textarea value={kind==='character'?(selected as Character).personality:(selected as Scene).atmosphere} onChange={e=>updateText(kind==='character'?'personality':'atmosphere',e.target.value)} className="w-full min-h-28 bg-zinc-900 border border-zinc-700 rounded-lg p-3 outline-none"/>:<p className="text-zinc-400 leading-7">{kind==='character'?(selected as Character).personality:(selected as Scene).atmosphere}</p>}</div><div><h2 className="font-bold text-white mb-3">视觉参考描述</h2>{editing?<textarea value={selected.visualPrompt||''} onChange={e=>updateText('visualPrompt',e.target.value)} className="w-full min-h-28 bg-zinc-900 border border-zinc-700 rounded-lg p-3 outline-none"/>:<p className="text-zinc-400 leading-7">{selected.visualPrompt||'尚未填写视觉描述。'}</p>}</div><div className="grid grid-cols-2 gap-4 pt-4 border-t border-zinc-800"><div><p className="text-xs text-zinc-500">关联镜头</p><b className="text-2xl text-white">{linked.length}</b></div><div><p className="text-xs text-zinc-500">创建状态</p><b className="text-sm text-emerald-400">{status}</b></div></div></div></section>
      <section className="border-t border-zinc-800 pt-7"><h2 className="text-lg font-bold text-white mb-4">关联镜头（{linked.length}）</h2>{linked.length? <div className="grid gap-3">{linked.map((shot,index)=><button key={shot.id} onClick={()=>onOpenDirector?.(shot.id)} className="text-left p-4 rounded-lg border border-zinc-800 hover:border-orange-500 hover:bg-zinc-900"><b className="text-orange-400 mr-3">镜头 {project.shots.indexOf(shot)+1}</b><span>{shot.actionSummary}</span><small className="block mt-2 text-zinc-500">{shot.shotSize||'未设定景别'} · {shot.cameraMovement}</small></button>)}</div>:<p className="text-zinc-500 py-4">该{typeLabel}尚未被导演工作台中的镜头使用。</p>}</section></>}</main>
  </div>;
};
export default StageAssets;
