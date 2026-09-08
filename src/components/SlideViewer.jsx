import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Sparkles,
  Maximize2,
  Layout,
  RefreshCw,
  Image as ImageIcon,
  Check,
  Layers,
  Lock,
  ExternalLink,
  Eye,
  Monitor,
  Copy
} from 'lucide-react';
import { THEMES } from '../services/pptxExport';

export default function SlideViewer({
  presentation,
  activeSlideIndex,
  onSelectSlide,
  onUpdateSlide,
  onAddSlide,
  onDeleteSlide,
  currentTheme,
  isFullscreen,
  onExitFullscreen,
  onRequestRework,
  onGenerateFirstSlide,
  deckStyle,
  onTriggerImageGen,
  generatingImageIndex
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [viewMode, setViewMode] = useState('full'); // 'full' (16:9 full image / GLM proposal board)
  const [copied, setCopied] = useState(false);

  const slides = presentation?.slides || [];
  const currentSlide = slides[activeSlideIndex] || slides[0];
  const theme = THEMES[currentTheme] || THEMES.dark;

  const toBulletText = (b) => (typeof b === 'string' ? b : (b?.title ? `${b.title}：${b.description || ''}` : String(b || '')));

  const handleCopyAllCopy = () => {
    if (!currentSlide) return;
    const lines = [
      `【第 ${activeSlideIndex + 1} 页：${currentSlide.title || '演示页'}】`,
      currentSlide.subtitle ? `副标题：${currentSlide.subtitle}` : '',
      currentSlide.layoutConcept ? `\n📐【版面构思与排布安排】：\n${currentSlide.layoutConcept}` : '',
      '',
      '📝【精修文案】：',
      ...(currentSlide.bullets || []).map((b, i) => `${i + 1}. ${toBulletText(b)}`)
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(lines).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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
      } else if (e.key === 'Escape' && isFullscreen) {
        onExitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSlideIndex, slides.length, isFullscreen, onSelectSlide, onExitFullscreen]);

  if (slides.length === 0 || !currentSlide) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-6 text-center">
        <div
          className="w-full max-w-3xl slide-ratio rounded-3xl border shadow-2xl flex flex-col items-center justify-center p-8 sm:p-12 relative overflow-hidden"
          style={{
            backgroundColor: `#${theme.bg}`,
            borderColor: `#${theme.border}`
          }}
        >
          <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-4">
            <Sparkles className="w-8 h-8 text-blue-400" />
          </div>

          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-800/40 text-emerald-300 text-xs font-medium mb-3">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>全套风格已锁定：{deckStyle?.name || '极简暗黑'}</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
            {presentation?.title || '演示文稿'}
          </h2>
          <p className="text-xs sm:text-sm text-neutral-400 max-w-md mb-6 leading-relaxed">
            演示文稿已成功立项，等待构思第 1 页。<br />
            请在左侧 Agent 对话框中交代第 1 页内容，支持随时拖入或粘贴本地图片。
          </p>

          <button
            onClick={() => onGenerateFirstSlide && onGenerateFirstSlide()}
            className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-white text-neutral-950 text-xs font-semibold hover:bg-neutral-200 transition shadow-lg active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-blue-600" />
            <span>让 AI Agent 构思生成第 1 页封面</span>
          </button>
        </div>
      </div>
    );
  }

  // 纯净 16:9 终稿展台待机态（彻底移除粗糙劣质模板假预览，构思与文案全由左侧对话语言/语音阐述）
  const renderStandbyCanvas = () => {
    const isGenerating = generatingImageIndex === activeSlideIndex;

    return (
      <div className="relative w-full h-full flex flex-col items-center justify-center p-6 md:p-10 bg-[#07090E] text-neutral-200 text-center select-none overflow-hidden">
        {/* Subtle decorative presentation background grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
        <div className="absolute inset-0 bg-radial from-blue-950/20 via-transparent to-black pointer-events-none" />

        <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center space-y-4">
          {/* Badge */}
          <div className="px-3.5 py-1 rounded-full bg-neutral-900/90 border border-neutral-800 text-neutral-400 text-xs font-mono flex items-center space-x-2 shadow-sm">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span>第 {activeSlideIndex + 1} 页 · 待 GPT 渲染 16:9 终稿画面</span>
          </div>

          {/* Slide Title */}
          <div className="space-y-1.5 px-2">
            <h2 className="text-xl md:text-2xl lg:text-3xl font-extrabold text-white tracking-tight leading-tight">
              {currentSlide.title || '演示页规划中'}
            </h2>
            {currentSlide.subtitle && (
              <p className="text-xs md:text-sm text-neutral-400 max-w-md mx-auto leading-relaxed">
                {currentSlide.subtitle}
              </p>
            )}
          </div>

          {/* Prompt / Thought Guidance Banner */}
          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-neutral-800/90 text-left w-full space-y-2 text-xs shadow-inner">
            <div className="flex items-center space-x-2 text-blue-400 font-semibold text-xs">
              <Sparkles className="w-4 h-4 text-blue-400 flex-shrink-0" />
              <span>排版构思与文案精修已在左侧完成</span>
            </div>
            <p className="text-neutral-300 text-xs leading-relaxed">
              根据您的要求，AI 已将本页排版构思、文案论据及演讲提词在左侧对话框中以语言详细列出。
            </p>
            <p className="text-neutral-400 text-[11px] leading-relaxed">
              确认无误后，点击下方按钮即可交付 GPT 直接渲染出整张 16:9 的高清 PPT 画面。
            </p>
          </div>

          {/* Action: Trigger GPT Render */}
          {onTriggerImageGen && (
            <button
              type="button"
              onClick={() => onTriggerImageGen(activeSlideIndex)}
              disabled={isGenerating}
              className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white text-sm font-semibold flex items-center space-x-2.5 transition active:scale-95 shadow-xl disabled:opacity-50 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-white" />
                  <span>GPT 正在绘制 16:9 终稿画卷（约需 70 秒）...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>🎨 交付 GPT 渲染本页 16:9 终稿画卷</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  // Render content according to slide data
  const renderSlideContent = () => {
    // 1. 若当前页已有 GPT 渲染生成的整页 16:9 画面，展示 16:9 高清画卷
    if (currentSlide.imageUrl) {
      return (
        <div className="relative w-full h-full group overflow-hidden bg-black flex items-center justify-center">
          <img
            src={currentSlide.imageUrl}
            alt={currentSlide.title || "16:9 Presentation Slide"}
            className="w-full h-full object-contain md:object-cover transition-transform duration-500 group-hover:scale-[1.01]"
          />
          {/* Hover actions overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-5 pointer-events-none">
            <div className="flex items-center justify-between pointer-events-auto">
              <span className={`text-xs font-semibold text-white/95 backdrop-blur-md px-3 py-1 rounded-full border flex items-center space-x-1.5 shadow-md ${
                currentSlide.userUploaded
                  ? 'bg-emerald-600/80 border-emerald-400/30'
                  : 'bg-blue-600/80 border-white/20'
              }`}>
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{currentSlide.userUploaded ? '📷 用户本地参考图（已由 GLM-4V 视觉解析）' : 'GPT 16:9 完整单页 PPT 画面'}</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => onTriggerImageGen && onTriggerImageGen(activeSlideIndex)}
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 text-xs border border-neutral-700/80 flex items-center space-x-1 transition shadow-lg cursor-pointer active:scale-95"
                  title="让 GPT 重新渲染本页完整画面"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                  <span>重新渲染画面</span>
                </button>
                <a
                  href={currentSlide.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 rounded-lg bg-neutral-900/90 hover:bg-neutral-800 text-neutral-200 text-xs border border-neutral-700/80 flex items-center space-x-1 transition shadow-lg cursor-pointer"
                  title="在新标签页查看高清原图"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
                  <span>查看原图</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // 2. 待机状态：纯净 16:9 展台，不渲染劣质模板预览，静候 GPT 绘制
    return renderStandbyCanvas();
  };

  return (
    <div className={`w-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-black p-4' : ''}`}>
      {/* Presentation Top bar inside viewer */}
      <div className="flex items-center justify-between mb-3 text-xs text-neutral-400">
        <div className="flex items-center space-x-2">
          <span className="font-medium text-neutral-200">
            第 {activeSlideIndex + 1} 页 / 共 {slides.length} 页
          </span>
          <span className="text-neutral-600">|</span>
          <span className="text-neutral-400">16:9 终稿演示画卷展台</span>
        </div>

        <div className="flex items-center space-x-2">
          {/* Conversational Rework button */}
          <button
            onClick={() => onRequestRework && onRequestRework(activeSlideIndex)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 transition text-xs font-medium shadow-xs active:scale-95"
            title="让 AI 针对当前页进行返工/重新排版/更换图片"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span>对话返工本页</span>
          </button>

          <button
            onClick={onAddSlide}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-neutral-800 text-neutral-400 hover:text-white hover:bg-neutral-850 transition"
            title="添加新幻灯片"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>加页</span>
          </button>
          {slides.length > 1 && (
            <button
              onClick={() => onDeleteSlide(activeSlideIndex)}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg border border-red-900/30 text-red-400 hover:text-red-300 hover:bg-red-950/20 transition"
              title="删除当前页"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Slide Canvas (16:9) */}
      <div
        className="relative w-full slide-ratio rounded-2xl overflow-hidden border shadow-2xl transition-all duration-300 select-text"
        style={{
          backgroundColor: `#${theme.bg}`,
          borderColor: `#${theme.border}`
        }}
      >
        {renderSlideContent()}

        {/* Navigation arrows (hover overlays) */}
        <button
          onClick={() => activeSlideIndex > 0 && onSelectSlide(activeSlideIndex - 1)}
          disabled={activeSlideIndex === 0}
          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-neutral-900/40 hover:bg-neutral-900/80 text-white backdrop-blur-sm border border-neutral-700/40 opacity-0 hover:opacity-100 disabled:opacity-0 transition-opacity"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => activeSlideIndex < slides.length - 1 && onSelectSlide(activeSlideIndex + 1)}
          disabled={activeSlideIndex === slides.length - 1}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-neutral-900/40 hover:bg-neutral-900/80 text-white backdrop-blur-sm border border-neutral-700/40 opacity-0 hover:opacity-100 disabled:opacity-0 transition-opacity"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Thumbnail Strip */}
      <div className="mt-4 flex items-center space-x-2.5 overflow-x-auto pb-2">
        {slides.map((s, idx) => (
          <button
            key={s.id || idx}
            onClick={() => onSelectSlide(idx)}
            className={`flex-shrink-0 w-28 slide-ratio rounded-lg border p-1.5 text-left transition-all relative ${
              idx === activeSlideIndex
                ? 'border-blue-500 ring-2 ring-blue-500/30 scale-105'
                : 'border-neutral-800 hover:border-neutral-700 opacity-60 hover:opacity-100'
            }`}
            style={{ backgroundColor: `#${theme.bg}` }}
          >
            <span
              className="absolute top-1 right-1 text-[9px] font-mono px-1 rounded bg-black/40"
              style={{ color: `#${theme.secondary}` }}
            >
              {idx + 1}
            </span>
            <p
              className="text-[9px] font-medium truncate mt-1"
              style={{ color: `#${theme.primary}` }}
            >
              {s.title || `Slide ${idx + 1}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
