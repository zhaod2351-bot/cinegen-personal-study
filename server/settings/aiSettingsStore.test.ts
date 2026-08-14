import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AiSettingsStore } from "./aiSettingsStore";

class ReversibleProtector {
  async protect(value: string): Promise<string> {
    return Buffer.from(value, "utf8").toString("base64url");
  }

  async unprotect(value: string): Promise<string> {
    return Buffer.from(value, "base64url").toString("utf8");
  }
}

function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

class BlockingProtector extends ReversibleProtector {
  private readonly protectionStarted = createDeferred();
  private readonly releaseProtection = createDeferred();

  async protect(value: string): Promise<string> {
    this.protectionStarted.resolve();
    await this.releaseProtection.promise;
    return super.protect(value);
  }

  async waitForProtection(): Promise<void> {
    await this.protectionStarted.promise;
  }

  release(): void {
    this.releaseProtection.resolve();
  }
}

const defaults = {
  text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: "sk-text-123456" },
  image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", apiKey: "im-image-abcdef" },
};

async function createStore(protector: ReversibleProtector = new ReversibleProtector()) {
  const directory = await mkdtemp(join(tmpdir(), "cinegen-settings-"));
  const filePath = join(directory, "settings.json");
  return { filePath, store: new AiSettingsStore({ filePath, protector, defaults }) };
}

describe("AiSettingsStore", () => {
  it("redacts independently configured provider keys", async () => {
    const { store } = await createStore();

    expect(await store.getPublicSettings()).toEqual({
      text: { baseUrl: "https://text.example/v1", model: "text-model", hasKey: true, keyMask: "sk-****3456" },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", hasKey: true, keyMask: "im-****cdef" },
    });
    expect(JSON.stringify(await store.getPublicSettings())).not.toContain("sk-text-123456");
  });

  it("preserves an omitted key while changing one provider", async () => {
    const { store } = await createStore();

    await store.update({
      text: { baseUrl: "https://new-text.example/v1", model: "  text-model-2  " },
    });

    expect(await store.getRuntimeSettings()).toEqual({
      text: { baseUrl: "https://new-text.example/v1", model: "text-model-2", apiKey: "sk-text-123456" },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", apiKey: "im-image-abcdef" },
    });
  });

  it("clears only the selected provider key", async () => {
    const { store } = await createStore();

    await store.clearKey("text");

    expect(await store.getPublicSettings()).toEqual({
      text: { baseUrl: "https://text.example/v1", model: "text-model", hasKey: false, keyMask: null },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", hasKey: true, keyMask: "im-****cdef" },
    });
    expect((await store.getRuntimeSettings()).image.apiKey).toBe("im-image-abcdef");
  });

  it("loads encrypted settings after restart", async () => {
    const { filePath, store } = await createStore();
    await store.update({ image: { baseUrl: "https://images.example/v2", model: "image-model", apiKey: "  im-new-12345678  " } });
    const persisted = await readFile(filePath, "utf8");

    expect(persisted).not.toContain("im-new-12345678");
    const restarted = new AiSettingsStore({ filePath, protector: new ReversibleProtector(), defaults });
    expect(await restarted.getRuntimeSettings()).toEqual({
      text: { baseUrl: "https://text.example/v1", model: "text-model", apiKey: "sk-text-123456" },
      image: { baseUrl: "https://images.example/v2", model: "image-model", apiKey: "im-new-12345678" },
    });
  });

  it("rejects URL credentials and empty models", async () => {
    const { store } = await createStore();

    await expect(store.update({ text: { baseUrl: "https://key@text.example/v1", model: "text-model" } })).rejects.toThrow("credentials");
    await expect(store.update({ image: { baseUrl: "https://image.example/v1", model: "   " } })).rejects.toThrow("model");
  });

  it("leaves the persisted settings untouched when decryption fails", async () => {
    const { filePath, store } = await createStore();
    await store.update({ text: { baseUrl: "https://persisted.example/v1", model: "persisted-model" } });
    const before = await readFile(filePath, "utf8");
    const failingProtector = new ReversibleProtector();
    failingProtector.unprotect = async () => {
      throw new Error("cannot decrypt");
    };
    const restarted = new AiSettingsStore({ filePath, protector: failingProtector, defaults });

    await expect(restarted.getRuntimeSettings()).rejects.toThrow("cannot decrypt");
    expect(await readFile(filePath, "utf8")).toBe(before);
  });

  it("keeps concurrent text and image updates", async () => {
    const protector = new BlockingProtector();
    const { store } = await createStore(protector);
    await store.getRuntimeSettings();

    const updates = Promise.all([
      store.update({ text: { baseUrl: "https://parallel-text.example/v1", model: "parallel-text" } }),
      store.update({ image: { baseUrl: "https://parallel-image.example/v1", model: "parallel-image" } }),
    ]);
    await protector.waitForProtection();
    protector.release();
    await updates;

    expect(await store.getRuntimeSettings()).toEqual({
      text: { baseUrl: "https://parallel-text.example/v1", model: "parallel-text", apiKey: "sk-text-123456" },
      image: { baseUrl: "https://parallel-image.example/v1", model: "parallel-image", apiKey: "im-image-abcdef" },
    });
  });

  it("keeps an update when a concurrent key clear succeeds", async () => {
    const protector = new BlockingProtector();
    const { store } = await createStore(protector);
    await store.getRuntimeSettings();

    const changes = Promise.all([
      store.update({ text: { baseUrl: "https://parallel-text.example/v1", model: "parallel-text" } }),
      store.clearKey("image"),
    ]);
    await protector.waitForProtection();
    protector.release();
    await changes;

    expect(await store.getRuntimeSettings()).toEqual({
      text: { baseUrl: "https://parallel-text.example/v1", model: "parallel-text", apiKey: "sk-text-123456" },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2" },
    });
  });

  it("allows a later change after a failed change", async () => {
    const { store } = await createStore();

    await expect(store.update({ text: { baseUrl: "https://text.example/v1", model: "  " } })).rejects.toThrow("model");
    await store.update({ text: { baseUrl: "https://recovery.example/v1", model: "recovery-model" } });

    expect(await store.getPublicSettings()).toEqual({
      text: { baseUrl: "https://recovery.example/v1", model: "recovery-model", hasKey: true, keyMask: "sk-****3456" },
      image: { baseUrl: "https://image.example/v1", model: "gpt-image-2", hasKey: true, keyMask: "im-****cdef" },
    });
  });
});
