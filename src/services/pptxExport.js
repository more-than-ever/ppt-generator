import pptxgen from "pptxgenjs";
import {
  buildScene,
  createTextMeasurer,
  waitForFonts,
  FONT,
} from "../../shared/slideScene.js";
import { slideScene } from "../../shared/deck.js";
const inch = (px) => px / 120;
const color = (hex) => String(hex).replace("#", "");

export function embeddedImageSize(dataUrl) {
  const match = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl || "",
  );
  if (!match) throw new Error("图片未嵌入或格式不支持");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  let width = 0,
    height = 0;
  if (
    match[1] === "png" &&
    bytes.length >= 33 &&
    view.getUint32(0) === 0x89504e47 &&
    view.getUint32(4) === 0x0d0a1a0a &&
    view.getUint32(12) === 0x49484452
  ) {
    width = view.getUint32(16);
    height = view.getUint32(20);
  } else if (match[1] === "jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 4 <= bytes.length;) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9 || offset + 2 > bytes.length)
        break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 8
      ) {
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
        break;
      }
      offset += length;
    }
  }
  if (!width || !height) throw new Error("图片尺寸无法读取，不能保证等比导出");
  return { width, height };
}

export function imagePlacement(frame, size, fit) {
  const { width, height } = size;
  if (
    ![width, height, frame.w, frame.h].every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error("图片尺寸不合法");
  if (fit === "cover") {
    // 库把外层 w/h 当作原图比例，sizing.w/h 才是目标画框。
    const unit = Math.max(width, height);
    return {
      ...frame,
      w: width / unit,
      h: height / unit,
      sizing: { type: "cover", w: frame.w, h: frame.h },
    };
  }
  // 完整显示直接使用等比居中几何，不依赖负 srcRect 的 Office 兼容性。
  const scale = Math.min(frame.w / width, frame.h / height);
  const w = width * scale,
    h = height * scale;
  return {
    x: frame.x + (frame.w - w) / 2,
    y: frame.y + (frame.h - h) / 2,
    w,
    h,
  };
}

export function createPptx({ title, slides, scenes, assets = {} }) {
  if (!slides?.length || scenes?.length !== slides.length)
    throw new Error("页面或场景缺失，无法导出");
  const errors = scenes.flatMap((scene, i) =>
    [
      ...(scene.contentRevision !== (slides[i].contentRevision || 0)
        ? [{ message: "场景版本已过期" }]
        : []),
      ...scene.issues.filter((issue) => issue.severity === "error"),
    ].map((issue) => `第${i + 1}页：${issue.message}`),
  );
  if (slides.some((s) => s.legacyImageUrl))
    errors.push("旧稿整页图片需先转换为原生页面再导出");
  if (errors.length) throw new Error(errors.join("\n"));
  const pptx = new pptxgen();
  pptx.defineLayout({ name: "SLIDEFLOW", width: 40 / 3, height: 7.5 });
  pptx.layout = "SLIDEFLOW";
  pptx.title = title || "演示文稿";
  pptx.author = "SlideFlow";
  pptx.subject = "原生可编辑演示文稿";
  pptx.lang = "zh-CN";
  pptx.theme = { headFontFace: FONT, bodyFontFace: FONT, lang: "zh-CN" };
  scenes.forEach((scene, index) => {
    const page = pptx.addSlide();
    page.background = { color: color(scene.background) };
    page.addNotes(
      [slides[index].keyMessage, slides[index].speakerNotes]
        .filter(Boolean)
        .join("\n"),
    );
    for (const e of scene.elements) {
      const r = { x: inch(e.x), y: inch(e.y), w: inch(e.w), h: inch(e.h) };
      if (e.kind === "rect")
        page.addShape(
          e.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect,
          {
            ...r,
            radius: inch(e.radius || 0),
            rectRadius: inch(e.radius || 0),
            fill: { color: color(e.fill) },
            line: e.stroke
              ? { color: color(e.stroke), width: 0.6 }
              : { transparency: 100 },
          },
        );
      else if (e.kind === "line")
        page.addShape(pptx.ShapeType.line, {
          x: inch(Math.min(e.x1, e.x2)),
          y: inch(Math.min(e.y1, e.y2)),
          w: inch(Math.abs(e.x2 - e.x1)),
          h: inch(Math.abs(e.y2 - e.y1)),
          flipV: e.y2 < e.y1,
          line: { color: color(e.stroke), width: e.width * 0.6 },
        });
      else if (e.kind === "text")
        e.lines.forEach((line, n) => {
          // 每行独立文本框；不交由 Office 二次自动换行或缩字。
          if (line)
            page.addText(line, {
              ...r,
              y: inch(e.y + n * e.lineHeight),
              h: inch(e.lineHeight),
              fontFace: e.font,
              fontSize: e.fontSize * 0.6,
              bold: e.bold,
              color: color(e.color),
              margin: 0,
              breakLine: false,
              valign: "top",
              paraSpaceAfterPt: 0,
              lineSpacingMultiple: 1,
              wrap: false,
              lang: "zh-CN",
            });
        });
      else if (e.kind === "image") {
        const asset = assets[e.assetId];
        if (
          !asset?.dataUrl ||
          !/^data:image\/(png|jpeg);base64,/.test(asset.dataUrl)
        )
          throw new Error(`第${index + 1}页图片未嵌入或格式不支持`);
        page.addImage({
          data: asset.dataUrl,
          ...imagePlacement(r, embeddedImageSize(asset.dataUrl), e.fit),
        });
      }
    }
  });
  return pptx;
}
async function embedAsset(asset) {
  let dataUrl = asset.dataUrl;
  if (!dataUrl) {
    if (!/^\/api\/assets\/[a-zA-Z0-9_-]+$/.test(asset.url || ""))
      throw new Error("只能嵌入本机资产");
    const res = await fetch(asset.url);
    if (!res.ok) throw new Error("图片资产无法读取");
    const blob = await res.blob();
    dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  if (/^data:image\/(webp|jpeg)/.test(dataUrl)) {
    // 固定浏览器解码后的 EXIF 朝向；旧 Office 无需再次解释图片方向。
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0);
    dataUrl = canvas.toDataURL("image/png");
  }
  return { ...asset, dataUrl };
}
export async function exportToPptx(presentation, options = {}) {
  const snapshot = structuredClone(presentation);
  await waitForFonts();
  const assets = {};
  const used = new Set(
    snapshot.slides.flatMap((s) => (s.assets || []).map((a) => a.id)),
  );
  for (const id of used) {
    if (!snapshot.assets?.[id]) throw new Error("图片资产缺失");
    assets[id] = await embedAsset(snapshot.assets[id]);
  }
  const measure = createTextMeasurer();
  const scenes = snapshot.slides.map((s, i) =>
    slideScene(snapshot, s, i, { assets, measure }),
  );
  const pptx = createPptx({ ...snapshot, scenes, assets });
  if (options.outputType) return pptx.write({ outputType: options.outputType });
  await pptx.writeFile({
    fileName: `${(snapshot.title || "演示文稿").replace(/[\\/:*?"<>|]/g, "_").slice(0, 60)}.pptx`,
  });
}
