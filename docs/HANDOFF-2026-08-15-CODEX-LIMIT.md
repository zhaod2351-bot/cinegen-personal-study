# CineGen 完整开发交接（Codex 额度切换，2026-08-15）

## 0. 给下一个 Codex 的一句话

继续开发 Windows 本机版 CineGen AI 漫剧工作台。当前主流程已经可以完成“剧本分析 → 人物/场景/道具资产 → 图片生成 → 导演台故事板”，文本与图片均通过用户的 OpenAI 兼容中转站调用；请先读取本文件并执行第 12 节的接手检查，不要重做已完成内容，不要索要或输出 API Key。

## 1. 用户当前目标与沟通习惯

- 用户不是程序员，回答必须使用容易理解的中文，先讲结果，再讲原因。
- 用户正在亲自用真实 API 测试网站，发现问题会用截图连续反馈。
- 当前重点是个人版完整生产串联、资产一致性、图片生成可靠性和易用性，不是追求与原版逐像素一致。
- 用户授权正常开发、测试、提交和发布；真实付费图片调用只由用户在网页上自行触发，自动化测试不得调用付费接口。
- 不得让用户把完整 API Key 发到聊天。所有 Key 均通过本机设置中心保存。

## 2. 仓库、分支与发布

```text
仓库：D:\Documents\ChatGPT\AI对接网站\CineGen-source\CineGen-ShortDrama-main
分支：main
远端：https://github.com/zhaod2351-bot/cinegen-personal-study.git
线上静态页：https://zhaod2351-bot.github.io/cinegen-personal-study/
本机完整功能页：http://localhost:3000
本地 API：http://127.0.0.1:8787
```

交接时最新本地提交：

```text
0b46945 feat: archive and download real PNG images
```

交接开始时本地 `main` 比 `origin/main` 超前 1 个提交；原因是 GitHub 网络间歇连接失败。完成本文后应再次 `git push`，并记录最终结果。

重要区别：GitHub Pages 只有静态前端，不能安全保存 Key、运行 Express、调用 DPAPI 或完成本机素材归档。用户日常真正使用的地址必须是 `http://localhost:3000`。

## 3. 一键启动与停止

用户正常启动：双击仓库根目录：

```text
一键启动CineGen.cmd
```

脚本会：

1. 检查 Node.js 和 npm。
2. 首次自动安装依赖。
3. 启动 `npm run dev:local`。
4. 等待本地会话 API 就绪。
5. 自动打开 `http://localhost:3000`。

手动启动：

```powershell
cd 'D:\Documents\ChatGPT\AI对接网站\CineGen-source\CineGen-ShortDrama-main'
npm install
npm run dev:local
```

两个黑色窗口的含义：外层是启动器，内层是 Vite 前端和 Express 后端日志。正常使用时不要关闭本地服务窗口。停止服务可关闭服务窗口或在其中按 `Ctrl+C`。

后端代码或原生依赖（例如 `sharp`）更新后，若热更新没有生效，应关闭启动窗口并重新双击一键启动。

## 4. 网站使用手册（给用户）

### 4.1 系统设置

进入项目后，点击左下角“系统设置”。文本和图片供应商独立配置：

- Base URL：中转站 OpenAI 兼容地址，通常以 `/v1` 结尾。
- 模型名称：文本当前使用 `gpt-5.6-sol`，图片当前使用 `gpt-image-2`。
- API Key：粘贴后先保存，再测试连接。
- Key 保存后只显示脱敏摘要，不会回填明文。

当前运行中的非敏感配置：

```text
中转站：星空无穷科技
文本 Base URL：https://www.xkwuai.cn/v1
文本模型：gpt-5.6-sol
图片 Base URL：https://www.xkwuai.cn/v1
图片模型：gpt-image-2
文本/图片 Key：均已保存（不要读取、复制或记录完整 Key）
```

设置文件：

```text
%LOCALAPPDATA%\CineGen\ai-settings.json
```

Key 使用 Windows DPAPI CurrentUser 加密，只能由同一 Windows 用户解密。

### 4.2 剧本与故事

1. 输入剧情。
2. 顶部选择中转站与文本模型。
3. 点击“AI 剧本分析”。
4. AI 输出润色剧本、人物、场景、道具、剪辑和镜头。
5. 检查后点击“确认并锁定剧本”或进入工作台。

“3分钟”等项目时长现在只是偏好，不再锁死。AI按剧情、对白、动作和节奏估算镜头秒数；导演台顶部会显示实际镜头总时长。每个镜头点击“编辑”可手动改秒数。

当前人物已有固定技能时，重新分析会向大语言模型发送：人物名、技能名、简短技能说明。不发送很长的“技能视觉参考”和技能图片。图片与长视觉说明留给图片模型使用。

### 4.3 设计与资产

- 分为角色、场景、道具。
- 每张图可选择比例和 1K/2K/4K。
- 当前中转站实际测试：1K成功；2K多次返回 HTTP 502，说明中转站2K线路暂不稳定。先用1K，不要同时大量生成。
- 图片生成是逐资产独立任务，可同时切换其他资产；按钮状态按资产隔离。
- 生成任务会持久化，刷新或断网后重新打开会恢复轮询。
- 图片悬浮操作包括查看大图、下载PNG、上传/替换、删除图片。
- 上传图片使用 `object-contain`，保持等比完整显示。

场景连续性字段：时间、天气、光线、色卡。AI拆解时填写；用户可编辑；后续图片提示词会带入，用于同一天场景一致性。

场景“标签”已从图片提示权重中移除，界面保留的天气/光线/色卡不受影响。场景备注和视觉参考仍会参与图片生成。

### 4.4 固定角色与技能

- 人物有性别、年龄、身高、体重、备注、视觉参考。
- 人物可通过右上角更多菜单“加入固定资产库”。固定库保存人物长相、资料、技能和技能图，之后可导入其他剧情。
- 固定技能包括：技能名、技能说明、技能视觉参考、技能参考图。
- 技能图片支持上传/替换、查看大图、下载PNG和删除。
- 技能视觉参考默认宽框，可滚动；右上角可“放大/缩回”。
- 技能说明是传给大语言模型的简短事实；技能视觉参考与技能图是传给图片模型的详细视觉约束。

### 4.5 导演工作台

- 左栏：剪辑列表。
- 中栏：镜头列表，可编辑标题、景别、动作、时长、运镜、提示词和音频。
- 右栏：故事板版本和未来视频入口。
- 三栏现在各自支持鼠标滚轮，标题固定。
- 生成故事板时会带入当前镜头关联的人物、场景、道具参考图，以及人物技能参考图和技能文字。
- 过大的参考图会在发送前自动压缩副本，总量控制在服务器安全限制内；资产库原始2K/4K图不被修改。

视频 API 尚未接入，按钮只显示说明，不要宣称视频生成功能已完成。

### 4.6 图片保存与本地目录

素材根目录：

```text
D:\AI动画创作素材
```

故事板按以下结构归档：

```text
D:\AI动画创作素材\项目名\场景名\故事板\v版本\故事板.png
D:\AI动画创作素材\项目名\场景名\故事板\v版本\生成信息.json
```

新代码要求中转站返回 PNG，并使用 `sharp` 检测真实内容；如果实际返回 WebP/JPEG，会重新编码为真正PNG再归档。网页“下载 PNG”也会将旧WebP/JPEG图片通过浏览器 Canvas 转成真实PNG，不能只改后缀。

## 5. 当前技术结构

```text
前端：React 19 + TypeScript + Vite + Tailwind样式
本地后端：Express 5，默认 127.0.0.1:8787
AI SDK：OpenAI SDK 7.4.0
数据校验：Zod
PNG转换：sharp 0.35.3
项目数据：浏览器 IndexedDB
任务记录：%LOCALAPPDATA%\CineGen\jobs\jobs.json
密钥设置：%LOCALAPPDATA%\CineGen\ai-settings.json（DPAPI）
生成素材：D:\AI动画创作素材
```

关键文件：

```text
App.tsx                              页面与阶段路由
components/StageScript.tsx           剧本分析与计划应用
components/StageAssets.tsx           资产、图片任务、固定库、技能库
components/StageDirector.tsx         导演台、分镜、故事板任务
components/AiSettingsDialog.tsx      AI设置中心
components/Sidebar.tsx               项目侧栏
services/aiApiService.ts              前端任务API
services/aiSettingsService.ts         前端设置API
services/storageService.ts            IndexedDB与固定资产库
server/app.ts                          Express路由、请求边界与本机会话
server/openaiGateway.ts                文本/图片中转调用、参考图上传、PNG转换
server/jobs/jobRunner.ts               后台任务执行
server/jobs/jobStore.ts                jobs.json持久化
server/storage/archive.ts              D盘版本化归档
server/prompts/directorPlanPrompt.ts    大语言模型拆解规则
server/prompts/storyboardPrompt.ts      六格故事板提示词
server/prompts/assetReferencePrompt.ts  单资产参考图提示词
server/settings/aiSettingsStore.ts      设置与DPAPI存储
```

## 6. 本机会话与安全边界

- Vite与Express仅监听回环地址。
- `/api` 要求本地Host/Origin和随机内存会话token。
- Key不进入浏览器 localStorage、IndexedDB、项目JSON、Git或前端构建产物。
- 错误信息经过清洗，不能泄漏Key和完整提示词。
- 第三方中转站会接触剧本、提示词和参考图片，用户已经在界面看到隐私提示。
- 不要把本机API暴露到局域网或公网。

## 7. 近期已完成的重要提交

```text
0b46945 feat: archive and download real PNG images
3eec6e5 fix: retry Windows job file replacement
9c7423d fix: compact storyboard reference images
f5d0317 feat: include fixed skill summaries in story analysis
cf10a22 ui: expand skill visual reference editor
6c49b12 fix: restore director workspace scrolling
b08490c ui: hide legacy script import navigation
152f61d fix: let AI estimate story duration
9f4e1f4 fix: keep asset filter counts on one line
96e2cd4 fix: keep skill image actions visible
6a86569 feat: add reusable fixed character library
2aa0d32 feat: add full skill image management
8734e0e fix: expand long-form skill descriptions
9a3183d feat: add persistent character skills and profiles
1508b5e refactor: remove asset tags from image prompting
3500a57 fix: allow commas while editing asset tags
6b5d5f2 feat: add per-asset image size controls
1354af8 fix: preserve character identity across reanalysis
8e37bae feat: lock scene lighting and weather continuity
9528657 fix: make asset status notice nonblocking
```

更早的AI设置中心、安全会话、任务恢复、重试和参考图管线请阅读：

```text
docs/HANDOFF-2026-08-15-ACCOUNT-SWITCH.md
docs/openai-local-setup.md
```

## 8. 最近实测问题与结论

### 8.1 中转站2K失败

用户实测1K成功，2K失败。jobs记录显示2K场景任务到65%后中转站返回 `Image provider request failed (HTTP 502)`。同一配置下1K成功，证明API Key、Base URL、模型名和网站主链路正常。不要把2K 502误判为本地前端错误。

建议：先单张1K；不并行；2K稍后重试或更换稳定线路。真实失败可能仍计费，需要用户查看中转站账单。

### 8.2 Windows EPERM rename

并发任务写 `%LOCALAPPDATA%\CineGen\jobs\jobs.json` 时出现 `EPERM rename`。提交 `3eec6e5` 已加入Windows临时文件占用重试与备用覆盖写入。若旧进程未热重载，重启一键启动。

### 8.3 参考图过大

导演台报 `assets: reference images are too large`。提交 `9c7423d` 已在发送故事板前将大图副本压缩到约1.5MB/张，最多8张，总量小于8MB。原图不变。

### 8.4 PNG只有图标、不能预览

原因是中转站可能忽略 `output_format`，返回WebP内容但文件扩展名被写成PNG。提交 `0b46945` 增加 `sharp` 真实转码，并将归档改为 `故事板.png`。该提交增加新依赖，必须 `npm install` 并重启后端后验证。

旧的错误扩展名文件不会自动修复；应重新生成，或在网页资产库通过“下载 PNG”转换保存。

## 9. 当前仍需优先完成/验证的工作

1. **必须真实验证PNG**：重启一键启动后生成一张1K图片，确认：
   - `D:\AI动画创作素材\...\故事板.png` 在Windows资源管理器显示缩略图；
   - 双击可直接打开；
   - 文件头为 `89 50 4E 47 0D 0A 1A 0A`；
   - 网页“下载 PNG”保存的也是可预览PNG。
2. **改进资产失败提示**：当前错误toast约8秒后消失。应在图片占位区持久显示失败原因与“重试”按钮，特别是HTTP 502和2K失败。
3. **中转站分辨率能力**：星空无穷科技1K已成功，2K多次502。可在设置或分辨率选择处提示“当前线路2K可能不稳定”，但不要永久禁用，避免服务恢复后无法使用。
4. **PNG体积与参考图上限**：PNG可能比WebP大。生成后再次用于分镜时，前端会压缩发送副本，仍应实测多人物+技能图场景。
5. **完整串联回归**：新建短剧情 → 分析 → 确认 → 生成角色/场景1K → 导演台故事板 → 刷新恢复 → 下载PNG。
6. **GitHub推送**：若交接时仍超前远端，网络恢复后执行 `git push`。
7. 视频生成仍未接入，不要提前实现或宣称完成，除非用户明确提出规格。

## 10. 测试与构建命令

```powershell
cd 'D:\Documents\ChatGPT\AI对接网站\CineGen-source\CineGen-ShortDrama-main'
npm install
npm test -- --run
npx tsc --noEmit
npm run build
npm run build:pages
git diff --check
```

自动化测试使用模拟中转站，不产生真实费用。真实图片测试只能由用户在本机页面触发。

交接时最终验证结果：

```text
Vitest：24 个测试文件，176 项测试全部通过
TypeScript：npx tsc --noEmit 通过
本地构建：npm run build 通过
Pages构建：npm run build:pages 通过
git diff --check：通过（仅有Windows换行提示）
```

## 11. 关于AI2D交接技能

本次按 `C:\Users\Administrator\.codex\skills\ai2d-storyboard-studio\SKILL.md` 尝试读取以下外部智能体库，但路径均不存在：

```text
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\START-NEW-CHAT.md
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\当前项目状态.md
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\AGENT目录路由表.md
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\团队总配置.yaml
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\Agent技能与工作范围总览.md
D:\Documents\ChatGPT\AI2D动漫项目\智能体技能库\学习更新中心\审核日志.md
```

因此本交接以当前CineGen仓库、运行状态和Git证据为准。下一个Codex不要因为这些外部文件缺失而停止CineGen开发。

## 12. 下一个 Codex 接手后的第一步

严格按顺序执行：

1. 阅读本文件、`docs/HANDOFF-2026-08-15-ACCOUNT-SWITCH.md`、`docs/openai-local-setup.md`。
2. 检查状态：

```powershell
git status --short --branch
git log -10 --oneline
git rev-list --left-right --count origin/main...HEAD
```

3. 不要reset、checkout或删除用户数据。
4. 若依赖刚更新，执行 `npm install`。
5. 运行第10节全量验证。
6. 检查本地健康：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

7. 让用户关闭并重新打开一键启动，然后由用户生成一张1K图片，完成第9节PNG真实验证。
8. PNG验证通过后，优先实现“持久失败提示+重试”，再继续用户的新截图反馈。

## 13. 禁止事项

- 不要读取、展示、记录或提交完整 API Key。
- 不要把 Key 写入 `.env` 后提交。
- 不要自动发起真实付费API调用。
- 不要删除 `%LOCALAPPDATA%\CineGen`、浏览器项目数据或 `D:\AI动画创作素材`。
- 不要把GitHub Pages当作完整本地应用。
- 不要为了修复失败任务清空整个jobs文件；任务恢复与历史版本依赖它。
- 不要把WebP只改后缀为PNG，必须真实转码。
