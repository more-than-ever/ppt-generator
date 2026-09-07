import React, { useState } from 'react';
import { Sparkles, ArrowRight, Layers, Globe, Palette } from 'lucide-react';

const SUGGESTIONS = [
  '2026年新能源汽车全球化出海战略分析',
  'AI智能体(Agent)在企业工作流中的落地实践',
  '新一代消费品牌Q3季度增长复盘与营销规划',
  '极简主义产品设计理念与用户体验重塑'
];

export default function PromptInput({ onGenerate, isLoading }) {
  const [topic, setTopic] = useState('');
  const [slideCount, setSlideCount] = useState('6');
  const [customSlideCount, setCustomSlideCount] = useState('12');
  const [language, setLanguage] = useState('zh');
  const [style, setStyle] = useState('minimal');
  const [customStyleText, setCustomStyleText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!topic.trim() || isLoading) return;

    const finalSlideCount =
      slideCount === 'custom'
        ? Math.max(1, Math.min(30, parseInt(customSlideCount, 10) || 8))
        : Number(slideCount);

    const finalStyle =
      style === 'custom'
        ? (customStyleText.trim() || '用户自定义定制风格')
        : style;

    onGenerate({
      topic: topic.trim(),
      slideCount: finalSlideCount,
      language,
      style: finalStyle,
      isCustomCount: slideCount === 'custom',
      isCustomStyle: style === 'custom'
    });
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <form
        onSubmit={handleSubmit}
        className="relative bg-neutral-900/90 border border-neutral-800 rounded-2xl p-4 sm:p-5 shadow-2xl backdrop-blur-xl transition-all focus-within:border-neutral-600 focus-within:ring-1 focus-within:ring-neutral-600"
      >
        {/* Main Textarea */}
        <div className="relative">
          <textarea
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                handleSubmit(e);
              }
            }}
            placeholder="输入PPT主题、大纲要点或演讲场景，例如：2026年AI大模型商业化落地趋势..."
            rows={3}
            className="w-full bg-transparent text-white placeholder-neutral-500 resize-none text-base sm:text-lg focus:outline-none leading-relaxed"
          />
        </div>

        {/* Dynamic Custom Inputs (When "其他" is selected) */}
        {(slideCount === 'custom' || style === 'custom') && (
          <div className="mt-3 pt-3 border-t border-neutral-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs animate-in fade-in duration-200">
            {slideCount === 'custom' && (
              <div className="flex items-center space-x-2 bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-2.5">
                <span className="text-neutral-400 flex-shrink-0">自定义页数：</span>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={customSlideCount}
                  onChange={(e) => setCustomSlideCount(e.target.value)}
                  placeholder="如：12"
                  className="w-20 bg-neutral-900 border border-neutral-700 rounded-lg px-2 py-1 text-white text-center focus:outline-none focus:border-blue-500 font-mono"
                />
                <span className="text-neutral-500 text-[11px]">页 (支持 1-30 页)</span>
              </div>
            )}

            {style === 'custom' && (
              <div className="flex items-center space-x-2 bg-neutral-800/60 border border-neutral-700/60 rounded-xl p-2.5 sm:col-span-1 flex-1">
                <span className="text-neutral-400 flex-shrink-0">向 AI 交代风格：</span>
                <input
                  type="text"
                  value={customStyleText}
                  onChange={(e) => setCustomStyleText(e.target.value)}
                  placeholder="如：新中式水墨风、复古报纸排版、孟菲斯多彩..."
                  className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-2.5 py-1 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>
        )}

        {/* Options & Action Bar */}
        <div className="mt-4 pt-3.5 border-t border-neutral-800/80 flex flex-wrap items-center justify-between gap-3">
          {/* Quick Selectors */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Slide Count */}
            <div className="flex items-center space-x-1.5 bg-neutral-800/70 border border-neutral-700/60 rounded-lg px-2.5 py-1.5 text-neutral-300">
              <Layers className="w-3.5 h-3.5 text-neutral-400" />
              <select
                value={slideCount}
                onChange={(e) => setSlideCount(e.target.value)}
                aria-label="选择生成幻灯片页数"
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="5" className="bg-neutral-900">5 页 (精炼汇报)</option>
                <option value="6" className="bg-neutral-900">6 页 (标准路演)</option>
                <option value="8" className="bg-neutral-900">8 页 (完整方案)</option>
                <option value="10" className="bg-neutral-900">10 页 (深度报告)</option>
                <option value="custom" className="bg-neutral-900 text-blue-400 font-medium">✨ 其他 (向 AI 交代页数)</option>
              </select>
            </div>

            {/* Language */}
            <div className="flex items-center space-x-1.5 bg-neutral-800/70 border border-neutral-700/60 rounded-lg px-2.5 py-1.5 text-neutral-300">
              <Globe className="w-3.5 h-3.5 text-neutral-400" />
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                aria-label="选择演示文稿语言"
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="zh" className="bg-neutral-900">中文</option>
                <option value="en" className="bg-neutral-900">English</option>
              </select>
            </div>

            {/* Style */}
            <div className="flex items-center space-x-1.5 bg-neutral-800/70 border border-neutral-700/60 rounded-lg px-2.5 py-1.5 text-neutral-300">
              <Palette className="w-3.5 h-3.5 text-neutral-400" />
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                aria-label="选择演示文稿风格"
                className="bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="minimal" className="bg-neutral-900">极简现代</option>
                <option value="tech" className="bg-neutral-900">科技未来</option>
                <option value="business" className="bg-neutral-900">高端商务</option>
                <option value="academic" className="bg-neutral-900">学术严谨</option>
                <option value="custom" className="bg-neutral-900 text-blue-400 font-medium">✨ 其他 (向 AI 交代风格)</option>
              </select>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-white text-neutral-950 font-medium text-sm hover:bg-neutral-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm ml-auto"
          >
            {isLoading ? (
              <>
                <Sparkles className="w-4 h-4 animate-spin text-neutral-800" />
                <span>构思中...</span>
              </>
            ) : (
              <>
                <span>一键生成</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* Suggestion Chips */}
      <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">
        <span className="text-xs text-neutral-500 font-mono mr-1">灵感：</span>
        {SUGGESTIONS.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setTopic(s)}
            className="text-xs px-2.5 py-1 rounded-full bg-neutral-900/60 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 border border-neutral-800/80 transition"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
