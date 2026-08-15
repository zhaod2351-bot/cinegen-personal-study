import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";

describe("Vite local development server", () => {
  it("binds the development proxy only to IPv4 loopback", async () => {
    const config = await resolveConfig({}, "serve", "development");

    expect(config.server.host).toBe("127.0.0.1");
    expect(config.server.proxy?.["/api"]).toBe("http://127.0.0.1:8787");
  });

  it("uses root assets for local builds and the repository base only for Pages", async () => {
    const local = await resolveConfig({}, "build", "production");
    const pages = await resolveConfig({}, "build", "pages");

    expect(local.base).toBe("/");
    expect(pages.base).toBe("/cinegen-personal-study/");
  });
});
