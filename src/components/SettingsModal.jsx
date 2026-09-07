import React, { useState, useEffect } from 'react';
import { X, Key, ShieldCheck, Globe, Cpu, Check, AlertTriangle, Sparkles, Image, RefreshCw, Zap, Lock } from 'lucide-react';
import { saveConfig, fetchConfig, testLlmConnection } from '../services/aiService';

const PRESETS = [
  {
    name: '智谱 GLM-4-Flash',
    badge: '🎁 免费推荐',
    url: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash',
    desc: '国内直连，个人开发者免费调用，中文理解与提炼能力第一梯队。'
  },
  {
    name: 'DeepSeek-V3',
    badge: '🔥 超高性价比',
    url: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    desc: '国内顶级大模型，推理与架构能力强劲，几分钱可用很久。'
  },
  {
    name: '硅基流动 SiliconFlow',
    badge: '免费额度',
    url: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V3',
    desc: '高并发加速平台，新用户赠送大额代金券，内置免费开源模型。'
  },
  {
    name: '本地离线 Ollama',
    badge: '⚡ 0成本无网',
    url: 'http://localhost:11434/v1',
    model: 'qwen2.5:7b',
    desc: '电脑本地完全离线运行，无需 API Key，数据绝对隐私且永久免费。'
  },
  {
    name: 'OpenAI 官方 / 代理',
    badge: '国际通用',
    url: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    desc: '标准 OpenAI 端点或第三方中转反代通道。'
  }
];

export default function SettingsModal({ isOpen, onClose, onConfigSaved }) {
  const [activeTab, setActiveTab] = useState('llm'); // 'llm' | 'image'
  const [gptKey, setGptKey] = useState('');
  const [gptUrl, setGptUrl] = useState('https://api.grsai.com/v1');
  const [gptModel, setGptModel] = useState('gpt-image-2');
  const [llmKey, setLlmKey] = useState('');
  const [llmUrl, setLlmUrl] = useState('https://open.bigmodel.cn/api/paas/v4');
  const [llmModel, setLlmModel] = useState('glm-4-flash');

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Test connection state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }
  const [hasServerLlmKey, setHasServerLlmKey] = useState(false);
  const [hasServerGptKey, setHasServerGptKey] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTestResult(null);
      // Clean any accidental keys from localStorage for privacy
      try {
        localStorage.removeItem('llm_key');
        localStorage.removeItem('gptimage2_key');
      } catch (e) {}

      fetchConfig().then((cfg) => {
        setHasServerLlmKey(Boolean(cfg.hasLlmKey));
        setHasServerGptKey(Boolean(cfg.hasGptimage2Key));
        // NEVER populate plain key into state or DOM - keep strictly confidential
        setGptKey('');
        setGptUrl(cfg.gptimage2ApiUrl || 'https://api.grsai.com/v1');
        setGptModel(cfg.gptimage2Model || 'gpt-image-2');
        setLlmKey('');
        setLlmUrl(cfg.llmApiUrl || 'https://open.bigmodel.cn/api/paas/v4');
        setLlmModel(cfg.llmModel || 'glm-4-flash');
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const applyPreset = (p) => {
    setLlmUrl(p.url);
    setLlmModel(p.model);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    const res = await testLlmConnection({
      apiKey: llmKey.trim() || undefined,
      apiUrl: llmUrl,
      model: llmModel
    });
    setIsTesting(false);
    setTestResult(res);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const configData = {
      gptimage2ApiUrl: gptUrl,
      gptimage2Model: gptModel,
      llmApiUrl: llmUrl,
      llmModel: llmModel,
    };
    if (gptKey.trim()) {
      configData.gptimage2ApiKey = gptKey.trim();
    }
    if (llmKey.trim()) {
      configData.llmApiKey = llmKey.trim();
    }
    await saveConfig(configData);
    setLlmKey('');
    setGptKey('');
    setIsSaving(false);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onConfigSaved?.();
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-[#0E1015] border border-neutral-800 rounded-2xl shadow-2xl p-6 text-neutral-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-neutral-800/90 border border-neutral-700/60">
              <Sparkles className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">AI 大模型与服务设置</h2>
              <p className="text-xs text-neutral-400">连接大语言模型实现深度理解、智能拆解与演说文案定制</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex mt-4 p-1 rounded-xl bg-neutral-900 border border-neutral-800">
          <button
            type="button"
            onClick={() => setActiveTab('llm')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-medium transition ${
              activeTab === 'llm'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>✍️ 文案排版大脑 (LLM)</span>
            {llmKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('image')}
            className={`flex-1 flex items-center justify-center space-x-2 py-2 rounded-lg text-xs font-medium transition ${
              activeTab === 'image'
                ? 'bg-neutral-800 text-white shadow-sm'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <Image className="w-3.5 h-3.5 text-purple-400" />
            <span>🎨 视觉生图大脑 (可选)</span>
            {gptKey && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>}
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
          {activeTab === 'llm' ? (
            <div className="space-y-3.5">
              {/* Preset quick buttons */}
              <div>
                <label className="block text-neutral-400 mb-1.5 font-medium">快捷预设推荐（一键填充接口与模型）：</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PRESETS.map((p) => {
                    const isSelected = llmUrl === p.url && llmModel === p.model;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={`text-left p-2 rounded-xl border transition flex flex-col justify-between ${
                          isSelected
                            ? 'bg-blue-950/40 border-blue-500/60 text-white shadow'
                            : 'bg-neutral-900/60 border-neutral-800 text-neutral-300 hover:border-neutral-700'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="font-medium text-[11px] truncate">{p.name}</span>
                          <span className="text-[9px] px-1 py-0.2 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {p.badge}
                          </span>
                        </div>
                        <span className="text-[10px] text-neutral-400 font-mono truncate">{p.model}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* API Key */}
              <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-neutral-800 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-300 font-medium flex items-center space-x-1.5">
                      <span>大语言模型 API Key</span>
                      {hasServerLlmKey && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>已在本地后端安全加密托管（对外完全保密）</span>
                        </span>
                      )}
                    </label>
                    <span className="text-[10px] text-neutral-500">
                      {llmUrl.includes('localhost') || llmUrl.includes('127.0.0.1') ? '本地 Ollama 无需填 Key' : '格式通常为 48... 或 sk-...'}
                    </span>
                  </div>
                  <div>
                    <input
                      type="password"
                      value={llmKey}
                      onChange={(e) => setLlmKey(e.target.value)}
                      placeholder={hasServerLlmKey ? '•••••••••••••••• (已在后台安全加密托管，留空保留原密钥)' : (llmUrl.includes('localhost') ? '本地模型免填' : 'sk-... / 智谱API Key')}
                      className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  {hasServerLlmKey && (
                    <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>密钥仅保留在您的电脑本地服务器内存及 .env 中，浏览器端杜绝明文回显与查看，任何人均无法偷窥。若需更换直接输入新 Key 保存即可。</span>
                    </p>
                  )}
                </div>

                {/* API Base URL */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-neutral-400 mb-1">API Base URL (端点地址)</label>
                    <input
                      type="text"
                      value={llmUrl}
                      onChange={(e) => setLlmUrl(e.target.value)}
                      placeholder="https://api.openai.com/v1"
                      className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-400 mb-1">模型名称 (Model Name)</label>
                    <input
                      type="text"
                      value={llmModel}
                      onChange={(e) => setLlmModel(e.target.value)}
                      placeholder="gpt-4o-mini / deepseek-chat"
                      className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-blue-500 font-mono text-[11px]"
                    />
                  </div>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-t border-neutral-800/60">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? '正在测试连接...' : '一键测试连接'}</span>
                  </button>

                  {testResult && (
                    <div
                      className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center space-x-1.5 ${
                        testResult.success
                          ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50'
                          : 'bg-rose-950/60 text-rose-300 border border-rose-800/50'
                      }`}
                    >
                      {testResult.success ? <Check className="w-3 h-3 flex-shrink-0" /> : <AlertTriangle className="w-3 h-3 flex-shrink-0" />}
                      <span className="truncate max-w-[280px]">{testResult.message || testResult.error}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Free AI Guidance Tip */}
              <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800 flex items-start space-x-2 text-neutral-400 text-[11px] leading-relaxed">
                <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <span className="text-neutral-200 font-medium">💡 免费白嫖小窍门：</span>
                  推荐点击上方的<strong>【智谱 GLM-4-Flash】</strong>（国内官网注册即用，开发者永久免费，0 成本调取，中文排版与竞聘演讲能力极佳），无需花钱买 OpenAI。
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* gptimage2 Section */}
              <div className="p-3.5 rounded-xl bg-neutral-900/60 border border-neutral-800/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-neutral-200 flex items-center space-x-1.5">
                    <span>gptimage2 图像 API 配置</span>
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-950/60 text-purple-400 border border-purple-800/40">
                    用于 PPT 智能插图
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-400 font-medium flex items-center space-x-1.5">
                      <span>API Key 密钥</span>
                      {hasServerGptKey && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 flex items-center space-x-1">
                          <Lock className="w-3 h-3" />
                          <span>已在本地后端安全加密托管（对外完全保密）</span>
                        </span>
                      )}
                    </label>
                  </div>
                  <div>
                    <input
                      type="password"
                      value={gptKey}
                      onChange={(e) => setGptKey(e.target.value)}
                      placeholder={hasServerGptKey ? '•••••••••••••••• (已在后台安全加密托管，留空保留原密钥)' : 'sk-...'}
                      className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono"
                    />
                  </div>
                  {hasServerGptKey && (
                    <p className="text-[11px] text-neutral-400 mt-1.5 flex items-center space-x-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>密钥仅保留在本地服务器，前端任何人均无法明文查看。若需更换直接在此输入新 Key 保存。</span>
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-400 text-xs">API Base URL (端点地址)</label>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => setGptUrl('https://api.grsai.com/v1')}
                        className="text-[10px] text-purple-400 hover:text-purple-300 underline"
                      >
                        GrsAI 中转站
                      </button>
                      <button
                        type="button"
                        onClick={() => setGptUrl('https://api.openai.com/v1')}
                        className="text-[10px] text-neutral-500 hover:text-neutral-400 underline"
                      >
                        OpenAI 官方
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={gptUrl}
                    onChange={(e) => setGptUrl(e.target.value)}
                    placeholder="https://api.grsai.com/v1"
                    className="w-full bg-neutral-800/80 border border-neutral-700 rounded-lg px-3 py-2 text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 font-mono text-xs"
                  />
                  <p className="text-[10px] text-neutral-500 mt-1">
                    支持 GrsAI 中转站及 OpenAI 官方 (dall-e-3)
                  </p>
                </div>

                <div>
                  <label className="text-neutral-400 text-xs block mb-1.5">生图模型档位 (GrsAI 积分策略)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setGptModel('gpt-image-2')}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        gptModel === 'gpt-image-2'
                          ? 'border-purple-500 bg-purple-950/20 text-white shadow-sm ring-1 ring-purple-500/50'
                          : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-semibold text-purple-300">gpt-image-2</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">推荐 · 省积分</span>
                      </div>
                      <div className="text-[11px] text-neutral-300 font-medium leading-tight">
                        约 600 积分/次
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-1">
                        经济首选，耗时约 35-45 秒
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGptModel('gpt-image-2-vip')}
                      className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        gptModel === 'gpt-image-2-vip'
                          ? 'border-amber-500 bg-amber-950/20 text-white shadow-sm ring-1 ring-amber-500/50'
                          : 'border-neutral-800 bg-neutral-900/50 text-neutral-400 hover:border-neutral-700 hover:text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-semibold text-amber-300">gpt-image-2-vip</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">VIP 高速</span>
                      </div>
                      <div className="text-[11px] text-neutral-300 font-medium leading-tight">
                        约 2000 积分/次
                      </div>
                      <div className="text-[10px] text-neutral-500 mt-1">
                        极速专属通道，耗时约 10-15 秒
                      </div>
                    </button>
                  </div>
                  <p className="text-[10px] text-neutral-500 mt-1.5">
                    * 系统已锁定为 <strong>gpt-image-2</strong>，绝不会在后台自动升档扣除高额 VIP 积分。
                  </p>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 rounded-xl bg-neutral-900/40 border border-neutral-800 flex items-start space-x-2 text-neutral-400 text-[11px] leading-relaxed">
                <Image className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <div>
                  生图 API 为可选功能。即使不配置，系统也会遵循当前主题色调自动搭配极简留白占位图，您也可以随时直接在页面<strong>拖拽或上传本地图片</strong>替换。
                </div>
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-neutral-800 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-neutral-300 transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-1.5 px-5 py-1.5 rounded-lg bg-white text-neutral-950 font-medium hover:bg-neutral-200 transition active:scale-95 disabled:opacity-50 shadow-sm"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>已保存！</span>
                </>
              ) : (
                <span>{isSaving ? '保存中...' : '保存并生效'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
