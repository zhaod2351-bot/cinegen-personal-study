# AI 设置中心设计

日期：2026-08-14  
状态：已确认

## 目标

为 CineGen 个人学习版增加统一的网页 AI 设置中心，让用户在不接触 `.env` 的情况下配置 OpenAI 兼容的文本与图片服务。两类服务使用各自的 API Key，并可独立设置 Base URL 和模型名。视频模型本期不接入，只显示未来扩展入口。

设置中心取代现有 Gemini 浏览器密钥入口。密钥不得进入 localStorage、IndexedDB、项目 JSON、前端构建产物、日志或 Git；需要记住时，仅由本机后端使用 Windows 当前用户绑定的 DPAPI 加密后持久化。

## 范围

本期包含：

- 左下角“系统设置”打开完整 AI 设置弹窗。
- 文本模型和图片模型的独立配置、保存、测试连接和清除密钥。
- 保存后新任务立即使用最新配置，无需重启服务。
- 将旧 Gemini 密钥入口、相关 React 状态和 `cinegen_api_key` localStorage 读写全部移除。
- 保留环境变量作为首次启动默认值或无持久化配置时的后端回退，但后端配置不得再要求文本与图片共用一枚 Key。
- 视频模型显示“暂未配置”，控件禁用，不创建视频配置 API。

本期不包含：

- 真实视频生成模型接入。
- 云端账号同步或多人共享设置。
- 在项目导出中携带 AI 服务配置。
- 自动探测第三方中转站支持的模型列表。

## 用户界面

设置弹窗分为三个区域。

### 大语言模型

- 服务类型固定显示“OpenAI 兼容”。
- API Base URL，可填写官方或第三方兼容地址。
- 模型名称，默认继承后端配置 `gpt-5.6-terra`。
- 独立 API Key，密码输入框支持显示/隐藏。
- “测试连接”“保存设置”“清除密钥”操作。
- 已保存时只显示后端返回的掩码和“已配置”状态，不把密钥原文回填到 DOM。

### 图片生成模型

- API Base URL，可与文本地址相同，但作为独立字段保存。
- 模型名称，默认 `gpt-image-2`。
- 与文本模型不同的独立 API Key。
- 与文本区域相同的显示/隐藏、测试、保存和清除体验。

### 视频生成模型

- 显示“暂未配置”。
- 区域及操作保持禁用，说明为未来扩展入口。

弹窗明确提示：第三方中转服务会收到剧本、提示词和图片参考资料，用户应自行判断其隐私与合规风险。

## 后端架构

### 设置模型

`server/settings/types.ts` 定义文本和图片两套运行时配置：

```ts
type ProviderSettings = {
  baseUrl: string;
  model: string;
  apiKey?: string;
};

type AiSettings = {
  text: ProviderSettings;
  image: ProviderSettings;
};
```

对外响应使用独立 DTO，只包含 `baseUrl`、`model`、`hasKey` 和可选 `keyMask`。任何 API 均不得序列化 `apiKey`。

### 加密适配器

`server/settings/windowsDpapi.ts` 提供窄接口：

```ts
interface SecretProtector {
  protect(plaintext: string): Promise<string>;
  unprotect(ciphertext: string): Promise<string>;
}
```

生产实现调用 Windows DPAPI 的 CurrentUser 作用域；测试使用可注入的 fake protector 验证存储行为。设置文件只保存 DPAPI 密文。解密失败时不得删除或覆盖文件，而是将对应密钥标记为不可用并返回可读错误。

若运行环境不是 Windows 或 DPAPI 不可用，非密钥字段仍可保存；“记住密钥”操作明确失败，绝不回退为明文存储。

### 设置存储

`server/settings/aiSettingsStore.ts` 负责：

- 从本地设置文件加载并解密配置。
- 用原子替换方式写入设置文件，避免半写入损坏。
- 对文本和图片密钥分别更新、保留和清除。
- 生成不泄密的掩码。
- 在没有已保存值时合并环境变量默认值。
- 为每个新 AI 任务提供当前运行时配置快照。

默认设置文件位于本机用户配置目录，不位于项目仓库或创作素材目录。日志只记录操作结果，不记录请求头、密钥、密文或完整第三方响应体。

### OpenAI 网关

`OpenAIGateway` 不再在应用启动时持有单个固定客户端。它从运行时设置提供器分别读取文本和图片配置：

```text
文本任务 -> text.baseUrl + text.apiKey + text.model
图片任务 -> image.baseUrl + image.apiKey + image.model
```

每个任务开始时读取一次配置快照，保证设置保存后后续任务立即生效，同时避免任务执行中途配置变化造成一次任务内混用。

## HTTP API

### `GET /api/settings/ai`

返回文本与图片的非敏感配置、`hasKey` 和掩码。绝不返回密钥原文或密文。

### `PUT /api/settings/ai`

按区域更新 Base URL、模型名和可选的新密钥。密钥字段省略表示保留原密钥，空字符串不隐式清除；清除必须调用专用 DELETE API。保存成功后返回与 GET 相同的安全 DTO。

### `DELETE /api/settings/ai/text-key`

仅清除文本密钥，不影响文本的 Base URL、模型名或图片配置。

### `DELETE /api/settings/ai/image-key`

仅清除图片密钥，不影响图片的 Base URL、模型名或文本配置。

### `POST /api/settings/ai/test-text`

使用当前表单提交的 Base URL、模型名和可选临时密钥进行最小文本请求；未提交临时密钥时使用已保存密钥。临时密钥只存在于该请求内存中，不落盘。

### `POST /api/settings/ai/test-image`

使用当前表单提交的配置执行兼容性检查。鉴于图片生成可能产生费用，界面必须明确提示测试可能计费；后端只执行最小可验证请求。未提交临时密钥时使用已保存密钥。

所有错误响应返回稳定的错误代码和经过清理的可读消息。第三方原始错误可以摘要呈现，但必须移除 Authorization、密钥、请求体中的剧本/提示词和完整图片数据。

## 前端数据流

打开弹窗时调用 GET，表单只接收非敏感配置、状态和掩码。密钥输入框初始为空；用户不输入新值即保留旧密钥。保存或测试时，密钥只通过 HTTPS/本机 HTTP 请求发往 `127.0.0.1` 后端，并在请求结束后从组件状态中清空。

前端服务封装位于 `services/aiSettingsService.ts`，弹窗位于 `components/AiSettingsDialog.tsx`。`App.tsx` 只管理弹窗开关，不持有全局密钥。现有 Gemini `apiKey`/`inputKey` 状态、`setGlobalApiKey` 调用、入口页和 localStorage 逻辑全部删除。

## 校验和错误处理

- Base URL 必须为 `http:` 或 `https:` URL；后端拒绝包含用户名或密码的 URL。
- 模型名去除首尾空白后不能为空。
- 新密钥去除意外的首尾空白，但不修改中间字符。
- 未配置相应密钥时，AI 任务和测试连接返回明确的“未配置”错误。
- 保存失败时保留用户表单内容并显示错误；不得把部分成功误报为整体成功。
- 测试连接失败不得改变已保存配置。
- AI 任务失败不得覆盖旧剧本、资产或故事板版本。

## 测试策略

实现采用 TDD，每个行为先写失败测试并确认因缺少功能而失败，再写最小实现。

后端至少覆盖：

- GET 响应不包含密钥原文或密文。
- 保存后返回正确掩码。
- 文本和图片任务分别使用各自的 Base URL、Key 和模型。
- 更新或清除一枚 Key 不影响另一枚。
- 存储实例重建后仍可通过 protector 解密。
- protector 解密失败不会破坏原设置文件。
- Base URL 和模型输入校验。
- 测试连接使用临时密钥但不持久化。
- 第三方错误清理后不泄露密钥或创作内容。

前端至少覆盖：

- 打开弹窗显示两套独立配置和禁用的视频区域。
- 已保存密钥只显示掩码，不回填密码框。
- 省略新密钥会保留已配置状态。
- 清除文本 Key 不触发图片 Key 清除。
- 保存或测试完成后清空密码输入状态。
- 不读取或写入 `cinegen_api_key`，并移除旧 Gemini 密钥入口。

最后运行全部 Vitest、TypeScript 类型检查和生产构建，并扫描源码及构建产物，确认没有测试密钥或真实密钥残留。

## 验收标准

- 用户可在系统设置中独立配置、测试、保存和清除文本/图片服务。
- 重启本地服务后，已记住的密钥仍可由同一 Windows 用户使用。
- 保存设置后，新任务无需重启即可使用新配置。
- 浏览器存储、项目数据、API 响应、日志和构建产物中均不存在密钥原文。
- 旧 Gemini/localStorage 密钥入口完全移除。
- 视频区域明确禁用，未引入虚假的可用能力。
- 自动化测试、类型检查和生产构建全部通过。
