// 百分比几何是预览、测量和导出的共同来源；不由模型输出自由坐标。
// 视觉风格不再预设：由模型在生成整套初稿时输出 design（见 shared/design.js），程序校验后使用。
export const FONT = "Microsoft YaHei";
const box = (x, y, w, h) => ({ x, y, w, h });
const title = box(5, 6, 90, 15);
const define = (name, types, min, max, mode, body, extras = {}) => ({
  name,
  types,
  minBullets: min,
  maxBullets: max,
  mode,
  body,
  title,
  gap: 3,
  userImageFrames: [],
  isFullBleed: false,
  bodyBudget: 90,
  pageBudget: 300,
  whenToUse: `${types.includes("process") ? "保持独立步骤与先后顺序" : types.includes("compare") ? "按相同维度等权对照" : "按实际内容组织"}，${min}–${max}个内容块`,
  ...extras,
});
export const LAYOUT_CATALOG = {
  "cover-hero": define(
    "封面 · 主视觉",
    ["cover"],
    0,
    0,
    "cover",
    box(6, 30, 50, 48),
    {
      forCover: true,
      isFullBleed: true,
      title: box(6, 26, 50, 31),
      subtitle: box(6, 62, 49, 20),
      textOnlyTitle: box(8, 28, 84, 30),
      textOnlySubtitle: box(8, 63, 80, 20),
      userImageFrames: [box(60, 12, 35, 76)],
    },
  ),
  "editorial-columns": define(
    "杂志式 · 开放分栏",
    ["cards"],
    2,
    4,
    "columns",
    box(5, 27, 90, 60),
  ),
  "evidence-bands": define(
    "全宽证据栏",
    ["cards", "metrics", "summary"],
    2,
    4,
    "bands",
    box(5, 25, 90, 63),
    { bodyBudget: 110, pageBudget: 320 },
  ),
  "step-staircase": define(
    "阶梯路线",
    ["process"],
    3,
    5,
    "stairs",
    box(5, 28, 90, 59),
  ),
  "summary-action": define(
    "全宽收束",
    ["summary"],
    2,
    4,
    "summary",
    box(7, 27, 86, 60),
  ),
  "image-top-story": define(
    "上图下文",
    ["cards", "statement", "summary"],
    1,
    4,
    "columns",
    box(5, 51, 90, 39),
    { userImageFrames: [box(5, 22, 90, 23)] },
  ),
  "split-visual-right": define(
    "左文右图",
    ["cards", "summary"],
    2,
    4,
    "rows",
    box(5, 25, 48, 63),
    { userImageFrames: [box(57, 25, 38, 63)] },
  ),
  "split-visual-left": define(
    "左图右文",
    ["cards", "summary"],
    2,
    4,
    "rows",
    box(47, 25, 48, 63),
    { userImageFrames: [box(5, 25, 38, 63)] },
  ),
  "cards-row": define("横向卡片", ["cards"], 3, 4, "cards", box(5, 26, 90, 62)),
  "grid-2x2": define(
    "四象限",
    ["cards", "compare"],
    4,
    4,
    "grid",
    box(5, 25, 90, 64),
  ),
  "process-horizontal": define(
    "横向流程",
    ["process"],
    2,
    8,
    "horizontal",
    box(5, 29, 90, 57),
    {
      gap: 2,
      flowGeometry: { direction: "horizontal", width: 90, height: 57 },
    },
  ),
  "timeline-vertical": define(
    "纵向时间线",
    ["process"],
    2,
    8,
    "vertical",
    box(8, 24, 84, 65),
    {
      gap: 1.5,
      flowGeometry: { direction: "vertical", width: 84, height: 65 },
    },
  ),
  "metrics-big-number": define(
    "大数字看板",
    ["metrics"],
    2,
    4,
    "metrics",
    box(5, 26, 90, 61),
  ),
  "compare-two-columns": define(
    "双栏对比",
    ["compare"],
    2,
    2,
    "compare",
    box(5, 26, 90, 62),
    { bodyBudget: 160 },
  ),
  "full-bleed-glass": define(
    "全景 · 悬浮卡片",
    ["statement"],
    2,
    3,
    "cards",
    box(5, 52, 90, 36),
    {
      isFullBleed: true,
      backgroundFrame: true,
      userImageFrames: [box(0, 0, 100, 100)],
    },
  ),
  "hero-statement": define(
    "核心结论",
    ["statement", "cards", "summary"],
    1,
    2,
    "hero",
    box(8, 68, 84, 20),
    { title: box(5, 6, 90, 12), statement: box(8, 25, 84, 35) },
  ),
  "summary-takeaways": define(
    "总结 · 要点收束",
    ["summary"],
    2,
    4,
    "rows",
    box(5, 24, 57, 64),
    { userImageFrames: [box(66, 24, 29, 59)] },
  ),
  "visual-hero-caption": define(
    "大图 · 图注",
    ["cards", "statement"],
    1,
    3,
    "rows",
    box(65, 25, 30, 63),
    { userImageFrames: [box(5, 25, 56, 63)] },
  ),
  "dual-visual-gallery": define(
    "双图对照",
    ["cards", "compare", "summary"],
    1,
    3,
    "columns",
    box(5, 74, 90, 16),
    { userImageFrames: [box(5, 23, 43.5, 44), box(51.5, 23, 43.5, 44)] },
  ),
};
export const LAYOUT_IDS = Object.keys(LAYOUT_CATALOG);
export function getLayoutFamily(id) {
  if (
    [
      "split-visual-right",
      "split-visual-left",
      "visual-hero-caption",
      "summary-takeaways",
    ].includes(id)
  )
    return "split";
  if (["cards-row", "grid-2x2", "metrics-big-number"].includes(id))
    return "grid";
  if (
    ["process-horizontal", "timeline-vertical", "step-staircase"].includes(id)
  )
    return "sequence";
  return id || "";
}
export function contentRegions(layoutId, count) {
  const l = LAYOUT_CATALOG[layoutId];
  if (!l || !count) return [];
  const { x, y, w, h } = l.body,
    gap = l.gap;
  return Array.from({ length: count }, (_, i) => {
    if (l.mode === "grid")
      return box(
        x + ((i % 2) * (w + gap)) / 2,
        y + (Math.floor(i / 2) * (h + gap)) / 2,
        (w - gap) / 2,
        (h - gap) / 2,
      );
    if (l.mode === "summary")
      return i === count - 1
        ? box(x, y + 39, w, h - 39)
        : box(
            x + (i * (w + gap)) / (count - 1),
            y,
            (w - gap * (count - 2)) / (count - 1),
            31,
          );
    if (["rows", "bands", "vertical"].includes(l.mode))
      return box(
        x,
        y + (i * (h + gap)) / count,
        w,
        (h - gap * (count - 1)) / count,
      );
    const cw = (w - gap * (count - 1)) / count;
    if (l.mode === "stairs")
      return box(
        x + i * (cw + gap),
        y + (count - 1 - i) * 5,
        cw,
        h - (count - 1) * 5,
      );
    return box(x + i * (cw + gap), y, cw, h);
  });
}
const regionText = (r) =>
  `x ${r.x.toFixed(1)}–${(r.x + r.w).toFixed(1)}%, y ${r.y.toFixed(1)}–${(r.y + r.h).toFixed(1)}%`;
for (const [id, l] of Object.entries(LAYOUT_CATALOG)) {
  l.promptLayout = ({ bulletCount }) =>
    `- 标题区域：${regionText(l.title)}。\n${contentRegions(id, bulletCount)
      .map(
        (r, i) =>
          `- 第${i + 1}块：${regionText(r)}，只呈现给定文字，短标签不补解释。`,
      )
      .join("\n")}`;
}
export function describeLayoutMenu() {
  return LAYOUT_IDS.filter((id) => !LAYOUT_CATALOG[id].forCover)
    .map((id) => {
      const l = LAYOUT_CATALOG[id];
      return `- ${id}（${l.name}）：${l.whenToUse}；type=${l.types.join("/")}；要点数 ${l.minBullets}-${l.maxBullets}；整页≤${l.pageBudget}字仅作参考，实际按区域换行测量；画框${l.userImageFrames.length}个`;
    })
    .join("\n");
}
