# OpenAI Storyboard Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a secure local API that turns a locked script into editable director data with GPT and generates a versioned 3×2 storyboard contact sheet with `gpt-image-2`.

**Architecture:** A local Express service owns the OpenAI key, prompt construction, durable jobs and D-drive archives. The React app talks only to same-origin `/api` endpoints, polls jobs, and persists accepted results in the existing IndexedDB project model. OpenAI access sits behind an injected interface so all automated tests are free and deterministic.

**Tech Stack:** TypeScript 5.8, React 19, Vite 6, Node.js 24, Express, OpenAI Node SDK, Zod, Vitest, Supertest, IndexedDB.

## Global Constraints

- `OPENAI_API_KEY` exists only in the local server environment.
- Text model is configured by `OPENAI_TEXT_MODEL`; image model is exactly `gpt-image-2`.
- The server listens on `127.0.0.1` by default.
- Locked script data is the single production source.
- Existing asset reference images and user-edited metadata are preserved.
- AI-generated content remains editable; storyboard regeneration creates a new version.
- Storyboards archive under `D:\AI动画创作素材\{项目名}\{场次名}\故事板\v{版本号}`.
- No video generation, public deployment, multi-user auth, billing, or generated asset turnarounds are included.
- Every production behavior is introduced by a failing test first.

---

## File Structure

### Server

- `server/types.ts` — API, job and OpenAI gateway contracts.
- `server/config.ts` — validated environment configuration.
- `server/openaiGateway.ts` — real OpenAI SDK adapter only.
- `server/prompts/directorPlanPrompt.ts` — GPT director-plan instructions.
- `server/prompts/storyboardPrompt.ts` — six-panel contact-sheet instructions.
- `server/validation/directorPlan.ts` — Zod schema and asset-reference integrity checks.
- `server/jobs/jobStore.ts` — durable JSON-backed job state and retry metadata.
- `server/jobs/jobRunner.ts` — asynchronous task orchestration and progress updates.
- `server/storage/archive.ts` — safe Chinese Windows paths and image/metadata writes.
- `server/app.ts` — Express routes and error mapping.
- `server/index.ts` — local listener and production static-file host.

### Client

- `services/aiApiService.ts` — typed `/api` client and polling helper.
- `types.ts` — director clips, storyboard versions and AI job references.
- `components/StageScript.tsx` — automatic GPT analysis flow.
- `components/StageDirector.tsx` — real storyboard job/version flow.
- `App.tsx` — local AI service health and model information.

### Tests

- `server/prompts/*.test.ts`
- `server/validation/directorPlan.test.ts`
- `server/jobs/jobStore.test.ts`
- `server/storage/archive.test.ts`
- `server/app.test.ts`
- `services/aiApiService.test.ts`
- `components/StageScript.test.tsx`
- `components/StageDirector.test.tsx`

---

### Task 1: Test Harness and Secure Local Configuration

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `.gitignore`
- Create: `.env.example`
- Create: `vitest.config.ts`
- Create: `server/config.ts`
- Test: `server/config.test.ts`

**Interfaces:**
- Produces: `loadServerConfig(env: NodeJS.ProcessEnv): ServerConfig`.
- `ServerConfig` contains `apiKey`, `textModel`, `imageModel`, `assetRoot`, `host`, and `port`.

- [ ] **Step 1: Add the failing configuration tests**

```ts
import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config";

describe("loadServerConfig", () => {
  it("rejects a missing OpenAI key", () => {
    expect(() => loadServerConfig({})).toThrow("OPENAI_API_KEY");
  });

  it("uses the fixed image model and loopback defaults", () => {
    const config = loadServerConfig({ OPENAI_API_KEY: "secret", OPENAI_TEXT_MODEL: "gpt-test" });
    expect(config).toMatchObject({
      textModel: "gpt-test",
      imageModel: "gpt-image-2",
      host: "127.0.0.1",
      port: 8787,
    });
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- server/config.test.ts --run`

Expected: FAIL because `server/config.ts` does not exist.

- [ ] **Step 3: Add Vitest, server dependencies and scripts**

Add runtime dependencies `express`, `openai`, `zod`, and `dotenv`. Add development dependencies `vitest`, `supertest`, `@types/express`, `@types/supertest`, `tsx`, `concurrently`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom`.

Add scripts:

```json
{
  "test": "vitest",
  "dev:web": "vite",
  "dev:api": "tsx watch server/index.ts",
  "dev:local": "concurrently -k \"npm:dev:api\" \"npm:dev:web\"",
  "start:local": "tsx server/index.ts"
}
```

- [ ] **Step 4: Implement validated config and proxy**

Implement `loadServerConfig` with Zod. Configure Vite to proxy `/api` to `http://127.0.0.1:8787`. Add `.env`, `.env.*`, `server-data`, and generated images to `.gitignore`. Add `.env.example` with blank `OPENAI_API_KEY` and the documented defaults.

- [ ] **Step 5: Run test and build**

Run: `npm test -- server/config.test.ts --run && npm run build`

Expected: tests PASS and Vite build succeeds without embedding the key.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vite.config.ts vitest.config.ts .gitignore .env.example server/config.ts server/config.test.ts
git commit -m "build: add secure local AI server config"
```

---

### Task 2: Director Plan Contract and Validation

**Files:**
- Create: `server/types.ts`
- Create: `server/validation/directorPlan.ts`
- Test: `server/validation/directorPlan.test.ts`

**Interfaces:**
- Produces: `DirectorPlanSchema`, `DirectorPlan`, `validateDirectorPlan(input): DirectorPlan`.
- Asset references use `{ type: "character" | "scene" | "prop", id: string }`, never name-only references.

- [ ] **Step 1: Write failing schema tests**

```ts
it("accepts a complete editable plan", () => {
  expect(validateDirectorPlan(validPlan).clips[0].shots).toHaveLength(2);
});

it("rejects a shot that references a missing asset", () => {
  const broken = structuredClone(validPlan);
  broken.clips[0].shots[0].assets.push({ type: "prop", id: "missing" });
  expect(() => validateDirectorPlan(broken)).toThrow("missing");
});

it("allows the same display name in different asset categories", () => {
  const plan = planWithCrossCategoryDuplicateNames();
  expect(validateDirectorPlan(plan).assets).toHaveLength(2);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/validation/directorPlan.test.ts --run`

Expected: FAIL because validator exports are missing.

- [ ] **Step 3: Implement the exact plan schema**

Define polished script, typed assets, clips, shots, audio items, duration, camera movement, shot size, asset references, and visual prompt. Add a second integrity pass that verifies every referenced type/id pair exists.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- server/validation/directorPlan.test.ts --run`

Expected: all three tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/types.ts server/validation/directorPlan.ts server/validation/directorPlan.test.ts
git commit -m "feat: define validated director plan contract"
```

---

### Task 3: Self-Authored Director and Storyboard Prompt Builders

**Files:**
- Create: `server/prompts/directorPlanPrompt.ts`
- Create: `server/prompts/storyboardPrompt.ts`
- Test: `server/prompts/directorPlanPrompt.test.ts`
- Test: `server/prompts/storyboardPrompt.test.ts`

**Interfaces:**
- Produces: `buildDirectorPlanPrompt(input: DirectorPlanInput): string`.
- Produces: `buildStoryboardPrompt(input: StoryboardInput): string`.

- [ ] **Step 1: Write failing director-prompt test**

```ts
it("includes locked script and project creative settings", () => {
  const prompt = buildDirectorPlanPrompt({
    lockedScript: "第一场内容",
    artStyle: "日漫赛璐璐",
    tags: ["末世", "悬疑"],
    aspectRatio: "16:9",
    language: "简体中文",
    targetDuration: "60s",
  });
  expect(prompt).toContain("第一场内容");
  expect(prompt).toContain("日漫赛璐璐");
  expect(prompt).toContain("type + id");
});
```

- [ ] **Step 2: Write failing storyboard-prompt test**

```ts
it("requires a 3x2 text-free contact sheet and continuity", () => {
  const prompt = buildStoryboardPrompt(storyboardFixture());
  expect(prompt).toContain("3x2");
  expect(prompt).toContain("six panels");
  expect(prompt).toContain("no captions");
  expect(prompt).toContain("character identity");
  expect(prompt).toContain("日漫赛璐璐");
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- server/prompts --run`

Expected: FAIL because both prompt builders are missing.

- [ ] **Step 4: Implement minimal deterministic builders**

Build prompts from named sections: role, inputs, continuity, internal planning, panel order, shot variety, art direction, text restrictions and final output. Do not copy the captured AniKuku wording. Sort assets and shots by their supplied order so repeated calls produce stable prompts.

- [ ] **Step 5: Verify GREEN and snapshot readability**

Run: `npm test -- server/prompts --run`

Expected: tests PASS and snapshots contain no API key, URL token or Base64 image data.

- [ ] **Step 6: Commit**

```bash
git add server/prompts
git commit -m "feat: build director and storyboard prompts"
```

---

### Task 4: Durable Jobs and D-Drive Storyboard Archive

**Files:**
- Create: `server/jobs/jobStore.ts`
- Create: `server/storage/archive.ts`
- Test: `server/jobs/jobStore.test.ts`
- Test: `server/storage/archive.test.ts`

**Interfaces:**
- Produces: `JobStore.create`, `JobStore.update`, `JobStore.get`, `JobStore.retry`.
- Produces: `buildStoryboardArchivePath`, `archiveStoryboard`.

- [ ] **Step 1: Write failing durable-job tests**

```ts
it("restores a completed job after creating a new store", async () => {
  const first = new JobStore(tempDir);
  const job = await first.create("storyboard", { projectId: "p1" });
  await first.update(job.id, { status: "completed", progress: 100 });
  expect((await new JobStore(tempDir).get(job.id))?.status).toBe("completed");
});

it("retry preserves the original job and increments attempts", async () => {
  const retried = await store.retry(failedJob.id);
  expect(retried.attempt).toBe(2);
  expect(retried.status).toBe("queued");
});
```

- [ ] **Step 2: Write failing archive tests**

```ts
it("creates a sanitized Chinese version path", () => {
  expect(buildStoryboardArchivePath("D:\\素材", "余烬:回声", "场次 01", 2))
    .toBe("D:\\素材\\余烬_回声\\场次 01\\故事板\\v2");
});

it("writes image and metadata without secrets", async () => {
  const result = await archiveStoryboard(fixture);
  expect(await readFile(result.imagePath)).toEqual(imageBytes);
  expect(await readFile(result.metadataPath, "utf8")).not.toContain("sk-");
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- server/jobs server/storage --run`

Expected: FAIL because stores do not exist.

- [ ] **Step 4: Implement atomic JSON persistence and safe paths**

Write temporary files then rename. Sanitize `<>:"/\\|?*` and trailing periods/spaces. Metadata contains model, timestamp, task ID, version, style, shot IDs and attempts, but never raw credentials.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- server/jobs server/storage --run`

Expected: all job and archive tests PASS.

- [ ] **Step 6: Commit**

```bash
git add server/jobs/jobStore.ts server/jobs/jobStore.test.ts server/storage/archive.ts server/storage/archive.test.ts
git commit -m "feat: persist AI jobs and storyboard archives"
```

---

### Task 5: OpenAI Gateway and Asynchronous Job Runner

**Files:**
- Create: `server/openaiGateway.ts`
- Create: `server/jobs/jobRunner.ts`
- Test: `server/jobs/jobRunner.test.ts`

**Interfaces:**
- Consumes: prompt builders, validator, archive and job store.
- Produces: `OpenAIGateway.createDirectorPlan`, `OpenAIGateway.generateStoryboard`.
- Produces: `JobRunner.runDirectorPlan`, `JobRunner.runStoryboard`.

- [ ] **Step 1: Write failing runner tests with an injected fake gateway**

```ts
it("validates and completes a director plan job", async () => {
  const runner = runnerWithGateway({ directorPlan: validPlan });
  const job = await runner.runDirectorPlan(input);
  await runner.waitFor(job.id);
  expect((await store.get(job.id))?.status).toBe("completed");
});

it("archives a generated gpt-image-2 storyboard", async () => {
  const runner = runnerWithGateway({ imageBase64: onePixelWebp });
  const job = await runner.runStoryboard(storyboardFixture());
  await runner.waitFor(job.id);
  const complete = await store.get(job.id);
  expect(complete?.result.imagePath).toContain("故事板");
  expect(fakeGateway.lastImageModel).toBe("gpt-image-2");
});

it("marks a third transient failure as failed without deleting prior versions", async () => {
  const runner = runnerWithThreeFailures();
  const job = await runner.runStoryboard(storyboardFixture());
  await runner.waitFor(job.id);
  expect((await store.get(job.id))?.status).toBe("failed");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/jobs/jobRunner.test.ts --run`

Expected: FAIL because gateway and runner are missing.

- [ ] **Step 3: Implement the injected gateway interface and runner**

Use OpenAI structured output for director data and the image generation/edit endpoint for `gpt-image-2`. Supply available reference images as image inputs. Retry rate limits and 5xx errors with bounded exponential backoff; never retry validation errors.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- server/jobs/jobRunner.test.ts --run`

Expected: all runner tests PASS without making network calls.

- [ ] **Step 5: Commit**

```bash
git add server/openaiGateway.ts server/jobs/jobRunner.ts server/jobs/jobRunner.test.ts
git commit -m "feat: run OpenAI director and storyboard jobs"
```

---

### Task 6: Local API and Same-Origin Static Host

**Files:**
- Create: `server/app.ts`
- Create: `server/index.ts`
- Test: `server/app.test.ts`

**Interfaces:**
- Produces: `createApp(deps): Express`.
- Routes: `GET /api/health`, `POST /api/director-plans`, `POST /api/storyboards`, `GET /api/jobs/:id`, `POST /api/jobs/:id/retry`.

- [ ] **Step 1: Write failing API tests**

```ts
it("reports configured models without exposing the key", async () => {
  const response = await request(app).get("/api/health").expect(200);
  expect(response.body.models).toEqual({ text: "gpt-test", image: "gpt-image-2" });
  expect(JSON.stringify(response.body)).not.toContain("secret");
});

it("creates and polls a storyboard job", async () => {
  const created = await request(app).post("/api/storyboards").send(storyboardFixture()).expect(202);
  expect(created.body.status).toBe("queued");
  await request(app).get(`/api/jobs/${created.body.jobId}`).expect(200);
});

it("returns 400 for malformed requests and 404 for unknown jobs", async () => {
  await request(app).post("/api/storyboards").send({}).expect(400);
  await request(app).get("/api/jobs/missing").expect(404);
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- server/app.test.ts --run`

Expected: FAIL because the app does not exist.

- [ ] **Step 3: Implement routes, limits and static hosting**

Use `express.json({ limit: "25mb" })`, validate all bodies with Zod and map domain errors to Chinese messages. In production serve `dist` and return `index.html` for non-API navigation. Bind only to configured loopback host.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- server/app.test.ts --run`

Expected: all API tests PASS.

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/index.ts server/app.test.ts
git commit -m "feat: expose local AI workflow API"
```

---

### Task 7: Typed Client, Polling and Project Data Migration

**Files:**
- Create: `services/aiApiService.ts`
- Test: `services/aiApiService.test.ts`
- Modify: `types.ts`
- Modify: `services/storageService.ts`
- Test: `services/storageService.test.ts`

**Interfaces:**
- Produces: `createDirectorPlanJob`, `createStoryboardJob`, `getAiJob`, `retryAiJob`, `pollAiJob`.
- Adds `directorClips`, `storyboardVersions`, and `activeAiJobs` to `ProjectState`.

- [ ] **Step 1: Write failing client polling test**

```ts
it("polls until the job completes", async () => {
  fetchMock.mockResponses(queuedResponse, progressResponse, completedResponse);
  const result = await pollAiJob("job_1", { intervalMs: 0 });
  expect(result.status).toBe("completed");
  expect(fetchMock).toHaveBeenCalledTimes(3);
});
```

- [ ] **Step 2: Write failing migration test**

```ts
it("adds empty AI collections to an existing project", () => {
  const migrated = migrateProject(oldProjectFixture);
  expect(migrated.directorClips).toEqual([]);
  expect(migrated.storyboardVersions).toEqual([]);
  expect(migrated.activeAiJobs).toEqual({});
});
```

- [ ] **Step 3: Verify RED**

Run: `npm test -- services/aiApiService.test.ts services/storageService.test.ts --run`

Expected: FAIL because client and migration are missing.

- [ ] **Step 4: Implement typed client and backwards-compatible project migration**

Polling accepts an abort signal, stops on completed/failed, and uses a capped interval. Storage reads migrate old IndexedDB records without deleting existing script, shots or assets.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- services/aiApiService.test.ts services/storageService.test.ts --run`

Expected: both test files PASS.

- [ ] **Step 6: Commit**

```bash
git add services/aiApiService.ts services/aiApiService.test.ts types.ts services/storageService.ts services/storageService.test.ts
git commit -m "feat: add AI job client and project migration"
```

---

### Task 8: Automatic GPT Script Analysis UI

**Files:**
- Modify: `components/StageScript.tsx`
- Test: `components/StageScript.test.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `createDirectorPlanJob`, `pollAiJob`, migrated project fields.
- Produces: editable accepted director plan in existing project state.

- [ ] **Step 1: Write failing component tests**

```tsx
it("submits the locked script and shows task progress", async () => {
  render(<StageScript project={project} updateProject={updateProject} />);
  await user.click(screen.getByRole("button", { name: "AI 剧本分析" }));
  expect(await screen.findByText("正在规划镜头")).toBeInTheDocument();
});

it("applies a completed plan without overwriting asset reference images", async () => {
  renderWithCompletedPlan(existingReferencedAssetProject);
  await user.click(await screen.findByRole("button", { name: "确认并锁定剧本" }));
  expect(lastProjectUpdate().scriptData?.characters[0].referenceImage).toBe("data:image/webp;base64,old");
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/StageScript.test.tsx --run`

Expected: FAIL because the component still calls Gemini directly.

- [ ] **Step 3: Replace direct Gemini calls with the job API**

Keep the manual import path. Add progress, failure and retry states. Show the completed structured preview before applying it. Merge assets by type/id and preserve user metadata/reference images.

- [ ] **Step 4: Show local service health in App settings**

Fetch `/api/health`, show GPT model, `gpt-image-2`, archive root and offline instructions. Remove browser API-key input from the normal workflow.

- [ ] **Step 5: Verify GREEN**

Run: `npm test -- components/StageScript.test.tsx --run && npm run build`

Expected: component tests PASS and build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/StageScript.tsx components/StageScript.test.tsx App.tsx
git commit -m "feat: connect script analysis to local GPT jobs"
```

---

### Task 9: Real Storyboard Generation and Version UI

**Files:**
- Modify: `components/StageDirector.tsx`
- Test: `components/StageDirector.test.tsx`

**Interfaces:**
- Consumes: storyboard job API and `ProjectState.storyboardVersions`.
- Produces: persistent editable storyboard versions with image and archive paths.

- [ ] **Step 1: Write failing UI tests**

```tsx
it("creates a storyboard job for the active clip", async () => {
  render(<StageDirector project={project} updateProject={updateProject} />);
  await user.click(screen.getByRole("button", { name: "生成新版本" }));
  expect(createStoryboardJob).toHaveBeenCalledWith(expect.objectContaining({ clipId: "clip-1" }));
});

it("shows progress and stores a completed version", async () => {
  renderWithCompletedStoryboardJob();
  expect(await screen.findByText("生成完成")).toBeInTheDocument();
  expect(lastProjectUpdate().storyboardVersions[0]).toMatchObject({ version: 1, status: "completed" });
});

it("retains the previous version when regeneration fails", async () => {
  renderWithFailedSecondVersion();
  expect(screen.getByRole("option", { name: "v1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Verify RED**

Run: `npm test -- components/StageDirector.test.tsx --run`

Expected: FAIL because version creation is currently local-only.

- [ ] **Step 3: Implement job-driven version behavior**

Build the request from the active Clip, current edited Shots, project art style and referenced assets. Disable duplicate submissions while active. Persist `jobId` immediately, restore polling after refresh, display archive path and never delete a prior version on failure.

- [ ] **Step 4: Verify GREEN**

Run: `npm test -- components/StageDirector.test.tsx --run && npm run build`

Expected: component tests PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add components/StageDirector.tsx components/StageDirector.test.tsx
git commit -m "feat: generate versioned storyboards with gpt-image-2"
```

---

### Task 10: Full Verification and One Paid API Smoke Test

**Files:**
- Create: `docs/openai-local-setup.md`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete local workflow.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test -- --run`

Expected: every test passes with no network access and no console warnings.

- [ ] **Step 2: Run production build and secret scan**

Run: `npm run build && rg -n "sk-[A-Za-z0-9_-]+|OPENAI_API_KEY=" dist server-data -g "*"`

Expected: build passes and the scan finds no key value.

- [ ] **Step 3: Document exact local setup**

Document copying `.env.example` to `.env`, entering the key locally, choosing `OPENAI_TEXT_MODEL`, running `npm run dev:local`, health check, estimated paid calls, D-drive output path, stopping the service and troubleshooting.

- [ ] **Step 4: Start local app and verify health**

Run: `npm run dev:local`

Expected: UI and API start; `/api/health` reports the configured GPT model and `gpt-image-2` without the key.

- [ ] **Step 5: Perform one real text and image smoke test after the user provides a funded key**

Use a short test Clip. Verify GPT returns valid director data, `gpt-image-2` returns one 3×2 storyboard, the UI creates v1 and files appear in the expected D-drive Chinese directory. Do not repeat paid calls if the first succeeds.

- [ ] **Step 6: Final regression and commit**

Run: `npm test -- --run && npm run build && git status --short`

Expected: all tests and build pass; only intended documentation changes remain before commit.

```bash
git add docs/openai-local-setup.md README.md
git commit -m "docs: add local OpenAI workflow setup"
```

