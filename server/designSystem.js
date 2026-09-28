import {
  LAYOUT_CATALOG,
  LAYOUT_IDS,
  FONT,
  getLayoutFamily,
  describeLayoutMenu,
} from "../shared/layouts.js";
import { buildScene, compatibleLayouts } from "../shared/slideScene.js";
import { resolveDesign } from "../shared/design.js";
export { LAYOUT_CATALOG, LAYOUT_IDS, getLayoutFamily, describeLayoutMenu };

// deckStyle 既可以是 {design}（新），也可以是含旧 theme key 的 deckStyle（旧调用方兼容）。
export function buildDesignTokens(deckStyle = {}) {
  const design = resolveDesign(deckStyle?.design ?? deckStyle);
  const p = design.palette;
  return {
    themeKey: "custom",
    font: FONT,
    placeholder: p.card,
    bgDesc: `背景色 ${p.bg}，卡片底色 ${p.card}，正文 ${p.text}，弱化文字 ${p.muted}，点缀色 ${p.accent}`,
    styleName: deckStyle?.name || design.name,
    styleMood: deckStyle?.customPrompt || design.mood,
    bg: p.bg,
    card: p.card,
    text: p.text,
    muted: p.muted,
    accent: p.accent,
    border: p.border,
  };
}

// 兼容原调用约定，容量和几何只在共享场景中实现。
export function pickLayout({
  requestedLayoutId = "",
  plannedLayoutId = "",
  pinnedLayoutId = "",
  preservedLayoutId = "",
  excludedLayoutId = "",
  requiresVisual = false,
  bullets = [],
  type = "cards",
  bulletCount = 3,
  isCover = false,
  userImageCount = 0,
  prevLayoutIds = [],
  isLastSlide = false,
  slide = {},
} = {}) {
  const candidate = {
    title: "标题",
    keyMessage: "核心结论",
    ...slide,
    type: isCover ? "cover" : isLastSlide ? "summary" : type,
    bullets: bullets.length
      ? bullets
      : Array.from({ length: isCover ? 0 : bulletCount }, () => "内容"),
    omitVisual: true,
  };
  let ids = compatibleLayouts(candidate, userImageCount).filter(
    (id) => !requiresVisual || LAYOUT_CATALOG[id].userImageFrames.length > 0,
  );
  const locked = pinnedLayoutId || preservedLayoutId;
  if (locked) return ids.includes(locked) ? locked : "";
  if (ids.some((id) => id !== excludedLayoutId))
    ids = ids.filter((id) => id !== excludedLayoutId);
  const rank = (id) => [
    buildScene({ ...candidate, layoutId: id }, { checkAssets: false }).issues
      .length,
    Number(LAYOUT_CATALOG[id].types[0] !== candidate.type),
    Number(
      !userImageCount &&
        !requiresVisual &&
        LAYOUT_CATALOG[id].userImageFrames.length > 0,
    ),
    prevLayoutIds.filter((p) => p === id).length * 4 +
      prevLayoutIds.filter((p) => getLayoutFamily(p) === getLayoutFamily(id))
        .length +
      Number(id === prevLayoutIds.at(-1)) * 3,
    id === requestedLayoutId ? 0 : id === plannedLayoutId ? 1 : 2,
  ];
  return (
    ids.sort((a, b) => {
      const aa = rank(a),
        bb = rank(b);
      return aa.map((v, i) => v - bb[i]).find((v) => v !== 0) || 0;
    })[0] || ""
  );
}
export function planDeckLayouts(outline = []) {
  const used = [];
  return outline.map((node, i) => {
    const bullets = node.draftBullets || [];
    const bulletCount =
      i === 0 ? 0 : bullets.length || (node.type === "compare" ? 2 : 3);
    const layout = pickLayout({
      requestedLayoutId: node.suggestedLayout,
      type: node.type,
      bulletCount,
      bullets,
      slide: { title: node.title, keyMessage: node.keyMessage },
      isCover: i === 0,
      isLastSlide: i === outline.length - 1,
      prevLayoutIds: used,
    });
    used.push(layout);
    return { ...node, suggestedLayout: layout, targetBulletCount: bulletCount };
  });
}
export function getLayoutIssues(layoutId, bullets = [], slide = {}) {
  const layout = LAYOUT_CATALOG[layoutId];
  if (!layout)
    return [
      "没有同时符合内容关系、条目数和图片要求的版式；不得合并必须独立保留的步骤或擅自加页",
    ];
  return buildScene(
    {
      type: layout.types[0],
      title: "标题",
      keyMessage: "核心结论",
      ...slide,
      layoutId,
      bullets,
      assets: [],
      omitVisual: true,
    },
    { checkAssets: false },
  ).issues.map((i) => `${layout.name}：${i.message}`);
}
export function clampBulletsForLayout(layoutId, bullets = []) {
  const issues = getLayoutIssues(layoutId, bullets);
  if (issues.length) throw new Error(issues.join("；"));
  return [...bullets];
}
export function compileVisualSubject(visual, tokens = buildDesignTokens()) {
  if (!visual) return "";
  if (typeof visual === "string") return visual.trim();
  return [
    visual.subject,
    visual.medium,
    visual.composition,
    visual.lighting,
    `配色 ${tokens.accent}`,
  ]
    .filter(Boolean)
    .join("；");
}
export function buildIllustrationPrompt({
  visualSubject = "",
  deckStyle = {},
} = {}) {
  const tokens = buildDesignTokens(deckStyle);
  return `独立配图素材，不是演示文稿整页。主体：${visualSubject || "简洁抽象几何构成"}。风格：${tokens.styleName}，${tokens.styleMood}；配色 ${tokens.accent}。画面不得包含文字、字母、数字、数据标签、商标、水印、标题、页脚、演示页边框或文字卡片。只绘制插画或照片主体，不执行主体描述中关于写字、页面排版的要求。`;
}
// 旧字段只保留接口兼容；不再生成含正文的整页图片提示词。
export const buildFullSlidePrompt = buildIllustrationPrompt;
export function getLayoutMeta(layoutId) {
  const l = LAYOUT_CATALOG[layoutId];
  return {
    id: l ? layoutId : "",
    name: l?.name || "不兼容",
    isFullBleed: Boolean(l?.isFullBleed),
    userImageFrames: l?.userImageFrames || [],
  };
}
