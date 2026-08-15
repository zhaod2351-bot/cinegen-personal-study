import { describe, expect, it } from "vitest";
import { loadServerConfig } from "./config";

describe("loadServerConfig", () => {
  it("allows provider keys to be omitted from startup defaults", () => {
    expect(loadServerConfig({}).aiDefaults).toEqual({
      text: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.6-terra",
      },
      image: {
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-image-2",
      },
    });
  });

  it("maps independent text and image environment defaults", () => {
    const config = loadServerConfig({
      OPENAI_TEXT_API_KEY: "text-key",
      OPENAI_IMAGE_API_KEY: "image-key",
      OPENAI_TEXT_BASE_URL: "https://text.example/v1",
      OPENAI_IMAGE_BASE_URL: "https://image.example/v1",
      OPENAI_TEXT_MODEL: "text-model",
      OPENAI_IMAGE_MODEL: "image-model",
    });

    expect(config).toMatchObject({
      aiDefaults: {
        text: {
          apiKey: "text-key",
          baseUrl: "https://text.example/v1",
          model: "text-model",
        },
        image: {
          apiKey: "image-key",
          baseUrl: "https://image.example/v1",
          model: "image-model",
        },
      },
      host: "127.0.0.1",
      port: 8787,
    });
  });

  it.each(["0.0.0.0", "192.168.1.25", "cinegen.example.test"])(
    "rejects the non-loopback AI server host %s",
    (host) => {
      expect(() => loadServerConfig({ AI_SERVER_HOST: host })).toThrow();
    },
  );

  it.each(["127.0.0.1", "::1"])("accepts the loopback AI server host %s", (host) => {
    expect(loadServerConfig({ AI_SERVER_HOST: host }).host).toBe(host);
  });
});
