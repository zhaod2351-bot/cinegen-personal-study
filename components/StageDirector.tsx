import React, { useMemo, useState } from 'react';
import { Clapperboard, Image as ImageIcon, MapPin, Pencil, Sparkles, UserRound } from 'lucide-react';
import { ProjectState, Shot } from '../types';

interface Props { project: ProjectState; updateProject: (updates: Partial<ProjectState>) => void; }

const StageDirector: React.FC<Props> = ({ project, updateProject }) => {
  const [editing, setEditing] = useState<string | null>(null);
  const script = project.scriptData;
  const scene = script?.scenes[0];
  const story = script?.logline || project.rawScript || '尚未填写故事摘要。';
  const updateShot = (id: string, patch: Partial<Shot>) => updateProject({ shots: project.shots.map((shot) => shot.id === id ? { ...shot, ...patch } : shot) });
  const shotsByScene = useMemo(() => project.shots.map((shot, index) => ({ shot, index })), [project.shots]);

  if (!project.shots.length) return <div className="h-full grid place-items-center bg-[#fffaf3] text-[#7b6e61]">请先通过剧本分析或导入式剧本生成镜头。</div>;

  return <section className="director-studio">
    <header className="director-topbar"><div><h1>导演工作台</h1><p>当前生产来源：{project.stage === 'import' ? '导入式剧本' : '已锁定剧本'} · 场次 01</p></div><button className="director-generate"><Sparkles size={17}/>重新分析镜头</button></header>
    <div className="director-body">
      <aside className="director-context">
        <section><h2>故事梗概</h2><p>“{story}”</p></section>
        <section><h2><UserRound size={16}/>演员表</h2>{script?.characters.map((character) => <div className="context-row" key={character.id}><span>{character.name}</span><small>{character.gender || '未设定'}</small></div>)}</section>
        <section><h2><MapPin size={16}/>场景列表</h2>{script?.scenes.map((item) => <div className="context-row" key={item.id}><span>•　{item.location}</span></div>)}</section>
      </aside>
      <main className="director-sequence">
        <header className="scene-banner"><b>01</b><strong>{scene?.location || '当前场次'}</strong><span>{scene?.time || '未设定时间'}　|　{scene?.atmosphere || '未设定氛围'}</span></header>
        {shotsByScene.map(({ shot, index }) => {
          const frame = shot.keyframes?.find((keyframe) => keyframe.type === 'start');
          const characterNames = shot.characters.map((id) => script?.characters.find((character) => character.id === id)?.name).filter(Boolean);
          const editingThis = editing === shot.id;
          return <article className="director-shot" key={shot.id}>
            <div className="shot-side"><b>镜头 {String(index + 1).padStart(3, '0')}</b><span>{shot.shotSize || '中景 MS'}</span><small>{shot.cameraMovement || '稳定镜头'}</small></div>
            <div className="shot-main">
              <div className="shot-content-head"><p>画面</p><button onClick={() => setEditing(editingThis ? null : shot.id)}><Pencil size={16}/>{editingThis ? '完成' : '编辑'}</button></div>
              {editingThis ? <textarea autoFocus value={shot.actionSummary} onChange={(event) => updateShot(shot.id, { actionSummary: event.target.value })}/> : <p className="shot-action">{shot.actionSummary}</p>}
              {shot.dialogue && <blockquote>{editingThis ? <textarea value={shot.dialogue} onChange={(event) => updateShot(shot.id, { dialogue: event.target.value })}/> : `“${shot.dialogue}”`}</blockquote>}
              <div className="shot-tags">{characterNames.map((name) => <i key={name}>{name}</i>)}</div>
            </div>
            <aside className="shot-prompt"><h3>画面提示词</h3><textarea value={frame?.visualPrompt || ''} placeholder="基于角色、场景和动作生成的画面提示词会显示在这里。" onChange={(event) => {
              const keyframes = shot.keyframes.map((keyframe) => keyframe.type === 'start' ? { ...keyframe, visualPrompt: event.target.value } : keyframe);
              updateShot(shot.id, { keyframes });
            }}/><div className="shot-frame">{frame?.imageUrl ? <img src={frame.imageUrl} alt="镜头首帧"/> : <ImageIcon size={28}/>}</div></aside>
          </article>;
        })}
      </main>
    </div>
  </section>;
};

export default StageDirector;
