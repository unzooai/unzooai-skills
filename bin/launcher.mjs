#!/usr/bin/env node
// Unzoo MCP 桥接启动器。
//
// 为什么需要它：plugin 的 `mcpServers.command` **不支持按平台分支**，而我们的
// 服务端二进制在三个平台上名字和位置都不同，而且安装位置用户可以改。
//
// 为什么**不**把二进制打包进这个仓：它是 30+ MB 的专有软件，且必须与装好的
// 浏览器内核版本匹配 —— 打包进来既违反授权，也会造成版本漂移。
// 所以这里只做一件事：**找到用户已装的那一份**，找不到就说清楚怎么办。
//
// 失败时的错误会出现在 Claude Code 的 /mcp → Errors 里，所以这些话是写给用户看的。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";

const CLIENT = process.env.UNZOO_CLIENT || "claude-code";

/** Windows：先查我们自己写的注册表键（安装器写的，用户改过安装目录也准）。 */
function fromWindowsRegistry() {
  // 32 位安装器写的，所以在 WOW6432Node 下；两个视图都查一遍。
  const keys = [
    "HKLM\\SOFTWARE\\Unzoo\\Browser",
    "HKLM\\SOFTWARE\\WOW6432Node\\Unzoo\\Browser",
    "HKCU\\SOFTWARE\\Unzoo\\Browser",
  ];
  for (const key of keys) {
    for (const value of ["InstallDir", "InstallLocation"]) {
      try {
        const out = execFileSync("reg", ["query", key, "/v", value], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
        const m = out.match(/REG_[A-Z_]+\s+(.+)\s*$/m);
        if (m) {
          const dir = m[1].trim();
          const exe = path.join(dir, "services", "unzoo-service.exe");
          if (existsSync(exe)) return exe;
        }
      } catch {
        /* 键不存在就试下一个 */
      }
    }
  }
  return null;
}

function candidates() {
  const home = os.homedir();
  if (process.platform === "win32") {
    return [
      path.join(process.env["ProgramFiles"] || "C:\\Program Files", "Unzoo Browser", "services", "unzoo-service.exe"),
      path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Unzoo Browser", "services", "unzoo-service.exe"),
      path.join(process.env["LOCALAPPDATA"] || path.join(home, "AppData", "Local"), "Unzoo Browser", "services", "unzoo-service.exe"),
    ];
  }
  if (process.platform === "darwin") {
    // mac/Linux 上 daemon 与浏览器**同级**（不是 services/ 子目录）—— 这是
    // 安装布局的硬约束，三个组件各按「相对自己可执行文件的位置」找东西。
    return [
      "/Applications/Unzoo Browser.app/Contents/MacOS/unzoo-service",
      path.join(home, "Applications", "Unzoo Browser.app", "Contents", "MacOS", "unzoo-service"),
    ];
  }
  return [
    "/opt/unzoo-browser/unzoo-service",
    "/usr/lib/unzoo-browser/unzoo-service",
    "/usr/local/lib/unzoo-browser/unzoo-service",
  ];
}

function resolveService() {
  // 显式覆盖优先 —— 便携安装、自定义目录、开发构建都靠它。
  const override = process.env.UNZOO_SERVICE;
  if (override) {
    if (existsSync(override)) return override;
    fail(
      `UNZOO_SERVICE 指向的文件不存在：\n  ${override}\n\n` +
        `请把它改成 Unzoo 的服务端可执行文件路径，或者删掉这个环境变量让插件自动查找。`
    );
  }
  if (process.platform === "win32") {
    const fromReg = fromWindowsRegistry();
    if (fromReg) return fromReg;
  }
  for (const c of candidates()) if (existsSync(c)) return c;
  return null;
}

function fail(msg) {
  process.stderr.write(`\n[unzoo] ${msg}\n\n`);
  process.exit(1);
}

const service = resolveService();
if (!service) {
  fail(
    `没有找到已安装的 Unzoo Browser。\n\n` +
      `这个插件只提供技能和连接方式，浏览器本体需要单独安装：\n` +
      `  → https://unzoo.ai/download\n\n` +
      `装过但还是找不到（比如装到了自定义目录）？设一个环境变量指过去：\n` +
      `  UNZOO_SERVICE=<unzoo-service 可执行文件的完整路径>\n\n` +
      `当前平台 ${process.platform}，已查找：\n` +
      candidates()
        .map((c) => `  - ${c}`)
        .join("\n")
  );
}

// 直通 stdio：MCP 走 stdin/stdout 的 JSON-RPC，**stdout 不能混入任何非协议内容**，
// 所以这里一个字节都不往 stdout 写（上面的错误都走 stderr）。
const child = spawn(service, ["--mcp", "stdio", "--client", CLIENT], {
  stdio: ["inherit", "inherit", "inherit"],
});

child.on("error", (e) => fail(`启动失败：${e.message}\n  ${service}`));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => child.kill(sig));
}
