# CineGen 开发交接：账号切换暂停点（2026-08-15）

## 1. 暂停原因与硬性状态

用户因 Codex 额度用尽，要求立即停止并切换账号。所有运行中的实现/审查智能体已经中断；不要自动继续、不要清理工作树、不要发布。

工作树：

```text
D:\Documents\ChatGPT\AI对接网站\CineGen-source\CineGen-ShortDrama-main\.worktrees\openai-storyboard-pipeline
```

分支：

```text
feat/openai-storyboard-pipeline
```

当前 HEAD（暂停时）：

```text
f0951a1 fix: preserve storyboard versions and reference inputs
```

注意：HEAD 之后存在 8 个未提交文件，主要是下一批修复的 RED 测试和类型准备。它们是有意保留的中断现场，不得丢弃、reset、checkout 或覆盖。

## 2. 已完成并提交的 AI 设置中心

设计、实施计划和 7 个任务均已完成任务级审查。关键提交：

```text
c661ff7 docs: design AI settings center
03655e9 docs: plan AI settings center implementation
6f93721 feat: persist redacted AI settings
13c4591 fix: serialize AI settings changes
3a3220f feat: protect AI keys with Windows DPAPI
9345a71 fix: validate DPAPI stdout
29af925 feat: route AI jobs through independent providers
454f78a fix: secure runtime provider routing
03566e8 feat: expose secure AI settings API
f06b817 fix: secure settings API health and parsing
0128903 feat: add AI settings web client
486fdc8 test: expand AI settings client route coverage
3bdfd21 feat: add AI settings center dialog
4427ef9 fix: isolate AI provider settings interactions
25571e4 fix: stabilize AI settings modal lifecycle
d0e5093 docs: explain secure AI settings
```

在 `d0e5093` 时已有证据：20 个测试文件、96 项测试通过，TypeScript 和 Vite build 通过。之后整分支总审发现更深层跨模块问题，因此该旧证据不能代表当前中断工作树。

## 3. 整分支总审结论

总审范围：`main` merge-base `35f5fd0` 到 `d0e5093`。

完整 findings 保存在 gitignored 工作区：

```text
.superpowers/sdd/2026-08-15-ai-settings-center/final-review-findings.md
```

总审判定当时不可发布，最严重问题是：Vite 监听局域网并代理无鉴权本机 API，远端可修改 provider Base URL 后诱导已保存 Key 外传。

## 4. 集中修复波中已经完成的 3 个提交

暂停前已提交：

```text
08c9756 fix: restrict local AI API to loopback sessions
3134c64 fix: separate local and Pages production builds
f0951a1 fix: preserve storyboard versions and reference inputs
```

### `08c9756`

- Vite 固定监听回环地址。
- Express 配置拒绝非回环 Host。
- `/api` 增加 Host/Origin 校验。
- 浏览器使用仅内存保存的随机本机会话 token。
- token 不进入 localStorage 或构建时密钥。

当时聚焦验证为 5 个测试文件、44 项测试通过。

### `3134c64`

- 本地生产 build 使用根路径，能被 Express 正确托管。
- GitHub Pages 使用单独 `build:pages` 保持 `/cinegen-personal-study/` base。
- Pages workflow 已切换到 pages build。
- 增加本地构建产物经 Express 加载 JS/CSS 的黑盒测试。

### `f0951a1`

- 故事板归档不再静默覆盖同一版本，并改进原子提交。
- 严格生成六个故事板帧的规范化逻辑。
- 参考图 DTO/边界与 OpenAI `images.edit` 输入路径已开始/完成主要接入。
- 相关归档、网关、导演台和提示词测试已提交。

新账号必须先审查这三个提交，不要直接认为全部总审 findings 已解决。

## 5. 当前未提交文件（必须保留）

暂停时 `git status --short`：

```text
 M components/StageDirector.test.tsx
 M components/StageScript.test.tsx
 M server/app.test.ts
 M server/jobs/jobRunner.test.ts
 M server/jobs/jobStore.test.ts
 M server/settings/aiSettingsStore.test.ts
 M services/aiApiService.test.ts
 M types.ts
```

这些变更覆盖尚未实现或尚未完成的 RED 行为：

- 项目刷新后恢复故事板/导演计划任务轮询。
- 失败任务调用 retry API，而不是重新 POST 新任务。
- 只移除当前完成任务，不清空其他 active jobs。
- 轮询实时上报 10 → 55 → 100 进度。
- queued/in_progress 重启协调与 `JOB_INTERRUPTED`。
- 只有 failed 任务可重试，其他状态返回 409。
- DPAPI 单个 provider 解密失败时，另一 provider 和非敏感设置仍可用。
- AI 再分析保留人工编辑的人物/场景/道具字段，并引入字段 provenance 类型。

因为生产实现尚未配套，当前测试很可能失败。不要把这些测试提交为“通过”，也不要删除；继续 TDD，从当前 RED 状态实现。

## 6. 尚未完成的总审问题

以 `final-review-findings.md` 为准，至少还包括：

1. AI 再分析保留人工字段/provenance（已有未提交 RED 测试）。
2. 持久化任务恢复、失败态重试、进度恢复（已有未提交 RED 测试）。
3. 单个 DPAPI Key 解密失败的降级行为（已有未提交 RED 测试）。
4. 每个逻辑任务只捕获一次 provider 设置快照；OpenAI SDK 设置 `maxRetries: 0`，避免最多 9 次调用。
5. 请求体、脚本、数组、Shot、并发队列和第三方图片下载的大小/超时/SSRF 边界。
6. 导演计划跨类别同名、Clip ID、Shot ID 唯一性与一次格式修复。
7. `.env.example` 中空 Key 应被规范化为 `undefined`。
8. jobs 移到 `%LOCALAPPDATA%\CineGen\jobs`，并忽略旧 `.cinegen-ai/`。
9. 端口文档统一、测试失败后临时 Key 清空、动态 health 图片模型类型、diff whitespace。

参考图能力审计已经确认：当前 OpenAI SDK 7.4.0 支持 `gpt-image-2` 的 `images.edit`、最多 16 个 `Uploadable`，可通过 `toFile(Buffer, ...)` 构建 multipart；第三方中转站是否兼容 `/images/edits` 仍需实际配置后验证，不能静默退化成纯文本生图。

## 7. 新账号的第一步

1. 阅读本文件、原交接、两份设计规格和 `final-review-findings.md`。
2. 运行：

```powershell
git status --short --branch
git log -8 --oneline
git diff --stat
```

3. 先运行当前聚焦 RED 测试，记录哪些按预期失败；不要立即修改测试：

```powershell
& 'E:\新建文件夹 (2)\npm.cmd' test -- --run components/StageDirector.test.tsx components/StageScript.test.tsx server/app.test.ts server/jobs/jobRunner.test.ts server/jobs/jobStore.test.ts server/settings/aiSettingsStore.test.ts services/aiApiService.test.ts
```

4. 按 TDD 分小提交实现当前未提交测试。
5. 完成剩余 findings 后运行整套验证、重新整分支审查，再决定合并/发布。

## 8. 发布状态

- 尚未发布本轮新代码。
- 尚未推送当前功能分支。
- 尚未合并到 `main`。
- 当前 GitHub Pages 仍是旧个人版静态页面。
- 不要在当前中断状态发布：工作树有未完成 RED 测试，整分支总审尚未清零。
- GitHub Pages 只能发布静态前端；安全 Express/DPAPI API 必须在用户 Windows 本机回环地址运行。

## 9. 安全提醒

- 不要让用户把 API Key 发到聊天、Git、Pages、项目 JSON 或浏览器持久化存储。
- 不要执行真实付费文本/图片调用，除非用户通过完成后的本机设置中心自行配置并明确要求测试。
- 不要绕过 AniKuku 的付费或私有能力；两个网页标签只用于合法的界面/按钮流程对照。
