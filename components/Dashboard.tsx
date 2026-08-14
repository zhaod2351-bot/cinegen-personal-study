import React, { useEffect, useMemo, useState } from 'react';
import { Calendar, Check, ChevronRight, Folder, Home, Images, Plus, Trash2, X } from 'lucide-react';
import { ProjectState } from '../types';
import { createNewProjectState, deleteProjectFromDB, getAllProjectsMetadata } from '../services/storageService';

interface Props { onOpenProject: (project: ProjectState) => void; }
type Section = 'home' | 'projects' | 'assets';
const styles = ['日漫赛璐璐', '国风水墨', '电影写实', '像素动画', '3D 卡通', '美式漫画'];
const tags = ['末世', '悬疑', '恋爱', '热血', '治愈', '喜剧', '科幻', '奇幻', '武侠', '赛博朋克', '暗黑', '轻松'];

const Dashboard: React.FC<Props> = ({ onOpenProject }) => {
  const [projects, setProjects] = useState<ProjectState[]>([]);
  const [section, setSection] = useState<Section>('home');
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [artStyle, setArtStyle] = useState(styles[0]);
  const [styleTags, setStyleTags] = useState<string[]>(['末世', '悬疑']);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('60 秒');
  const load = async () => setProjects(await getAllProjectsMetadata());
  useEffect(() => { load(); }, []);
  const recent = projects[0];
  const assetTotals = useMemo(() => projects.reduce((total, project) => ({
    characters: total.characters + (project.scriptData?.characters.length || 0),
    scenes: total.scenes + (project.scriptData?.scenes.length || 0),
    props: total.props + (project.scriptData?.props?.length || 0),
  }), { characters: 0, scenes: 0, props: 0 }), [projects]);
  const toggleTag = (tag: string) => setStyleTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  const create = () => {
    const projectTitle = title.trim() || '未命名项目';
    const base = createNewProjectState({ title: projectTitle, artStyle, styleTags, aspectRatio, targetDuration: duration, language: '中文' });
    onOpenProject({ ...base, title: projectTitle, targetDuration: duration, language: '中文' });
  };
  const remove = async (event: React.MouseEvent, id: string) => { event.stopPropagation(); if (confirm('确定删除这个本地项目吗？')) { await deleteProjectFromDB(id); load(); } };
  const projectGrid = <section className="home-project-grid">{projects.map((project) => <article key={project.id} onClick={() => onOpenProject(project)}><div className="project-cover"/><h2>{project.title}</h2><div>{project.artStyle || '未设定画风'}</div><footer><span><Calendar size={13}/>{new Date(project.lastModified).toLocaleDateString('zh-CN')}</span><button aria-label={`删除${project.title}`} onClick={(event) => remove(event, project.id)}><Trash2 size={15}/></button></footer></article>)}<button onClick={() => setCreating(true)} className="home-create-card"><Plus size={28}/>创建新项目</button></section>;

  return <main className="home-page"><aside className="home-side"><div className="home-brand"><span>✦</span><b>CineGen</b></div><button className={section === 'home' ? 'active' : ''} onClick={() => setSection('home')}><Home size={17}/>　首页</button><button className={section === 'projects' ? 'active' : ''} onClick={() => setSection('projects')}><Folder size={17}/>　项目</button><button className={section === 'assets' ? 'active' : ''} onClick={() => setSection('assets')}><Images size={17}/>　素材库</button><footer>个人学习版</footer></aside><section className="home-content"><header className="home-head"><div><p>{section === 'home' ? '概览' : section === 'projects' ? '全部项目' : '素材库'}</p><h1>{section === 'home' ? '你好，创作者！' : section === 'projects' ? '我的项目' : '项目资产总览'}</h1><span>{section === 'assets' ? '资产随项目保存，并与导演工作台保持关联。' : '今天准备创作些什么？'}</span></div><button onClick={() => setCreating(true)}><Plus size={18}/>创建项目</button></header>{section === 'home' && <>{recent && <section className="continue-card" onClick={() => onOpenProject(recent)}><Folder/><div><small>继续此前的进度</small><h2>{recent.title}</h2><p>{recent.artStyle || '未设置画风'}　·　已编辑 {new Date(recent.lastModified).toLocaleDateString('zh-CN')}</p></div><ChevronRight/></section>}<div className="home-section-title"><h2>最近项目</h2><button onClick={() => setSection('projects')}>查看全部　→</button></div>{projectGrid}</>}{section === 'projects' && <><div className="home-section-title"><h2>全部项目（{projects.length}）</h2><span>按最近编辑排序</span></div>{projectGrid}</>}{section === 'assets' && <><section className="asset-summary-cards"><article><b>{assetTotals.characters}</b><span>角色资产</span></article><article><b>{assetTotals.scenes}</b><span>场景资产</span></article><article><b>{assetTotals.props}</b><span>道具资产</span></article></section><div className="home-section-title"><h2>选择项目查看资产</h2><span>资产不能脱离项目单独编辑</span></div>{projectGrid}</>}</section>{creating && <div className="fixed inset-0 z-[100] grid place-items-center bg-black/45 p-6"><section className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl bg-[#fffdf8] p-8 shadow-2xl"><header className="flex items-start justify-between"><div><h2 className="m-0 text-2xl">新建项目</h2><p className="mt-2 text-sm text-[#8d7e70]">画风与标签会贯穿整个项目。</p></div><button onClick={() => setCreating(false)}><X/></button></header><label className="setup-label">项目名称<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：银河小队" autoFocus/></label><div className="setup-block"><h3>艺术风格 <small>单选</small></h3><div className="style-gallery">{styles.map((style,index) => <button key={style} className={artStyle === style ? 'selected' : ''} onClick={() => setArtStyle(style)}><span style={{backgroundPosition:`${(index%4)*33.333}% ${Math.floor(index/4)*50}%`}}/>{artStyle === style && <Check size={14}/>}<b>{style}</b></button>)}</div></div><div className="setup-block"><h3>作品标签 <small>可多选</small></h3><div className="setup-options">{tags.map((tag) => <button key={tag} className={styleTags.includes(tag) ? 'selected' : ''} onClick={() => toggleTag(tag)}>{styleTags.includes(tag) && <Check size={15}/>} {tag}</button>)}</div></div><div className="grid grid-cols-2 gap-5"><label className="setup-label">画幅<select value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value)}><option>16:9</option><option>9:16</option><option>1:1</option><option>2.35:1</option></select></label><label className="setup-label">预计时长<select value={duration} onChange={(event) => setDuration(event.target.value)}><option>30 秒</option><option>60 秒</option><option>90 秒</option><option>3 分钟</option></select></label></div><footer className="mt-8 flex justify-end gap-3"><button className="setup-cancel" onClick={() => setCreating(false)}>取消</button><button className="setup-create" onClick={create}>创建 <ChevronRight size={17}/></button></footer></section></div>}</main>;
};
export default Dashboard;
