import React from 'react';
import { Presentation, Settings, Download, MonitorPlay } from 'lucide-react';

export default function Header({
  hasKey,
  imageModel = 'gpt-image-2',
  onChangeImageModel,
  onOpenSettings,
  onExport,
  isExporting,
  hasSlides,
  onEnterFullscreen
}) {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-neutral-800/80 bg-[#0A0A0B]/90 backdrop-blur-md px-6 py-3.5 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Logo & Title */}
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-neutral-800 to-neutral-700 flex items-center justify-center border border-neutral-700/60 shadow-inner">
            <Presentation className="w-5 h-5 text-neutral-100" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-semibold text-base tracking-tight text-white">SlideFlow</span>
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/50">
                Minimal AI
              </span>
            </div>
            <p className="text-xs text-neutral-400 hidden sm:block">极简 AI 幻灯片生成</p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center space-x-2.5">
          {/* Fullscreen Demo */}
          {hasSlides && (
            <button
              onClick={onEnterFullscreen}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-lg transition"
              title="全屏演示"
            >
              <MonitorPlay className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">演示</span>
            </button>
          )}

          {/* Export PPTX button */}
          {hasSlides && (
            <button
              onClick={onExport}
              disabled={isExporting}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 text-xs font-medium text-neutral-900 bg-white hover:bg-neutral-200 active:scale-95 rounded-lg transition shadow-sm disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>{isExporting ? '正在导出...' : '导出 PPTX'}</span>
            </button>
          )}

          {/* 生图通道快速切换（image2 vs VIP） */}
          <div className="flex items-center p-0.5 rounded-lg bg-neutral-900/90 border border-neutral-800 text-xs shadow-inner">
            <button
              type="button"
              onClick={() => onChangeImageModel?.('gpt-image-2')}
              className={`px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5 ${
                imageModel === 'gpt-image-2'
                  ? 'bg-purple-950/80 text-purple-300 border border-purple-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="gpt-image-2：约600积分/次，省积分经济首选"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${imageModel === 'gpt-image-2' ? 'bg-purple-400' : 'bg-neutral-600'}`} />
              <span>image2</span>
              <span className="text-[10px] text-emerald-400/90 font-mono hidden sm:inline">省分</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeImageModel?.('gpt-image-2-vip')}
              className={`px-2.5 py-1 rounded-md transition font-medium flex items-center space-x-1.5 ${
                imageModel === 'gpt-image-2-vip'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/50 shadow-sm'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
              title="gpt-image-2-vip：约2000积分/次，VIP极速专属通道"
            >
              <span className={`w-1.5 h-1.5 rounded-full ${imageModel === 'gpt-image-2-vip' ? 'bg-amber-400' : 'bg-neutral-600'}`} />
              <span>VIP</span>
              <span className="text-[10px] text-amber-400/90 font-mono hidden sm:inline">极速</span>
            </button>
          </div>

          {/* 详情与说明按钮 */}
          <button
            onClick={onOpenSettings}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 transition"
            title="查看生图通道详情"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
