# OpenAI 兼容服务本地接入

个人学习版通过本机 Express 服务配置和调用 OpenAI 兼容的文本、图片服务：文本用于分析和导演台数据，图片用于故事板。文本与图片是两套独立配置，各自拥有 Base URL、模型名和 API Key。

## 1. 运行位置与安全边界

AI 设置中心及保存/测试 Key 的 API 只随 Windows 本机服务运行：使用 `npm run dev:local` 开发，或使用 `npm run start:local` 运行已构建前端。服务默认仅监听 `127.0.0.1:8787`。

GitHub Pages 只能托管静态前端文件，**不托管 Express API、DPAPI 或任何 Key 保存服务**。若从 Pages 打开网页而未连接到本机服务，设置中心无法保存或测试 Key，也不能发起本地 AI 任务；请在同一台 Windows 电脑上启动本机服务并打开其本地页面。

密钥不会写入浏览器 localStorage、IndexedDB、项目数据或前端构建产物。点击“保存设置”后，本机服务使用 Windows DPAPI 的 `CurrentUser` 作用域加密密钥，并写入：

```text
%LOCALAPPDATA%\CineGen\ai-settings.json
```

这意味着只有保存密钥的同一 Windows 用户可以解密它；复制该文件到其他用户或电脑通常无法使用。非 Windows 系统或 DPAPI 不可用时，服务不会降级为明文保存密钥。

## 2. 可选的环境默认值

复制 `.env.example` 为 `.env`，可为没有已保存配置的首次本机启动提供独立默认值：

```dotenv
OPENAI_TEXT_API_KEY=
OPENAI_IMAGE_API_KEY=
OPENAI_TEXT_BASE_URL=https://api.openai.com/v1
OPENAI_IMAGE_BASE_URL=https://api.openai.com/v1
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2
AI_ASSET_ROOT=D:\AI动画创作素材
AI_SERVER_HOST=127.0.0.1
AI_SERVER_PORT=8787
```

- `OPENAI_TEXT_*` 与 `OPENAI_IMAGE_*` 相互独立；不要把“共享浏览器 Key”放到前端代码或浏览器存储中。
- 环境变量只是首次启动、且尚未存在本机设置文件时的后端回退。之后在设置中心保存的配置会优先使用，并在下一个新任务立即生效，无需重启。
- `.env` 已被 Git 忽略；不要提交、粘贴或截图真实密钥。

## 3. 启动与设置

```powershell
npm install
npm run dev:local
```

浏览器打开 `http://localhost:5173`，在左下角或顶部的“系统设置”打开 AI 设置中心：

1. 分别填写文本模型和图片生成模型的 Base URL、模型名以及对应 API Key。
2. 可先使用“测试连接”；临时输入的 Key 只用于本次测试，不会因此保存。
3. 使用“保存设置”记住该区域的配置。界面只显示密钥掩码，绝不回填密钥原文。
4. 使用“清除 Key”只删除当前区域的已保存密钥；另一类服务的 Key 和两个区域的 Base URL/模型名不会受影响。清除后若已有设置文件，该 Key 不会自动从 `.env` 重新载入。

生产本地运行（先执行一次 `npm run build`）可使用：

```powershell
npm run start:local
```

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

## 4. 隐私、费用与排查

- 使用第三方 OpenAI 兼容中转服务时，剧本、提示词和图片参考资料会发送给该服务。请自行评估其隐私、数据保留、合规和地域要求。
- API 调用按服务商规则另行计费，ChatGPT 订阅不等于 API 余额。图片连接测试也可能产生计费；请在账户与中转服务侧确认费用规则。
- 本项目的自动化验证不执行真实的付费 OpenAI 或中转服务调用。请仅在完成本机设置并自行提供有效凭据后进行真实生成。
- 显示“本地 AI 服务离线”时，确认 `npm run dev:local` 或 `npm run start:local` 仍在运行；401 通常表示 Key 无效，429 通常表示余额或速率限制问题。
