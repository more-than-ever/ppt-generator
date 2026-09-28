// AI 定制视觉风格的解析、校验与兜底工具。
// 风格不再由用户在几个预设里挑选，而是由模型在生成整套初稿时输出 design 对象，
// 程序负责校验并修正可读性（对比度），不合法时回退 NEUTRAL_DESIGN。
export const PALETTE_FIELDS = [
  "bg",
  "card",
  "text",
  "muted",
  "accent",
  "border",
];

// 空白稿与极端失败路径的应急配色：不是可选风格，任何界面不得把它当作选项展示。
export const NEUTRAL_DESIGN = Object.freeze({
  name: "素白",
  mood: "简洁清晰",
  palette: Object.freeze({
    bg: "#FAFAFA",
    card: "#FFFFFF",
    text: "#18181B",
    muted: "#52525B",
    accent: "#245BC4",
    border: "#D4D4D8",
  }),
});

// 仅供读取旧版已保存文稿（theme 为预设 key）时迁移数据，不是可选风格集合。
const LEGACY_THEME_TO_DESIGN = {
  dark: {
    name: "深岩",
    mood: "硬朗科技",
    palette: {
      bg: "#0F1115",
      card: "#1B2029",
      text: "#FFFFFF",
      muted: "#B5BFCE",
      accent: "#80B4FF",
      border: "#374151",
    },
  },
  light: {
    name: "纸白",
    mood: "简洁清晰",
    palette: {
      bg: "#FAFAFA",
      card: "#FFFFFF",
      text: "#18181B",
      muted: "#52525B",
      accent: "#245BC4",
      border: "#D4D4D8",
    },
  },
  tech: {
    name: "深海",
    mood: "深邃科技",
    palette: {
      bg: "#0B1329",
      card: "#132145",
      text: "#F8FAFC",
      muted: "#B3C5DF",
      accent: "#67DCEC",
      border: "#334C75",
    },
  },
  warm: {
    name: "暖纸",
    mood: "温暖人文",
    palette: {
      bg: "#F7F4EB",
      card: "#FFFDF7",
      text: "#292524",
      muted: "#665A4B",
      accent: "#9C5009",
      border: "#D8CDBB",
    },
  },
};

const legacyDesign = (key) =>
  typeof key === "string" && Object.hasOwn(LEGACY_THEME_TO_DESIGN, key)
    ? LEGACY_THEME_TO_DESIGN[key]
    : null;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function normalizeHex(value) {
  if (typeof value !== "string") return null;
  const hex = value.trim();
  if (!HEX_RE.test(hex)) return null;
  const body =
    hex.length === 4
      ? hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : hex.slice(1);
  return `#${body.toUpperCase()}`;
}

const channel = (hex, offset) =>
  Number.parseInt(hex.slice(1 + offset * 2, 3 + offset * 2), 16) / 255;

const linear = (c) =>
  c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

export function luminance(hex) {
  const n = normalizeHex(hex);
  if (!n) return 0;
  return (
    0.2126 * linear(channel(n, 0)) +
    0.7152 * linear(channel(n, 1)) +
    0.0722 * linear(channel(n, 2))
  );
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function mixWith(hex, target, t) {
  const n = normalizeHex(hex);
  const to = normalizeHex(target);
  if (!n || !to) return n || to || "#000000";
  const parts = [0, 1, 2]
    .map((i) => {
      const c = Math.round(
        channel(n, i) * (1 - t) + channel(to, i) * t,
      );
      return c.toString(16).padStart(2, "0");
    })
    .join("");
  return `#${parts.toUpperCase()}`;
}

// 重页底色：向黑混合一档，保持色相方向。用于整套配色内的明暗节奏。
export function deepen(hex, t = 0.22) {
  return mixWith(hex, "#000000", t);
}

// 把前景色朝黑或白方向逐步混合，直到对背景达到最低对比度；仍不满足时取最接近的一次。
export function ensureContrast(fg, bg, min = 4.5) {
  const background = normalizeHex(bg) || NEUTRAL_DESIGN.palette.bg;
  const base = normalizeHex(fg);
  if (!base) return luminance(background) > 0.5 ? "#18181B" : "#FFFFFF";
  if (contrastRatio(base, background) >= min) return base;
  const toward = luminance(background) > 0.5 ? "#000000" : "#FFFFFF";
  let best = base;
  let bestRatio = contrastRatio(base, background);
  for (let i = 1; i <= 12; i += 1) {
    const candidate = mixWith(base, toward, i / 12);
    const ratio = contrastRatio(candidate, background);
    if (ratio > bestRatio) {
      best = candidate;
      bestRatio = ratio;
    }
    if (ratio >= min) return candidate;
  }
  return best;
}

const strOr = (value, max, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

// 结构合法即返回修正后的 design（自动修对比度）；结构不合法返回 null。
export function normalizeDesign(raw) {
  if (!raw || typeof raw !== "object") return null;
  const palette = {};
  for (const key of PALETTE_FIELDS) {
    const hex = normalizeHex(raw.palette?.[key]);
    if (!hex) return null;
    palette[key] = hex;
  }
  palette.text = ensureContrast(palette.text, palette.bg, 4.5);
  palette.muted = ensureContrast(palette.muted, palette.bg, 4.5);
  palette.accent = ensureContrast(palette.accent, palette.bg, 3);
  return {
    name: strOr(raw.name, 20, "定制风格"),
    mood: strOr(raw.mood, 200, "简洁清晰"),
    palette,
  };
}

export function validateDesign(raw) {
  const problems = [];
  if (!raw || typeof raw !== "object") return ["缺少 design 对象"];
  for (const key of PALETTE_FIELDS) {
    if (!normalizeHex(raw.palette?.[key]))
      problems.push(`design.palette.${key} 不是合法颜色`);
  }
  return problems;
}

// 从任意输入解析出可用 design：design 对象 / 旧 theme key / 混合 deck 数据。
export function resolveDesign(input) {
  if (input && typeof input === "object") {
    if (input.palette && typeof input.palette === "object") {
      const direct = normalizeDesign(input);
      if (direct) return direct;
    }
    if (input.design) {
      const fromDeck = normalizeDesign(input.design);
      if (fromDeck) return fromDeck;
    }
    if (typeof input.theme === "string") {
      const legacy = legacyDesign(input.theme);
      if (legacy) return { ...legacy, palette: { ...legacy.palette } };
    }
    return { ...NEUTRAL_DESIGN, palette: { ...NEUTRAL_DESIGN.palette } };
  }
  if (typeof input === "string") {
    const legacy = legacyDesign(input);
    if (legacy) return { ...legacy, palette: { ...legacy.palette } };
  }
  return { ...NEUTRAL_DESIGN, palette: { ...NEUTRAL_DESIGN.palette } };
}
