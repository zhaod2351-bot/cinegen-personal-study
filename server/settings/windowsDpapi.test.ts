import { describe, expect, it, vi } from "vitest";
import { WindowsDpapiProtector, type PowerShellInvocation } from "./windowsDpapi";

function decodeScript(invocation: PowerShellInvocation): string {
  const encodedCommandIndex = invocation.args.indexOf("-EncodedCommand");
  return Buffer.from(invocation.args[encodedCommandIndex + 1], "base64").toString("utf16le");
}

function commandText(invocation: PowerShellInvocation): string {
  return [invocation.executable, ...invocation.args].join(" ");
}

describe("WindowsDpapiProtector", () => {
  it("round-trips UTF-8 secrets through stdin and an encoded non-interactive PowerShell command", async () => {
    const secret = "sk-secret-秘密";
    const runPowerShell = vi.fn(async (invocation: PowerShellInvocation) => {
      const script = decodeScript(invocation);
      return {
        exitCode: 0,
        stderr: "",
        stdout: script.includes("::Protect(")
          ? Buffer.from(invocation.stdin, "utf8").toString("base64")
          : invocation.stdin,
      };
    });
    const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });

    expect(await protector.unprotect(await protector.protect(secret))).toBe(secret);
    expect(runPowerShell).toHaveBeenCalledTimes(2);
    for (const [invocation] of runPowerShell.mock.calls) {
      expect(invocation.executable).toBe("powershell.exe");
      expect(invocation.args.slice(0, 3)).toEqual(["-NoProfile", "-NonInteractive", "-EncodedCommand"]);
      expect(commandText(invocation)).not.toContain(secret);
      expect(decodeScript(invocation)).toContain("DataProtectionScope]::CurrentUser");
    }
    expect(runPowerShell.mock.calls[0][0].stdin).toBe(secret);
  });

  it("rejects on non-Windows platforms without invoking PowerShell", async () => {
    const runPowerShell = vi.fn();
    const protector = new WindowsDpapiProtector({ platform: "linux", runPowerShell });

    await expect(protector.protect("sk-secret")).rejects.toThrow("DPAPI is only available on Windows");
    expect(runPowerShell).not.toHaveBeenCalled();
  });

  it("redacts stdin from failed command errors and truncates stderr", async () => {
    const secret = "sk-secret";
    const stderr = `${secret}:${"x".repeat(600)}`;
    const runPowerShell = vi.fn(async (_invocation: PowerShellInvocation) => ({ exitCode: 1, stdout: "", stderr }));
    const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });

    await expect(protector.protect(secret)).rejects.toThrow("[REDACTED]");
    await expect(protector.protect(secret)).rejects.not.toThrow(secret);
    await expect(protector.protect(secret)).rejects.not.toThrow("x".repeat(513));
    for (const [invocation] of runPowerShell.mock.calls) {
      expect(commandText(invocation)).not.toContain(secret);
    }
  });

  it("does not expose stdin when the command runner throws", async () => {
    const secret = "sk-secret";
    const runPowerShell = vi.fn(async (_invocation: PowerShellInvocation) => {
      throw new Error(`PowerShell could not process ${secret}`);
    });
    const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });

    await expect(protector.protect(secret)).rejects.toThrow("Windows DPAPI protect failed");
    await expect(protector.protect(secret)).rejects.not.toThrow(secret);
    expect(commandText(runPowerShell.mock.calls[0][0])).not.toContain(secret);
  });

  it.each([
    ["empty", ""],
    ["invalid-character", "not-base64!"],
    ["noncanonical", "AA"],
  ])("rejects %s stdout from protect without exposing it", async (_name, stdout) => {
    const runPowerShell = vi.fn(async (_invocation: PowerShellInvocation) => ({ exitCode: 0, stdout, stderr: "" }));
    const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });

    await expect(protector.protect("sk-secret")).rejects.toThrow("Windows DPAPI protect failed");
    if (stdout) await expect(protector.protect("sk-secret")).rejects.not.toThrow(stdout);
  });

  it.each([
    ["empty", ""],
    ["invalid-character", "not-base64!"],
    ["noncanonical", "AA"],
  ])("rejects %s stdout from unprotect without exposing it", async (_name, stdout) => {
    const runPowerShell = vi.fn(async (_invocation: PowerShellInvocation) => ({ exitCode: 0, stdout, stderr: "" }));
    const protector = new WindowsDpapiProtector({ platform: "win32", runPowerShell });

    await expect(protector.unprotect("protected-value")).rejects.toThrow("Windows DPAPI unprotect failed");
    if (stdout) await expect(protector.unprotect("protected-value")).rejects.not.toThrow(stdout);
  });
});
