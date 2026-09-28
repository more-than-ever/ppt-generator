import React, { useEffect, useMemo, useRef, useState } from "react";
import SceneCanvas from "./SceneCanvas.jsx";
import {
  buildScene,
  createTextMeasurer,
  waitForFonts,
} from "../../shared/slideScene.js";

export function isEditingTarget(event) {
  return (
    event.isComposing ||
    event.keyCode === 229 ||
    event.target?.closest?.(
      'input,textarea,select,button,[contenteditable="true"],[role="dialog"]',
    )
  );
}
export default function SlideViewer({
  presentation,
  activeSlideIndex = 0,
  onSelectSlide,
  onClose,
  isFullscreen,
  onExitFullscreen,
  scenes,
  assets = presentation?.assets || {},
}) {
  const [fontReady, setFontReady] = useState(false);
  const container = useRef(null);
  useEffect(() => {
    if (!isFullscreen) return;
    const previous = document.activeElement;
    container.current?.focus();
    return () => previous?.isConnected && previous.focus();
  }, [isFullscreen]);
  useEffect(() => {
    let active = true;
    waitForFonts().then(() => {
      if (active) setFontReady(true);
    });
    return () => {
      active = false;
    };
  }, []);
  const measure = useMemo(() => createTextMeasurer(), [fontReady]);
  const slides = presentation?.slides || [];
  const current = slides[activeSlideIndex];
  const scene =
    scenes?.[activeSlideIndex] ||
    (current &&
      buildScene(current, {
        design: presentation?.design,
        measure,
        assets,
        slideIndex: activeSlideIndex + 1,
        totalSlides: slides.length,
      }));
  useEffect(() => {
    if (!isFullscreen) return;
    const key = (e) => {
      if (isEditingTarget(e)) return;
      if (e.key === "Escape") {
        onExitFullscreen?.();
        return;
      }
      if (["ArrowRight", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        onSelectSlide(Math.min(slides.length - 1, activeSlideIndex + 1));
      }
      if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        onSelectSlide(Math.max(0, activeSlideIndex - 1));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [
    isFullscreen,
    activeSlideIndex,
    slides.length,
    onSelectSlide,
    onExitFullscreen,
  ]);
  if (!current) return null;
  return (
    <section
      className={isFullscreen ? "presentation-overlay" : "slide-viewer"}
      ref={container}
      tabIndex={isFullscreen ? -1 : undefined}
      aria-label="演示画布"
    >
      <div className="viewer-toolbar">
        <span>
          第 {activeSlideIndex + 1} 页 / {slides.length} 页
        </span>
        {isFullscreen && (
          <button onClick={onExitFullscreen}>退出演示 Esc</button>
        )}
        {!isFullscreen && onClose && <button onClick={onClose}>关闭</button>}
      </div>
      <div className="canvas-frame">
        {current.legacyImageUrl ? (
          <>
            <img src={current.legacyImageUrl} alt="旧稿整页图片，不可编辑" />
            <span>旧稿整页图片 · 不可编辑</span>
          </>
        ) : (
          <SceneCanvas scene={scene} assets={assets} label={current.title} />
        )}
      </div>
      {isFullscreen && (
        <div className="viewer-toolbar">
          <button
            onClick={() => onSelectSlide(Math.max(0, activeSlideIndex - 1))}
            disabled={!activeSlideIndex}
          >
            上一页
          </button>
          <span>方向键或空格翻页</span>
          <button
            onClick={() =>
              onSelectSlide(Math.min(slides.length - 1, activeSlideIndex + 1))
            }
            disabled={activeSlideIndex === slides.length - 1}
          >
            下一页
          </button>
        </div>
      )}
    </section>
  );
}
