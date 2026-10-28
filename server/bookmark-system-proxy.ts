import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execute = promisify(execFile);
// Use Windows' per-URL proxy resolution, including PAC/bypass rules. The URL is
// data in the child environment, never interpolated into PowerShell source.
const script = `
$ErrorActionPreference = 'Stop'
$target = [Uri]$env:NOTDOWN_BOOKMARK_PROXY_URL
$proxy = [Net.WebRequest]::GetSystemWebProxy()
if ($proxy.IsBypassed($target)) { 'DIRECT'; exit }
$resolved = $proxy.GetProxy($target)
if ($resolved -eq $target) { 'DIRECT' }
elseif ($resolved.Scheme -eq 'http') { 'PROXY ' + $resolved.Authority }
elseif ($resolved.Scheme -eq 'https') { 'HTTPS ' + $resolved.Authority }
else { throw 'Unsupported system proxy' }
`;

export async function systemBookmarkProxy(url: string, signal?: AbortSignal): Promise<string> {
  if (process.platform !== "win32") return "DIRECT";
  const { stdout } = await execute("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    env: { ...process.env, NOTDOWN_BOOKMARK_PROXY_URL: url },
    windowsHide: true, timeout: 5000, maxBuffer: 4096, signal,
  });
  return stdout.trim();
}
