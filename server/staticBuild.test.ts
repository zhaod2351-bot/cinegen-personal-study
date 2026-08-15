import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "vite";
import { createApp } from "./app";
import type { JobRunner } from "./jobs/jobRunner";
import type { JobStore } from "./jobs/jobStore";
import type { AiConnectionTester } from "./openaiGateway";
import type { AiSettingsStore } from "./settings/aiSettingsStore";

describe("local production build", () => {
  let outputDirectory = "";

  beforeAll(async () => {
    outputDirectory = await mkdtemp(resolve(tmpdir(), "cinegen-local-build-"));
    await build({
      configFile: resolve("vite.config.ts"),
      mode: "production",
      logLevel: "silent",
      build: { outDir: outputDirectory, emptyOutDir: true },
    });
  }, 60_000);

  afterAll(async () => {
    if (outputDirectory) await rm(outputDirectory, { recursive: true, force: true });
  });

  it("serves every JS and CSS URL referenced by the real build through Express", async () => {
    const app = createApp({
      store: {} as JobStore,
      runner: {} as JobRunner,
      settingsStore: {} as AiSettingsStore,
      connectionTester: {} as AiConnectionTester,
      distPath: outputDirectory,
      sessionToken: "static-build-test-session",
    });
    const index = await request(app).get("/").set("Host", "127.0.0.1:8787").expect(200);
    const assetUrls = Array.from(
      index.text.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g),
      (match) => match[1],
    );

    expect(assetUrls.length).toBeGreaterThan(0);
    for (const url of assetUrls) {
      const asset = await request(app).get(url).set("Host", "127.0.0.1:8787").expect(200);
      expect(asset.headers["content-type"]).toMatch(/(?:javascript|css)/);
      expect(asset.text).not.toContain("<div id=\"root\"></div>");
    }
  });
});
