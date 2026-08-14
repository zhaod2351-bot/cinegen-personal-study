# OpenAI 本地自动化接入

个人学习版支持完整自动化链路：GPT 分析并拆解剧本，生成可编辑的导演台数据，再由 `gpt-image-2` 生成六格故事板。API Key 只保存在本机后端，不会被打包进网页。

## 1. 配置

在项目根目录复制 `.env.example` 为 `.env`，然后填写：

```dotenv
OPENAI_API_KEY=你的_OpenAI_API_Key
OPENAI_TEXT_MODEL=gpt-5.6-terra
OPENAI_IMAGE_MODEL=gpt-image-2
AI_ASSET_ROOT=D:\AI动画创作素材
AI_SERVER_HOST=127.0.0.1
AI_SERVER_PORT=8787
```

- 文本模型可以替换成账户可用的其他 GPT 模型。
- 图片模型固定为 `gpt-image-2`。
- `.env` 已被 Git 忽略，不要把密钥提交到 GitHub。
- OpenAI API 与 ChatGPT Plus 分开计费，实际调用会消耗 API 余额。

## 2. 启动

```powershell
npm install
npm run dev:local
```

浏览器打开 `http://localhost:5173`。应用会显示本地 AI 服务、文本模型、图片模型和保存目录。

健康检查：

```powershell
Invoke-RestMethod http://127.0.0.1:8787/api/health
```

## 3. 使用流程

1. 在“剧本与故事”输入剧本并点击“AI 剧本分析”。
2. 核对人物、场景、道具、剪辑和镜头预览。
3. 点击“确认并锁定剧本”，数据会同步到资产库和导演工作台。
4. 进入导演工作台，为剪辑点击“生成新版本”。
5. 故事板会按版本保存；失败不会覆盖旧版本，可直接重试。

生成文件保存在：

```text
D:\AI动画创作素材\项目名称\场次名称\故事板\v1\故事板.webp
```

## 4. 停止与排查

- 在运行服务的终端按 `Ctrl+C` 停止。
- 显示“本地 AI 服务离线”时，确认 `npm run dev:local` 仍在运行。
- 返回 401 时检查 API Key；返回 429 时检查余额、速率限制并稍后重试。
- 模型不可用时，确认当前 OpenAI 账户拥有相应模型权限。
- 本地服务只监听 `127.0.0.1`，默认不会暴露给局域网或互联网。
