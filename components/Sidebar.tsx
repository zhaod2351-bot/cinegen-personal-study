import React from 'react';
import { FileText, Users, Clapperboard, Film, Settings, ChevronLeft, Aperture } from 'lucide-react';

interface SidebarProps {
  currentStage: string;
  setStage: (stage: 'script' | 'import' | 'assets' | 'director' | 'export') => void;
  onExit: () => void;
  onOpenSettings: () => void;
  projectName?: string;
}

const Sidebar: React.FC<SidebarProps> = ({ currentStage, setStage, onExit, onOpenSettings, projectName }) => {
  const navItems = [
    { id: 'script', label: '剧本与故事', icon: FileText, sub: '第一步' },
    { id: 'assets', label: '设计与资产', icon: Users, sub: '第二步' },
    { id: 'director', label: '导演工作台', icon: Clapperboard, sub: '第三步' },
    { id: 'export', label: '成片与导出', icon: Film, sub: '第四步' },
  ];

  return (
    <aside className="cine-sidebar fixed inset-y-0 left-0 z-50 flex w-[200px] select-none flex-col border-r border-[#ded5c8] bg-[#fbf7ef] text-[#2d261f]">
      <div className="border-b border-[#e6ddd1] px-4 pb-5 pt-5">
        <div className="mb-6 flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#c4510c] text-white">
            <Aperture className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold tracking-wide">CineGen AI</h1>
            <p className="text-[10px] tracking-[0.14em] text-[#8d7e70]">个人学习版</p>
          </div>
        </div>
        <button onClick={onExit} className="group flex items-center gap-2 text-xs text-[#75685c] transition-colors hover:text-[#c4510c]">
          <ChevronLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
          返回项目列表
        </button>
      </div>

      <div className="border-b border-[#e6ddd1] px-4 py-4">
        <div className="mb-1 text-[10px] tracking-[0.12em] text-[#9b8c7e]">当前项目</div>
        <div className="truncate text-sm font-medium">{projectName || '未命名项目'}</div>
      </div>

      <nav className="flex-1 space-y-1 px-2 py-5">
        {navItems.map((item) => {
          const isActive = currentStage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setStage(item.id as any)}
              className={`relative flex w-full items-center justify-between rounded-md px-3 py-3 text-left transition-colors ${
                isActive ? 'bg-[#f1e6d4] text-[#b74608]' : 'text-[#40372f] hover:bg-[#f6eee2]'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <item.icon className={`h-4 w-4 shrink-0 ${isActive ? 'text-[#c4510c]' : 'text-[#6f6257]'}`} />
                <span className="truncate text-[13px] font-medium">{item.label}</span>
              </span>
              <span className={`ml-2 shrink-0 text-[10px] ${isActive ? 'text-[#b74608]' : 'text-[#9b8c7e]'}`}>{item.sub}</span>
            </button>
          );
        })}
      </nav>

      <div className="border-t border-[#e6ddd1] p-4">
        <button onClick={onOpenSettings} className="flex w-full items-center justify-between text-[11px] text-[#75685c] transition-colors hover:text-[#c4510c]">
          <span>系统设置</span>
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
