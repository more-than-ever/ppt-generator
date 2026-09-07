import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowRight, RefreshCw, Wand2 } from 'lucide-react';
import { recommendDeckStyle } from '../services/aiService';

export default function DeckInitModal({ onStartDeck, isLoading }) {
  const [topic, setTopic] = useState('');
  const [aiRecommendedStyle, setAiRecommendedStyle] = useState(null);
  const [isRecommending, setIsRecommending] = useState(false);

  // Auto recommend style when topic changes (debounce 600ms)
  useEffect(() => {
    const trimmed = topic.trim();
    if (trimmed.length < 3) {
      setAiRecommendedStyle(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsRecommending(true);
      const style = await recommendDeckStyle({ topic: trimmed });
      setAiRecommendedStyle(style);
      setIsRecommending(false);
    }, 600);

    return () => clearTimeout(timer);
  }, [topic]);

  const handleStart = async (e) => {
    e.preventDefault();
    if (!topic.trim() || isLoading) return;

    let deckStyle = aiRecommendedStyle;
    if (!deckStyle) {
      setIsRecommending(true);
      deckStyle = await recommendDeckStyle({ topic: topic.trim() });
      setIsRecommending(false);
    }

    onStartDeck({
      topic: topic.trim(),
      deckStyle: deckStyle || {
        id: 'auto',
        name: '现代专业商务',
        theme: 'dark',
        customPrompt: 'modern minimalist presentation design, clean negative space, balanced layout'
      }
    });
  };

  return (
    <div className="w-full max-w-xl mx-auto my-auto p-6 sm:p-8 bg-[#0D0F14] border border-neutral-800 rounded-3xl shadow-2xl backdrop-blur-xl animate-in fade-in duration-300">
      <div className="flex items-center space-x-2 text-xs text-blue-400 font-medium mb-3">
        <Sparkles className="w-4 h-4" />
        <span>多轮对话 · 逐页交互制片 · 成品级 16:9 演示画卷</span>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
        开启演示文稿制作
      </h1>
      <p className="text-xs sm:text-sm text-neutral-400 mb-6 leading-relaxed">
        输入主题后，AI 将自动分析业务场景并量身确定最契合的视觉调性与排版规范（若后续对风格有其他想法，可随时在对话中告诉 AI 调整）。
      </p>

      <form onSubmit={handleStart} className="space-y-5 text-xs">
        {/* Topic Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-neutral-200 font-semibold text-sm">
              PPT 主题 / 汇报主旨 <span className="text-red-400">*</span>
            </label>
            {isRecommending && (
              <span className="text-[11px] text-blue-400 flex items-center space-x-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>AI 正在匹配设计风格...</span>
              </span>
            )}
          </div>
          <input
            type="text"
            required
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="例如：第一页写班长竞选；特斯拉4680电池技术解析；企业出海商业计划书..."
            className="w-full bg-neutral-900/90 border border-neutral-700/80 rounded-2xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 transition shadow-inner"
          />
        </div>

        {/* AI Style Live preview */}
        {topic.trim().length >= 2 && (
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-blue-950/40 via-indigo-950/20 to-neutral-900/80 border border-blue-500/30 space-y-1.5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Wand2 className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="font-semibold text-white">AI 智能匹配设计风格：</span>
                <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                  {isRecommending ? '匹配中...' : (aiRecommendedStyle?.name || '智能自适应')}
                </span>
              </div>
              {aiRecommendedStyle?.accentColor && !isRecommending && (
                <div className="flex items-center space-x-1.5 text-[11px] text-neutral-400">
                  <span>主色调：</span>
                  <span
                    className="w-3 h-3 rounded-full border border-white/20 shadow-sm"
                    style={{ backgroundColor: aiRecommendedStyle.accentColor }}
                  />
                </div>
              )}
            </div>
            {aiRecommendedStyle?.reason && !isRecommending && (
              <p className="text-[11px] text-neutral-400 leading-relaxed pt-0.5">
                💡 {aiRecommendedStyle.reason}
              </p>
            )}
          </div>
        )}

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={!topic.trim() || isLoading}
            className="w-full flex items-center justify-center space-x-2 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold text-sm active:scale-98 disabled:opacity-40 transition shadow-xl cursor-pointer"
          >
            <span>开启智能对话制作</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

