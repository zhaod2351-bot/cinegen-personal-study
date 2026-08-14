import React, { useMemo, useState } from "react";
import { BarChart3, CheckCircle, Clock, Download, FileJson, Film, Layers, Share2 } from "lucide-react";
import { ProjectState } from "../types";

interface Props {
  project: ProjectState;
  updateProject: (updates: Partial<ProjectState>) => void;
}

const downloadJson = (filename: string, data: unknown) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const StageExport: React.FC<Props> = ({ project }) => {
  const [notice, setNotice] = useState("");
  const completedShots = project.shots.filter((shot) => shot.interval?.videoUrl);
  const totalShots = project.shots.length;
  const progress = totalShots ? Math.round((completedShots.length / totalShots) * 100) : 0;
  const estimatedDuration = project.shots.reduce((sum, shot) => sum + (shot.interval?.duration || 3), 0);
  const title = project.scriptData?.title || project.title || "未命名项目";
  const characters = project.scriptData?.characters || [];
  const locations = project.scriptData?.scenes || [];
  const props = project.scriptData?.props || [];

  const manifest = useMemo(() => ({
    schemaVersion: 1,
    project: { id: project.id, title: project.title, targetDuration: project.targetDuration },
    script: project.scriptData,
    characters,
    locations,
    props,
    shots: project.shots,
    directorClips: project.directorClips,
    storyboardVersions: project.storyboardVersions,
    exportedAt: new Date().toISOString(),
  }), [characters, locations, project, props]);

  const exportManifest = () => downloadJson(`${title}-导演工程.json`, manifest);
  const exportAssets = () => downloadJson(`${title}-资产清单.json`, { characters, locations, props });

  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setNotice("当前个人版链接已复制；项目数据仍保存在本地浏览器。");
    } catch {
      setNotice("浏览器未授予剪贴板权限，请从地址栏复制当前链接。");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fffdf9] text-[#2d261f]">
      <header className="flex h-[82px] shrink-0 items-center justify-between border-b border-[#ded5c8] px-7">
        <div>
          <h2 className="flex items-center gap-2 text-[20px] font-bold"><Film className="h-5 w-5 text-[#c4510c]" />成片与导出</h2>
          <p className="mt-1 text-xs text-[#8d7e70]">汇总镜头、故事板、视频和资产，导出可继续编辑的导演工程。</p>
        </div>
        <span className="rounded-md border border-[#ded5c8] bg-[#fbf7ef] px-3 py-1.5 text-xs">状态：{progress === 100 ? "已就绪" : "制作中"}</span>
      </header>

      <div className="flex-1 overflow-y-auto p-7">
        <div className="mx-auto max-w-[1180px] space-y-6">
          {notice && <div className="rounded-lg border border-[#e7c9aa] bg-[#fff5e8] px-4 py-3 text-sm text-[#9d430c]">{notice}</div>}
          <section className="rounded-xl border border-[#ded5c8] bg-white p-7 shadow-[0_8px_26px_rgba(80,55,30,0.05)]">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-5">
              <div>
                <div className="mb-2 flex items-center gap-3"><h3 className="text-2xl font-bold">{title}</h3><span className="rounded bg-[#f3eadc] px-2 py-1 text-[10px] text-[#7f6d5d]">主序列</span></div>
                <div className="flex gap-6 text-sm text-[#6f6257]"><span>镜头 <b className="ml-1 text-[#2d261f]">{totalShots}</b></span><span>预计时长 <b className="ml-1 text-[#2d261f]">{estimatedDuration} 秒</b></span><span>目标时长 <b className="ml-1 text-[#2d261f]">{project.targetDuration}</b></span></div>
              </div>
              <div className="min-w-[150px] rounded-lg bg-[#fbf7ef] p-4 text-right"><div className="text-3xl font-bold text-[#c4510c]">{progress}<span className="text-sm">%</span></div><div className="mt-1 flex items-center justify-end gap-1.5 text-[11px] text-[#8d7e70]">{progress === 100 ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600" /> : <BarChart3 className="h-3.5 w-3.5" />}视频完成度</div></div>
            </div>
            <div className="mb-7"><div className="mb-2 flex justify-between text-[11px] text-[#8d7e70]"><span>镜头时间线</span><span>TC 00:00:00:00</span></div><div className="flex h-20 items-center gap-1 overflow-x-auto rounded-lg border border-[#e7ded2] bg-[#fbf7ef] p-2">{totalShots === 0 ? <div className="w-full text-center text-xs text-[#aa9b8c]">暂无镜头</div> : project.shots.map((shot, index) => <div key={shot.id} title={`镜头 ${index + 1}：${shot.actionSummary}`} className={`h-14 min-w-[18px] flex-1 rounded border ${shot.interval?.videoUrl ? "border-[#e4a36f] bg-[#f2c9a7]" : "border-[#ded5c8] bg-white"}`} />)}</div></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => setNotice(progress === 100 ? "视频合成 API 尚未配置；现有视频片段不会丢失。" : "请先完成全部镜头的视频生成。")} className={`flex h-12 items-center justify-center gap-2 rounded-lg border text-sm font-semibold ${progress === 100 ? "border-[#c4510c] bg-[#c4510c] text-white" : "border-[#ded5c8] bg-[#f5f0e9] text-[#a6988a]"}`}><Download className="h-4 w-4" />下载成片（MP4）</button>
              <button onClick={exportManifest} className="flex h-12 items-center justify-center gap-2 rounded-lg border border-[#cdbfae] bg-white text-sm font-semibold hover:bg-[#fbf7ef]"><FileJson className="h-4 w-4" />导出导演工程（JSON）</button>
            </div>
          </section>
          <section className="grid gap-4 md:grid-cols-3">
            <button onClick={exportAssets} className="flex min-h-[120px] flex-col items-start justify-between rounded-xl border border-[#ded5c8] bg-white p-5 text-left hover:border-[#c4510c]"><Layers className="h-5 w-5 text-[#c4510c]" /><span><b className="block text-sm">源资产清单</b><small className="mt-1 block text-[#8d7e70]">下载角色、场景、道具和参考图信息。</small></span></button>
            <button onClick={copyShareLink} className="flex min-h-[120px] flex-col items-start justify-between rounded-xl border border-[#ded5c8] bg-white p-5 text-left hover:border-[#c4510c]"><Share2 className="h-5 w-5 text-[#c4510c]" /><span><b className="block text-sm">分享当前页面</b><small className="mt-1 block text-[#8d7e70]">复制个人版地址，并明确本地数据边界。</small></span></button>
            <button onClick={() => setNotice(`当前有 ${completedShots.length} 个镜头包含视频，${totalShots - completedShots.length} 个待生成。`)} className="flex min-h-[120px] flex-col items-start justify-between rounded-xl border border-[#ded5c8] bg-white p-5 text-left hover:border-[#c4510c]"><Clock className="h-5 w-5 text-[#c4510c]" /><span><b className="block text-sm">制作记录</b><small className="mt-1 block text-[#8d7e70]">查看当前工程的视频完成情况。</small></span></button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default StageExport;
