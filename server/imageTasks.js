import { promises as fs } from "node:fs";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import { randomUUID, createHash } from "node:crypto";
import { buildIllustrationPrompt, LAYOUT_CATALOG } from "./designSystem.js";
import { error } from "./store.js";
import { validId } from "../shared/deck.js";
import { setTimeout as delay } from "node:timers/promises";

export function isGrsaiProvider(provider) {
  const host = new URL(provider).hostname;
  return (
    /(^|\.)(grsai\.com|grsai\.ai|grsaiapi\.com)$/.test(host) ||
    host === "grsai.dakka.com.cn"
  );
}

async function imageJson(url, body, key, signal) {
  const response = await fetch(url, {
    method: "POST",
    signal,
    redirect: "error",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw error(502, `图片供应商返回${response.status}`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 15 * 1024 * 1024) throw error(413, "图片供应商响应超过大小限制");
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw error(502, "图片供应商返回无效JSON");
  }
}

export async function requestImage(task, key, signal, onSubmitted) {
  const base = task.provider.replace(/\/$/, "");
  if (!isGrsaiProvider(base)) {
    const payload = await imageJson(
      `${base}/images/generations`,
      {
        model: task.model,
        prompt: task.prompt,
        n: 1,
        size: task.size,
      },
      key,
      signal,
    );
    return payload.data?.[0];
  }
  // Grsai异步协议只提交一次；后续仅查同一任务，不自动重新付费。
  const api = base.replace(/\/v1$/, "") + "/v1";
  const submitted = await imageJson(
    `${api}/draw/completions`,
    {
      model: task.model,
      prompt: task.prompt,
      aspectRatio: "3:2",
      webHook: "-1",
      shutProgress: true,
    },
    key,
    signal,
  );
  if (
    submitted.code !== 0 ||
    typeof submitted.data?.id !== "string" ||
    !submitted.data.id
  )
    throw error(502, "Grsai未接受任务或未返回任务ID，未自动重试");
  task.providerTaskId = submitted.data.id;
  await onSubmitted(task);
  for (let attempt = 0; attempt < 90; attempt++) {
    await delay(2000, undefined, { signal });
    const payload = await imageJson(
      `${api}/draw/result`,
      { id: task.providerTaskId },
      key,
      signal,
    );
    if (payload.code !== 0)
      throw error(502, "Grsai任务查询失败，未重新提交生图");
    const data = payload.data;
    if (data?.status === "succeeded") return data.results?.[0];
    if (data?.status === "failed")
      throw error(
        502,
        "Grsai生图失败，可在供应商任务记录查看原因；重试需手动操作",
      );
    if (!["queued", "pending", "running", "processing"].includes(data?.status))
      throw error(502, "Grsai返回未知任务状态，已停止等待");
  }
  throw error(504, "Grsai任务等待超时，未自动重新提交");
}

export function isPublicAddress(ip) {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  if (net.isIP(ip) !== 6) return false;
  const global = new net.BlockList(),
    reserved = new net.BlockList();
  global.addSubnet("2000::", 3, "ipv6");
  for (const [address, prefix] of [
    ["2001::", 23],
    ["2001:db8::", 32],
    ["2002::", 16],
    ["3fff::", 20],
  ])
    reserved.addSubnet(address, prefix, "ipv6");
  return global.check(ip, "ipv6") && !reserved.check(ip, "ipv6");
}
// SSRF 防护仅针对不可信来源：trusted=true 表示 URL 来自用户自行配置密钥的
// 图片供应商 API 响应，视为可信输入（本地代理的 fake-ip DNS 可能把供应商 CDN
// 域名解析到保留地址段），trusted 分支交回系统协议栈解析下载。
export async function downloadImage(url, signal, redirects = 0, options = {}) {
  const { trusted = false } = options;
  const u = new URL(url);
  if (
    !["https:", "http:"].includes(u.protocol) ||
    u.username ||
    u.password ||
    redirects > 3
  )
    throw error(400, "图片下载地址不安全");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  signal = signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30000)])
    : AbortSignal.timeout(30000);
  signal.throwIfAborted();
  let pinnedLookup;
  if (!trusted) {
    const records = net.isIP(host)
      ? [{ address: host, family: net.isIP(host) }]
      : await new Promise((resolve, reject) => {
          const abort = () => reject(error(504, "图片地址解析超时或已取消"));
          signal.addEventListener("abort", abort, { once: true });
          dns
            .lookup(host, { all: true })
            .then(resolve, reject)
            .finally(() => signal.removeEventListener("abort", abort));
        });
    if (!records.length || records.some((r) => !isPublicAddress(r.address)))
      throw error(400, "图片下载禁止内网或保留地址");
    // 固定解析结果，防止连接阶段被重新解析到内网。
    pinnedLookup = (_hostname, o, cb) =>
      o.all ? cb(null, records) : cb(null, records[0].address, records[0].family);
  }
  return new Promise((resolve, reject) => {
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.get(
      u,
      {
        signal,
        ...(pinnedLookup ? { lookup: pinnedLookup } : {}),
      },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          try {
            if (!res.headers.location) throw error(502, "图片重定向缺少地址");
            downloadImage(
              new URL(res.headers.location, u).href,
              signal,
              redirects + 1,
              options,
            ).then(resolve, reject);
          } catch {
            reject(error(502, "图片重定向地址无效"));
          }
          return;
        }
        const mime = String(res.headers["content-type"] || "").split(";")[0];
        if (
          res.statusCode !== 200 ||
          !["image/png", "image/jpeg", "image/webp"].includes(mime)
        ) {
          res.resume();
          reject(error(502, "供应商未返回支持的图片类型"));
          return;
        }
        const chunks = [];
        let size = 0;
        res.on("data", (chunk) => {
          size += chunk.length;
          if (size > 10 * 1024 * 1024) req.destroy(error(413, "图片超过10MB"));
          else chunks.push(chunk);
        });
        res.on("end", () =>
          resolve(
            `data:${mime};base64,${Buffer.concat(chunks).toString("base64")}`,
          ),
        );
        res.on("error", reject);
      },
    );
    req.setTimeout(20000, () => req.destroy(error(504, "图片下载超时")));
    req.on("error", reject);
  });
}
export class ImageTasks {
  constructor(store, getConfig) {
    this.store = store;
    this.getConfig = getConfig;
    this.tasks = new Map();
    this.controllers = new Map();
    this.active = 0;
    this.warnings = [];
  }
  async init() {
    for (const file of await fs.readdir(path.join(this.store.root, "tasks"))) {
      if (!file.endsWith(".json")) continue;
      try {
        const task = await this.store.read(
          this.store.file("tasks", file.slice(0, -5)),
          true,
        );
        if (
          !task ||
          !validId(task.requestId) ||
          `${task.requestId}.json` !== file ||
          !validId(task.deckId) ||
          !validId(task.slideId) ||
          ![
            "queued",
            "running",
            "completed",
            "failed",
            "cancelled",
            "interrupted",
            "stale",
          ].includes(task.status)
        )
          throw error(422, "任务记录格式损坏");
        if (["queued", "running"].includes(task.status)) {
          task.status = "interrupted";
          task.error = "服务重启，任务已中断；是否重试由您决定";
          await this.persist(task);
        }
        this.tasks.set(task.requestId, task);
      } catch {
        this.warnings.push(
          `配图任务记录 ${file} 无法读取，已保留原文件，未自动重试；文稿仍可编辑。`,
        );
      }
    }
    return this;
  }
  persist(task) {
    return this.store.serial(`task-${task.requestId}`, () =>
      this.store.atomic(this.store.file("tasks", task.requestId), task),
    );
  }
  list(deckId) {
    return [...this.tasks.values()].filter((t) => t.deckId === deckId);
  }
  enqueue(input) {
    return this.store.serial("image-enqueue", () => this.submit(input));
  }
  // 单页 GPT 整页渲染：不校验版式画框与配图描述，提示词由文案模型(DeepSeek)产出，
  // 同提示词缓存复用已完成任务，避免重复计费。
  enqueueRender(input) {
    return this.store.serial("image-enqueue", () => this.submitRender(input));
  }
  async submitRender({ deckId, slideId, inputRevision, prompt }) {
    const { deck } = await this.store.load(deckId),
      slide = deck.slides.find((s) => s.id === slideId);
    if (!slide || slide.contentRevision !== inputRevision)
      throw error(409, "页面版本已变化，请先保存");
    const c = this.getConfig();
    if (!c.gptimage2Model) throw error(503, "请先填写实际图片模型名称");
    if (
      !c.gptimage2ApiKey &&
      !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(c.gptimage2ApiUrl)
    )
      throw error(503, "请先配置图片模型");
    const size = "1536x1024";
    const cacheKey = createHash("sha256")
      .update(
        JSON.stringify([c.gptimage2ApiUrl, c.gptimage2Model, size, prompt]),
      )
      .digest("hex");
    const duplicate = this.list(deckId).find(
      (t) =>
        t.kind === "render" &&
        t.slideId === slideId &&
        t.inputRevision === inputRevision &&
        ["queued", "running", "completed"].includes(t.status) &&
        t.cacheKey === cacheKey,
    );
    if (duplicate && duplicate.status !== "completed") return duplicate;
    if (
      duplicate?.asset &&
      (await this.store.read(
        this.store.file("assets", duplicate.asset.id),
        true,
      ))
    )
      return duplicate;
    let cached = [...this.tasks.values()].find(
      (t) =>
        t.kind === "render" &&
        t.cacheKey === cacheKey &&
        t.status === "completed" &&
        t.asset,
    );
    if (
      cached &&
      !(await this.store.read(this.store.file("assets", cached.asset.id), true))
    )
      cached = null;
    const task = {
      requestId: randomUUID(),
      kind: "render",
      deckId,
      slideId,
      inputRevision,
      status: cached ? "completed" : "queued",
      prompt,
      size,
      cacheKey,
      provider: c.gptimage2ApiUrl,
      model: c.gptimage2Model,
      createdAt: new Date().toISOString(),
      ...(cached ? { asset: cached.asset } : {}),
    };
    this.tasks.set(task.requestId, task);
    await this.persist(task);
    this.pump();
    return task;
  }
  async submit({ deckId, slideId, inputRevision, slot = 0 }) {
    const { deck } = await this.store.load(deckId),
      slide = deck.slides.find((s) => s.id === slideId);
    if (!slide || slide.contentRevision !== inputRevision)
      throw error(409, "页面版本已变化，请先保存");
    const frames = LAYOUT_CATALOG[slide.layoutId]?.userImageFrames || [];
    if (
      !frames[slot] ||
      !Number.isInteger(slot) ||
      slot !== slide.assets.length ||
      slide.omitVisual
    )
      throw error(400, "当前版式不需要该配图，未调用供应商");
    if (!slide.visualIdea?.trim()) throw error(400, "请先描述配图主体");
    const c = this.getConfig();
    if (!c.gptimage2Model) throw error(503, "请先填写实际图片模型名称");
    if (
      !c.gptimage2ApiKey &&
      !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(c.gptimage2ApiUrl)
    )
      throw error(503, "请先配置图片模型");
    const prompt = buildIllustrationPrompt({
      visualSubject: slide.visualIdea,
      deckStyle: { design: deck.design },
    });
    const size = "1536x1024";
    const cacheKey = createHash("sha256")
      .update(
        JSON.stringify([c.gptimage2ApiUrl, c.gptimage2Model, size, prompt]),
      )
      .digest("hex");
    const duplicate = this.list(deckId).find(
      (t) =>
        t.slideId === slideId &&
        t.inputRevision === inputRevision &&
        t.slot === slot &&
        ["queued", "running", "completed"].includes(t.status) &&
        t.cacheKey === cacheKey,
    );
    if (duplicate && duplicate.status !== "completed") return duplicate;
    if (
      duplicate?.asset &&
      (await this.store.read(
        this.store.file("assets", duplicate.asset.id),
        true,
      ))
    )
      return duplicate;
    let cached = [...this.tasks.values()].find(
      (t) => t.cacheKey === cacheKey && t.status === "completed" && t.asset,
    );
    if (
      cached &&
      !(await this.store.read(this.store.file("assets", cached.asset.id), true))
    )
      cached = null;
    const task = {
      requestId: randomUUID(),
      deckId,
      slideId,
      inputRevision,
      slot,
      status: cached ? "completed" : "queued",
      prompt,
      size,
      cacheKey,
      provider: c.gptimage2ApiUrl,
      model: c.gptimage2Model,
      createdAt: new Date().toISOString(),
      ...(cached ? { asset: cached.asset } : {}),
    };
    this.tasks.set(task.requestId, task);
    await this.persist(task);
    this.pump();
    return task;
  }
  async cancel(id) {
    const t = this.tasks.get(id);
    if (!t) throw error(404, "任务不存在");
    if (["queued", "running"].includes(t.status)) {
      t.status = "cancelled";
      t.error = "已停止等待，供应商可能仍会计费";
      this.controllers.get(id)?.abort();
      await this.persist(t);
    }
    return t;
  }
  pump() {
    while (this.active < 2) {
      const task = [...this.tasks.values()].find((t) => t.status === "queued");
      if (!task) return;
      task.status = "running";
      this.active++;
      this.run(task)
        .catch(() => {})
        .finally(() => {
          this.active--;
          this.controllers.delete(task.requestId);
          this.pump();
        });
    }
  }
  async run(task) {
    const controller = new AbortController();
    this.controllers.set(task.requestId, controller);
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(300000),
    ]);
    try {
      await this.persist(task);
      const { deck } = await this.store.load(task.deckId);
      if (
        !deck.slides.some(
          (s) =>
            s.id === task.slideId && s.contentRevision === task.inputRevision,
        )
      )
        throw error(409, "原页面已改变，未继续配图");
      const c = this.getConfig();
      if (
        task.provider !== c.gptimage2ApiUrl ||
        task.model !== c.gptimage2Model
      )
        throw error(409, "供应商配置已改变，请重新提交任务");
      const image = await requestImage(task, c.gptimage2ApiKey, signal, (t) =>
        this.persist(t),
      );
      let dataUrl;
      if (image?.b64_json) {
        const bytes = Buffer.from(image.b64_json, "base64");
        const mime =
          bytes[0] === 137 ? "png" : bytes[0] === 255 ? "jpeg" : "webp";
        dataUrl = `data:image/${mime};base64,${image.b64_json}`;
      } else if (image?.url)
        dataUrl = await downloadImage(image.url, signal, 0, { trusted: true });
      else throw error(502, "供应商未返回图片URL或base64数据");
      if (task.status === "cancelled") return;
      const current = await this.store.load(task.deckId);
      if (
        !current.deck.slides.some(
          (s) =>
            s.id === task.slideId && s.contentRevision === task.inputRevision,
        )
      ) {
        task.status = "stale";
        task.error = "页面版本已改变，旧图片未写回";
      } else {
        task.asset = await this.store.putAsset(
          dataUrl,
          task.kind === "render" ? "GPT整页渲染" : "AI独立配图",
        );
        if (task.status !== "cancelled") task.status = "completed";
      }
    } catch (e) {
      if (task.status !== "cancelled") {
        task.status = "failed";
        task.error = e.status ? e.message : "配图连接失败或超时，可手动重试";
      }
    } finally {
      await this.persist(task);
    }
  }
}
