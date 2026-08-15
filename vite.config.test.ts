import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";

describe("Vite local development server", () => {
  it("binds the development proxy only to IPv4 loopback", async () => {
    const config = await resolveConfig({}, "serve", "development");

    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.proxy?.["/api"]).toBe("http://127.0.0.1:8787");
  });
});
