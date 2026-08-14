# AI Settings Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure web settings center for independent OpenAI-compatible text and image providers, with Windows DPAPI persistence and no browser-stored secrets.

**Architecture:** A focused `AiSettingsStore` owns validated public settings and encrypted secrets, while a runtime provider supplies one immutable text/image snapshot per AI job. Express exposes redacted CRUD/test endpoints, React renders a modal with ephemeral password state, and the legacy Gemini/localStorage key path is removed.

**Tech Stack:** TypeScript 5.8, Node.js, Express 5, React 19, OpenAI SDK 7, Zod 4, Vitest 4, Testing Library, Windows PowerShell DPAPI.

## Global Constraints

- Text and image providers have independent Base URLs, model names, and API keys.
- Default text model is `gpt-5.6-terra`; default image model is `gpt-image-2`.
- Secrets never enter localStorage, IndexedDB, project JSON, API responses, logs, Git, or frontend bundles.
- Remembered secrets use Windows DPAPI CurrentUser scope; never fall back to plaintext.
- New jobs use newly saved settings without restarting the server, while each job uses one immutable settings snapshot.
- Video generation remains disabled and has no backend configuration API.
- Every behavior follows RED → verify failure → GREEN → verify pass → refactor.

---

### Task 1: Validated AI settings model and encrypted store

**Files:**
- Create: `server/settings/types.ts`
- Create: `server/settings/aiSettingsStore.ts`
- Test: `server/settings/aiSettingsStore.test.ts`

**Interfaces:**
- Consumes: `SecretProtector` from Task 2; begin with an inline structural type so Task 1 remains testable.
- Produces: `AiSettingsStore.getPublicSettings()`, `getRuntimeSettings()`, `update()`, `clearKey()` and the exact DTOs used by Tasks 3–5.

- [ ] **Step 1: Write failing store tests**

Create fixtures using `mkdtemp`, a reversible fake protector, and literal expected DTOs. Cover: redaction, independent keys, omitted key preservation, one-key clearing, restart/decryption, invalid URL credentials, empty model, and failed decryption preserving the settings file.

```ts
expect(await store.getPublicSettings()).toEqual({
  text: { baseUrl: "https://text.example/v1", model: "text-model", hasKey: true, keyMask: "sk-****3456" },
  image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", hasKey: true, keyMask: "im-****cdef" },
});
expect(JSON.stringify(await store.getPublicSettings())).not.toContain("sk-text-123456");
await store.clearKey("text");
expect((await store.getRuntimeSettings()).image.apiKey).toBe("im-image-abcdef");
```

- [ ] **Step 2: Run the new test and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run server/settings/aiSettingsStore.test.ts`

Expected: FAIL because `AiSettingsStore` and its types do not exist.

- [ ] **Step 3: Implement the minimal model and store**

Define `ProviderSettingsInput`, `PublicProviderSettings`, `RuntimeProviderSettings`, `PublicAiSettings`, and `RuntimeAiSettings`. Validate URLs with `new URL`, allow only `http:`/`https:`, reject credentials, trim models and new keys, persist `{ version: 1, text: { baseUrl, model, protectedKey? }, image: ... }`, and atomically rename a sibling temporary file.

```ts
export class AiSettingsStore {
  constructor(options: { filePath: string; protector: SecretProtector; defaults: RuntimeAiSettings });
  getPublicSettings(): Promise<PublicAiSettings>;
  getRuntimeSettings(): Promise<RuntimeAiSettings>;
  update(input: AiSettingsUpdate): Promise<PublicAiSettings>;
  clearKey(kind: "text" | "image"): Promise<PublicAiSettings>;
}
```

- [ ] **Step 4: Verify GREEN and commit**

Run the Task 1 test, then run `git diff --check`.

Commit:

```powershell
git add server/settings/types.ts server/settings/aiSettingsStore.ts server/settings/aiSettingsStore.test.ts
git commit -m "feat: persist redacted AI settings"
```

### Task 2: Windows CurrentUser DPAPI adapter

**Files:**
- Create: `server/settings/windowsDpapi.ts`
- Test: `server/settings/windowsDpapi.test.ts`

**Interfaces:**
- Produces: `SecretProtector` and `WindowsDpapiProtector` consumed by `AiSettingsStore` and server assembly.

- [ ] **Step 1: Write failing adapter tests**

Inject a command runner so the test exercises encoding, command arguments, non-Windows rejection, and sanitized failure messages without requiring a second Windows account.

```ts
const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });
expect(await protector.unprotect(await protector.protect("sk-secret"))).toBe("sk-secret");
expect(runPowerShell).toHaveBeenCalledWith(expect.not.stringContaining("sk-secret"));
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run server/settings/windowsDpapi.test.ts`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement the minimal adapter**

Pass plaintext to a hidden `powershell.exe -NoProfile -NonInteractive` child process through stdin, use `[Security.Cryptography.ProtectedData]::Protect/Unprotect(..., CurrentUser)`, and exchange only Base64 on stdout. Reject non-Windows platforms with `DPAPI is only available on Windows`; cap stderr included in errors and never include stdin.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 2 tests plus Task 1 tests.

```powershell
git add server/settings/windowsDpapi.ts server/settings/windowsDpapi.test.ts server/settings/aiSettingsStore.ts
git commit -m "feat: protect AI keys with Windows DPAPI"
```

### Task 3: Runtime provider routing for text and image jobs

**Files:**
- Modify: `server/openaiGateway.ts`
- Create: `server/openaiGateway.test.ts`
- Modify: `server/jobs/jobRunner.ts`
- Modify: `server/jobs/jobRunner.test.ts`
- Modify: `server/config.ts`
- Modify: `server/config.test.ts`

**Interfaces:**
- Consumes: `() => Promise<RuntimeAiSettings>` from Task 1.
- Produces: `OpenAIGateway` that routes each call to an independently configured SDK client; `JobRunner` no longer owns fixed model fields.

- [ ] **Step 1: Write failing routing/config tests**

Inject an OpenAI client factory and assert real gateway outputs while recording literal factory inputs. Verify text uses `https://text.example/v1`, `text-key`, `text-model`, and image uses `https://image.example/v1`, `image-key`, `gpt-image-2`. Update config tests so missing env keys are allowed and independent `OPENAI_TEXT_API_KEY`, `OPENAI_IMAGE_API_KEY`, `OPENAI_TEXT_BASE_URL`, and `OPENAI_IMAGE_BASE_URL` become defaults.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run server/openaiGateway.test.ts server/jobs/jobRunner.test.ts server/config.test.ts`

Expected: FAIL because the gateway still accepts one startup key/client and runner still passes fixed models.

- [ ] **Step 3: Implement provider snapshots**

Change the gateway contract to:

```ts
interface AiGateway {
  createDirectorPlan(input: DirectorPlanInput): Promise<unknown>;
  generateStoryboard(input: StoryboardInput): Promise<{ image: Buffer; model: string }>;
}
```

At the beginning of each method call, await one runtime snapshot, require the relevant key, construct the SDK client with `{ apiKey, baseURL }`, and use the relevant model. Update `JobRunner` to archive the model returned by the image call.

- [ ] **Step 4: Verify GREEN and commit**

Run all three focused test files.

```powershell
git add server/openaiGateway.ts server/openaiGateway.test.ts server/jobs/jobRunner.ts server/jobs/jobRunner.test.ts server/config.ts server/config.test.ts
git commit -m "feat: route AI jobs through independent providers"
```

### Task 4: Redacted settings and connection-test HTTP APIs

**Files:**
- Modify: `server/app.ts`
- Modify: `server/app.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `AiSettingsStore` and an injectable `AiConnectionTester`.
- Produces: GET/PUT/DELETE/test routes specified by the design.

- [ ] **Step 1: Write failing API contract tests**

Use Supertest with a real temporary `AiSettingsStore` and a small fake connection tester. Assert exact status/body for GET, PUT, deleting one key, temporary-key tests, validation failures, and sanitized upstream failures. Assert `JSON.stringify(response.body)` contains neither plaintext nor protected keys.

- [ ] **Step 2: Run API tests and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run server/app.test.ts`

Expected: FAIL with 404 for `/api/settings/ai`.

- [ ] **Step 3: Implement routes and server composition**

Extend `AppDependencies` with `settingsStore` and `connectionTester`; add the six routes. Define `AiConnectionTester.testText(settings)` and `testImage(settings)` in `server/openaiGateway.ts`; test endpoints merge submitted non-persistent fields with the saved runtime settings but never call `update()`. Map input errors to 400, missing key to 409, upstream auth to 401, throttling to 429, and sanitized compatibility failures to 502.

In `server/index.ts`, instantiate one store under `resolve(process.env.LOCALAPPDATA ?? ".cinegen-ai", "CineGen", "ai-settings.json")`, one protector, one runtime gateway, and pass them to the runner/app.

- [ ] **Step 4: Verify GREEN and commit**

Run `server/app.test.ts`, `server/openaiGateway.test.ts`, and `server/jobs/jobRunner.test.ts`.

```powershell
git add server/app.ts server/app.test.ts server/index.ts server/openaiGateway.ts
git commit -m "feat: expose secure AI settings API"
```

### Task 5: Typed frontend AI settings service

**Files:**
- Create: `services/aiSettingsService.ts`
- Create: `services/aiSettingsService.test.ts`

**Interfaces:**
- Consumes: Task 4 HTTP routes.
- Produces: `getAiSettings`, `saveAiSettings`, `clearAiKey`, and `testAiConnection` for the dialog.

- [ ] **Step 1: Write failing service tests**

Stub `fetch` with complete response objects. Assert literal URL/method/body for each operation and assert a failed response surfaces the sanitized backend `error`. For save requests, verify omitted password fields are absent from serialized JSON.

- [ ] **Step 2: Run the service test and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run services/aiSettingsService.test.ts`

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement the minimal client**

Export the public DTO types and these functions:

```ts
getAiSettings(signal?: AbortSignal): Promise<PublicAiSettings>
saveAiSettings(input: AiSettingsUpdate): Promise<PublicAiSettings>
clearAiKey(kind: "text" | "image"): Promise<PublicAiSettings>
testAiConnection(kind: "text" | "image", input: ProviderSettingsInput): Promise<{ ok: true; message: string }>
```

- [ ] **Step 4: Verify GREEN and commit**

```powershell
& 'E:\新建文件夹 (2)\npm.cmd' test -- --run services/aiSettingsService.test.ts
git add services/aiSettingsService.ts services/aiSettingsService.test.ts
git commit -m "feat: add AI settings web client"
```

### Task 6: AI settings dialog and sidebar integration

**Files:**
- Create: `components/AiSettingsDialog.tsx`
- Create: `components/AiSettingsDialog.test.tsx`
- Modify: `components/Sidebar.tsx`
- Create: `components/Sidebar.test.tsx`
- Modify: `App.tsx`
- Create: `App.test.tsx`

**Interfaces:**
- Consumes: Task 5 service functions.
- Produces: accessible modal launched by “系统设置”; App/Sidebar hold only modal state and never secret state.

- [ ] **Step 1: Write failing UI behavior tests**

Use jsdom file annotations. Render the real dialog and assert: two independent sections; password inputs initially empty beside masks; show/hide toggles; disabled “暂未配置” video section; privacy warning; save/test loading and success/error states; image-test billing warning; clearing only the chosen key; password inputs cleared after successful save/test. Render Sidebar and click “系统设置” to assert the dialog opens.

Add an App regression test that spies on Storage and asserts no call references `cinegen_api_key`, while the dashboard remains accessible without a browser key.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `& 'E:\新建文件夹 (2)\npm.cmd' test -- --run components/AiSettingsDialog.test.tsx components/Sidebar.test.tsx App.test.tsx`

Expected: FAIL because the dialog and new launcher behavior do not exist.

- [ ] **Step 3: Implement the modal and remove legacy secret UI**

Build an accessible `role="dialog"`, labeled fields, close button, separate submit/test/clear actions, and ephemeral password state. Replace Sidebar’s inline theme popover with an `onOpenSettings` callback supplied by App. Keep theme controls either inside the settings dialog or in the existing top theme picker, but never couple them to AI secret state.

Delete from `App.tsx`: `apiKey`, `inputKey`, `requiresApiKeyForEntry`, key-loading effect, `handleSaveKey`, `handleClearKey`, the obsolete key-entry screen, the top-right key button, `setGlobalApiKey`, and Gemini key-related icon imports.

- [ ] **Step 4: Verify GREEN and commit**

Run the three UI tests plus existing component tests.

```powershell
git add components/AiSettingsDialog.tsx components/AiSettingsDialog.test.tsx components/Sidebar.tsx components/Sidebar.test.tsx App.tsx App.test.tsx
git commit -m "feat: add AI settings center dialog"
```

### Task 7: Documentation, security regression, and full verification

**Files:**
- Modify: `.env.example`
- Modify: `docs/openai-local-setup.md`
- Modify: `README.md`
- Test: existing full suite

**Interfaces:**
- Consumes: all previous tasks.
- Produces: final user setup guidance and verification evidence.

- [ ] **Step 1: Update configuration documentation**

Document independent optional environment defaults, the web settings flow, the DPAPI CurrentUser limitation, local settings file location, clear-key behavior, and third-party privacy/billing warnings. Remove instructions that tell users to place one shared key in the browser.

- [ ] **Step 2: Run focused security scans**

Run:

```powershell
rg -n "cinegen_api_key|Key is stored locally in your browser|setGlobalApiKey" App.tsx components services dist
rg -n "sk-[A-Za-z0-9_-]{8,}|im-[A-Za-z0-9_-]{8,}" . -g '!node_modules/**' -g '!.git/**'
```

Expected: first command has no matches; second contains only deliberate fake test literals and no real credentials.

- [ ] **Step 3: Run the complete verification suite**

```powershell
& 'E:\新建文件夹 (2)\npm.cmd' test -- --run
& 'E:\新建文件夹 (2)\npx.cmd' tsc --noEmit
& 'E:\新建文件夹 (2)\npm.cmd' run build
git diff --check
git status --short
```

Expected: all tests pass, TypeScript and build exit 0, no whitespace errors, and only intended documentation changes remain before commit.

- [ ] **Step 4: Commit documentation**

```powershell
git add .env.example docs/openai-local-setup.md README.md
git commit -m "docs: explain secure AI settings"
```

- [ ] **Step 5: Invoke completion verification and branch-finishing skills**

Read and follow `superpowers:verification-before-completion`, then `superpowers:finishing-a-development-branch`. Report that real paid OpenAI/relay generation was not executed unless the user separately supplies local credentials through the finished UI.
