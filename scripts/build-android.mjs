import { spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const windows = process.platform === "win32";
const args = ["--no-daemon", "assembleDebug", "testDebugUnitTest"];
const child = spawn(windows ? "cmd.exe" : "./gradlew", windows ? ["/d", "/c", "gradlew.bat", ...args] : args, {
  cwd: path.join(root, "android"), stdio: "inherit", windowsHide: true,
});
const code = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", resolve); });
if (code !== 0) process.exit(Number(code) || 1);
const target = path.join(root, ".run/android-release");
await mkdir(target, { recursive: true });
await copyFile(path.join(root, "android/app/build/outputs/apk/debug/app-debug.apk"), path.join(target, "Notdown-Android-debug.apk"));
console.log(`Android debug APK: ${path.join(target, "Notdown-Android-debug.apk")}`);
