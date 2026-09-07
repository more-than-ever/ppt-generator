import React from 'react';
import {
  ListOrdered,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layout,
  Layers,
  Sparkles,
  X
} from 'lucide-react';

const LAYOUT_OPTIONS = [
  { value: 'cover', label: '封面 (Hero)' },
  { value: 'agenda', label: '目录 (Agenda)' },
  { value: 'cards', label: '多列卡片 (Cards)' },
  { value: 'metrics', label: '数据指标 (Metrics)' },
  { value: 'process', label: '流程图 (Process)' },
  { value: 'summary', label: '总结页 (Summary)' }
];

export default function OutlineEditor({
  slides,
  activeSlideIndex,
  onSelectSlide,
  onUpdateSlide,
  onAddSlide,
  onDeleteSlide,
  onMoveSlide,
  isOpen,
  onClose
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-[#0D0E11] border-l border-neutral-800 shadow-2xl z-40 flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <ListOrdered className="w-4 h-4 text-neutral-400" />
          <h2 className="text-sm font-semibold text-white">演示文稿大纲</h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-mono">
            {slides.length} 页
          </span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            onClick={onAddSlide}
            className="flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-neutral-200 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>加页</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Slide List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {slides.map((slide, idx) => {
          const isActive = idx === activeSlideIndex;
          return (
            <div
              key={slide.id || idx}
              onClick={() => onSelectSlide(idx)}
              className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                isActive
                  ? 'bg-neutral-850/90 border-blue-500/80 ring-1 ring-blue-500/20 shadow-md'
                  : 'bg-neutral-900/40 border-neutral-800/80 hover:border-neutral-700'
              }`}
            >
              {/* Slide top controls */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-mono font-semibold text-neutral-400">
                    #{idx + 1}
                  </span>
                  {/* Layout Type Selector */}
                  <select
                    value={slide.type || 'cards'}
                    onChange={(e) => {
                      e.stopPropagation();
                      onUpdateSlide(idx, { type: e.target.value });
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="text-[11px] bg-neutral-800 border border-neutral-700 text-neutral-300 rounded px-2 py-0.5 focus:outline-none"
                  >
                    {LAYOUT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
                  {idx > 0 && (
                    <button
                      onClick={() => onMoveSlide(idx, idx - 1)}
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                      title="上移"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {idx < slides.length - 1 && (
                    <button
                      onClick={() => onMoveSlide(idx, idx + 1)}
                      className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800"
                      title="下移"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {slides.length > 1 && (
                    <button
                      onClick={() => onDeleteSlide(idx)}
                      className="p-1 text-neutral-500 hover:text-red-400 rounded hover:bg-neutral-800"
                      title="删除"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Title input */}
              <input
                type="text"
                value={slide.title || ''}
                onChange={(e) => onUpdateSlide(idx, { title: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                placeholder="幻灯片标题"
                className="w-full bg-neutral-800/60 border border-neutral-700/50 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 mb-2 focus:outline-none focus:border-neutral-500"
              />

              {/* Bullets */}
              <div className="space-y-1.5">
                {slide.bullets?.map((bullet, bIdx) => (
                  <div key={bIdx} className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-neutral-500 text-xs">•</span>
                    <input
                      type="text"
                      value={bullet}
                      onChange={(e) => {
                        const newBullets = [...(slide.bullets || [])];
                        newBullets[bIdx] = e.target.value;
                        onUpdateSlide(idx, { bullets: newBullets });
                      }}
                      className="flex-1 bg-transparent border-b border-transparent focus:border-neutral-700 text-neutral-300 text-xs py-0.5 focus:outline-none"
                    />
                    {slide.bullets.length > 1 && (
                      <button
                        onClick={() => {
                          const newBullets = slide.bullets.filter((_, i) => i !== bIdx);
                          onUpdateSlide(idx, { bullets: newBullets });
                        }}
                        className="opacity-0 hover:opacity-100 p-0.5 text-neutral-500 hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add Bullet Item button */}
              <div className="mt-2 pt-2 border-t border-neutral-800/60 flex justify-end" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    const newBullets = [...(slide.bullets || []), '新要点描述'];
                    onUpdateSlide(idx, { bullets: newBullets });
                  }}
                  className="text-[11px] text-neutral-400 hover:text-white flex items-center space-x-1 py-0.5 px-1.5 rounded hover:bg-neutral-800"
                >
                  <Plus className="w-3 h-3" />
                  <span>添加要点</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
