import express from "express";
import dotenv from "dotenv";
import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { LocalStore, error } from "./server/store.js";
import { ContentService } from "./server/contentService.js";
import { ImageTasks } from "./server/imageTasks.js";

const root = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(root, ".env") });
const PORT = Number(process.env.PORT || 3001);
const configNames = {
  llmApiKey: "LLM_API_KEY",
  llmApiUrl: "LLM_API_URL",
  llmModel: "LLM_MODEL",
  gptimage2ApiKey: "GPTIMAGE2_API_KEY",
  gptimage2ApiUrl: "GPTIMAGE2_API_URL",
  gptimage2Model: "GPTIMAGE2_MODEL",
};
const initialConfig = () => ({
  llmApiKey: process.env.LLM_API_KEY || "",
  llmApiUrl: process.env.LLM_API_URL || "",
  llmModel: process.env.LLM_MODEL || "",
  gptimage2ApiKey: process.env.GPTIMAGE2_API_KEY || "",
  gptimage2ApiUrl: process.env.GPTIMAGE2_API_URL || "",
  gptimage2Model: process.env.GPTIMAGE2_MODEL || "",
});
const masked = (c) => ({
  llmApiUrl: c.llmApiUrl,
  llmModel: c.llmModel,
  hasLlmKey: Boolean(c.llmApiKey),
  gptimage2ApiUrl: c.gptimage2ApiUrl,
  gptimage2Model: c.gptimage2Model,
  hasGptimage2Key: Boolean(c.gptimage2ApiKey),
});
const asyncRoute = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res)).catch(next);
const configUrl = (value) => {
  try {
    if (
      typeof value !== "string" ||
      value.length > 2000 ||
      /[\r\n]/.test(value)
    )
      throw new Error();
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
    return value.trim();
  } catch {
    throw error(400, "API地址必须是无凭据、无查询参数的HTTP(S)基础地址");
  }
};

export async function createApp({
  dataDir = process.env.SLIDEFLOW_DATA_DIR || path.join(root, "data"),
  config = initialConfig(),
  configPath = path.join(root, ".env"),
} = {}) {
  const app = express(),
    store = await new LocalStore(dataDir).init();
  let runtimeConfig = { ...config };
  const content = new ContentService(() => runtimeConfig);
  const images = await new ImageTasks(store, () => runtimeConfig).init();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const allowedHost = (host) =>
      ["localhost", "127.0.0.1", "[::1]"].includes(host);
    if (!allowedHost(req.hostname))
      return res.status(403).json({ error: "仅允许本机访问" });
    if (req.headers.origin) {
      try {
        const origin = new URL(req.headers.origin);
        const allowedPort = [
          String(PORT),
          "5173",
          String(req.socket.localPort),
        ].includes(origin.port);
        if (
          !allowedHost(origin.hostname) ||
          !["http:", "https:"].includes(origin.protocol) ||
          !allowedPort
        )
          throw new Error();
        res.setHeader("Access-Control-Allow-Origin", origin.origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader(
          "Access-Control-Allow-Methods",
          "GET,POST,PUT,DELETE,OPTIONS",
        );
      } catch {
        return res.status(403).json({ error: "请求来源不允许" });
      }
    }
    if (req.headers["sec-fetch-site"] === "cross-site")
      return res.status(403).json({ error: "不接受跨站请求" });
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use("/api/backups", express.json({ limit: "100mb" }));
  app.use(express.json({ limit: "15mb" }));
  app.get("/api/health", (_req, res) =>
    res.json({
      service: "slideflow",
      schemaVersion: 1,
      status: "ok",
      instance: createHash("sha256")
        .update(root.toLowerCase())
        .digest("hex")
        .slice(0, 16),
    }),
  );
  app.get("/api/config", (_req, res) => res.json(masked(runtimeConfig)));
  app.post(
    "/api/config",
    asyncRoute(async (req, res) => {
      await store.serial("configuration", async () => {
        const next = { ...runtimeConfig };
        for (const key of Object.keys(configNames)) {
          if (req.body[key] === undefined || req.body[key] === "") continue;
          if (
            typeof req.body[key] !== "string" ||
            /[\r\n]/.test(req.body[key]) ||
            req.body[key].length > 2000
          )
            throw error(400, "配置字段格式不合法");
          next[key] = req.body[key].trim();
          if (key.endsWith("Url")) next[key] = configUrl(next[key]);
        }
        for (const key of ["llmApiKey", "gptimage2ApiKey"])
          if (req.body[`clear_${key}`] === true) next[key] = "";
        const old = fs.existsSync(configPath)
          ? dotenv.parse(await fsp.readFile(configPath))
          : {};
        const values = {
          ...old,
          PORT: String(PORT),
          ...Object.fromEntries(
            Object.entries(configNames).map(([key, env]) => [env, next[key]]),
          ),
        };
        await fsp.writeFile(
          `${configPath}.tmp`,
          Object.entries(values)
            .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
            .join("\n") + "\n",
        );
        await fsp.rename(`${configPath}.tmp`, configPath);
        runtimeConfig = next;
      });
      res.json({ success: true, ...masked(runtimeConfig) });
    }),
  );
  app.post(
    "/api/test-llm",
    asyncRoute(async (req, res) => {
      const c = runtimeConfig;
      const apiUrl = configUrl(req.body.apiUrl || c.llmApiUrl),
        key = req.body.apiKey || c.llmApiKey,
        model = req.body.model || c.llmModel;
      if (typeof model !== "string" || !model.trim() || model.length > 2000)
        throw error(400, "请填写实际模型名称");
      if (typeof key !== "string" || /[\r\n]/.test(key) || key.length > 2000)
        throw error(400, "密钥格式不合法");
      const response = await fetch(
        `${apiUrl.replace(/\/$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "仅回复OK" }],
            max_tokens: 12,
          }),
        },
      );
      if (!response.ok) throw error(502, `模型连接失败（${response.status}）`);
      const body = await response.json();
      if (!body.choices?.[0]?.message?.content)
        throw error(502, "模型没有返回有效文字");
      res.json({ success: true, message: `模型 ${model} 已返回有效文字` });
    }),
  );
  app.get(
    "/api/decks",
    asyncRoute(async (_req, res) => res.json({ decks: await store.list() })),
  );
  app.post(
    "/api/decks",
    asyncRoute(async (req, res) =>
      res.json(await store.save(req.body.deck, 0)),
    ),
  );
  app.get(
    "/api/decks/:id",
    asyncRoute(async (req, res) => res.json(await store.get(req.params.id))),
  );
  app.put(
    "/api/decks/:id",
    asyncRoute(async (req, res) => {
      if (req.params.id !== req.body.deck?.id)
        throw error(400, "文稿标识不一致");
      res.json(await store.save(req.body.deck, req.body.expectedRevision));
    }),
  );
  app.delete(
    "/api/decks/:id",
    asyncRoute(async (req, res) => {
      await store.remove(req.params.id, req.body.expectedRevision);
      res.json({ success: true });
    }),
  );
  app.post(
    "/api/decks/:id/copy",
    asyncRoute(async (req, res) => res.json(await store.copy(req.params.id))),
  );
  app.get(
    "/api/decks/:id/versions",
    asyncRoute(async (req, res) =>
      res.json({ versions: await store.versions(req.params.id) }),
    ),
  );
  app.post(
    "/api/decks/:id/restore",
    asyncRoute(async (req, res) =>
      res.json(
        await store.restore(
          req.params.id,
          req.body.revision,
          req.body.expectedRevision,
        ),
      ),
    ),
  );
  app.get(
    "/api/decks/:id/backup",
    asyncRoute(async (req, res) => {
      const { deck } = await store.load(req.params.id);
      res.json(await store.backup(deck));
    }),
  );
  app.post(
    "/api/backups/export",
    asyncRoute(async (req, res) => res.json(await store.backup(req.body.deck))),
  );
  app.post(
    "/api/backups/import",
    asyncRoute(async (req, res) =>
      res.json(await store.importBackup(req.body)),
    ),
  );
  app.post(
    "/api/assets",
    asyncRoute(async (req, res) =>
      res.json({
        asset: await store.putAsset(req.body.dataUrl, req.body.name),
      }),
    ),
  );
  app.get(
    "/api/assets/:id",
    asyncRoute(async (req, res) => {
      const asset = await store.read(store.file("assets", req.params.id));
      const { bytes, mime } = store.decodeImage(asset.dataUrl);
      res.setHeader("Cache-Control", "private, max-age=31536000, immutable");
      res.type(mime).send(bytes);
    }),
  );
  app.post(
    "/api/deck-draft",
    asyncRoute(async (req, res) =>
      res.json(await content.draft(req.body.deck)),
    ),
  );
  app.post(
    "/api/deck-review",
    asyncRoute(async (req, res) =>
      res.json({ review: await content.review(req.body.deck) }),
    ),
  );
  app.post(
    "/api/deck-edit",
    asyncRoute(async (req, res) =>
      res.json(await content.edit(req.body.deck, req.body)),
    ),
  );
  app.post(
    "/api/deck-restyle",
    asyncRoute(async (req, res) =>
      res.json(await content.restyle(req.body.deck, req.body.description)),
    ),
  );
  app.post(
    "/api/deck-render-slide",
    asyncRoute(async (req, res) => {
      // 第一步：DeepSeek 产出排版生图提示词与排版说明；第二步：交给 GPT Image 2 任务队列。
      const plan = await content.renderSlide(req.body.deck, req.body.slideId);
      const task = await store.serial("image-submission", () =>
        images.enqueueRender(plan),
      );
      res.json({
        done: task.status === "completed",
        slidePatch: {
          aiRender: {
            contentRevision: plan.inputRevision,
            taskId: task.requestId,
            description: plan.layoutDescription,
          },
          placements: plan.placements || null,
        },
      });
    }),
  );
  app.post(
    "/api/deck-inline-image",
    asyncRoute(async (req, res) =>
      res.json(
        await store.serial("image-submission", () =>
          images.enqueueInline({
            deckId: req.body.deckId,
            slideId: req.body.slideId,
            prompt: req.body.prompt,
          }),
        ),
      ),
    ),
  );
  app.post(
    "/api/image-tasks",
    asyncRoute(async (req, res) =>
      res.json(
        await store.serial("image-submission", () => images.enqueue(req.body)),
      ),
    ),
  );
  app.get("/api/image-tasks", (req, res) =>
    res.json({
      tasks: images.list(req.query.deckId),
      warnings: images.warnings,
    }),
  );
  app.get("/api/image-tasks/:id", (req, res) => {
    const task = images.tasks.get(req.params.id);
    if (!task) return res.status(404).json({ error: "任务不存在" });
    res.json(task);
  });
  app.post(
    "/api/image-tasks/:id/cancel",
    asyncRoute(async (req, res) =>
      res.json(await images.cancel(req.params.id)),
    ),
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "接口不存在或已迁移到原生工作台" }),
  );
  const dist = path.join(root, "dist");
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
  }
  app.use((err, _req, res, _next) =>
    res.status(err.status || 500).json({
      error: err.status
        ? err.message
        : "本机服务操作失败，未保存的修改仍保留；请检查磁盘或连接后重试",
    }),
  );
  return { app, store, images, content };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { app } = await createApp();
  const server = app.listen(PORT, "127.0.0.1", () =>
    console.log(`SlideFlow: http://127.0.0.1:${PORT}`),
  );
  server.on("error", (e) => {
    console.error(
      e.code === "EADDRINUSE"
        ? `端口${PORT}被占用，未终止其他进程`
        : "本机服务启动失败",
    );
    process.exitCode = 1;
  });
  server.keepAliveTimeout = 120000;
  server.headersTimeout = 125000;
  server.requestTimeout = 300000;
}
