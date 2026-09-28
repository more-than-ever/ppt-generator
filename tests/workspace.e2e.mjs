import { test, expect } from "@playwright/test";
import { promises as fs } from "node:fs";
import JSZip from "jszip";
import { fixtureDeck, png, visualCases, sampleDesigns } from "./fixtures.mjs";
import { createPptx } from "../src/services/pptxExport.js";
import { LAYOUT_IDS } from "../shared/layouts.js";

async function seed(page, request, title = `验收-${Date.now()}`) {
  const d = fixtureDeck();
  d.title = title;
  const res = await request.post("/api/decks", { data: { deck: d } });
  expect(res.ok()).toBeTruthy();
  const saved = await res.json();
  await page.goto("/");
  await page.locator(".deck-cover").filter({ hasText: title }).click();
  await expect(page.locator(".thumbnail")).toHaveCount(4);
  return saved.deck;
}
const saved = (page) =>
  expect(page.locator(".save-status")).toHaveText("已保存到本机");

test("真实界面创建整套、改字、AI建议应用/放弃、撤销、刷新及PPTX", async ({
  page,
  request,
}) => {
  const title = `全链路-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("button", { name: "新建演示文稿", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "创建演示文稿" });
  await dialog.getByLabel("主题", { exact: true }).fill(title);
  await dialog.getByLabel("听众 / 用途").fill("设计团队");
  await dialog.getByRole("button", { name: "4 页", exact: true }).click();
  await dialog
    .getByLabel("参考资料")
    .fill("先核对资料中的事实和适用范围。保留原文限定条件，不新增承诺。");
  await dialog
    .getByRole("button", { name: "生成整套初稿", exact: true })
    .click();
  await expect(page.locator(".thumbnail")).toHaveCount(4);
  await expect(page.locator(".workspace-toolbar")).toContainText(
    "原生文字实时预览",
  );
  await saved(page);
  await page.locator(".thumbnail").nth(1).click();
  const bullets = page.locator(".inspector textarea");
  await bullets.nth(2).fill("修改后的完整正文，保留统计范围。");
  await expect(page.locator(".canvas-column svg.scene-canvas")).toContainText(
    "修改后的完整正文，保留统计范围。",
  );
  await saved(page);
  await page.getByLabel("AI修改字段").selectOption("bullets.0");
  await page.getByRole("button", { name: "口语化", exact: true }).click();
  await expect(page.locator(".change-preview")).toContainText(
    "我们先核对资料。",
  );
  await page.getByRole("button", { name: "放弃", exact: true }).click();
  await expect(bullets.nth(2)).toHaveValue("修改后的完整正文，保留统计范围。");
  await page.getByRole("button", { name: "口语化", exact: true }).click();
  await page.getByRole("button", { name: "应用建议", exact: true }).click();
  await expect(bullets.nth(2)).toHaveValue("我们先核对资料。");
  await expect(bullets.nth(0)).toHaveValue("资料整理 1");
  await page.getByTitle("撤销 Ctrl+Z").click();
  await expect(bullets.nth(2)).toHaveValue("修改后的完整正文，保留统计范围。");
  await saved(page);
  await page.screenshot({
    path: "artifacts/workspace-1440.png",
    fullPage: true,
  });
  await page.reload();
  await page.locator(".deck-cover").filter({ hasText: title }).click();
  await page.locator(".thumbnail").nth(1).click();
  await expect(page.locator(".inspector textarea").nth(2)).toHaveValue(
    "修改后的完整正文，保留统计范围。",
  );
  await page.getByRole("button", { name: "导出 PPTX", exact: true }).click();
  const gate = page.getByRole("dialog", { name: "导出前检查" });
  for (const check of await gate.getByRole("checkbox").all())
    await check.check();
  const downloading = page.waitForEvent("download");
  await gate.getByRole("button", { name: "下载可编辑 PPTX" }).click();
  const download = await downloading;
  await download.saveAs("artifacts/浏览器验收.pptx");
  const zip = await JSZip.loadAsync(
    await fs.readFile("artifacts/浏览器验收.pptx"),
  );
  expect(
    Object.keys(zip.files).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    ),
  ).toHaveLength(4);
  expect(await zip.file("ppt/slides/slide2.xml").async("string")).toContain(
    "修改后的完整正文",
  );
});

test("保存冲突保留本地文字，可明确放弃并重新读取", async ({
  page,
  request,
}) => {
  const d = await seed(page, request, `冲突验收-${Date.now()}`);
  await request.put(`/api/decks/${d.id}`, {
    data: {
      deck: { ...d, title: "另一个窗口已保存" },
      expectedRevision: d.revision,
    },
  });
  await page.getByLabel("文稿名称").fill("本窗口未提交");
  await expect(page.locator(".save-status")).toHaveText("版本冲突");
  await expect(page.getByLabel("文稿名称")).toHaveValue("本窗口未提交");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "放弃本地修改并重新读取" }).click();
  await expect(page.getByLabel("文稿名称")).toHaveValue("另一个窗口已保存");
  await saved(page);
});

test("服务不可达保留暂存；连接恢复重试保存；输入法和输入框不翻页", async ({
  page,
  request,
}) => {
  await seed(page, request);
  await page.locator(".thumbnail").nth(1).click();
  await page.route("**/api/decks/*", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  const title = page.locator(".inspector textarea").first();
  await title.fill("断网期间的手工修改");
  await expect(page.locator(".save-status")).toHaveText("保存失败");
  await title.press("ArrowRight");
  await expect(page.locator(".rail-heading")).toContainText("2 / 4");
  await page.evaluate(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await expect(page.locator(".rail-heading")).toContainText("2 / 4");
  await page.unroute("**/api/decks/*");
  await page.getByRole("button", { name: "重试保存" }).click();
  await saved(page);
  await expect(title).toHaveValue("断网期间的手工修改");
});

test("旧AI结果在编辑后不覆盖；真实图片队列失败后可重试应用", async ({
  page,
  request,
}) => {
  await seed(page, request);
  await page.locator(".thumbnail").nth(1).click();
  await page.getByLabel("AI修改字段").selectOption("bullets.0");
  await page.getByLabel("修改要求").fill("延迟返回一个精简建议");
  await page.getByRole("button", { name: "提出修改", exact: true }).click();
  await page
    .locator(".inspector textarea")
    .nth(2)
    .fill("此处是用户更晚的修改。");
  await expect(page.getByRole("alert")).toContainText("旧修改建议已丢弃");
  await expect(page.locator(".change-preview")).toHaveCount(0);
  await page.getByRole("button", { name: "设计", exact: true }).click();
  await page.getByLabel("兼容版式").selectOption("image-top-story");
  await page
    .getByRole("checkbox", { name: "省略空画框，不生成配图" })
    .uncheck();
  await page
    .getByLabel("配图主体", { exact: true })
    .fill(`失败重试的独立插图${Date.now()}`);
  await saved(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "生成本页配图" }).click();
  await expect(page.locator(".task-card")).toContainText("配图失败");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "按当前版本重试" }).click();
  await page.getByRole("button", { name: "应用配图", exact: true }).click();
  await expect(page.locator(".asset-card img")).toHaveCount(1);
  await expect(page.locator(".canvas-column svg image")).toHaveCount(1);
  await saved(page);
});

test("1440、1280与窄屏保持可操作；演示键盘翻页和退出", async ({
  page,
  request,
}) => {
  await seed(page, request);
  for (const size of [
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(size);
    if (size.width < 850) {
      await page.getByRole("button", { name: "编辑面板", exact: true }).click();
      await expect(page.locator(".inspector")).toBeVisible();
      await page.getByRole("button", { name: "画布", exact: true }).click();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await page.screenshot({
      path: `artifacts/workspace-${size.width}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "演示", exact: true }).click();
  await expect(page.locator(".presentation-overlay")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(".presentation-overlay")).toContainText(
    "第 2 页 / 4 页",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".presentation-overlay")).toHaveCount(0);
});

test("文稿库重命名、复制、删除及自包含备份恢复", async ({ page, request }) => {
  const title = `文稿库操作-${Date.now()}`;
  await seed(page, request, title);
  await page.getByRole("button", { name: "文稿库", exact: true }).click();
  const card = (name) =>
    page
      .locator(".deck-card")
      .filter({ has: page.locator(".deck-cover strong", { hasText: name }) });
  page.once("dialog", (d) => d.accept(`${title}-改名`));
  await card(title)
    .getByRole("button", { name: "重命名", exact: true })
    .click();
  await expect(card(`${title}-改名`)).toHaveCount(1);
  await card(`${title}-改名`)
    .getByRole("button", { name: "复制", exact: true })
    .click();
  await expect(card(`${title}-改名 副本`)).toHaveCount(1);
  const downloadEvent = page.waitForEvent("download");
  await card(`${title}-改名 副本`)
    .getByRole("button", { name: "备份", exact: true })
    .click();
  await (await downloadEvent).saveAs("artifacts/浏览器文稿备份.slideflow.json");
  page.once("dialog", (d) => d.accept());
  await card(`${title}-改名 副本`)
    .getByRole("button", { name: "删除", exact: true })
    .click();
  await expect(card(`${title}-改名 副本`)).toHaveCount(0);
  await page
    .getByLabel("导入备份")
    .setInputFiles("artifacts/浏览器文稿备份.slideflow.json");
  await expect(page.getByLabel("文稿名称")).toHaveValue(`${title}-改名 副本`);
  await expect(page.locator(".thumbnail")).toHaveCount(4);
  await saved(page);
});

test("刷新恢复未提交修改，资料编辑使复核失效，版本恢复保留旧稿", async ({
  page,
  request,
}) => {
  const title = `恢复验收-${Date.now()}`;
  const d = await seed(page, request, title);
  await page.locator(".thumbnail").nth(1).click();
  await page.route("**/api/decks/*", (route) =>
    route.request().method() === "PUT" ? route.abort() : route.continue(),
  );
  await page.locator(".inspector textarea").first().fill("未提交的页面标题");
  await expect(page.locator(".save-status")).toHaveText("保存失败");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await page.unroute("**/api/decks/*");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(".deck-cover").filter({ hasText: title }).click();
  await page.locator(".thumbnail").nth(1).click();
  await expect(page.locator(".inspector textarea").first()).toHaveValue(
    "未提交的页面标题",
  );
  await saved(page);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((k) =>
        k.startsWith("slideflow.pending."),
      ),
    ),
  ).toEqual([]);
  await page.getByRole("button", { name: "整套复核", exact: true }).click();
  await expect(page.locator(".workspace-toolbar")).toContainText(
    "原生文字实时预览",
  );
  await saved(page);
  await page.getByText("原始资料与修改历史", { exact: true }).click();
  await page
    .locator(".source-card textarea")
    .fill("修改后的原始资料，只保留明确的范围。");
  await saved(page);
  expect(
    (await (await request.get(`/api/decks/${d.id}`)).json()).deck.review,
  ).toBeNull();
  await page.getByRole("button", { name: "版本记录", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "版本记录" });
  page.once("dialog", (dialog) => dialog.accept());
  await dialog
    .locator(".version-row")
    .last()
    .getByRole("button", { name: "恢复" })
    .click();
  await page.locator(".thumbnail").nth(1).click();
  await expect(page.locator(".inspector textarea").first()).toHaveValue(
    "资料整理 1",
  );
  await saved(page);
  expect(
    (await (await request.get(`/api/decks/${d.id}/versions`)).json()).versions
      .length,
  ).toBeGreaterThan(1);
});

test("无模型可手工创建；设置失败不假成功，连接测试使用填写模型", async ({
  page,
}) => {
  await page.route("**/api/config", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: { llmModel: "", hasLlmKey: false } })
      : route.fulfill({ status: 500, json: { error: "模拟配置磁盘写入失败" } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "新建演示文稿", exact: true }).click();
  const create = page.getByRole("dialog", { name: "创建演示文稿" });
  await create.getByLabel("主题", { exact: true }).fill("无模型手工文稿");
  await expect(
    create.getByRole("button", { name: "生成整套初稿" }),
  ).toBeDisabled();
  await create.getByRole("button", { name: "创建空白稿" }).click();
  await expect(page.locator(".thumbnail")).toHaveCount(6);
  await page.locator(".inspector textarea").first().fill("仍可直接改字");
  await expect(page.locator(".canvas-column .scene-canvas")).toContainText(
    "仍可直接改字",
  );
  await saved(page);
  await page.getByTitle("模型设置").click();
  const settings = page.getByRole("dialog", { name: "本机模型设置" });
  await settings.getByLabel("实际模型名称").first().fill("手动选择的模型");
  let tested;
  await page.route("**/api/test-llm", (route) => {
    tested = route.request().postDataJSON();
    return route.fulfill({
      json: { success: true, message: "已使用指定模型完成测试" },
    });
  });
  await settings.getByRole("button", { name: "测试当前文案模型" }).click();
  await expect(settings.getByRole("status")).toContainText("已使用指定模型");
  expect(tested.model).toBe("手动选择的模型");
  await settings.getByRole("button", { name: "保存设置" }).click();
  await expect(settings.getByRole("alert")).toContainText("磁盘写入失败");
  await expect(settings.getByRole("status")).toHaveCount(0);
});

test("旧整页图片只用结构化文案转换，不作为独立配图", async ({
  page,
  request,
}) => {
  const d = fixtureDeck();
  d.title = `旧稿-${Date.now()}`;
  const asset = (
    await (
      await request.post("/api/assets", {
        data: { dataUrl: png, name: "旧整页" },
      })
    ).json()
  ).asset;
  d.slides[1].legacyImageUrl = `/api/assets/${asset.id}`;
  expect(
    (await request.post("/api/decks", { data: { deck: d } })).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.locator(".deck-cover").filter({ hasText: d.title }).click();
  await page.locator(".thumbnail").nth(1).click();
  await expect(page.getByAltText("旧稿整页图片，不可编辑")).toBeVisible();
  await page.getByRole("button", { name: "转换为原生页面" }).click();
  await expect(page.getByAltText("旧稿整页图片，不可编辑")).toHaveCount(0);
  await expect(page.locator(".canvas-column .scene-canvas")).toContainText(
    "核对已有资料",
  );
  await expect(page.locator(".canvas-column svg image")).toHaveCount(0);
  await saved(page);
});

test("弹窗循环焦点、屏蔽底层快捷键和输入法Escape，关闭后恢复焦点", async ({
  page,
  request,
}) => {
  await seed(page, request);
  await page.locator(".thumbnail").nth(1).click();
  const opener = page.getByTitle("模型设置");
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "本机模型设置" });
  const controls = dialog.locator(
    'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
  );
  await controls.first().focus();
  await page.keyboard.press("Shift+Tab");
  await expect(controls.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(controls.first()).toBeFocused();
  expect(
    await page
      .locator(".thumbnail")
      .first()
      .evaluate((el) => Boolean(el.closest("[inert]"))),
  ).toBeTruthy();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".rail-heading")).toContainText("2 / 4");
  await page.evaluate(() =>
    document.activeElement.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        isComposing: true,
        bubbles: true,
      }),
    ),
  );
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(
    await page
      .locator(".thumbnail")
      .first()
      .evaluate((el) => Boolean(el.closest("[inert]"))),
  ).toBeFalsy();
});

test("初稿残留问题刷新后仍定位和阻断导出，逐项确认可持久保存", async ({
  page,
  request,
}) => {
  const d = fixtureDeck();
  d.title = `初稿检查-${Date.now()}`;
  d.generationReview = {
    status: "complete",
    revisions: Object.fromEntries(
      d.slides.map((s) => [s.id, s.contentRevision]),
    ),
    issues: [
      {
        id: "generation-risk",
        slideId: d.slides[1].id,
        field: "bullets.0",
        message: "初稿生成检查：这条需要人工补充依据",
        suggestion: "",
        acknowledged: false,
      },
    ],
  };
  expect(
    (await request.post("/api/decks", { data: { deck: d } })).ok(),
  ).toBeTruthy();
  await page.goto("/");
  await page.locator(".deck-cover").filter({ hasText: d.title }).click();
  await page.reload();
  await page.locator(".deck-cover").filter({ hasText: d.title }).click();
  await page.getByRole("button", { name: "导出 PPTX", exact: true }).click();
  const gate = page.getByRole("dialog", { name: "导出前检查" });
  const issue = gate
    .locator(".issue-card")
    .filter({ hasText: "初稿生成检查：这条需要人工补充依据" });
  await expect(issue).toBeVisible();
  await expect(
    gate.getByRole("button", { name: "下载可编辑 PPTX" }),
  ).toBeDisabled();
  await issue.getByRole("checkbox").check();
  await saved(page);
  expect(
    (await (await request.get(`/api/decks/${d.id}`)).json()).deck
      .generationReview.issues[0].acknowledged,
  ).toBeTruthy();
  await page.keyboard.press("Escape");
  await page.locator(".thumbnail").nth(1).click();
  await page.getByRole("button", { name: "内容", exact: true }).click();
  await page
    .locator(".inspector textarea")
    .nth(2)
    .fill("人工修改后重新执行结构检查。");
  await saved(page);
  expect(
    (await (await request.get(`/api/decks/${d.id}`)).json()).deck
      .generationReview,
  ).toBeNull();
});

test("长文、混排、2/5/6/8步流程的真实字体边界与Office样例", async ({
  page,
}) => {
  const samples = [];
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const spec of visualCases) {
    await page.goto(
      `http://127.0.0.1:5173/tests/visual.html?case=${encodeURIComponent(spec.name)}&design=${encodeURIComponent(sampleDesigns[0].name)}`,
    );
    await page.waitForFunction(
      () => window.sample && document.querySelectorAll("tspan").length,
    );
    const sample = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll("svg text")].map((el) => {
        const b = el.getBBox();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      return { ...window.sample, boxes };
    });
    expect(sample.scene.issues, spec.name).toEqual([]);
    const texts = sample.scene.elements.filter((e) => e.kind === "text");
    for (const [i, box] of sample.boxes.entries()) {
      expect(box.x, `${spec.name}/${texts[i].field}`).toBeGreaterThanOrEqual(
        texts[i].x - 2,
      );
      expect(box.y).toBeGreaterThanOrEqual(texts[i].y - 2);
      expect(box.x + box.w).toBeLessThanOrEqual(texts[i].x + texts[i].w + 2);
      expect(box.y + box.h).toBeLessThanOrEqual(texts[i].y + texts[i].h + 2);
    }
    for (let i = 0; i < sample.boxes.length; i++)
      for (let j = i + 1; j < sample.boxes.length; j++) {
        const a = sample.boxes[i],
          b = sample.boxes[j];
        expect(
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
            Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1,
          `${spec.name}的字形相交`,
        ).toBeFalsy();
      }
    await page.screenshot({ path: `artifacts/dense/${spec.name}.png` });
    samples.push(sample);
  }
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  const { root } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", {
    nodeId: root.nodeId,
    selector: "svg text",
  });
  const { fonts } = await cdp.send("CSS.getPlatformFontsForNode", { nodeId });
  expect(
    fonts.some(
      (f) => /Microsoft YaHei/i.test(f.familyName) && f.glyphCount > 0,
    ),
    JSON.stringify(fonts),
  ).toBeTruthy();
  await cdp.detach();
  const assets = Object.assign({}, ...samples.map((s) => s.assets));
  const pptx = createPptx({
    title: "真实字体与Office验收",
    slides: samples.map((s) => s.slide),
    scenes: samples.map((s) => s.scene),
    assets,
  });
  await fs.writeFile(
    "artifacts/真实字体与Office验收.pptx",
    await pptx.write({ outputType: "nodebuffer" }),
  );
  await fs.writeFile(
    "artifacts/office-expected.json",
    JSON.stringify(
      samples.map((s) => ({
        name: s.slide.title,
        texts: s.scene.elements
          .filter((e) => e.kind === "text")
          .flatMap((e) => e.lines.filter(Boolean)),
        images: s.scene.elements.filter((e) => e.kind === "image").length,
      })),
      null,
      2,
    ),
  );
});

test("19版式×多套AI定制配色真实字体样本、SVG实际字形边界与截图", async ({ page }) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 1600, height: 900 });
  for (const design of sampleDesigns)
    for (const layout of LAYOUT_IDS) {
      await page.goto(
        `http://127.0.0.1:5173/tests/visual.html?design=${encodeURIComponent(design.name)}&layout=${layout}`,
      );
      await page.waitForFunction(
        () => window.sample && document.querySelectorAll("tspan").length,
      );
      const result = await page.evaluate(() => {
        const texts = [...document.querySelectorAll("svg text")];
        const boxes = texts.map((el) => {
          const b = el.getBBox();
          return {
            text: el.textContent,
            x: b.x,
            y: b.y,
            w: b.width,
            h: b.height,
          };
        });
        return {
          issues: window.sample.scene.issues,
          boxes,
          fonts: document.fonts.check('32px "Microsoft YaHei"'),
        };
      });
      expect(result.issues, `${design.name}/${layout}`).toEqual([]);
      expect(result.fonts).toBeTruthy();
      for (const box of result.boxes) {
        expect(box.x, box.text).toBeGreaterThanOrEqual(0);
        expect(box.y, box.text).toBeGreaterThanOrEqual(0);
        expect(box.x + box.w, box.text).toBeLessThanOrEqual(1601);
        expect(box.y + box.h, box.text).toBeLessThanOrEqual(901);
      }
      await page.screenshot({
        path: `artifacts/layouts/${design.name}-${layout}.png`,
      });
    }
  for (const design of sampleDesigns) {
    const theme = design.name;
    await page.setViewportSize({ width: 1600, height: 1260 });
    await page.goto("http://127.0.0.1:5173/tests/visual.html");
    await page.waitForFunction(() => window.sample);
    await page.evaluate(
      ({ theme, layouts }) => {
        document.body.style.cssText =
          'margin:0;background:#e8ede9;font:16px "Microsoft YaHei";';
        document.body.innerHTML = "";
        const grid = document.createElement("main");
        grid.style.cssText =
          "display:grid;grid-template-columns:repeat(4,400px)";
        for (const layout of layouts) {
          const cell = document.createElement("div"),
            img = document.createElement("img"),
            label = document.createElement("div");
          img.src = `/artifacts/layouts/${theme}-${layout}.png`;
          img.style.cssText = "display:block;width:400px;height:225px";
          label.textContent = `${theme} / ${layout}`;
          label.style.height = "27px";
          cell.append(img, label);
          grid.append(cell);
        }
        document.body.append(grid);
      },
      { theme, layouts: LAYOUT_IDS },
    );
    await page.waitForFunction(() =>
      [...document.images].every((i) => i.complete && i.naturalWidth),
    );
    await page.screenshot({
      path: `artifacts/contact-${theme}.png`,
      fullPage: true,
    });
  }
});
