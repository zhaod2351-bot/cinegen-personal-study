import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config";

describe("loadServerConfig", () => {
  it("rejects a missing OpenAI key", () => {
    expect(() => loadServerConfig({})).toThrow("OPENAI_API_KEY");
  });

  it("uses the fixed image model and loopback defaults", () => {
    const config = loadServerConfig({
      OPENAI_API_KEY: "secret",
      OPENAI_TEXT_MODEL: "gpt-test",
    });

    expect(config).toMatchObject({
      textModel: "gpt-test",
      imageModel: "gpt-image-2",
      host: "127.0.0.1",
      port: 8787,
    });
  });
});
