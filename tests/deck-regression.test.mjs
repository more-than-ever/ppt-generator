import test from "node:test";
import assert from "node:assert/strict";
import {
  NEUTRAL_DESIGN,
  contrastRatio,
  normalizeDesign,
  resolveDesign,
  validateDesign,
} from "../shared/design.js";
import { buildScene, chooseLayout, deepen } from "../shared/slideScene.js";
import { contentRegions, LAYOUT_CATALOG } from "../shared/layouts.js";
import {
  makeDeck,
  slideScene,
  validateDeck,
  visibleFields,
} from "../shared/deck.js";
import {
  buildFactPolicy,
  findCopyIssues,
  lacksConcreteAnchor,
} from "../server/textGuards.js";
import { ContentService } from "../server/contentService.js";
import {
  buildDesignTokens,
  buildIllustrationPrompt,
} from "../server/designSystem.js";
import { fixtureDeck, layoutFixture, sampleDesigns } from "./fixtures.mjs";

const model = (value) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(value) } }],
    }),
  );
const serviceConfig = {
  llmApiUrl: "http://127.0.0.1:9999",
  llmApiKey: "",
  llmModel: "test-text",
};

test("AI设计校验：hex规范化、对比度自动修正、结构不合法回退", () => {
  const design = normalizeDesign({
    name: "曜黑鎏金",
    mood: "暗夜金属质感",
    palette: {
      bg: "#0e0e12",
      card: "#17171e",
      text: "#f2f2f5",
      muted: "#9b9ba4",
      accent: "#d4af37",
      border: "#2c2c36",
    },
  });
  assert.equal(design.palette.accent, "#D4AF37");
  assert.ok(contrastRatio(design.palette.text, design.palette.bg) >= 4.5);
  assert.ok(contrastRatio(design.palette.muted, design.palette.bg) >= 4.5);
  // 浅色文字配浅色底：自动压深直到可读，不丢弃色相方向。
  const fixed = normalizeDesign({
    name: "误配",
    palette: {
      bg: "#FFFFFF",
      card: "#FFFFFF",
      text: "#EEEEEE",
      muted: "#DDDDDD",
      accent: "#FF0000",
      border: "#DDDDDD",
    },
  });
  assert.ok(contrastRatio(fixed.palette.text, fixed.palette.bg) >= 4.5);
  assert.ok(contrastRatio(fixed.palette.muted, fixed.palette.bg) >= 4.5);
  // 结构不合法：非hex、缺字段、非对象。
  assert.equal(normalizeDesign({ palette: { bg: "red" } }), null);
  assert.equal(normalizeDesign({ palette: { bg: "#fff" } }), null);
  assert.equal(normalizeDesign("dark"), null);
  assert.equal(validateDesign({ palette: { bg: "red" } }).length, 6);
  // resolveDesign 兜底链：design > 旧theme键 > 应急中性。
  assert.equal(resolveDesign(design).name, "曜黑鎏金");
  assert.equal(resolveDesign("dark").name, "深岩");
  assert.equal(resolveDesign({ theme: "warm" }).name, "暖纸");
  assert.equal(resolveDesign(undefined).name, NEUTRAL_DESIGN.name);
  assert.equal(resolveDesign({ theme: "__proto__" }).name, NEUTRAL_DESIGN.name);
});

test("文稿schema：design贯穿校验，旧theme键迁移，非法design回退", () => {
  const blank = makeDeck({ title: "空白稿", slideCount: 6 });
  assert.equal(blank.design.name, NEUTRAL_DESIGN.name);
  assert.equal(blank.theme, undefined);
  const d = fixtureDeck();
  const custom = validateDeck({ ...d, design: sampleDesigns[1] });
  assert.equal(custom.design.name, "曜黑鎏金");
  assert.equal(custom.design.palette.accent, "#D4AF37");
  const recovered = validateDeck({ ...d, design: { palette: { bg: "red" } } });
  assert.equal(recovered.design.name, NEUTRAL_DESIGN.name);
  const legacy = validateDeck({ ...d, design: undefined, theme: "tech" });
  assert.equal(legacy.design.name, "深海");
  // design是对象，不受原型键名把戏影响。
  const tricky = validateDeck({
    ...d,
    design: JSON.parse('"toString"'),
  });
  assert.equal(tricky.design.name, NEUTRAL_DESIGN.name);
});

test("buildScene：AI配色贯穿场景，装饰随版式区分且不入侵内容区", () => {
  const design = sampleDesigns[1];
  const sceneOf = (id) =>
    buildScene(
      { ...layoutFixture(id), omitVisual: true },
      { design, checkAssets: false },
    );
  const rects = (s) => s.elements.filter((e) => e.kind === "rect");
  // 配色贯穿：背景、标题色来自palette。
  const cards = sceneOf("cards-row");
  assert.equal(cards.background, design.palette.bg);
  assert.equal(cards.issues.length, 0);
  const title = cards.elements.find((e) => e.field === "title");
  assert.equal(title.color, design.palette.text);
  // rows：卡片左侧点缀条。
  assert.ok(
    rects(cards).some((e) => e.w === 6 && e.fill === design.palette.accent),
    "rows左侧条",
  );
  // grid：卡片左上角点缀方块，且卡片无边框。
  const grid = sceneOf("grid-2x2");
  assert.equal(grid.issues.length, 0);
  assert.ok(
    rects(grid).some(
      (e) => e.w === 12 && e.h === 12 && e.fill === design.palette.accent,
    ),
    "grid方块",
  );
  assert.ok(
    rects(grid).some(
      (e) => e.fill === design.palette.card && e.stroke === null,
    ),
    "grid无边框卡",
  );
  // compare：卡片顶部通宽强调线。
  const compare = sceneOf("compare-two-columns");
  assert.equal(compare.issues.length, 0);
  assert.ok(
    rects(compare).some((e) => e.h === 8 && e.w > 400),
    "compare顶部线",
  );
  // bands：交替色带 + 方块标记，内容整体右移。
  const bands = sceneOf("evidence-bands");
  assert.equal(bands.issues.length, 0);
  assert.ok(
    rects(bands).some(
      (e) => e.w === 12 && e.h === 12 && e.fill === design.palette.accent,
    ),
    "bands方块",
  );
  assert.ok(
    !rects(bands).some((e) => e.w === 42 && e.h === 5),
    "bands不使用columns短条",
  );
  const slot0 = contentRegions("evidence-bands", layoutFixture("evidence-bands").bullets.length)[0];
  const bandBody = bands.elements.find((e) => e.field === "bullets.0.body");
  assert.ok(bandBody.x >= slot0.x * 16 + 39, "bands内容右移");
  // horizontal：步骤编号。
  const process = sceneOf("process-horizontal");
  assert.equal(process.issues.length, 0);
  assert.ok(
    process.elements.some((e) => e.field === "step.0" && e.text === "01"),
    "步骤编号",
  );
  // metrics：大数字下强调线。
  const metrics = sceneOf("metrics-big-number");
  assert.equal(metrics.issues.length, 0);
  assert.ok(
    rects(metrics).some((e) => e.w === 140 && e.h === 4),
    "metrics下划线",
  );
  // 标题下短线长度随版式变化：bands 160×3，columns默认 68×5。
  const rule = (s) =>
    rects(s).find((e) => e.y === 187 && e.h <= 6 && e.w <= 200);
  assert.deepEqual(rule(bands) && [rule(bands).w, rule(bands).h], [160, 3]);
  const columns = sceneOf("editorial-columns");
  assert.equal(columns.issues.length, 0);
  assert.deepEqual(
    rule(columns) && [rule(columns).w, rule(columns).h],
    [68, 5],
  );
  // 页缘结构按mode分工，只画在内容区外。
  assert.ok(
    rects(bands).some((e) => e.x === 0 && e.w === 10 && e.h === 900),
    "bands左书脊",
  );
  assert.ok(
    rects(metrics).some((e) => e.x === 1590 && e.w === 10 && e.h === 900),
    "metrics右书脊",
  );
  assert.ok(
    columns.elements.some(
      (e) => e.kind === "line" && e.y1 === 42 && e.x2 === 1520,
    ),
    "columns页眉线",
  );
  assert.ok(
    rects(compare).some((e) => e.h === 6 && e.w === 1600),
    "compare页面顶部accent线",
  );
  // 主题节奏：metrics/hero/compare整页压深一档；巨号文字不加粗（字重阶梯）。
  assert.equal(metrics.background, deepen(design.palette.bg));
  assert.equal(compare.background, deepen(design.palette.bg));
  assert.equal(columns.background, design.palette.bg);
  const metricNum = metrics.elements.find(
    (e) => e.kind === "text" && e.field.startsWith("bullets.0.metric"),
  );
  assert.equal(metricNum.bold, false);
  const hero = sceneOf("hero-statement");
  assert.equal(hero.background, deepen(design.palette.bg));
  assert.equal(
    hero.elements.find((e) => e.kind === "text" && e.field === "keyMessage")
      .bold,
    false,
  );
  const cover = sceneOf("cover-hero");
  assert.equal(
    cover.elements.find((e) => e.kind === "text" && e.field === "title").bold,
    false,
  );
  // 版式多样性：与前页同mode的版式在同等错误数下被降级。
  const pick = chooseLayout(layoutFixture("editorial-columns"), {
    previous: ["image-top-story"],
  });
  assert.notEqual(LAYOUT_CATALOG[pick].mode, "columns");
});

test("事实策略：写明机构与时间的公开事实放行，无来源裸数字仍被标出", () => {
  const policy = buildFactPolicy({ allowPublicSources: true });
  assert.match(policy, /公开事实/);
  assert.match(policy, /机构\/资料名称及时间/);
  // 资料中没有、但写明出处与时间的公开事实：不再拦截。
  const cited = findCopyIssues(
    "2024年中国汽车出口585.9万辆（中国汽车工业协会，2025年1月发布）。",
    { sourceText: "公司例行汇报材料", allowPublicSources: true },
  );
  assert.deepEqual(
    cited.filter((m) => m.includes("未在用户资料中出现")),
    [],
  );
  // 裸数字无出处：仍然标出，不能补造来源。
  const bare = findCopyIssues("本季度出口增长37%，表现强劲。", {
    sourceText: "公司例行汇报材料",
    allowPublicSources: true,
  });
  assert.ok(bare.some((m) => m.includes("未在用户资料中出现")));
  // 资料里已有的数字：放行。
  const fromSource = findCopyIssues("出口增长37%。", {
    sourceText: "会议记录：出口增长37%",
    allowPublicSources: true,
  });
  assert.deepEqual(
    fromSource.filter((m) => m.includes("未在用户资料中出现")),
    [],
  );
});

test("初稿生成：模型返回design即采用；不合法则统一修正，仍不合法回退并记录检查项", async (t) => {
  const d = fixtureDeck();
  const payload = (design) => ({ design, slides: d.slides });
  // 1) 合法design：直接采用。
  let queue = [payload(sampleDesigns[1])];
  t.mock.method(globalThis, "fetch", async () => model(queue.shift()));
  const service = new ContentService(() => serviceConfig);
  const ok = await service.draft(d);
  assert.equal(ok.deck.design.name, "曜黑鎏金");
  assert.deepEqual(ok.issues, []);
  // 2) 首次design不合法：反馈唯一一次统一修正，二次合法则采用。
  queue = [payload({ palette: { bg: "red" } }), payload(sampleDesigns[2])];
  let requests = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    requests += 1;
    JSON.parse(init.body);
    return model(queue.shift());
  });
  const repaired = await service.draft(d);
  assert.equal(requests, 2);
  assert.equal(repaired.deck.design.name, "松烟黛绿");
  assert.deepEqual(repaired.issues, []);
  // 3) 两次都不合法：保留文稿，回退应急配色，检查项如实记录。
  queue = [payload({ palette: { bg: "red" } }), payload(null)];
  const fallback = await service.draft(d);
  assert.equal(fallback.deck.design.name, NEUTRAL_DESIGN.name);
  assert.ok(fallback.issues.some((m) => m.includes("design不合法")));
  assert.ok(
    fallback.deck.generationReview.issues.some((i) =>
      i.message.includes("design不合法"),
    ),
  );
});

test("具体锚点：无数字的空泛条目被标出，带数字条目放行", () => {
  assert.equal(lacksConcreteAnchor("潜力巨大，前景广阔"), true);
  assert.equal(lacksConcreteAnchor("【判断】市场地位领先"), true);
  assert.equal(lacksConcreteAnchor("2023年全球需求同比增长约25%（IEA）"), false);
  assert.equal(lacksConcreteAnchor("【优势】单件成本较上代下降18%"), false);
  assert.equal(lacksConcreteAnchor("２０２４年出口数据"), false);
  assert.equal(lacksConcreteAnchor(""), false);
  assert.equal(lacksConcreteAnchor("   "), false);
});

test("初稿具体性：无数字锚点的笼统条目触发一次统一修正", async (t) => {
  const d = fixtureDeck();
  const vague = {
    design: sampleDesigns[1],
    slides: d.slides.map((s) => ({
      ...s,
      bullets: s.bullets.map(() => "市场前景广阔，需求持续增长"),
    })),
  };
  const anchored = { design: sampleDesigns[1], slides: d.slides };
  const queue = [vague, anchored];
  let fixMessage = "";
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    const messages = JSON.parse(init.body).messages;
    if (messages.length > 2) fixMessage = messages.at(-1).content;
    return model(queue.shift());
  });
  const service = new ContentService(() => serviceConfig);
  const result = await service.draft(d);
  assert.match(fixMessage, /过于笼统/);
  assert.deepEqual(result.issues, []);
});

test("风格定制：按描述生成design并校验；不合法修正一次后报错", async (t) => {
  const d = fixtureDeck();
  let queue = [{ design: sampleDesigns[1] }];
  let bodies = [];
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    bodies.push(JSON.parse(init.body));
    return model(queue.shift());
  });
  const service = new ContentService(() => serviceConfig);
  const ok = await service.restyle(d, "暗夜金属质感");
  assert.equal(ok.design.name, "曜黑鎏金");
  assert.match(bodies[0].messages[1].content, /暗夜金属质感/);
  // 裸design对象（无包裹）也兼容。
  queue = [sampleDesigns[2]];
  const bare = await service.restyle(d, "");
  assert.equal(bare.design.name, "松烟黛绿");
  // 两次都不合法：422，不返回伪风格。
  queue = [{ palette: { bg: "red" } }, null];
  await assert.rejects(() => service.restyle(d, "x"), /未达标/);
  // 描述类型不合法：400。
  await assert.rejects(() => service.restyle(d, 123), /风格描述不合法/);
});

test("配图提示词与设计令牌消费deck.design；旧theme调用兼容", () => {
  const tokens = buildDesignTokens({ design: sampleDesigns[1] });
  assert.equal(tokens.accent, "#D4AF37");
  assert.equal(tokens.styleName, "曜黑鎏金");
  assert.equal(tokens.styleMood, sampleDesigns[1].mood);
  const prompt = buildIllustrationPrompt({
    visualSubject: "港口整车装船场景",
    deckStyle: { design: sampleDesigns[1] },
  });
  assert.match(prompt, /#D4AF37/);
  assert.match(prompt, /暗夜金属质感/);
  assert.match(prompt, /不得包含文字/);
  // 旧调用方传theme键：仍可解析，不报错。
  const legacy = buildDesignTokens({ theme: "dark" });
  assert.equal(legacy.bg, "#0F1115");
});

test("renderSlide：prompt必须逐字包含全部页面文字，缺则修正循环，两次失败422", async (t) => {
  const service = new ContentService(() => ({
    llmModel: "m",
    llmApiKey: "k",
    llmApiUrl: "http://supplier.local",
  }));
  const sample = fixtureDeck();
  const target = sample.slides[1];
  const fullText = Object.values(visibleFields(target)).join("\n");
  const goodPlan = () => ({
    prompt: `杂志分栏构图，深色底金色点缀。画面文字依次为：\n${Object.values(
      visibleFields(target),
    )
      .map((t) => `「${t}」`)
      .join("\n")}`,
    layoutDescription: "左侧超大标题竖排，正文两栏错层排布，金色细线分隔。",
  });
  let calls = 0;
  t.mock.method(service, "json", async () => {
    calls++;
    return calls === 1
      ? { prompt: "只有部分文字的提示词", layoutDescription: "说明" }
      : goodPlan();
  });
  const result = await service.renderSlide(sample, target.id);
  assert.equal(calls, 2);
  assert.equal(result.inputRevision, target.contentRevision);
  assert.equal(result.deckId, sample.id);
  assert.match(result.prompt, /杂志分栏/);
  assert.match(result.layoutDescription, /竖排/);
  await assert.rejects(
    () => service.renderSlide(sample, "no-such-id"),
    /页面不存在/,
  );
  t.mock.method(service, "json", async () => ({
    prompt: "缺文字的提示词",
    layoutDescription: "说明",
  }));
  await assert.rejects(
    () => service.renderSlide(sample, target.id),
    /GPT排版方案未达标/,
  );
});

test("renderSlide：画面文字不得多于给定文字（「」双向守门，多字打回修正）", async (t) => {
  const service = new ContentService(() => ({
    llmModel: "m",
    llmApiKey: "k",
    llmApiUrl: "http://supplier.local",
  }));
  const sample = fixtureDeck();
  const target = sample.slides[1];
  const quoted = Object.values(visibleFields(target)).map((x) => `「${x}」`);
  let calls = 0;
  t.mock.method(service, "json", async () => {
    calls++;
    if (calls === 1)
      // 第一张：给定文字全包，但擅自多了一句口号
      return {
        prompt: `非对称留白构图。${quoted.join("，")}，角落点缀小字「超越自我 共创辉煌」`,
        layoutDescription: "超大焦点字右置，正文左对齐。",
      };
    return {
      prompt: `非对称留白构图。${quoted.join("，")}`,
      layoutDescription: "超大焦点字右置，正文左对齐。",
    };
  });
  const result = await service.renderSlide(sample, target.id);
  assert.equal(calls, 2, "多字方案应被打回修正一次");
  assert.match(result.prompt, /非对称留白/);
  assert.ok(!result.prompt.includes("超越自我"));
});

test("aiImage随内容编辑失效回退程序排版，schema保留aiImage与aiRender", () => {
  const sample = fixtureDeck();
  const withAi = validateDeck({
    ...sample,
    slides: sample.slides.map((s, i) =>
      i === 1
        ? {
            ...s,
            aiImage: { contentRevision: s.contentRevision, assetId: "a".repeat(64) },
            aiRender: {
              contentRevision: s.contentRevision,
              taskId: "b".repeat(36),
              description: "非对称留白，大字焦点。",
            },
          }
        : s,
    ),
  });
  assert.equal(withAi.slides[1].aiImage.assetId, "a".repeat(64));
  assert.equal(withAi.slides[1].aiRender.description, "非对称留白，大字焦点。");
  assert.equal(withAi.slides[0].aiImage, null);
  // 成图页的场景是铺满画布的整页图片；编辑后（版本变化）回退程序排版。
  const scene = slideScene(withAi, withAi.slides[1], 1, {});
  assert.equal(scene.ai, true);
  assert.equal(scene.elements.length, 1);
  assert.equal(scene.elements[0].kind, "image");
  assert.equal(scene.elements[0].w, 1600);
  assert.equal(scene.elements[0].assetId, "a".repeat(64));
  const edited = {
    ...withAi,
    slides: withAi.slides.map((s, i) =>
      i === 1 ? { ...s, contentRevision: s.contentRevision + 1 } : s,
    ),
  };
  const fallback = slideScene(edited, edited.slides[1], 1, {});
  assert.equal(fallback.ai, undefined);
  assert.ok(fallback.elements.some((e) => e.kind === "text"));
});
