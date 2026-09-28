import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const instance = createHash("sha256")
  .update(root.toLowerCase())
  .digest("hex")
  .slice(0, 16);
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`构建未完成（${code}），未启动旧产物`)),
    );
  });
}
async function newest(dir) {
  let time = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    time = Math.max(
      time,
      entry.isDirectory() ? await newest(file) : (await fs.stat(file)).mtimeMs,
    );
  }
  return time;
}
async function launch() {
  for (const name of ["express", "dotenv", "vite", "react", "pptxgenjs"]) {
    try {
      require.resolve(name);
    } catch {
      throw new Error(
        `缺少依赖 ${name}，请先在项目目录运行 npm ci，再重新双击启动。已有文稿不会被修改。`,
      );
    }
  }
  const { default: dotenv } = await import("dotenv");
  dotenv.config({ path: path.join(root, ".env") });
  const port = Number(process.env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 必须是1–65535之间的整数");
  const url = `http://127.0.0.1:${port}`;
  const health = async () => {
    try {
      const res = await fetch(`${url}/api/health`, {
        signal: AbortSignal.timeout(1500),
      });
      const body = await res.json();
      return (
        res.ok &&
        body.service === "slideflow" &&
        body.status === "ok" &&
        body.instance === instance
      );
    } catch {
      return false;
    }
  };
  const openBrowser = () => {
    if (process.env.SLIDEFLOW_NO_BROWSER === "1") return;
    const child = spawn("rundll32.exe", ["url.dll,FileProtocolHandler", url], {
      windowsHide: true,
      stdio: "ignore",
    });
    child.on("error", () => console.log(`请手动打开 ${url}`));
  };
  if (await health()) {
    console.log(`已找到此项目的 SlideFlow 服务：${url}`);
    openBrowser();
    return;
  }
  await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () =>
      reject(
        new Error(
          `端口 ${port} 已被其他服务占用，未终止任何进程。请修改 .env 的 PORT 后重试。`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
  let built = 0;
  try {
    built = (await fs.stat(path.join(root, "dist", "index.html"))).mtimeMs;
  } catch {}
  const sourceTime = Math.max(
    await newest(path.join(root, "src")),
    await newest(path.join(root, "shared")),
    ...(await Promise.all(
      [
        "index.html",
        "package-lock.json",
        "vite.config.js",
        "tailwind.config.js",
      ].map(async (name) => (await fs.stat(path.join(root, name))).mtimeMs),
    )),
  );
  if (!built || sourceTime > built) {
    console.log("正在构建本机应用，请稍候…");
    await run([
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "build",
    ]);
  }
  const child = spawn(process.execPath, [path.join(root, "server.js")], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  let exited = false;
  child.on("exit", (code) => {
    exited = true;
    process.exitCode = code || 0;
  });
  child.on("error", () => {
    exited = true;
    console.error("服务进程无法启动");
    process.exitCode = 1;
  });
  for (let n = 0; n < 40; n++) {
    if (await health()) {
      console.log(
        `应用已就绪：${url}\n请保持此窗口开启。无模型配置也可手工编辑；AI功能请在设置中配置。`,
      );
      openBrowser();
      return;
    }
    if (exited) throw new Error("服务未能就绪，请查看上方错误");
    await sleep(250);
  }
  throw new Error(
    `健康检查未通过，未自动打开网页。请检查 ${url}/api/health；未终止其他进程。`,
  );
}
launch().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
