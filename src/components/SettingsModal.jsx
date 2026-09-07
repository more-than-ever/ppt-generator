import React, { useState, useEffect } from 'react';
import { X, Check, Zap, Sparkles } from 'lucide-react';
import { saveConfig, fetchConfig } from '../services/aiService';

export default function SettingsModal({ isOpen, onClose, currentModel, onConfigSaved }) {
  const [gptModel, setGptModel] = useState(currentModel || 'gpt-image-2');
  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig().then((cfg) => {
        setGptModel(cfg.gptimage2Model || currentModel || 'gpt-image-2');
      });
    }
  }, [isOpen, currentModel]);

  if (!isOpen) return null;

  const handleSelectModel = async (model) => {
    setGptModel(model);
    setIsSaving(true);
    await saveConfig({ gptimage2Model: model });
    setIsSaving(false);
    setSavedSuccess(true);
    onConfigSaved?.(model);
    setTimeout(() => {
      setSavedSuccess(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-[#0E1015] border border-neutral-800 rounded-2xl shadow-2xl p-6 text-neutral-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-purple-950/50 border border-purple-800/50">
              <Zap className="w-4 h-4 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">生图模型档位切换</h2>
              <p className="text-xs text-neutral-400">一键切换 GPT 成品幻灯片生图通道</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Model Selection Cards */}
        <div className="mt-5 space-y-3">
          {/* Option 1: gpt-image-2 */}
          <button
            type="button"
            onClick={() => handleSelectModel('gpt-image-2')}
            className={`w-full p-4 rounded-xl border text-left transition flex items-center justify-between group ${
              gptModel === 'gpt-image-2'
                ? 'border-purple-500 bg-purple-950/30 text-white shadow-lg ring-1 ring-purple-500/50'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-850'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-purple-300">gpt-image-2</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                  推荐 · 省积分
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                约 <strong className="text-neutral-200">600 积分</strong> / 次 · 经济首选，耗时约 35-45 秒
              </p>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                gptModel === 'gpt-image-2'
                  ? 'border-purple-500 bg-purple-500 text-white'
                  : 'border-neutral-700 bg-neutral-800 text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </button>

          {/* Option 2: gpt-image-2-vip */}
          <button
            type="button"
            onClick={() => handleSelectModel('gpt-image-2-vip')}
            className={`w-full p-4 rounded-xl border text-left transition flex items-center justify-between group ${
              gptModel === 'gpt-image-2-vip'
                ? 'border-amber-500 bg-amber-950/30 text-white shadow-lg ring-1 ring-amber-500/50'
                : 'border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-850'
            }`}
          >
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="font-semibold text-sm text-amber-300">gpt-image-2-vip</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                  VIP 高速
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                约 <strong className="text-neutral-200">2000 积分</strong> / 次 · 极速专属通道，耗时约 10-15 秒
              </p>
            </div>
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                gptModel === 'gpt-image-2-vip'
                  ? 'border-amber-500 bg-amber-500 text-white'
                  : 'border-neutral-700 bg-neutral-800 text-transparent'
              }`}
            >
              <Check className="w-3.5 h-3.5 stroke-[3]" />
            </div>
          </button>
        </div>

        {/* Footer info & close */}
        <div className="mt-5 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs">
          <div className="text-neutral-400 text-[11px]">
            {savedSuccess ? (
              <span className="text-emerald-400 font-medium flex items-center space-x-1">
                <Check className="w-3.5 h-3.5" />
                <span>已切换为 {gptModel} 并实时生效</span>
              </span>
            ) : isSaving ? (
              <span className="text-neutral-400">正在切换...</span>
            ) : (
              <span>点击卡片即可直接切换生图通道</span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium transition"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

