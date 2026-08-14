import React, { useMemo, useState } from 'react';
import { Clapperboard, Image as ImageIcon, Layers3, Pencil, Play, Sparkles } from 'lucide-react';
import { ProjectState, Shot } from '../types';

interface Props { project: ProjectState; updateProject: (updates: Partial<ProjectState>) => void; }

const StageDirector: React.FC<Props> = ({ project, updateProject }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const [activeClip, setActiveClip] = useState(0);
  const [boardVersion, setBoardVersion] = useState(1);
  const [notice, setNotice] = useState('');
  const script = project.scriptData;
  const scene = script?.scenes[0];
  const shots = useMemo(() => project.shots.map((shot, index) => ({ shot, index })), [project.shots]);
  const updateShot = (id: string, patch: Partial<Shot>) => updateProject({ shots: project.shots.map((shot) => shot.id === id ? { ...shot, ...patch } : shot) });
  const clipCount = Math.max(1, Math.min(5, Math.ceil(project.shots.length / 2)));
  const clips = Array.from({ length: clipCount }, (_, index) => ({
    title: `Clip ${index + 1}`,
    range: `${index * 2 + 1}–${Math.min(index * 2 + 2, project.shots.length)}`,
  }));
  const visibleShots = shots.slice(activeClip * 2, activeClip * 2 + 2);
  const notify = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2800);
  };

  if (!project.shots.length) return <div className="director-empty">请先通过剧本分析或导入式剧本生成镜头。</div>;

  return <section className="director-studio director-reference-layout">
    <header className="director-topbar">
      <div><h1>导演工作室</h1><p>当前生产来源：{project.stage === 'import' ? '导入式剧本' : '已锁定剧本'} · 场次 01</p></div>
      <button className="director-generate" onClick={() => { setActiveClip(0); notify('镜头已按当前场次顺序整理。'); }}><Layers3 size={17}/>整理镜头</button>
    </header>
    <div className="director-reference-body">
      <aside className="director-clips">
        <header><b>剪辑列表</b><em>{clips.length}</em></header>
        <div className="clip-list">{clips.map((clip, index) => <button key={clip.title} className={activeClip === index ? 'active' : ''} onClick={() => { setActiveClip(index); setEditing(null); }}><span>{index + 1}</span><div><b>{clip.title}</b><small>镜头 {clip.range}</small></div><i>▦</i></button>)}</div>
      </aside>
      <main className="director-shot-column">
        <header className="director-column-title"><b>镜头列表</b><em>{project.shots.length}</em></header>
        <div className="director-shot-scroll">{visibleShots.map(({ shot, index }) => {
          const editingThis = editing === shot.id;
          const characterNames = shot.characters.map((id) => script?.characters.find((character) => character.id === id)?.name).filter(Boolean);
          return <article className="director-shot-card" key={shot.id}>
            <header><span>#{index + 1}</span><b>{shot.shotSize || '中景 MS'}</b><button onClick={() => setEditing(editingThis ? null : shot.id)}><Pencil size={16}/>{editingThis ? '完成' : '编辑'}</button></header>
            <div className="director-shot-card-main"><section><small>▣ 画面</small>{editingThis ? <textarea autoFocus value={shot.actionSummary} onChange={(event) => updateShot(shot.id, { actionSummary: event.target.value })}/> : <p>{shot.actionSummary}</p>}</section><aside><small>◷ 时长</small><b>{shot.duration || 5} 秒</b></aside></div>
            <div className="shot-audio"><small>▱ 音频（对白 / 旁白 / 音效 / 环境音 / 音乐）</small>{shot.dialogue && <p><i>对白</i>{editingThis ? <input value={shot.dialogue} onChange={(event) => updateShot(shot.id, { dialogue: event.target.value })}/> : `“${shot.dialogue}”`}</p>}</div>
            <footer><span>⌖ {scene?.location || '未指定场景'}</span>{characterNames.map((name) => <span key={name}>♙ {name}</span>)}</footer>
          </article>;
        })}</div>
      </main>
      <aside className="director-storyboard">
        <header><b>▧ 故事板</b><div><button>v{boardVersion}⌄</button><button className="director-board-create" onClick={() => { setBoardVersion((version) => version + 1); notify('已创建新的本地故事板版本。'); }}><Sparkles size={15}/>生成新版本</button></div></header>
        <div className="storyboard-grid">{visibleShots.map(({ shot, index }) => {
          const image = shot.keyframes?.find((frame) => frame.type === 'start')?.imageUrl;
          return <button key={shot.id} className="storyboard-tile" onClick={() => setEditing(shot.id)}>{image ? <img src={image} alt={`镜头 ${index + 1}`}/> : <ImageIcon size={26}/>}<span>镜头 {String(index + 1).padStart(2, '0')}</span></button>;
        })}</div>
        <section className="director-video-panel"><header><b>▣ 视频</b><button onClick={() => notify('视频接口尚未配置；可在接入后从当前镜头生成预览。')}><Play size={16}/>生成视频</button></header><div><Clapperboard size={42}/><p>暂无视频</p><small>生成视频以预览最终效果</small></div></section>
      </aside>
    </div>
    {notice && <div className="director-notice" role="status">{notice}</div>}
  </section>;
};

export default StageDirector;
