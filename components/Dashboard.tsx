import React, { useEffect, useState } from 'react';
import { Calendar, Check, ChevronRight, Folder, Plus, Trash2, X } from 'lucide-react';
import { ProjectState } from '../types';
import { createNewProjectState, deleteProjectFromDB, getAllProjectsMetadata } from '../services/storageService';

interface Props { onOpenProject: (project: ProjectState) => void; }
const styles = ['日漫赛璐璐', '国风水墨', '电影写实', '像素动画', '3D 卡通', '美式漫画'];
const tags = ['末世', '悬疑', '恋爱', '热血', '治愈', '喜剧', '科幻', '奇幻', '武侠', '赛博朋克', '暗黑', '轻松'];

const Dashboard: React.FC<Props> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [artStyle, setArtStyle] = useState(styles[0]);
  const [styleTags, setStyleTags] = useState<string[]>(['末世', '悬疑']);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('60 秒');
  const load = async () => setProjects(await getAllProjectsMetadata());
  useEffect(() => { load(); }, []);
  const toggleTag = (tag: string) => setStyleTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const create = () => {
    const base = createNewProjectState({ title: title.trim() || '未命名项目', artStyle, styleTags, aspectRatio, targetDuration: duration, language: '中文' });
    onOpenProject({ ...base, title: title.trim() || '未命名项目', targetDuration: duration, language: '中文' });
  };
  const remove = async (event: React.MouseEvent, id: string) => { event.stopPropagation(); if (confirm('确定删除这个本地项目吗？')) { await deleteProjectFromDB(id); load(); } };
  return <main className="min-h-screen bg-[#fffaf3] p-10 text-[#302821]"><header className="mx-auto flex max-w-6xl items-center justify-between border-b border-[#e4dbcf] pb-7"><div><h1 className="m-0 text-3xl">我的项目</h1><p className="mt-2 text-sm text-[#8d7e70]">从统一的画风和标签开始你的 AI 动画制作。</p></div><button onClick={() => setCreating(true)} className="flex items-center gap-2 rounded-md bg-[#c9570c] px-5 py-3 text-sm font-bold text-white"><Plus size={18}/>新建项目</button></header><section className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-5 md:grid-cols-3">{projects.map((project) => <article key={project.id} onClick={() => onOpenProject(project)} className="cursor-pointer rounded-lg border border-[#e4dbcf] bg-[#fffdf8] p-5 transition hover:border-[#c9570c]"><Folder className="mb-6 text-[#c9570c]"/><h2 className="text-lg">{project.title}</h2><div className="mt-4 flex flex-wrap gap-2"><i className="project-tag">{project.artStyle || '未设定画风'}</i>{(project.styleTags || []).slice(0, 3).map((tag) => <i className="project-tag" key={tag}>#{tag}</i>)}</div><footer className="mt-8 flex items-center justify-between border-t border-[#eee5db] pt-3 text-xs text-[#968777]"><span className="flex items-center gap-1"><Calendar size={13}/>{new Date(project.lastModified).toLocaleDateString('zh-CN')}</span><button onClick={(event) => remove(event, project.id)} title="删除项目"><Trash2 size={16}/></button></footer></article>)}<button onClick={() => setCreating(true)} className="grid min-h-52 place-items-center rounded-lg border border-dashed border-[#d8cbbb] text-[#8d7e70] hover:border-[#c9570c] hover:text-[#c9570c]"><span className="flex flex-col items-center gap-3"><Plus size={27}/>创建新项目</span></button></section>{creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-6"><section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-[#fffdf8] p-8 shadow-2xl"><header className="flex items-start justify-between"><div><h2 className="m-0 text-2xl">创建项目</h2><p className="mt-2 text-sm text-[#8d7e70]">这些设定会贯穿剧本、资产和导演工作台。</p></div><button onClick={() => setCreating(false)}><X/></button></header><label className="setup-label">项目名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：初次交锋" autoFocus/></label><div className="setup-block"><h3>主画风 <small>单选</small></h3><div className="setup-options">{styles.map((style) => <button key={style} className={artStyle === style ? 'selected' : ''} onClick={() => setArtStyle(style)}>{artStyle === style && <Check size={15}/>} {style}</button>)}</div></div><div className="setup-block"><h3>作品标签 <small>可多选</small></h3><div className="setup-options">{tags.map((tag) => <button key={tag} className={styleTags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{styleTags.includes(tag) && <Check size={15}/>} {tag}</button>)}</div></div><div className="grid grid-cols-2 gap-5"><label className="setup-label">画幅<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>2.35:1</option></select></label><label className="setup-label">预计时长<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>30 秒</option><option>60 秒</option><option>90 秒</option><option>3 分钟</option></select></label></div><footer className="mt-8 flex justify-end gap-3"><button className="setup-cancel" onClick={() => setCreating(false)}>取消</button><button className="setup-create" onClick={create}>确认创建项目 <ChevronRight size={17}/></button></footer></section></div>}</main>;
};
export default Dashboard;
