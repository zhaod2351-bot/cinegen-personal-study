import React, { useMemo, useState } from 'react';
import { CheckCircle2, Clipboard, FileInput, AlertCircle, Users, MapPin, Clapperboard } from 'lucide-react';
import { ProjectState } from '../types';
import { applyImportedStory, buildChatGptImportPrompt, parseImportedStoryPlan, type ImportedStoryPlan } from '../services/importService';

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState>) => void;
}

const StageImport: React.FC<Props> = ({ project, updateProject }) => {
  const [json, setJson] = useState('');
  const [copied, setCopied] = useState(false);
  const [plan, setPlan] = useState<ImportedStoryPlan | null>(null);
  const [error, setError] = useState('');
  const prompt = useMemo(() => buildChatGptImportPrompt(project.rawScript), [project.rawScript]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError('无法自动复制，请手动选中上方提示词复制。');
    }
  };

  const inspect = () => {
    try {
      setPlan(parseImportedStoryPlan(json));
      setError('');
    } catch (err) {
      setPlan(null);
      setError(err instanceof Error ? err.message : '导入结果无法解析');
    }
  };

  const confirmImport = () => {
    if (!plan) return;
    updateProject(applyImportedStory(project, plan));
  };

  return (
    <div className="h-full overflow-y-auto bg-[#050505] text-zinc-300">
      <div className="mx-auto max-w-6xl px-8 py-10">
        <div className="mb-8 border-b border-zinc-800 pb-7">
          <div className="mb-3 flex items-center gap-3 text-zinc-500">
            <FileInput className="h-5 w-5" />
            <span className="font-mono text-[11px] tracking-[.22em]">手动 AI 导入</span>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight text-white">导入式剧本与故事</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-500">
            不需要在网站内配置模型。让 ChatGPT 生成固定 JSON，再导入到当前项目；角色、场景和镜头会建立稳定 ID 关联，并自动进入导演工作台。
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-zinc-800 bg-[#0A0A0A] p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <span className="font-mono text-[11px] text-zinc-600">STEP 01</span>
                <h3 className="mt-1 text-lg font-semibold text-white">复制 ChatGPT 提示词</h3>
                <p className="mt-2 text-xs leading-5 text-zinc-500">提示词已包含当前剧本，并规定角色、场景、镜头的统一名称格式。</p>
              </div>
              <button onClick={copyPrompt} className="flex shrink-0 items-center gap-2 rounded-md border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-white hover:text-white">
                {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <Clipboard className="h-4 w-4" />}
                {copied ? '已复制' : '复制提示词'}
              </button>
            </div>
            <textarea readOnly value={prompt} className="h-[390px] w-full resize-none rounded-lg border border-zinc-800 bg-[#111] p-4 font-mono text-xs leading-6 text-zinc-400 outline-none" />
          </section>

          <section className="rounded-xl border border-zinc-800 bg-[#0A0A0A] p-6">
            <div className="mb-5">
              <span className="font-mono text-[11px] text-zinc-600">STEP 02</span>
              <h3 className="mt-1 text-lg font-semibold text-white">粘贴 ChatGPT JSON</h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">只粘贴 JSON。预览校验通过后才会导入，不会写入不完整数据。</p>
            </div>
            <textarea value={json} onChange={(event) => setJson(event.target.value)} placeholder="在此粘贴 ChatGPT 返回的 JSON…" className="h-[318px] w-full resize-none rounded-lg border border-zinc-800 bg-[#111] p-4 font-mono text-xs leading-6 text-zinc-300 outline-none focus:border-indigo-500" />
            {error && <div className="mt-4 flex gap-2 rounded-md border border-red-900/60 bg-red-950/20 p-3 text-xs text-red-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>}
            <button onClick={inspect} disabled={!json.trim()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-white py-3 text-xs font-bold uppercase tracking-widest text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40">
              <FileInput className="h-4 w-4" /> 校验并预览结果
            </button>
          </section>
        </div>

        {plan && <section className="mt-6 rounded-xl border border-emerald-900/60 bg-[#0A0A0A] p-6">
          <div className="flex flex-wrap items-start justify-between gap-5 border-b border-zinc-800 pb-5">
            <div>
              <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="h-5 w-5" /><span className="font-mono text-[11px] tracking-widest">校验通过</span></div>
              <h3 className="mt-2 text-xl font-semibold text-white">{plan.title}</h3>
              <p className="mt-1 text-sm text-zinc-500">{plan.logline || '未填写一句话梗概'}</p>
            </div>
            <button onClick={confirmImport} className="flex items-center gap-2 rounded-md bg-emerald-400 px-5 py-3 text-xs font-bold uppercase tracking-widest text-black transition hover:bg-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> 确认导入并进入导演台
            </button>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-800 bg-[#111] p-4"><Users className="mb-3 h-5 w-5 text-indigo-400" /><b className="text-2xl text-white">{plan.scriptData.characters.length}</b><p className="mt-1 text-xs text-zinc-500">角色将写入资产工作台</p></div>
            <div className="rounded-lg border border-zinc-800 bg-[#111] p-4"><MapPin className="mb-3 h-5 w-5 text-amber-400" /><b className="text-2xl text-white">{plan.scriptData.scenes.length}</b><p className="mt-1 text-xs text-zinc-500">场景将写入资产工作台</p></div>
            <div className="rounded-lg border border-zinc-800 bg-[#111] p-4"><Clapperboard className="mb-3 h-5 w-5 text-emerald-400" /><b className="text-2xl text-white">{plan.shots.length}</b><p className="mt-1 text-xs text-zinc-500">镜头将绑定角色与场景 ID</p></div>
          </div>
        </section>}
      </div>
    </div>
  );
};

export default StageImport;
