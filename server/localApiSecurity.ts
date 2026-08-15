import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const loopbackHosts = new Set(["127.0.0.1", "::1", "localhost"]);
export const localSessionHeader = "X-CineGen-Session";

export function createLocalSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function enforceLoopbackRequest(request: Request, response: Response, next: NextFunction): void {
  if (!isLoopbackAuthority(request.headers.host)) {
    response.status(403).json({ code: "AI_LOCAL_ONLY", error: "本机 AI API 仅允许回环地址访问" });
    return;
  }

  const origin = request.headers.origin;
  if (origin !== undefined && !isLoopbackOrigin(origin)) {
    response.status(403).json({ code: "AI_LOCAL_ORIGIN_REQUIRED", error: "本机 AI API 拒绝远程网页来源" });
    return;
  }

  next();
}

export function requireBrowserSession(token: string) {
  return (request: Request, response: Response, next: NextFunction): void => {
    // Non-browser loopback clients do not send Origin. Browser mutations do, so
    // they must prove they bootstrapped from the same local server instance.
    if (request.headers.origin === undefined || tokensMatch(request.get(localSessionHeader), token)) {
      next();
      return;
    }
    response.status(401).json({ code: "AI_SESSION_REQUIRED", error: "本机会话已失效，请刷新页面" });
  };
}

function isLoopbackOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && loopbackHosts.has(normalizeHostname(url.hostname));
  } catch {
    return false;
  }
}

function isLoopbackAuthority(authority: string | undefined): boolean {
  if (!authority) return false;
  try {
    return loopbackHosts.has(normalizeHostname(new URL(`http://${authority}`).hostname));
  } catch {
    return false;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

function tokensMatch(candidate: string | undefined, expected: string): boolean {
  if (!candidate) return false;
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
