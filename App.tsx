import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import StageScript from './components/StageScript';
import StageImport from './components/StageImport';
import StageAssets from './components/StageAssets';
import StageDirector from './components/StageDirector';
import StageExport from './components/StageExport';
import Dashboard from './components/Dashboard';
import AiSettingsDialog from './components/AiSettingsDialog';
import { ProjectState } from './types';
import { Save, CheckCircle, Palette, Settings } from 'lucide-react';
import { getProjectById, saveProjectToDB, subscribeToProjectSync } from './services/storageService';
import { getAiHealth, type AiHealth } from './services/aiApiService';

const HomeLinks = () => (
  <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-zinc-800 bg-black/70 px-4 py-2 text-[11px] font-mono text-zinc-400 backdrop-blur-sm">
    <a
      href="https://github.com/UllrAI/CineGen-ShortDrama"
      target="_blank"
      rel="noreferrer"
      className="hover:text-white transition-colors"
    >
      原始开源仓库
    </a>
    <span className="text-zinc-700">|</span>
    <a
      href="https://anikuku.com/?from=open-source"
      target="_blank"
      rel="noreferrer"
      className="hover:text-white transition-colors"
    >
      anikuku.com
    </a>
  </div>
);

type Theme = 'paper' | 'mist' | 'night';

const ThemePicker = ({ theme, setTheme }: { theme: Theme; setTheme: (theme: Theme) => void }) => (
  <label className="fixed top-4 left-4 z-[80] flex items-center gap-2 rounded-lg border border-black/10 bg-white/85 px-3 py-2 text-[11px] font-mono text-zinc-700 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-black/70 dark:text-zinc-300">
    <Palette className="h-3.5 w-3.5" />
    <span>主题</span>
    <select
      aria-label="主题颜色"
      value={theme}
      onChange={(event) => setTheme(event.target.value as Theme)}
      className="cursor-pointer bg-transparent text-[11px] font-bold outline-none"
    >
      <option value="paper">暖白</option>
      <option value="mist">雾蓝</option>
      <option value="night">夜间</option>
    </select>
  </label>
);

function App() {
  const [project, setProject] = useState<ProjectState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('cinegen_theme') as Theme) || 'paper');
  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
  const [directorFocusShotId, setDirectorFocusShotId] = useState<string | undefined>();

  // Ref to hold debounce timer
  const saveTimeoutRef = useRef<any>(null);

  // Auto-save logic
  useEffect(() => {
    if (!project) return;

    setSaveStatus('unsaved');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);

    saveTimeoutRef.current = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProjectToDB(project);
        setSaveStatus('saved');
      } catch (e) {
        console.error("Auto-save failed", e);
      }
    }, 1000); // Debounce 1s

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [project]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cinegen_theme', theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    getAiHealth(controller.signal).then(setAiHealth).catch(() => setAiHealth(null));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    return subscribeToProjectSync(async (event) => {
      if (!project || event.projectId !== project.id) return;
      if (event.type === 'deleted') { setProject(null); return; }
      const latest = await getProjectById(project.id);
      if (latest) setProject(latest);
    });
  }, [project?.id]);

  const updateProject = (updates: Partial<ProjectState>) => {
    if (!project) return;
    setProject(prev => prev ? ({ ...prev, ...updates }) : null);
  };

  const setStage = (stage: 'script' | 'import' | 'assets' | 'director' | 'export') => {
    updateProject({ stage });
  };

  const handleOpenProject = (proj: ProjectState) => {
    setProject(proj);
  };

  const handleExitProject = async () => {
    // Force save before exiting
    if (project) {
      await saveProjectToDB(project);
    }
    setProject(null);
  };

  const renderStage = () => {
    if (!project) return null;
    switch (project.stage) {
      case 'script':
        return <StageScript project={project} updateProject={updateProject} onOpenAssets={() => setStage('assets')} />;
      case 'import':
        return <StageImport project={project} updateProject={updateProject} />;
      case 'assets':
        return <StageAssets project={project} updateProject={updateProject} onOpenDirector={(shotId) => { setDirectorFocusShotId(shotId); setStage('director'); }} />;
      case 'director':
        return <StageDirector project={project} updateProject={updateProject} initialShotId={directorFocusShotId} />;
      case 'export':
        return <StageExport project={project} updateProject={updateProject} />;
      default:
        return <div className="text-white">未知阶段</div>;
    }
  };

  // Dashboard View
  if (!project) {
    return (
      <>
        <ThemePicker theme={theme} setTheme={setTheme} />
        <button
          onClick={() => setSettingsOpen(true)}
          className="fixed top-4 right-4 z-[80] inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white/85 px-3 py-2 text-[11px] font-semibold text-zinc-700 shadow-lg backdrop-blur-md transition hover:bg-white"
        >
          <Settings className="h-3.5 w-3.5" />系统设置
        </button>
        <Dashboard onOpenProject={handleOpenProject} />
        {settingsOpen && <AiSettingsDialog onClose={() => setSettingsOpen(false)} />}
        <HomeLinks />
      </>
    );
  }

  // Workspace View
  return (
    <div className="flex h-screen bg-[#121212] font-sans text-gray-100 selection:bg-indigo-500/30">
      <ThemePicker theme={theme} setTheme={setTheme} />
      <Sidebar
        currentStage={project.stage}
        setStage={setStage}
        onExit={handleExitProject}
        onOpenSettings={() => setSettingsOpen(true)}
        projectName={project.title}
      />

      <main className="ml-[200px] flex-1 h-screen overflow-hidden relative">
        {renderStage()}

        {/* Save Status Indicator */}
        <div className="absolute top-4 right-6 pointer-events-none opacity-50 flex items-center gap-2 text-xs font-mono text-zinc-400 bg-black/50 px-2 py-1 rounded-full backdrop-blur-sm z-50">
          {saveStatus === 'saving' ? (
            <>
              <Save className="w-3 h-3 animate-pulse" />
              保存中...
            </>
          ) : (
            <>
              <CheckCircle className="w-3 h-3 text-green-500" />
              已保存
            </>
          )}
        </div>
      </main>

      {settingsOpen && <AiSettingsDialog onClose={() => setSettingsOpen(false)} />}

      <div className="fixed bottom-4 right-5 z-[70] rounded-md border border-[#ded5c8] bg-[#fffaf3]/95 px-3 py-2 text-[10px] text-[#75685d] shadow-sm backdrop-blur">
        {aiHealth ? (
          <span><b className="text-emerald-700">AI 服务已连接</b> · {aiHealth.models.text} · {aiHealth.models.image}{aiHealth.archiveRoot ? ` · ${aiHealth.archiveRoot}` : ''}</span>
        ) : (
          <span className="text-amber-700">AI 服务未启动：请运行 npm run dev:local</span>
        )}
      </div>

      <div className="lg:hidden fixed inset-0 bg-black z-[100] flex items-center justify-center p-8 text-center">
        <p className="text-zinc-500">为了获得最佳体验，请使用桌面浏览器访问。</p>
      </div>
    </div>
  );
}

export default App;
