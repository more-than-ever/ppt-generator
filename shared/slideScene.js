import {
  LAYOUT_CATALOG,
  LAYOUT_IDS,
  FONT,
  contentRegions,
  getLayoutFamily,
} from "./layouts.js";
import { resolveDesign, contrastRatio, deepen } from "./design.js";
export { LAYOUT_CATALOG, LAYOUT_IDS, FONT };
export { contrastRatio, resolveDesign, deepen };
export const CANVAS = { width: 1600, height: 900 };
export const pxBox = (r) => ({
  x: r.x * 16,
  y: r.y * 9,
  w: r.w * 16,
  h: r.h * 9,
});
export function splitBullet(value) {
  const text = String(value ?? "").trim();
  const m = text.match(
    /^(?:【([^】]+)】\s*[:：]?|([^：:\n]{1,24})[:：])\s*([\s\S]*)$/,
  );
  return m
    ? { head: text.slice(0, text.length - m[3].length), body: m[3] }
    : { head: "", body: text };
}
// 服务端使用保守估算；浏览器必须注入真实字体测量结果。
export const estimateWidth = (text, size) =>
  [...text].reduce(
    (sum, c) => sum + (/[\x00-\xff]/.test(c) ? 0.62 : 1) * size,
    0,
  );
export async function waitForFonts() {
  if (typeof document === "undefined") return;
  await document.fonts.load(`32px "${FONT}"`, "中文排版");
  await document.fonts.load(`700 56px "${FONT}"`, "中文标题");
  await document.fonts.ready;
}
export function createTextMeasurer() {
  if (typeof document === "undefined") return estimateWidth;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return estimateWidth;
  const measure = (text, size, bold = false) => {
    context.font = `${bold ? 700 : 400} ${size}px "${FONT}"`;
    return context.measureText(text).width;
  };
  measure.metrics = (size, bold = false) => {
    context.font = `${bold ? 700 : 400} ${size}px "${FONT}"`;
    const metrics = context.measureText("国Ag");
    return {
      ascent: metrics.fontBoundingBoxAscent ?? size * 1.1,
      descent: metrics.fontBoundingBoxDescent ?? size * 0.25,
    };
  };
  return measure;
}
export function wrapText(
  text,
  width,
  size,
  measure = estimateWidth,
  bold = false,
) {
  const lines = [];
  for (const paragraph of String(text).replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    const tokens =
      paragraph.match(/[A-Za-z0-9]+(?:[-_./][A-Za-z0-9]+)*|[\s\S]/g) || [];
    for (const token of tokens) {
      const chunks = measure(token, size, bold) > width ? [...token] : [token];
      for (const chunk of chunks) {
        if (line && measure(line + chunk, size, bold) > width) {
          // 中文闭合标点不孤立到行首；保留全部字符。
          if (/^[，。！？；：、）》】」』]/.test(chunk) && line.length > 1) {
            const chars = [...line];
            const last = chars.pop();
            lines.push(chars.join(""));
            line = last + chunk;
          } else {
            lines.push(line);
            line = chunk;
          }
        } else line += chunk;
      }
    }
    lines.push(line);
  }
  return lines;
}
const metricPattern =
  /[-+]?\d+(?:\.\d+)?\s*(?:[%％]|亿元|万元|万人|万辆|万|亿|倍|元|人|个|台|次)/;
export function metricValue(text) {
  const values =
    String(text).match(new RegExp(metricPattern.source, "g")) || [];
  return values.length === 1 &&
    String(text)
      .replace(values[0], "")
      .replace(/[\s：:【】]/g, "").length >= 2
    ? values[0]
    : "";
}
export function compatibleLayouts(
  slide,
  imageCount = (slide.assets || []).length,
) {
  const type = slide.type || "cards";
  return LAYOUT_IDS.filter((id) => {
    const l = LAYOUT_CATALOG[id],
      count = (slide.bullets || []).length;
    return (
      l.types.includes(type) &&
      count >= l.minBullets &&
      count <= l.maxBullets &&
      l.userImageFrames.length >= imageCount &&
      (id !== "metrics-big-number" ||
        slide.bullets.every((b) => metricValue(b)))
    );
  });
}
export function buildScene(
  slide,
  {
    design = null,
    slideIndex = 1,
    totalSlides = 6,
    measure = estimateWidth,
    assets = {},
    checkAssets = true,
  } = {},
) {
  const l = LAYOUT_CATALOG[slide.layoutId],
    colors = resolveDesign(design).palette;
  // 主题节奏：数据看板/核心结论/双栏对比是"重页"，整页压深一档制造翻页呼吸感。
  const heavy =
    l && ["metrics", "hero", "compare"].includes(l.mode);
  // 装饰文字（编号、大数字）落在卡片底上时用，避免 AI 配色对比度误报。
  const accentText =
    contrastRatio(colors.accent, colors.card) >= 4.5
      ? colors.accent
      : colors.text;
  const scene = {
    sceneVersion: 1,
    canvas: CANVAS,
    elements: [],
    issues: [],
    contentRevision: slide.contentRevision || 0,
    layoutId: slide.layoutId,
    background: heavy ? deepen(colors.bg) : colors.bg,
  };
  const issue = (code, message, field = "") =>
    scene.issues.push({ severity: "error", code, message, field });
  if (!l) {
    issue("layout", "请选择有效版式");
    return scene;
  }
  const bullets = Array.isArray(slide.bullets) ? slide.bullets : [];
  if (!l.types.includes(slide.type)) issue("relation", "版式与内容关系不匹配");
  if (bullets.length < l.minBullets || bullets.length > l.maxBullets)
    issue(
      "count",
      `${l.name}需要${l.minBullets}–${l.maxBullets}个独立内容块，当前${bullets.length}个`,
    );
  if (!String(slide.title || "").trim())
    issue("empty", "请填写页面标题", "title");
  const shape = (r, fill, stroke = null, radius = 0) =>
    scene.elements.push({ kind: "rect", ...r, fill, stroke, radius });
  const line = (x1, y1, x2, y2) =>
    scene.elements.push({
      kind: "line",
      x1,
      y1,
      x2,
      y2,
      stroke: colors.border,
      width: 2,
    });
  const text = (
    value,
    r,
    field,
    {
      size = 32,
      min = 30,
      bold = false,
      color = colors.text,
      role = "body",
    } = {},
  ) => {
    value = String(value ?? "");
    if (!value) return 0;
    const metricsFor = (size) => {
      const metrics = measure.metrics?.(size, bold) || {
        ascent: size * 1.1,
        descent: size * 0.25,
      };
      return {
        baseline: metrics.ascent,
        lineHeight: Math.max(size * 1.35, metrics.ascent + metrics.descent),
      };
    };
    let fontSize = size,
      lines;
    for (; fontSize >= min; fontSize -= 2) {
      lines = wrapText(value, r.w, fontSize, measure, bold);
      if (lines.length * metricsFor(fontSize).lineHeight <= r.h) break;
    }
    fontSize = Math.max(min, fontSize);
    lines = wrapText(value, r.w, fontSize, measure, bold);
    const { lineHeight, baseline } = metricsFor(fontSize);
    if (
      lines.length * lineHeight > r.h + 0.1 ||
      lines.some((s) => measure(s, fontSize, bold) > r.w + 0.1)
    )
      issue("overflow", `${field}文字超出区域，请精简或更换兼容版式`, field);
    const under = [...scene.elements]
      .reverse()
      .find(
        (e) =>
          e.kind === "rect" &&
          e.x <= r.x &&
          e.y <= r.y &&
          e.x + e.w >= r.x + r.w &&
          e.y + e.h >= r.y + Math.min(r.h, lines.length * lineHeight),
      );
    if (contrastRatio(color, under?.fill || colors.bg) < 4.5)
      issue("contrast", `${field}文字对比度不足`, field);
    scene.elements.push({
      kind: "text",
      ...r,
      text: value,
      lines,
      fontSize,
      lineHeight,
      baseline,
      font: FONT,
      bold,
      color,
      field,
      role,
    });
    return lines.length * lineHeight;
  };
  if (
    l.backgroundFrame &&
    slide.assets?.[0] &&
    (!checkAssets || assets[slide.assets[0].id])
  ) {
    scene.elements.push({
      kind: "image",
      x: 0,
      y: 0,
      w: 1600,
      h: 900,
      assetId: slide.assets[0].id,
      fit: slide.assets[0].fit === "cover" ? "cover" : "contain",
    });
    // 文字使用不透明底板，照片亮度不会改变可读性。
    shape({ x: 64, y: 36, w: 1472, h: 148 }, colors.bg);
    shape({ x: 1380, y: 836, w: 160, h: 48 }, colors.bg);
  }
  const textOnlyCover = l.forCover && !slide.assets?.length;
  if (l.forCover) {
    shape({ x: 64, y: 94, w: 140, h: 8 }, colors.accent);
    shape({ x: 0, y: 0, w: 12, h: 900 }, colors.accent);
    if (textOnlyCover) {
      shape({ x: 64, y: 762, w: 120, h: 10 }, colors.accent);
      shape({ x: 64, y: 782, w: 56, h: 10 }, colors.border);
    }
    if (!textOnlyCover)
      shape({ x: 950, y: 110, w: 570, h: 650 }, colors.card, colors.border, 28);
  } else {
    const rule =
      {
        horizontal: [120, 4],
        stairs: [120, 4],
        bands: [160, 3],
        metrics: [68, 6],
      }[l.mode] || [68, 5];
    shape({ x: 80, y: 187, w: rule[0], h: rule[1] }, colors.accent);
    // 页缘结构按mode分工，只画在内容区外（内容自y>=225起、左缘x<=80、右缘x>=1520）。
    if (["bands", "rows", "stairs"].includes(l.mode))
      shape({ x: 0, y: 0, w: 10, h: 900 }, colors.accent);
    if (["metrics", "vertical"].includes(l.mode))
      shape({ x: 1590, y: 0, w: 10, h: 900 }, colors.border);
    if (["columns", "grid"].includes(l.mode)) line(80, 42, 1520, 42);
    if (l.mode === "compare") shape({ x: 0, y: 0, w: 1600, h: 6 }, colors.accent);
    if (l.mode === "horizontal") line(80, 852, 420, 852);
  }
  text(slide.title, pxBox(textOnlyCover ? l.textOnlyTitle : l.title), "title", {
    size: l.forCover ? 80 : 56,
    min: 48,
    bold: !l.forCover,
    role: "title",
  });
  if (l.forCover)
    text(
      slide.subtitle,
      pxBox(textOnlyCover ? l.textOnlySubtitle : l.subtitle),
      "subtitle",
      {
        size: 34,
        min: 30,
        color: colors.muted,
      },
    );
  if (l.statement) {
    if (!slide.keyMessage) issue("empty", "金句页需要核心结论", "keyMessage");
    text(slide.keyMessage, pxBox(l.statement), "keyMessage", {
      size: 60,
      min: 48,
      bold: false,
      role: "title",
    });
  }
  const slots = contentRegions(slide.layoutId, bullets.length).map(pxBox);
  slots.forEach((slot, i) => {
    const { head, body } = splitBullet(bullets[i]);
    if (!head && !body) issue("empty", `第${i + 1}条为空`, `bullets.${i}`);
    let r = { ...slot };
    const card = [
      "cards",
      "grid",
      "compare",
      "metrics",
      "stairs",
      "rows",
    ].includes(l.mode);
    if (card) {
      const cardRect = { ...r };
      const frameless = ["grid", "metrics"].includes(l.mode);
      shape(cardRect, colors.card, frameless ? null : colors.border, 16);
      if (l.mode === "rows" || slide.layoutId === "cards-row")
        shape(
          { x: cardRect.x + 10, y: cardRect.y + 20, w: 6, h: cardRect.h - 40 },
          colors.accent,
        );
      if (l.mode === "grid")
        shape(
          { x: cardRect.x + 10, y: cardRect.y + 10, w: 12, h: 12 },
          colors.accent,
        );
      if (l.mode === "compare")
        shape(
          { x: cardRect.x, y: cardRect.y, w: cardRect.w, h: 8 },
          colors.accent,
        );
      r = { x: r.x + 24, y: r.y + 24, w: r.w - 48, h: r.h - 48 };
    }
    if (l.mode === "columns" || l.mode === "summary" || l.mode === "hero") {
      shape({ x: r.x, y: r.y, w: 42, h: 5 }, colors.accent);
      r.y += 22;
      r.h -= 22;
      if (i < slots.length - 1 && l.mode === "columns")
        line(
          slot.x + slot.w + 20,
          slot.y,
          slot.x + slot.w + 20,
          slot.y + slot.h,
        );
    }
    if (l.mode === "horizontal" || l.mode === "stairs") {
      shape({ x: r.x, y: r.y, w: 46, h: 46 }, colors.card, colors.accent, 23);
      text(
        String(i + 1).padStart(2, "0"),
        { x: r.x + 7, y: r.y + 5, w: 34, h: 36 },
        `step.${i}`,
        { size: 24, min: 24, color: accentText, role: "decoration" },
      );
      if (i < slots.length - 1)
        line(r.x + 58, r.y + 23, slots[i + 1].x - 10, r.y + 23);
      r.y += 70;
      r.h -= 70;
    }
    if (l.mode === "vertical") {
      shape({ x: r.x, y: r.y + 8, w: 16, h: 16 }, colors.accent, null, 8);
      if (i < slots.length - 1)
        line(r.x + 8, r.y + 29, r.x + 8, slots[i + 1].y);
      r.x += 40;
      r.w -= 40;
    }
    if (l.mode === "bands") {
      shape({ ...r }, i % 2 ? colors.card : colors.bg);
      line(r.x, r.y + r.h, r.x + r.w, r.y + r.h);
      shape({ x: r.x + 4, y: r.y + 16, w: 12, h: 12 }, colors.accent);
      r.x += 40;
      r.w -= 40;
    }
    const field = `bullets.${i}`;
    if (l.mode === "metrics") {
      const value = metricValue(bullets[i]);
      if (!value)
        issue(
          "metric",
          "大数字看板的每一条必须有明确指标；请改用证据栏",
          field,
        );
      // 数字突出显示是同一原文的视觉重复，正文仍完整保留对象、口径与单位。
      const used = text(
        value,
        { ...r, h: Math.min(140, r.h) },
        `${field}.metric`,
        {
          size: 64,
          min: 48,
          bold: false,
          color: accentText,
          role: "decoration",
        },
      );
      shape({ x: r.x, y: r.y + used + 4, w: 140, h: 4 }, colors.accent);
      r.y += used + 20;
      r.h -= used + 20;
    }
    if ((l.mode === "bands" || l.mode === "vertical") && head && body) {
      text(head, { ...r, w: r.w * 0.24 }, `${field}.head`, { bold: true });
      text(
        body,
        { x: r.x + r.w * 0.28, y: r.y, w: r.w * 0.72, h: r.h },
        `${field}.body`,
        { color: colors.muted },
      );
    } else {
      const used = head ? text(head, r, `${field}.head`, { bold: true }) : 0;
      if (body)
        text(
          body,
          {
            ...r,
            y: r.y + (used ? used + 14 : 0),
            h: r.h - (used ? used + 14 : 0),
          },
          `${field}.body`,
          { color: head ? colors.muted : colors.text },
        );
    }
  });
  const slideAssets = slide.assets || [];
  if (slideAssets.length > l.userImageFrames.length)
    issue("images", "当前版式没有足够画框，请更换版式");
  l.userImageFrames.forEach((f, i) => {
    const ref = slideAssets[i],
      asset = ref && assets[ref.id];
    if (!ref && (slide.omitVisual || l.forCover)) return;
    const r = pxBox(f);
    if (ref && (!checkAssets || asset)) {
      if (!l.backgroundFrame)
        scene.elements.push({
          kind: "image",
          ...r,
          assetId: ref.id,
          fit: ref.fit === "cover" ? "cover" : "contain",
        });
    } else {
      if (!l.backgroundFrame) shape(r, colors.card, colors.border, 16);
      if (checkAssets)
        issue(
          "asset",
          ref
            ? "图片资产缺失，请重新上传"
            : "配图尚未就绪，可上传、生成或选择省略配图",
          "assets",
        );
    }
  });
  text(
    `${slideIndex} / ${totalSlides}`,
    { x: 1400, y: 846, w: 120, h: 30 },
    "footer",
    { size: 20, min: 20, color: colors.muted, role: "footer" },
  );
  for (const e of scene.elements) {
    const r =
      e.kind === "line"
        ? {
            x: Math.min(e.x1, e.x2),
            y: Math.min(e.y1, e.y2),
            w: Math.abs(e.x2 - e.x1),
            h: Math.abs(e.y2 - e.y1),
          }
        : e;
    const h =
      e.kind === "text" ? Math.max(e.h, e.lines.length * e.lineHeight) : r.h;
    if (
      ![r.x, r.y, r.w, h].every(Number.isFinite) ||
      r.w < 0 ||
      h < 0 ||
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.w > 1600.1 ||
      r.y + h > 900.1
    )
      issue("bounds", `${e.field || e.kind}超出画布或区域无效`, e.field);
    if (e.role === "body" && e.fontSize < 30)
      issue("font", "正文低于可读字号", e.field);
    if (
      e.kind === "text" &&
      e.lines.join("") !== e.text.replace(/\r\n?|\n/g, "")
    )
      issue("coverage", "换行后文字不完整", e.field);
  }
  const visibleFields = {
    title: slide.title,
    ...(l.forCover ? { subtitle: slide.subtitle } : {}),
    ...(l.statement ? { keyMessage: slide.keyMessage } : {}),
    ...Object.fromEntries(bullets.map((b, i) => [`bullets.${i}`, b])),
  };
  for (const [field, value] of Object.entries(visibleFields)) {
    const visible = scene.elements
      .filter(
        (e) =>
          e.kind === "text" &&
          e.role !== "decoration" &&
          (e.field === field || e.field.startsWith(`${field}.`)),
      )
      .map((e) => e.text)
      .join("");
    if (visible.replace(/\s/g, "") !== String(value || "").replace(/\s/g, ""))
      issue("coverage", `${field}存在未呈现文字`, field);
  }
  const texts = scene.elements.filter((e) => e.kind === "text");
  for (let i = 0; i < texts.length; i++)
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i],
        b = texts[j];
      if (
        Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
        Math.min(
          a.y + a.lines.length * a.lineHeight,
          b.y + b.lines.length * b.lineHeight,
        ) -
          Math.max(a.y, b.y) >
          1
      )
        issue("overlap", `${a.field}与${b.field}区域重叠`);
    }
  return scene;
}
export function chooseLayout(
  slide,
  {
    requested = slide.layoutId,
    previous = [],
    measure = estimateWidth,
    design = null,
  } = {},
) {
  let ids = compatibleLayouts(slide);
  if (!ids.length) return "";
  const results = ids.map((id) => ({
    id,
    errors: buildScene(
      { ...slide, layoutId: id, omitVisual: true },
      { measure, design, checkAssets: false },
    ).issues.length,
  }));
  results.sort(
    (a, b) =>
      a.errors - b.errors ||
      Number(
        previous.length &&
          LAYOUT_CATALOG[previous.at(-1)].mode === LAYOUT_CATALOG[a.id].mode,
      ) -
        Number(
          previous.length &&
            LAYOUT_CATALOG[previous.at(-1)].mode === LAYOUT_CATALOG[b.id].mode,
        ) ||
      Number(LAYOUT_CATALOG[a.id].types[0] !== slide.type) -
        Number(LAYOUT_CATALOG[b.id].types[0] !== slide.type) ||
      Number(
        !slide.assets?.length &&
          LAYOUT_CATALOG[a.id].userImageFrames.length > 0,
      ) -
        Number(
          !slide.assets?.length &&
            LAYOUT_CATALOG[b.id].userImageFrames.length > 0,
        ) ||
      previous.filter((id) => getLayoutFamily(id) === getLayoutFamily(a.id))
        .length -
        previous.filter((id) => getLayoutFamily(id) === getLayoutFamily(b.id))
          .length ||
      Number(b.id === requested) - Number(a.id === requested),
  );
  return results[0].id;
}
