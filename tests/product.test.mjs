import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import JSZip from "jszip";
import { LocalStore } from "../server/store.js";
import { ContentService } from "../server/contentService.js";
import {
  ImageTasks,
  isPublicAddress,
  downloadImage,
  requestImage,
  isGrsaiProvider,
} from "../server/imageTasks.js";
import { createApp } from "../server.js";
import {
  makeDeck,
  validateDeck,
  updateSlide,
  sourceIssues,
} from "../shared/deck.js";
import {
  buildScene,
  wrapText,
  LAYOUT_IDS,
  chooseLayout,
  deepen,
} from "../shared/slideScene.js";
import { LAYOUT_CATALOG } from "../shared/layouts.js";
import {
  createPptx,
  embeddedImageSize,
  imagePlacement,
} from "../src/services/pptxExport.js";
import {
  fixtureDeck,
  layoutFixture,
  paragraphs,
  png,
  sampleDesigns,
} from "./fixtures.mjs";

const testRoot = path.resolve(".test-data");
async function storeFor() {
  await fs.mkdir(testRoot, { recursive: true });
  return new LocalStore(
    await fs.mkdtemp(path.join(testRoot, "product-")),
  ).init();
}
const config = {
  llmApiUrl: "http://127.0.0.1:9999",
  llmApiKey: "",
  llmModel: "test-text",
  gptimage2ApiUrl: "http://127.0.0.1:9999",
  gptimage2ApiKey: "",
  gptimage2Model: "test-image",
};
const model = (value) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );
const waitFor = async (predicate) => {
  for (let i = 0; i < 200; i++) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.fail("等待测试条件超时");
};

test("19版式×多套AI定制配色：完整文字、边界、字号和图片均通过共享场景检查", () => {
  assert.equal(LAYOUT_IDS.length, 19);
  for (const design of sampleDesigns)
    for (const id of LAYOUT_IDS) {
      const slide = layoutFixture(id);
      const assets = Object.fromEntries(
        slide.assets.map((a) => [a.id, { dataUrl: png }]),
      );
      const scene = buildScene(slide, { design, assets });
      assert.deepEqual(scene.issues, [], `${design.name}/${id}`);
      // 重页（数据看板/核心结论/双栏对比）整页压深一档，其余保持底色。
      assert.equal(
        scene.background,
        ["metrics", "hero", "compare"].includes(LAYOUT_CATALOG[id].mode)
          ? deepen(design.palette.bg)
          : design.palette.bg,
      );
      for (let i = 0; i < slide.bullets.length; i++) {
        const fields = scene.elements.filter(
          (e) =>
            e.kind === "text" &&
            e.role !== "decoration" &&
            e.field.startsWith(`bullets.${i}.`),
        );
        assert.equal(fields.map((e) => e.text).join(""), slide.bullets[i]);
        assert.ok(fields.every((e) => e.fontSize >= 30));
      }
      assert.equal(
        scene.elements.filter((e) => e.kind === "image").length,
        slide.assets.length,
      );
    }
});

test("混排换行不漏字符；长文与锁定溢出不裁切；无指标不补数字", () => {
  for (const text of [
    "中文，标点。\nEnglish words with punctuation.",
    "averylongword".repeat(15),
    "第一行\n\n最后一行",
    "emoji🙂与汉字",
  ]) {
    const lines = wrapText(text, 220, 32);
    assert.equal(lines.join(""), text.replace(/\n/g, ""));
  }
  const slide = { ...layoutFixture("image-top-story"), bullets: paragraphs };
  assert.deepEqual(buildScene(slide, { checkAssets: false }).issues, []);
  const dense = {
    ...layoutFixture("editorial-columns"),
    title: "长标题".repeat(100),
    bullets: [paragraphs.join("").repeat(5), "第二条"],
  };
  const scene = buildScene(dense);
  assert.ok(scene.issues.some((e) => e.code === "overflow"));
  assert.equal(
    scene.elements
      .filter((e) => e.kind === "text" && e.field.startsWith("bullets.0"))
      .map((e) => e.text)
      .join(""),
    dense.bullets[0],
  );
  const metric = {
    ...layoutFixture("metrics-big-number"),
    bullets: ["用户未提供指标", "仍需补充资料"],
  };
  assert.notEqual(chooseLayout(metric), "metrics-big-number");
  assert.ok(buildScene(metric).issues.some((e) => e.code === "metric"));
  assert.equal(
    buildScene(metric).elements.some(
      (e) => e.kind === "text" && /95%|300%|100万/.test(e.text),
    ),
    false,
  );
});

test("单文稿并发保存只成功一个；20版本、撤销恢复及重启持久性", async () => {
  const store = await storeFor();
  let { deck } = await store.save(fixtureDeck(), 0);
  const first = { ...deck, title: "窗口A" },
    second = { ...deck, title: "窗口B" };
  const saves = await Promise.allSettled([
    store.save(first, deck.revision),
    store.save(second, deck.revision),
  ]);
  assert.equal(saves.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(saves.find((r) => r.status === "rejected").reason.status, 409);
  deck = (await store.get(deck.id)).deck;
  for (let n = 0; n < 22; n++)
    deck = (
      await store.save(
        updateSlide(deck, deck.slides[1].id, { title: `保存版本${n}` }),
        deck.revision,
      )
    ).deck;
  const versions = await store.versions(deck.id);
  assert.equal(versions.length, 20);
  const restored = (
    await store.restore(deck.id, versions[4].revision, deck.revision)
  ).deck;
  assert.ok(
    restored.slides[1].contentRevision > deck.slides[1].contentRevision,
  );
  const restarted = await new LocalStore(store.root).init();
  assert.deepEqual((await restarted.get(deck.id)).deck, restored);
  await restarted.remove(deck.id, restored.revision);
  assert.deepEqual(await restarted.list(), []);
  await assert.rejects(
    restarted.save(deck, deck.revision),
    (e) => e.status === 409,
  );
});

test("主文件损坏恢复最近可读备份；双损坏禁止用新稿覆盖", async () => {
  const store = await storeFor();
  let { deck } = await store.save(fixtureDeck(), 0);
  const readable = structuredClone(deck);
  deck = (await store.save({ ...deck, title: "后续版本" }, deck.revision)).deck;
  const file = store.file("decks", deck.id);
  await fs.writeFile(file, "{broken");
  assert.deepEqual((await store.get(deck.id)).deck, readable);
  await fs.writeFile(`${file}.bak`, "{broken-too");
  await assert.rejects(
    store.save({ ...deck, revision: 0 }, 0),
    (e) => e.status === 422,
  );
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
  assert.equal((await store.list())[0].unreadable, true);
});

test("自包含备份复用图片、迁移旧图、隔离密钥与路径，拒绝缺资产", async () => {
  const store = await storeFor(),
    d = fixtureDeck();
  const asset = await store.putAsset(png, "测试图片");
  assert.equal((await store.putAsset(png, "同内容图片")).id, asset.id);
  d.slides[0].assets = [{ id: asset.id, fit: "contain" }];
  d.slides[1].legacyImageUrl = `/api/assets/${asset.id}`;
  d.apiKey = "not-a-real-secret";
  const saved = await store.save(d, 0),
    backup = await store.backup(saved.deck);
  assert.equal(JSON.stringify(backup).includes("not-a-real-secret"), false);
  assert.equal(Object.keys(backup.assets).length, 1);
  const other = await storeFor(),
    imported = await other.importBackup(backup);
  assert.notEqual(imported.deck.id, d.id);
  assert.equal(Object.keys(imported.assets).length, 1);
  assert.ok(imported.deck.slides[1].legacyImageUrl.startsWith("/api/assets/"));
  await assert.rejects(
    other.importBackup({ ...backup, assets: {} }),
    /缺少图片/,
  );
  assert.throws(
    () =>
      validateDeck({
        ...d,
        slides: d.slides.map((s, i) =>
          i === 1 ? { ...s, legacyImageUrl: "file:///C:/private.png" } : s,
        ),
      }),
    /旧图片/,
  );
  await assert.rejects(
    store.putAsset("data:image/svg+xml;base64,PHN2Zz4="),
    /仅支持/,
  );
  await assert.rejects(
    store.putAsset(
      "data:image/png;base64," + Buffer.alloc(20).toString("base64"),
    ),
    /签名/,
  );
  await assert.rejects(
    store.putAsset(
      "data:image/png;base64," +
        Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64"),
    ),
    /10MB/,
  );
});

test("文稿schema拒绝越界页数、重复ID、非法对象；过期复核失效", () => {
  const d = fixtureDeck();
  for (const change of [
    { slides: [] },
    { sources: {} },
    { history: {} },
    { schemaVersion: 2 },
  ])
    assert.throws(() => validateDeck({ ...d, ...change }));
  // 风格由AI生成：非法design不拒绝整稿，回退应急中性配色；旧theme键迁移为design。
  assert.equal(
    validateDeck({ ...d, design: { palette: { bg: "red" } } }).design.name,
    "素白",
  );
  assert.equal(
    validateDeck({ ...d, design: undefined, theme: "tech" }).design.name,
    "深海",
  );
  assert.equal(
    validateDeck({ ...d, design: sampleDesigns[1] }).design.name,
    "曜黑鎏金",
  );
  assert.throws(
    () =>
      validateDeck({ ...d, slides: [d.slides[0], d.slides[0], d.slides[3]] }),
    /重复/,
  );
  d.review = {
    status: "complete",
    revisions: Object.fromEntries(
      d.slides.map((s) => [s.id, s.contentRevision]),
    ),
    issues: [],
  };
  d.slides[1].contentRevision++;
  assert.equal(validateDeck(d).review, null);
  for (const change of [
    { sources: [null] },
    { history: [null] },
    { history: [{ slideId: "missing", text: "记录" }] },
  ])
    assert.throws(
      () => validateDeck({ ...d, ...change }),
      (e) => e.status === 400,
    );
  const review = {
    status: "complete",
    revisions: Object.fromEntries(
      d.slides.map((s) => [s.id, s.contentRevision]),
    ),
    issues: [],
  };
  for (const issue of [
    null,
    { slideId: "missing", field: "title" },
    { slideId: d.slides[1].id, field: "bullets.99" },
  ])
    assert.throws(
      () => validateDeck({ ...d, review: { ...review, issues: [issue] } }),
      /定位/,
    );
  d.slides[1].bullets[0] = "用户数增长37%";
  d.slides[1].provenance = {
    "bullets.0": [{ sourceId: "source-1", quote: "伪造的引用片段" }],
  };
  assert.match(
    sourceIssues(d).find((i) => i.field === "bullets.0").message,
    /无直接对应/,
  );
});

test("新生成接口一次统一修正；二次中断仍保留可读稿，不接受错误页数", async (t) => {
  const service = new ContentService(() => config),
    d = fixtureDeck();
  const good = { design: sampleDesigns[1], slides: d.slides },
    weak = structuredClone(good);
  weak.slides[1].bullets[0] = "赋能团队，打造行业标杆。";
  const queue = [weak, new Error("中断")],
    requests = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    const next = queue.shift();
    if (next instanceof Error) throw next;
    return model(next);
  });
  const result = await service.draft(d);
  assert.equal(result.deck.slides[1].bullets[0], weak.slides[1].bullets[0]);
  assert.ok(result.issues.some((i) => i.includes("笼统评价")));
  assert.ok(result.issues.some((i) => i.includes("统一修正失败")));
  assert.equal(requests.length, 2);
  assert.ok(
    result.deck.generationReview.issues.some(
      (i) => i.slideId === d.slides[1].id && i.field === "bullets.0",
    ),
  );
  const store = await storeFor();
  let stored = (await store.save(result.deck, 0)).deck;
  assert.deepEqual(
    stored.generationReview.issues,
    result.deck.generationReview.issues,
  );
  stored.generationReview.issues[0].acknowledged = true;
  stored = (await store.save(stored, stored.revision)).deck;
  assert.equal(
    (await store.get(stored.id)).deck.generationReview.issues[0].acknowledged,
    true,
  );
  stored = (
    await store.save(
      updateSlide(stored, stored.slides[1].id, { title: "人工调整后" }),
      stored.revision,
    )
  ).deck;
  assert.equal(stored.generationReview, null);
  queue.push({ slides: good.slides.slice(0, 3) }, new Error("中断"));
  await assert.rejects(service.draft(d), (e) => e.status === 422);
  assert.equal(requests.length, 4);
});

test("封面类型错误给出精确位置；无效JSON仅统一修正一次", async (t) => {
  const service = new ContentService(() => config),
    d = fixtureDeck();
  const wrong = structuredClone(d);
  wrong.slides[0].type = "statement";
  const requests = [],
    queue = [
      model({ design: sampleDesigns[1], slides: wrong.slides }),
      model({ design: sampleDesigns[1], slides: d.slides }),
    ];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return queue.shift();
  });
  const repaired = await service.draft(d);
  assert.equal(repaired.deck.slides[0].type, "cover");
  assert.match(requests[1].messages.at(-1).content, /第1页type必须是cover/);
  queue.push(
    new Response(
      JSON.stringify({ choices: [{ message: { content: "{bad" } }] }),
    ),
    model({ design: sampleDesigns[1], slides: d.slides }),
  );
  assert.deepEqual((await service.draft(d)).issues, []);
  assert.equal(requests.length, 4);
  queue.push(new Response("{}"), new Response("{}"));
  await assert.rejects(service.draft(d), (e) => e.status === 422);
  assert.equal(requests.length, 6);
});

test("复核区分实际可见字段，保留直接替换建议与需人工删除的问题", async (t) => {
  const service = new ContentService(() => config),
    d = fixtureDeck();
  d.slides[1].layoutId = "editorial-columns";
  d.slides[1].keyMessage = d.slides[1].bullets[0];
  const before = structuredClone(d);
  let request;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    request = JSON.parse(init.body);
    return model({
      issues: [
        {
          slideId: d.slides[1].id,
          field: "bullets.0",
          message: "表达可更自然",
          suggestion: "建议先核对已有资料。",
        },
        {
          slideId: d.slides[1].id,
          field: "bullets.1",
          message: "需要删除重复条目，请人工处理",
          suggestion: "",
        },
      ],
    });
  });
  const review = await service.review(d);
  const input = JSON.parse(request.messages[1].content);
  assert.ok(input.slides[1].visibleFields.includes("bullets.0"));
  assert.ok(!input.slides[1].visibleFields.includes("keyMessage"));
  assert.ok(input.slides[0].visibleFields.includes("subtitle"));
  assert.match(request.messages[0].content, /可直接替换的完整文字/);
  assert.match(request.messages[0].content, /正文中的正常建议表达可以保留/);
  assert.equal(review.issues[0].suggestion, "建议先核对已有资料。");
  assert.equal(review.issues[1].suggestion, "");
  assert.deepEqual(d, before);
});

test("局部修改与设计调整保留未变字段的来源，不沿用已改文字的引用", () => {
  const d = fixtureDeck(),
    slide = d.slides[1];
  slide.provenance = Object.fromEntries(
    ["title", "bullets.0", "bullets.1"].map((field) => [
      field,
      [{ sourceId: "source-1", quote: "已有资料" }],
    ]),
  );
  assert.deepEqual(
    updateSlide(d, slide.id, { layoutPinned: true }).slides[1].provenance,
    slide.provenance,
  );
  const next = updateSlide(d, slide.id, {
    bullets: ["更改第一条", slide.bullets[1]],
  });
  assert.deepEqual(Object.keys(next.slides[1].provenance), [
    "title",
    "bullets.1",
  ]);
});

test("字段修改只返回授权字段、精简按字符验收且最多一次修正", async (t) => {
  const service = new ContentService(() => config),
    d = fixtureDeck(),
    slide = d.slides[1];
  slide.bullets[0] = "先收集资料，再逐项核对资料中的事实与范围。";
  const before = structuredClone(d),
    queue = [
      { text: "超长".repeat(20), title: "偷偷改标题" },
      { text: "逐项核对事实。", title: "仍然偷偷改标题" },
    ];
  const fetcher = t.mock.method(globalThis, "fetch", async () =>
    model(queue.shift()),
  );
  const result = await service.edit(d, {
    slideId: slide.id,
    inputRevision: 0,
    field: "bullets.0",
    instruction: "精简",
    maxChars: 10,
  });
  assert.equal(result.after, "逐项核对事实。");
  assert.equal(result.title, undefined);
  assert.deepEqual(d, before);
  assert.equal(fetcher.mock.callCount(), 2);
  await assert.rejects(
    service.edit(d, {
      slideId: slide.id,
      inputRevision: 1,
      field: "title",
      instruction: "改",
    }),
    (e) => e.status === 409,
  );
  await assert.rejects(
    service.edit(d, {
      slideId: slide.id,
      inputRevision: 0,
      field: "__proto__",
      instruction: "改",
    }),
    (e) => e.status === 400,
  );
});

test("本机API来源保护、乐观锁、配置不泄密及磁盘失败不假成功", async (t) => {
  const store = await storeFor();
  const { app } = await createApp({
    dataDir: store.root,
    config: { ...config, llmApiKey: "synthetic-test-token" },
    configPath: path.join(store.root, "missing-parent", ".env"),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, method = "POST", headers = {}) =>
    fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(base + "/api/health")).status, 200);
  assert.equal(
    (
      await fetch(base + "/api/config", {
        headers: { Origin: "https://example.com" },
      })
    ).status,
    403,
  );
  const masked = await (await fetch(base + "/api/config")).json();
  assert.equal(masked.llmApiKey, undefined);
  assert.equal(masked.hasLlmKey, true);
  assert.equal(
    (await post("/api/config", { llmModel: "not-saved" })).status,
    500,
  );
  assert.equal(
    (await (await fetch(base + "/api/config")).json()).llmModel,
    config.llmModel,
  );
  const created = await (
    await post("/api/decks", { deck: fixtureDeck() })
  ).json();
  assert.equal(
    (
      await post(
        `/api/decks/${created.deck.id}`,
        { deck: created.deck, expectedRevision: 0 },
        "PUT",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await post("/api/decks", { deck: fixtureDeck() }, "POST", {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base + "/api/not-real")).status, 404);
  for (const url of [
    "file:///tmp/model",
    "https://user:pass@example.com",
    "https://example.com?token=x",
    "https://example.com#fragment",
    "https://example.com\n",
  ]) {
    assert.equal((await post("/api/config", { llmApiUrl: url })).status, 400);
    assert.equal(
      (await post("/api/test-llm", { apiUrl: url, model: "mock" })).status,
      400,
    );
  }
});

test("API地址跨主机变更自动清空已存密钥，测试接口不向陌生地址复用密钥", async (t) => {
  const store = await storeFor();
  const { app } = await createApp({
    dataDir: store.root,
    config: {
      ...config,
      llmApiUrl: "https://api.deepseek.com",
      llmApiKey: "synthetic-secret",
      llmModel: "m",
    },
    configPath: path.join(store.root, "cfg.env"),
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) =>
    fetch(base + url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await (await fetch(base + "/api/config")).json()).hasLlmKey,
    true,
  );
  // 跨主机改地址、不带新密钥 → 已存密钥被清空，静默改地址无法外送 Bearer
  assert.equal(
    (await (await post("/api/config", { llmApiUrl: "https://evil.example.com" })).json())
      .hasLlmKey,
    false,
  );
  // 带新密钥一起提交 → 保留（正常换供应商不受影响）
  assert.equal(
    (
      await (
        await post("/api/config", {
          llmApiUrl: "https://api.deepseek.com",
          llmApiKey: "k2",
        })
      ).json()
    ).hasLlmKey,
    true,
  );
  // 同主机仅改路径（host 不变）→ 不清空
  assert.equal(
    (
      await (
        await post("/api/config", { llmApiUrl: "https://api.deepseek.com/v1" })
      ).json()
    ).hasLlmKey,
    true,
  );
  // test-llm 向陌生 host 但不带 key → 400（不回落已存密钥，且在发起网络前拦截）
  assert.equal(
    (await post("/api/test-llm", { apiUrl: "https://evil.example.com", model: "m" }))
      .status,
    400,
  );
});

test("损坏的图片任务隔离保留，不阻断文稿服务或自动重试付费任务", async (t) => {
  const store = await storeFor(),
    taskId = crypto.randomUUID();
  const file = store.file("tasks", taskId);
  await fs.writeFile(file, "{broken-task");
  await fs.writeFile(`${file}.bak`, "{broken-backup");
  const { app } = await createApp({ dataDir: store.root, config });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + "/api/health")).status, 200);
  const tasks = await (await fetch(base + "/api/image-tasks")).json();
  assert.deepEqual(tasks.tasks, []);
  assert.match(tasks.warnings[0], /未自动重试/);
  assert.equal(await fs.readFile(file, "utf8"), "{broken-task");
  assert.equal((await store.save(fixtureDeck(), 0)).deck.revision, 1);
});

test("远程图片拒绝内网、映射IPv6、凭据、文件协议及保留段", async () => {
  for (const ip of [
    "127.0.0.1",
    "10.2.3.4",
    "172.16.1.2",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "2001:0000::1",
    "2001:0db8::1",
    "2002:7f00:1::",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ["8.8.8.8", "2606:4700:4700::1111", "2001:4860:4860::8888"])
    assert.equal(isPublicAddress(ip), true, ip);
  for (const url of [
    "file:///tmp/a.png",
    "http://user:pass@example.com/a.png",
    "http://127.0.0.1/a.png",
    "http://[::ffff:127.0.0.1]/a.png",
  ])
    await assert.rejects(downloadImage(url));
});

test("图片队列最多2并发、去重、取消、缓存、旧版本与重启中断", async (t) => {
  const store = await storeFor();
  let d = fixtureDeck(5);
  d.slides = d.slides.map((s, i) => ({
    ...s,
    layoutId: i === 0 ? "cover-hero" : "image-top-story",
    visualIdea: `独立插图主题${i}`,
    omitVisual: false,
  }));
  d = (await store.save(d, 0)).deck;
  const queue = await new ImageTasks(store, () => config).init(),
    calls = [];
  let active = 0,
    peak = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    active++;
    peak = Math.max(peak, active);
    try {
      return await new Promise((resolve, reject) => {
        calls.push({
          resolve: () =>
            resolve(
              new Response(
                JSON.stringify({ data: [{ b64_json: png.split(",")[1] }] }),
              ),
            ),
          prompt: JSON.parse(init.body).prompt,
        });
        init.signal.addEventListener("abort", () => reject(new Error("取消")), {
          once: true,
        });
      });
    } finally {
      active--;
    }
  });
  const input = (i) => ({
    deckId: d.id,
    slideId: d.slides[i].id,
    inputRevision: d.slides[i].contentRevision,
    slot: 0,
  });
  const [a, duplicate] = await Promise.all([
    queue.enqueue(input(0)),
    queue.enqueue(input(0)),
  ]);
  assert.equal(a.requestId, duplicate.requestId);
  const b = await queue.enqueue(input(1)),
    c = await queue.enqueue(input(2));
  await waitFor(() => calls.length === 2);
  assert.equal(peak, 2);
  assert.equal(c.status, "queued");
  await queue.cancel(b.requestId);
  await waitFor(() => calls.length === 3);
  d = (
    await store.save(
      updateSlide(d, d.slides[2].id, { title: "新版本" }),
      d.revision,
    )
  ).deck;
  calls[0].resolve();
  calls[2].resolve();
  await waitFor(() => queue.active === 0);
  assert.equal(a.status, "completed");
  assert.equal(b.status, "cancelled");
  assert.equal(c.status, "stale");
  assert.match(calls[0].prompt, /不得包含文字/);
  assert.equal((await queue.enqueue(input(0))).requestId, a.requestId);
  const fake = { ...a, requestId: crypto.randomUUID(), status: "running" };
  await queue.persist(fake);
  const restarted = await new ImageTasks(store, () => config).init();
  assert.equal(restarted.tasks.get(fake.requestId).status, "interrupted");
  assert.equal(calls.length, 3);
});

test("Grsai只提交一次并查询同一ID；失败与取消不重新付费", async (t) => {
  assert.equal(isGrsaiProvider("https://api.grsai.com/v1"), true);
  assert.equal(isGrsaiProvider("https://grsai.com.example.org/v1"), false);
  const task = {
    provider: "https://api.grsai.com/v1",
    model: "gpt-image-2",
    size: "1536x1024",
    prompt: "无文字插图",
  };
  const requests = [],
    responses = [
      { code: 0, data: { id: "remote-test" } },
      { code: 0, data: { status: "running" } },
      {
        code: 0,
        data: {
          status: "succeeded",
          results: [{ b64_json: png.split(",")[1] }],
        },
      },
    ];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    requests.push({
      url,
      body: JSON.parse(init.body),
      redirect: init.redirect,
    });
    return new Response(JSON.stringify(responses.shift()));
  });
  let savedId;
  const image = await requestImage(
    task,
    "",
    AbortSignal.timeout(10000),
    async (value) => {
      savedId = value.providerTaskId;
    },
  );
  assert.equal(image.b64_json, png.split(",")[1]);
  assert.equal(savedId, "remote-test");
  assert.equal(
    requests.filter((r) => r.url.endsWith("/draw/completions")).length,
    1,
  );
  assert.equal(requests[0].body.webHook, "-1");
  assert.equal(requests[0].body.aspectRatio, "3:2");
  assert.equal(requests[0].redirect, "error");
  assert.deepEqual(
    requests.slice(1).map((r) => r.body),
    [{ id: savedId }, { id: savedId }],
  );
  responses.push(
    { code: 0, data: { id: "failed-test" } },
    { code: 0, data: { status: "failed" } },
  );
  await assert.rejects(
    requestImage({ ...task }, "", AbortSignal.timeout(5000), async () => {}),
    /Grsai生图失败/,
  );
  responses.push({ code: 0, data: { id: "cancel-test" } });
  const controller = new AbortController();
  await assert.rejects(
    requestImage({ ...task }, "", controller.signal, async () =>
      controller.abort(),
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(requests.length, 6);
});

test("图片真实尺寸决定contain位置和cover裁切，宽窄画框均不拉伸", async () => {
  assert.deepEqual(embeddedImageSize(png), { width: 1, height: 1 });
  assert.throws(() => embeddedImageSize("data:image/png;base64,AA=="), /尺寸/);
  const jpeg = Buffer.from([
    0xff, 0xd8, 0xff, 0xc0, 0, 11, 8, 0x03, 0x20, 0x04, 0xb0, 1, 1, 0x11, 0,
    0xff, 0xd9,
  ]);
  assert.deepEqual(
    embeddedImageSize("data:image/jpeg;base64," + jpeg.toString("base64")),
    { width: 1200, height: 800 },
  );
  for (const frame of [
    { x: 1, y: 1, w: 10, h: 2 },
    { x: 1, y: 1, w: 2, h: 5 },
  ]) {
    const p = imagePlacement(frame, { width: 1200, height: 800 }, "contain");
    assert.equal(p.sizing, undefined);
    assert.ok(Math.abs(p.w / p.h - 1.5) < 1e-8);
    assert.ok(p.w <= frame.w && p.h <= frame.h);
    assert.ok(Math.abs(p.x + p.w / 2 - frame.x - frame.w / 2) < 1e-8);
    assert.ok(Math.abs(p.y + p.h / 2 - frame.y - frame.h / 2) < 1e-8);
    const slides = [layoutFixture("image-top-story")];
    for (const fit of ["contain", "cover"]) {
      const scene = {
        contentRevision: slides[0].contentRevision,
        background: "#ffffff",
        issues: [],
        elements: [
          {
            kind: "image",
            assetId: "image-0",
            fit,
            ...Object.fromEntries(
              Object.entries(frame).map(([k, v]) => [k, v * 120]),
            ),
          },
        ],
      };
      const zip = await JSZip.loadAsync(
        await createPptx({
          slides,
          scenes: [scene],
          assets: { "image-0": { dataUrl: png } },
        }).write({ outputType: "nodebuffer" }),
      );
      const xml = await zip.file("ppt/slides/slide1.xml").async("string");
      const [, width, height] = xml.match(
        /<p:pic>[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/,
      );
      if (fit === "contain") {
        assert.equal(width, height);
        assert.doesNotMatch(xml, /<a:srcRect/);
      } else {
        const [, left, right, top, bottom] = xml
          .match(/<a:srcRect l="(\d+)" r="(\d+)" t="(\d+)" b="(\d+)"/)
          .map(Number);
        assert.equal(left, right);
        assert.equal(top, bottom);
        const visibleRatio =
          (1 - (left + right) / 1e5) / (1 - (top + bottom) / 1e5);
        assert.ok(
          Math.abs(Number(width) / Number(height) - visibleRatio) < 0.0001,
          JSON.stringify({
            frame,
            width,
            height,
            left,
            right,
            top,
            bottom,
            visibleRatio,
          }),
        );
        assert.ok(left > 0 || top > 0);
      }
    }
  }
});

test("PPTX包包含完整可编辑文字、字号坐标与嵌入图；版本或溢出阻断", async () => {
  const slides = [
    "cover-hero",
    "process-horizontal",
    "compare-two-columns",
    "image-top-story",
    "summary-action",
  ].map(layoutFixture);
  slides[1].bullets = ["登记", "确认", "准备", "执行", "验收", "归档"];
  slides[3].bullets = paragraphs;
  const assets = { "image-0": { dataUrl: png } };
  const scenes = slides.map((s, i) =>
    buildScene(s, { assets, slideIndex: i + 1, totalSlides: slides.length }),
  );
  const pptx = createPptx({ title: "原生导出验收", slides, scenes, assets });
  const bytes = await pptx.write({ outputType: "nodebuffer" });
  const zip = await JSZip.loadAsync(bytes);
  const files = Object.keys(zip.files).filter((n) =>
    /^ppt\/slides\/slide\d+\.xml$/.test(n),
  );
  assert.equal(files.length, slides.length);
  for (let i = 0; i < slides.length; i++) {
    const xml = await zip.file(`ppt/slides/slide${i + 1}.xml`).async("string");
    const actual = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      m[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"),
    );
    const expected = scenes[i].elements
      .filter((e) => e.kind === "text")
      .flatMap((e) => e.lines.filter(Boolean));
    assert.deepEqual(actual, expected);
    for (const e of scenes[i].elements.filter((e) => e.kind === "text")) {
      assert.ok(xml.includes(`sz="${Math.round(e.fontSize * 60)}"`));
      assert.ok(xml.includes(`x="${Math.round((e.x / 120) * 914400)}"`));
    }
    assert.ok(xml.includes("Microsoft YaHei"));
    assert.doesNotMatch(xml, /95%|300%|100万/);
  }
  assert.ok(
    Object.keys(zip.files).some(
      (n) => n.startsWith("ppt/media/") && !zip.files[n].dir,
    ),
  );
  const bad = structuredClone(scenes);
  bad[1].contentRevision++;
  assert.throws(() => createPptx({ slides, scenes: bad, assets }), /过期/);
  bad[1] = { ...scenes[1], issues: [{ severity: "error", message: "溢出" }] };
  assert.throws(() => createPptx({ slides, scenes: bad, assets }), /溢出/);
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile("artifacts/原生导出验收.pptx", bytes);
});

test("实际服务进程重启后文稿、版本和资产保留；启动器复用服务且不终止冲突端口", async (t) => {
  const store = await storeFor();
  const probe = createServer((_req, res) => res.end("unrelated-service"));
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  const env = {
    ...process.env,
    PORT: String(port),
    SLIDEFLOW_DATA_DIR: store.root,
    SLIDEFLOW_NO_BROWSER: "1",
    LLM_API_KEY: "",
    LLM_MODEL: "",
    GPTIMAGE2_API_KEY: "",
    GPTIMAGE2_MODEL: "",
  };
  const children = [];
  const stop = async (child) => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const exit = once(child, "exit");
    child.kill();
    await exit;
  };
  t.after(async () => {
    for (const child of children) await stop(child);
    probe.closeAllConnections();
    if (probe.listening) await new Promise((r) => probe.close(r));
  });
  const launch = async () => {
    const child = spawn(process.execPath, ["server/launch.js"], {
      cwd: path.resolve("."),
      env,
      windowsHide: true,
      signal: AbortSignal.timeout(15000),
    });
    children.push(child);
    let output = "";
    child.stdout.on("data", (b) => {
      output += b.toString();
    });
    child.stderr.on("data", (b) => {
      output += b.toString();
    });
    const [code] = await once(child, "exit");
    return { code, output };
  };
  const conflict = await launch();
  assert.equal(conflict.code, 1);
  assert.match(conflict.output, /未终止任何进程/);
  const base = `http://127.0.0.1:${port}`;
  assert.equal(await (await fetch(base)).text(), "unrelated-service");
  probe.closeAllConnections();
  await new Promise((r) => probe.close(r));
  const start = async () => {
    const child = spawn(process.execPath, ["server.js"], {
      cwd: path.resolve("."),
      env,
      windowsHide: true,
      stdio: "ignore",
    });
    children.push(child);
    await waitFor(async () => {
      assert.equal(child.exitCode, null, "服务提前退出");
      try {
        return (await fetch(base + "/api/health")).ok;
      } catch {
        return false;
      }
    });
    return child;
  };
  const post = async (url, body, method = "POST") => {
    const res = await fetch(base + url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.ok(res.ok, await res.clone().text());
    return res.json();
  };
  let child = await start();
  const reused = await launch();
  assert.equal(reused.code, 0);
  assert.match(reused.output, /已找到此项目/);
  const { asset } = await post("/api/assets", {
    dataUrl: png,
    name: "重启验收图片",
  });
  const d = fixtureDeck();
  d.slides[0].assets = [{ id: asset.id, fit: "contain" }];
  let { deck } = await post("/api/decks", { deck: d });
  deck = (
    await post(
      `/api/decks/${deck.id}`,
      {
        deck: updateSlide(deck, deck.slides[1].id, {
          title: "重启前的最后修改",
        }),
        expectedRevision: deck.revision,
      },
      "PUT",
    )
  ).deck;
  const taskId = crypto.randomUUID();
  await store.atomic(store.file("tasks", taskId), {
    requestId: taskId,
    deckId: deck.id,
    slideId: deck.slides[1].id,
    inputRevision: deck.slides[1].contentRevision,
    status: "running",
    slot: 0,
  });
  await stop(child);
  child = await start();
  const restored = await (await fetch(`${base}/api/decks/${deck.id}`)).json();
  assert.deepEqual(restored.deck, deck);
  assert.equal(
    (await (await fetch(`${base}/api/decks/${deck.id}/versions`)).json())
      .versions.length,
    1,
  );
  assert.deepEqual(
    Buffer.from(await (await fetch(base + asset.url)).arrayBuffer()),
    Buffer.from(png.split(",")[1], "base64"),
  );
  const { tasks } = await (
    await fetch(`${base}/api/image-tasks?deckId=${deck.id}`)
  ).json();
  assert.equal(tasks[0].status, "interrupted");
  const backup = await post("/api/backups/export", { deck });
  assert.equal(backup.assets[asset.id].dataUrl, png);
  await stop(child);
});
