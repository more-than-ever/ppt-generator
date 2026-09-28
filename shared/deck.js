import { chooseLayout, buildScene, CANVAS } from "./slideScene.js";
import { normalizeDesign, resolveDesign } from "./design.js";
export const SCHEMA_VERSION = 1;
export const newId = () => globalThis.crypto.randomUUID();
export const contentFields = [
  "type",
  "title",
  "subtitle",
  "keyMessage",
  "bullets",
  "layoutId",
  "layoutPinned",
  "assets",
  "omitVisual",
  "visualIdea",
  "speakerNotes",
  "legacyImageUrl",
];
const fail = (message) => {
  throw Object.assign(new Error(message), { status: 400 });
};
const str = (value, max = 20000) => {
  if (typeof value !== "string" || value.length > max)
    fail("文本字段类型或长度不合法");
  return value;
};
export const validId = (id) =>
  typeof id === "string" && /^[a-zA-Z0-9_-]{1,80}$/.test(id);
const id = (value) => {
  if (!validId(value)) fail("标识不合法");
  return value;
};
const integer = (value, min, max) => {
  if (!Number.isInteger(value) || value < min || value > max)
    fail("版本或数量不合法");
  return value;
};
export function validateDeck(raw) {
  if (!raw || raw.schemaVersion !== 1) fail("不支持的文稿版本");
  if (
    !Array.isArray(raw.slides) ||
    raw.slides.length < 3 ||
    raw.slides.length > 20
  )
    fail("文稿必须包含3–20页");
  const design = normalizeDesign(raw.design) || resolveDesign(raw.theme);
  if (!Array.isArray(raw.sources || []) || (raw.sources || []).length > 100)
    fail("资料数量或格式不合法");
  if (!Array.isArray(raw.history || []) || (raw.history || []).length > 2000)
    fail("历史数量或格式不合法");
  const seen = new Set();
  const slides = raw.slides.map((s) => {
    if (!s || typeof s !== "object") fail("页面格式不合法");
    id(s.id);
    if (seen.has(s.id)) fail("页面标识重复");
    seen.add(s.id);
    if (
      ![
        "cover",
        "cards",
        "summary",
        "compare",
        "metrics",
        "process",
        "statement",
      ].includes(s.type)
    )
      fail("页面关系不合法");
    if (!Array.isArray(s.bullets) || s.bullets.length > 40)
      fail("正文条目不合法");
    if (
      !Array.isArray(s.assets) ||
      s.assets.length > 2 ||
      s.assets.some((a) => !a || !validId(a.id))
    )
      fail("图片引用不合法");
    if (
      s.legacyImageUrl &&
      !/^\/api\/assets\/[a-zA-Z0-9_-]{1,80}$/.test(s.legacyImageUrl)
    )
      fail("旧图片必须引用本机资产");
    return {
      id: s.id,
      type: s.type,
      contentRevision: integer(
        s.contentRevision ?? 0,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
      title: str(s.title, 500),
      subtitle: str(s.subtitle || "", 2000),
      keyMessage: str(s.keyMessage || "", 5000),
      bullets: s.bullets.map((b) => str(b, 20000)),
      layoutId: str(s.layoutId || "", 80),
      layoutPinned: Boolean(s.layoutPinned),
      omitVisual: Boolean(s.omitVisual),
      assets: s.assets.map((a) => ({
        id: id(a.id),
        fit: a.fit === "cover" ? "cover" : "contain",
      })),
      visualIdea: str(s.visualIdea || "", 4000),
      speakerNotes: str(s.speakerNotes || "", 20000),
      provenance: sanitizeProvenance(s.provenance),
      legacyImageUrl: /^\/api\/assets\/[\w-]+$/.test(s.legacyImageUrl || "")
        ? s.legacyImageUrl
        : "",
      aiImage: sanitizeAiImage(s.aiImage),
      aiRender: sanitizeAiRender(s.aiRender),
    };
  });
  if (
    slides[0].type !== "cover" ||
    slides.at(-1).type !== "summary" ||
    slides.slice(1, -1).some((s) => ["cover", "summary"].includes(s.type))
  )
    fail("封面和结尾关系不合法");
  const sources = (raw.sources || []).map((s) => {
    if (!s || typeof s !== "object") fail("资料条目格式不合法");
    return { id: id(s.id), name: str(s.name, 200), text: str(s.text, 200000) };
  });
  if (
    sources.length > 100 ||
    new Set(sources.map((s) => s.id)).size !== sources.length
  )
    fail("资料标识重复或数量过多");
  const history = (raw.history || []).map((h) => {
    if (!h || typeof h !== "object") fail("历史条目格式不合法");
    if (h.slideId !== null && !slides.some((s) => s.id === h.slideId))
      fail("历史页面标识不存在");
    return {
      slideId: h.slideId === null ? null : id(h.slideId),
      text: str(h.text, 20000),
      at: str(h.at || "", 50),
    };
  });
  if (history.length > 2000) fail("历史过长，请备份后另建文稿");
  return {
    schemaVersion: 1,
    id: id(raw.id),
    revision: integer(raw.revision ?? 0, 0, Number.MAX_SAFE_INTEGER),
    title: str(raw.title, 200),
    audience: str(raw.audience || "", 500),
    mode: raw.mode === "expand" ? "expand" : "sources",
    design,
    slides,
    sources,
    history,
    confirmations: Object.fromEntries(
      Object.entries(raw.confirmations || {}).filter(
        ([key, value]) =>
          key.length <= 160 &&
          typeof value === "string" &&
          value.length <= 20000,
      ),
    ),
    review: sanitizeReview(raw.review, slides),
    generationReview: sanitizeReview(raw.generationReview, slides),
    updatedAt: str(raw.updatedAt || "", 50),
  };
}
// GPT 整页渲染结果与排队态的结构化校验：落库前做形状检查防脏数据。
function sanitizeAiImage(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Number.isInteger(raw.contentRevision)) return null;
  if (!validId(raw.assetId)) return null;
  return { contentRevision: raw.contentRevision, assetId: raw.assetId };
}
function sanitizeAiRender(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (!Number.isInteger(raw.contentRevision)) return null;
  if (!validId(raw.taskId)) return null;
  return {
    contentRevision: raw.contentRevision,
    taskId: raw.taskId,
    description:
      typeof raw.description === "string" ? raw.description.slice(0, 2000) : "",
  };
}
// 页面可见字段：内容非空才需要进入生图提示词。
export function visibleFields(slide) {
  const fields = {};
  if (String(slide.title || "").trim()) fields.title = slide.title;
  if (String(slide.subtitle || "").trim()) fields.subtitle = slide.subtitle;
  if (String(slide.keyMessage || "").trim())
    fields.keyMessage = slide.keyMessage;
  (slide.bullets || []).forEach((b, i) => {
    if (String(b || "").trim()) fields[`bullets.${i}`] = b;
  });
  return fields;
}
export function sanitizeProvenance(raw = {}) {
  const result = {};
  for (const [field, refs] of Object.entries(raw || {})) {
    if (
      !/^(title|subtitle|keyMessage|bullets\.\d+)$/.test(field) ||
      !Array.isArray(refs)
    )
      continue;
    result[field] = refs
      .slice(0, 20)
      .map((r) => ({ sourceId: id(r?.sourceId), quote: str(r?.quote, 10000) }));
  }
  return result;
}
function sanitizeReview(raw, slides) {
  if (!raw || !["complete", "failed"].includes(raw.status)) return null;
  if (slides.some((s) => raw.revisions?.[s.id] !== s.contentRevision))
    return null;
  if (!Array.isArray(raw.issues || [])) fail("复核问题格式不合法");
  const revisions = Object.fromEntries(
    slides.map((s) => [
      s.id,
      integer(raw.revisions?.[s.id] ?? -1, -1, Number.MAX_SAFE_INTEGER),
    ]),
  );
  return {
    status: raw.status,
    revisions,
    error: str(raw.error || "", 1000),
    issues: (raw.issues || []).slice(0, 300).map((i) => {
      const slide = i && slides.find((s) => s.id === i.slideId);
      if (
        !slide ||
        typeof i.field !== "string" ||
        !/^(title|subtitle|keyMessage|bullets\.\d+)$/.test(i.field) ||
        (i.field.startsWith("bullets.") &&
          Number(i.field.split(".")[1]) >= slide.bullets.length)
      )
        fail("复核问题缺少有效页面或字段定位");
      return {
        id: id(i.id),
        slideId: slide.id,
        field: i.field,
        message: str(i.message, 2000),
        suggestion: str(i.suggestion || "", 20000),
        acknowledged: Boolean(i.acknowledged),
      };
    }),
  };
}
export function makeDeck({
  title,
  audience = "",
  slideCount = 6,
  design = null,
  mode = "sources",
  sources = [],
}) {
  integer(Number(slideCount), 3, 20);
  return {
    schemaVersion: 1,
    id: newId(),
    revision: 0,
    title: title.trim(),
    audience,
    design: resolveDesign(design),
    mode,
    sources,
    history: [],
    review: null,
    slides: Array.from({ length: Number(slideCount) }, (_, i) => ({
      id: newId(),
      contentRevision: 0,
      type:
        i === 0 ? "cover" : i === Number(slideCount) - 1 ? "summary" : "cards",
      title: i === 0 ? title.trim() : "",
      subtitle: i === 0 ? audience : "",
      keyMessage: "",
      bullets: i === 0 ? [] : ["", ""],
      layoutId:
        i === 0
          ? "cover-hero"
          : i === Number(slideCount) - 1
            ? "summary-action"
            : "editorial-columns",
      layoutPinned: false,
      assets: [],
      omitVisual: true,
      visualIdea: "",
      provenance: {},
    })),
  };
}
export function updateSlide(deck, slideId, patch, measure) {
  return {
    ...deck,
    review: null,
    generationReview: null,
    slides: deck.slides.map((s) => {
      if (s.id !== slideId) return s;
      const next = {
        ...s,
        ...patch,
        id: s.id,
        contentRevision: s.contentRevision + 1,
        provenance:
          patch.provenance ||
          Object.fromEntries(
            Object.entries(s.provenance || {}).filter(([field]) => {
              if (field.startsWith("bullets.")) {
                const index = Number(field.split(".")[1]);
                return (
                  !patch.bullets || patch.bullets[index] === s.bullets[index]
                );
              }
              return patch[field] === undefined || patch[field] === s[field];
            }),
          ),
      };
      if (!next.layoutPinned)
        next.layoutId =
          chooseLayout(next, { measure, design: deck.design }) || next.layoutId;
      return next;
    }),
  };
}
export function sourceIssues(deck) {
  const result = [];
  for (const slide of deck.slides) {
    const fields = {
      title: slide.title,
      subtitle: slide.subtitle,
      keyMessage: slide.keyMessage,
      ...Object.fromEntries(slide.bullets.map((b, i) => [`bullets.${i}`, b])),
    };
    for (const [field, text] of Object.entries(fields)) {
      if (!text?.trim()) continue;
      const refs = slide.provenance?.[field] || [];
      const valid =
        refs.length &&
        refs.every(
          (r) =>
            r.quote?.trim() &&
            deck.sources.some(
              (s) => s.id === r.sourceId && s.text.includes(r.quote),
            ),
        );
      const direct = deck.sources.some((s) => s.text.includes(text));
      if (!direct)
        result.push({
          id: `${slide.id}-${field}`,
          slideId: slide.id,
          field,
          severity: "warning",
          message: valid
            ? "来源片段存在，仍需核对原文是否支持此表述"
            : "无直接对应原文，需核对事实、适用范围及承诺",
          refs,
          text,
          acknowledged: deck.confirmations?.[`${slide.id}-${field}`] === text,
        });
    }
  }
  return result;
}
// 单页场景：GPT 整页渲染页吃 AI 图片（预览/演示/导出同一数据），
// 内容被编辑（contentRevision 变化）即失效回退程序排版。
export function slideScene(
  deck,
  slide,
  index,
  { assets = {}, measure } = {},
) {
  if (slide.aiImage?.contentRevision === slide.contentRevision)
    return {
      sceneVersion: 1,
      canvas: CANVAS,
      elements: [
        {
          kind: "image",
          x: 0,
          y: 0,
          w: CANVAS.width,
          h: CANVAS.height,
          assetId: slide.aiImage.assetId,
          fit: "cover",
        },
      ],
      issues: [],
      contentRevision: slide.contentRevision,
      layoutId: slide.layoutId,
      background: deck.design.palette.bg,
      ai: true,
    };
  return buildScene(slide, {
    design: deck.design,
    assets,
    measure,
    slideIndex: index + 1,
    totalSlides: deck.slides.length,
  });
}
export function deckScenes(deck, assets, measure) {
  return deck.slides.map((s, i) => slideScene(deck, s, i, { assets, measure }));
}
