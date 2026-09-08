import React, { useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RefreshCw,
  ExternalLink,
  X,
  EyeOff,
  Maximize2
} from 'lucide-react';
import { THEMES } from '../services/pptxExport';

export default function SlideViewer({
  presentation,
  activeSlideIndex,
  onSelectSlide,
  onClose,
  currentTheme,
  isFullscreen,
  onExitFullscreen,
  onTriggerImageGen,
  generatingImageIndex
}) {
  const slides = presentation?.slides || [];
  const currentSlide = slides[activeSlideIndex] || slides[0];
  const theme = THEMES[currentTheme] || THEMES.dark;

  // Keyboard navigation for presentation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'Space') {
        if (activeSlideIndex < slides.length - 1) {
          onSelectSlide(activeSlideIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (activeSlideIndex > 0) {
          onSelectSlide(activeSlideIndex - 1);
        }
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          onExitFullscreen();
        } else if (onClose) {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSlideIndex, slides.length, isFullscreen, onSelectSlide, onExitFullscreen, onClose]);

  if (!currentSlide) return null;

  const isGeneratingThis = generatingImageIndex === activeSlideIndex;
  const hasImage = Boolean(currentSlide.imageUrl);

  return (
    <div className={`flex flex-col h-full bg-[#08090C] text-neutral-200 select-none ${isFullscreen ? 'fixed inset-0 z-50 p-6' : 'p-4 sm:p-5'}`}>
      {/* Top Bar inside Viewer */}
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-neutral-800/80 text-xs">
        <div className="flex items-center space-x-2">
          <span className="font-semibold text-white">
            第 {activeSlideIndex + 1} 页 / 共 {slides.length} 页
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400 truncate max-w-[200px]">
            {currentSlide.title || '演示页'}
          </span>
          {hasImage ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              GPT 16:9 终稿画面
            </span>
          ) : isGeneratingThis ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
              GPT 渲染中...
            </span>
          ) : null}
        </div>

        {/* Action Controls & Close Button */}
        <div className="flex items-center space-x-2">
          {hasImage && (
            <>
              <button
                type="button"
                onClick={() => onTriggerImageGen && onTriggerImageGen(activeSlideIndex)}
                disabled={isGeneratingThis}
                className="px-2.5 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs border border-neutral-750 flex items-center space-x-1.5 transition cursor-pointer active:scale-95 disabled:opacity-50"
                title="让 GPT 重新渲染本页画卷"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingThis ? 'animate-spin text-amber-400' : 'text-amber-400'}`} />
                <span>重新渲染</span>
              </button>

              <a
                href={currentSlide.imageUrl}
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1.5 rounded-lg bg-neutral-850 hover:bg-neutral-800 text-neutral-300 text-xs border border-neutral-750 flex items-center space-x-1.5 transition cursor-pointer"
                title="在新标签页查看高清原图"
              >
                <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                <span>原图</span>
              </a>
            </>
          )}

          {/* Close / Hide Viewer Button (一键收起画卷，返回全屏对话) */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-neutral-800/90 hover:bg-neutral-750 text-neutral-300 hover:text-white border border-neutral-700 transition text-xs font-medium cursor-pointer active:scale-95 ml-1"
              title="收起右侧画卷，返回纯对话界面"
            >
              <EyeOff className="w-3.5 h-3.5" />
              <span>收起预览</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 16:9 Image Display Canvas */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        <div
          className="relative w-full slide-ratio rounded-2xl overflow-hidden border shadow-2xl transition-all duration-300 bg-black flex items-center justify-center"
          style={{ borderColor: `#${theme.border}` }}
        >
          {hasImage ? (
            /* 1. GPT 16:9 Finished Image */
            <div className="relative w-full h-full group overflow-hidden flex items-center justify-center bg-black">
              <img
                src={currentSlide.imageUrl}
                alt={currentSlide.title || "16:9 Presentation Slide"}
                className="w-full h-full object-contain md:object-cover transition-transform duration-500 group-hover:scale-[1.01]"
              />

              {/* Hover overlay hint */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4 pointer-events-none">
                <div className="flex items-center justify-between pointer-events-auto">
                  <span className="text-[11px] font-medium text-white/90 backdrop-blur-md px-3 py-1 rounded-full bg-blue-600/80 border border-white/20 shadow-md flex items-center space-x-1.5">
                    <Sparkles className="w-3 h-3 text-amber-300" />
                    <span>GPT 16:9 完整成品 PPT 画卷</span>
                  </span>
                </div>
              </div>
            </div>
          ) : isGeneratingThis ? (
            /* 2. Generating Loading State (No fake GLM text layout!) */
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                <RefreshCw className="w-7 h-7 text-blue-400 animate-spin" />
              </div>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-white">
                  GPT 正在绘制第 {activeSlideIndex + 1} 页 16:9 终稿画卷
                </h3>
                <p className="text-xs text-neutral-400 max-w-sm">
                  正在直接将中文排版与定制视觉渲染为成品画卷，约需 70 秒，请稍候...
                </p>
              </div>
              <div className="w-48 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-full animate-pulse" />
              </div>
            </div>
          ) : (
            /* 3. Empty / Unrendered State (Clean prompt, NO GLM text layout canvas!) */
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4 max-w-md">
              <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-neutral-500" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-neutral-200">
                  第 {activeSlideIndex + 1} 页尚未生成画面
                </h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  文案与排版构想已在左侧对话框列出。<br />
                  点击下方按钮，由 GPT 直接渲染出整张 16:9 高清画卷。
                </p>
              </div>
              {onTriggerImageGen && (
                <button
                  type="button"
                  onClick={() => onTriggerImageGen(activeSlideIndex)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center space-x-2 shadow-lg transition active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>🎨 交付 GPT 渲染本页画卷</span>
                </button>
              )}
            </div>
          )}

          {/* Left / Right Slide Navigation Overlay Arrows */}
          <button
            type="button"
            onClick={() => activeSlideIndex > 0 && onSelectSlide(activeSlideIndex - 1)}
            disabled={activeSlideIndex === 0}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-neutral-900/60 hover:bg-neutral-900/90 text-white backdrop-blur-sm border border-neutral-700/50 opacity-0 hover:opacity-100 disabled:opacity-0 transition-opacity cursor-pointer"
            title="上一页"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => activeSlideIndex < slides.length - 1 && onSelectSlide(activeSlideIndex + 1)}
            disabled={activeSlideIndex === slides.length - 1}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-neutral-900/60 hover:bg-neutral-900/90 text-white backdrop-blur-sm border border-neutral-700/50 opacity-0 hover:opacity-100 disabled:opacity-0 transition-opacity cursor-pointer"
            title="下一页"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
