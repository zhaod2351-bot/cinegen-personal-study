import { spawn } from "node:child_process";

export type SecretProtector = {
  protect(value: string): Promise<string>;
  unprotect(value: string): Promise<string>;
};

export type PowerShellInvocation = {
  executable: string;
  args: string[];
  stdin: string;
};

type PowerShellResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type PowerShellRunner = (invocation: PowerShellInvocation) => Promise<PowerShellResult>;

const STDERR_LIMIT = 512;

const protectScript = [
  "$ErrorActionPreference = 'Stop'",
  "$plaintext = [Console]::In.ReadToEnd()",
  "$bytes = [Text.Encoding]::UTF8.GetBytes($plaintext)",
  "$protected = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($protected))",
].join("; ");

const unprotectScript = [
  "$ErrorActionPreference = 'Stop'",
  "$protected = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())",
  "$plaintext = [Security.Cryptography.ProtectedData]::Unprotect($protected, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Console]::Out.Write([Convert]::ToBase64String($plaintext))",
].join("; ");

function encodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function runPowerShell(invocation: PowerShellInvocation): Promise<PowerShellResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(invocation.executable, invocation.args, {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
    child.stdin.end(invocation.stdin, "utf8");
  });
}

function failure(operation: "protect" | "unprotect", stderr: string, stdin: string): Error {
  const detail = stdin ? stderr.replaceAll(stdin, "[REDACTED]") : stderr;
  const capped = detail.slice(0, STDERR_LIMIT).trim();
  return new Error(capped ? `Windows DPAPI ${operation} failed: ${capped}` : `Windows DPAPI ${operation} failed`);
}

export class WindowsDpapiProtector implements SecretProtector {
  private readonly platform: NodeJS.Platform;
  private readonly runner: PowerShellRunner;

  constructor(options: { platform?: NodeJS.Platform; runPowerShell?: PowerShellRunner } = {}) {
    this.platform = options.platform ?? process.platform;
    this.runner = options.runPowerShell ?? runPowerShell;
  }

  async protect(value: string): Promise<string> {
    return this.execute("protect", protectScript, value);
  }

  async unprotect(value: string): Promise<string> {
    const output = await this.execute("unprotect", unprotectScript, value);
    return Buffer.from(output, "base64").toString("utf8");
  }

  private async execute(operation: "protect" | "unprotect", script: string, stdin: string): Promise<string> {
    if (this.platform !== "win32") throw new Error("DPAPI is only available on Windows");

    let result: PowerShellResult;
    try {
      result = await this.runner({
        executable: "powershell.exe",
        args: ["-NoProfile", "-NonInteractive", "-EncodedCommand", encodedCommand(script)],
        stdin,
      });
    } catch {
      throw failure(operation, "", stdin);
    }
    if (result.exitCode !== 0) throw failure(operation, result.stderr, stdin);
    return result.stdout.trim();
  }
}
