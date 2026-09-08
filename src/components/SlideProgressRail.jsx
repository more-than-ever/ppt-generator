import React from 'react';
import { CheckCircle2, Clock, RefreshCw, Plus, Eye, EyeOff, Sparkles, Image as ImageIcon } from 'lucide-react';

export default function SlideProgressRail({
  slides = [],
  activeSlideIndex = 0,
  onSelectSlide,
  onAddSlide,
  generatingImageIndex = null,
  isViewerOpen = false,
  onToggleViewer,
  theme = { bg: '0D0E12', border: '262626', primary: 'ffffff', secondary: 'a3a3a3' }
}) {
  const completedCount = slides.filter(s => Boolean(s.imageUrl)).length;

  return (
    <div className="w-full border-t border-neutral-800/80 bg-[#090A0D]/95 backdrop-blur-md px-4 py-2 flex items-center justify-between gap-3 z-30 select-none shadow-lg">
      {/* Left: Overall Generation Progress Badge */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-neutral-900 border border-neutral-800 text-xs">
          <span className="text-neutral-400 font-mono">共 {slides.length} 页</span>
          <span className="text-neutral-600">|</span>
          <span className={`flex items-center space-x-1 font-medium ${completedCount > 0 ? 'text-emerald-400' : 'text-neutral-400'}`}>
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>已生图 {completedCount}/{slides.length}</span>
          </span>
        </div>
      </div>

      {/* Center: Slide Thumbnail Rail (保留并升级第二张图的指示器) */}
      <div className="flex-1 flex items-center space-x-2.5 overflow-x-auto py-1 px-1 scrollbar-thin scrollbar-thumb-neutral-800">
        {slides.map((s, idx) => {
          const isActive = idx === activeSlideIndex;
          const isGeneratingThis = generatingImageIndex === idx;
          const hasImage = Boolean(s.imageUrl);
          const isPendingPlan = !s.bullets || s.bullets.length === 0 || (s.title && s.title.includes('待规划'));

          return (
            <button
              key={s.id || idx}
              type="button"
              onClick={() => onSelectSlide(idx, hasImage)}
              className={`group relative flex-shrink-0 w-36 h-18 rounded-xl border text-left transition-all duration-200 overflow-hidden flex flex-col justify-between p-2 cursor-pointer ${
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-500/40 bg-neutral-900 shadow-md scale-[1.02]'
                  : 'border-neutral-800/90 hover:border-neutral-700 bg-neutral-950/70 hover:bg-neutral-900/80 opacity-80 hover:opacity-100'
              }`}
            >
              {/* Optional Background preview if GPT image is ready */}
              {hasImage && (
                <div className="absolute inset-0 z-0 opacity-25 group-hover:opacity-40 transition-opacity">
                  <img
                    src={s.imageUrl}
                    alt=""
                    className="w-full h-full object-cover filter blur-[0.5px]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                </div>
              )}

              {/* Card Top: Slide Number & Status Indicator */}
              <div className="relative z-10 flex items-center justify-between w-full">
                {/* Status Indicator */}
                {isGeneratingThis ? (
                  <span className="flex items-center space-x-1 text-[9.5px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium animate-pulse">
                    <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                    <span>渲染中</span>
                  </span>
                ) : hasImage ? (
                  <span className="flex items-center space-x-1 text-[9.5px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-medium">
                    <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
                    <span>已完成生图</span>
                  </span>
                ) : isPendingPlan ? (
                  <span className="flex items-center space-x-1 text-[9.5px] px-1.5 py-0.5 rounded-full bg-neutral-800 text-neutral-400 border border-neutral-700 font-normal">
                    <span>待规划</span>
                  </span>
                ) : (
                  <span className="flex items-center space-x-1 text-[9.5px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-300 border border-blue-500/20 font-medium">
                    <Clock className="w-2.5 h-2.5" />
                    <span>待生图</span>
                  </span>
                )}

                {/* Slide Number Badge */}
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-black/60 text-neutral-300 border border-white/10">
                  {idx + 1}
                </span>
              </div>

              {/* Card Bottom: Slide Title */}
              <div className="relative z-10 w-full mt-1">
                <p className="text-[10.5px] font-medium text-white/90 truncate leading-tight">
                  {s.title || `第 ${idx + 1} 页`}
                </p>
              </div>

              {/* Active Indicator Bar on bottom border */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
              )}
            </button>
          );
        })}

        {/* Quick Add Slide Button */}
        {onAddSlide && (
          <button
            type="button"
            onClick={onAddSlide}
            className="flex-shrink-0 h-18 px-3 rounded-xl border border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-950/40 hover:bg-neutral-900/60 text-neutral-400 hover:text-white flex flex-col items-center justify-center space-y-1 transition text-[10px] cursor-pointer"
            title="添加新幻灯片"
          >
            <Plus className="w-4 h-4" />
            <span>加页</span>
          </button>
        )}
      </div>

      {/* Right: Toggle Right Viewer (Only when there are generated images) */}
      <div className="flex items-center space-x-2 flex-shrink-0">
        {completedCount > 0 && (
          <button
            type="button"
            onClick={onToggleViewer}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition shadow-xs cursor-pointer active:scale-95 ${
              isViewerOpen
                ? 'bg-neutral-800 text-neutral-200 border-neutral-700 hover:bg-neutral-750'
                : 'bg-blue-600 hover:bg-blue-500 text-white border-blue-500/50 shadow-blue-500/20'
            }`}
            title={isViewerOpen ? '收起右侧画卷，返回纯对话界面' : '在右侧展开查看 GPT 渲染的 16:9 画卷'}
          >
            {isViewerOpen ? (
              <>
                <EyeOff className="w-3.5 h-3.5" />
                <span>收起画卷</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5 text-blue-200" />
                <span>查看画卷 ({completedCount})</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
