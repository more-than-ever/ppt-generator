import React from 'react';
import { Presentation, Settings, Download, MonitorPlay, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { THEMES } from '../services/pptxExport';

export default function Header({
  hasKey,
  onOpenSettings,
  onExport,
  isExporting,
  hasSlides,
  currentTheme,
  onChangeTheme,
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
          {/* Theme Selector */}
          {hasSlides && (
            <div className="relative inline-flex items-center">
              <select
                value={currentTheme}
                onChange={(e) => onChangeTheme(e.target.value)}
                aria-label="选择幻灯片配色风格"
                className="text-xs bg-neutral-900 border border-neutral-800 text-neutral-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-neutral-600 cursor-pointer"
              >
                {Object.entries(THEMES).map(([key, t]) => (
                  <option key={key} value={key}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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

          {/* API Key Status & Settings button */}
          <button
            onClick={onOpenSettings}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
              hasKey
                ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/40'
                : 'bg-neutral-900 border-neutral-800 text-neutral-300 hover:text-white hover:bg-neutral-800'
            }`}
            title="配置 API 密钥"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="flex items-center space-x-1">
              <span>API 设置</span>
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  hasKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
