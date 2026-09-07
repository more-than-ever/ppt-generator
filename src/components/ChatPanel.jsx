import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Image as ImageIcon,
  Paperclip,
  X,
  Lock,
  Sparkles,
  ChevronRight,
  RefreshCw,
  PlusCircle,
  FileCheck,
  Check,
  Mic,
  MicOff
} from 'lucide-react';

export default function ChatPanel({
  deckStyle,
  messages,
  onSendMessage,
  isLoading,
  currentSlideCount,
  onSelectSlide,
  activeSlideIndex,
  activeSlide,
  slides = [],
  reworkTarget,
  onSetReworkTarget,
  onTriggerImageGen,
  generatingImageIndex
}) {
  const [inputText, setInputText] = useState('');
  const [attachedImages, setAttachedImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);

  // Is current mode rework?
  const isReworkMode = reworkTarget !== null && reworkTarget !== undefined;
  const currentTargetIndex = isReworkMode ? reworkTarget : activeSlideIndex;

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus textarea when rework mode is triggered
  useEffect(() => {
    if (reworkTarget !== null && reworkTarget !== undefined) {
      textareaRef.current?.focus();
    }
  }, [reworkTarget]);

  // Convert uploaded files to base64 data URLs
  const handleFiles = (files) => {
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (validFiles.length === 0) return;

    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        setAttachedImages(prev => [...prev, e.target.result]);
      };
      reader.readAsDataURL(file);
    });
  };

  // Drag & drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // Clipboard paste support (e.g. Win+Shift+S screenshots)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        files.push(items[i].getAsFile());
      }
    }
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  // Speech Recognition (Voice Description Dictation)
  const toggleSpeechRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('当前浏览器未开放语音识别接口，推荐使用 Chrome 或 Edge 浏览器开启语音描述。');
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'zh-CN';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputText(prev => prev ? `${prev} ${transcript}` : transcript);
        }
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
      setIsListening(false);
    }
  };

  const handleSubmit = (e) => {
    e?.preventDefault();
    if ((!inputText.trim() && attachedImages.length === 0) || isLoading) return;

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }

    const textToSend = inputText.trim() || (attachedImages.length > 0
      ? (isReworkMode
        ? `请将第 ${currentTargetIndex + 1} 页的图片替换为上传的图片，并重新保持与风格【${deckStyle?.name}】的高度契合`
        : `请根据提供的图片及锁定风格【${deckStyle?.name}】，制作该页演示文稿`)
      : `请根据提供的图片及锁定风格【${deckStyle?.name}】，制作该页演示文稿`);

    onSendMessage({
      text: textToSend,
      images: attachedImages,
      isRework: isReworkMode,
      targetIndex: currentTargetIndex
    });

    setInputText('');
    setAttachedImages([]);
  };

  return (
    <div className="flex flex-col h-full bg-[#0D0E12] border-r border-neutral-800/80 w-full md:w-[50%] lg:w-[50%] xl:w-[52%] flex-shrink-0">
      {/* Top Header with Style Anchor & Deck Meta */}
      <div className="px-4 py-3 border-b border-neutral-800 bg-[#0A0A0B]/80 backdrop-blur-md flex flex-col space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-white">AI 幻灯片 Agent</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
              已生成 {currentSlideCount} 页
            </span>
          </div>

          {currentSlideCount > 0 && (
            <span className="text-[10px] text-neutral-400">
              当前选定第 {activeSlideIndex + 1} 页
            </span>
          )}
        </div>

        {/* Locked Style Anchor Banner */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-800/50 text-[11px] text-emerald-300">
          <Lock className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
          <span className="font-semibold text-emerald-400">风格已全局锁定：</span>
          <span className="truncate text-white font-medium">{deckStyle?.name || '极简暗黑'}</span>
          {deckStyle?.customPrompt && (
            <span className="text-emerald-400/70 truncate text-[10px]">({deckStyle.customPrompt})</span>
          )}
        </div>
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <div
              className={`max-w-[92%] rounded-2xl p-3 text-xs leading-relaxed ${
                msg.role === 'user'
                  ? msg.isRework
                    ? 'bg-amber-600/90 text-white rounded-br-none shadow-md border border-amber-500/40'
                    : 'bg-blue-600 text-white rounded-br-none shadow-md'
                  : 'bg-neutral-850/90 text-neutral-200 border border-neutral-750/70 rounded-bl-none shadow-sm'
              }`}
            >
              {/* User attached images preview */}
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {msg.images.map((img, i) => (
                    <img
                      key={i}
                      src={img}
                      alt="upload thumbnail"
                      className="w-20 h-20 object-cover rounded-lg border border-white/20"
                    />
                  ))}
                </div>
              )}

              <p className="whitespace-pre-wrap">{msg.text}</p>

              {/* If assistant returned a slide reference */}
              {msg.slideIndex && (
                <div className="mt-2.5 flex flex-col space-y-2 w-full">
                  {/* Action 1: View Slide Button */}
                  <button
                    onClick={() => onSelectSlide(msg.slideIndex - 1)}
                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition ${
                      activeSlideIndex === msg.slideIndex - 1
                        ? 'bg-blue-500/30 text-blue-200 border border-blue-400/40'
                        : 'bg-neutral-800/80 text-neutral-300 hover:bg-neutral-800 border border-neutral-750/70'
                    }`}
                  >
                    <span className="flex items-center space-x-1.5 truncate">
                      <FileCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <span>查看第 {msg.slideIndex} 页排版效果</span>
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 opacity-60 ml-1 flex-shrink-0" />
                  </button>

                  {/* Action 2: Image Generation Box under Assistant Reply */}
                  {(() => {
                    const targetSlide = slides[msg.slideIndex - 1];
                    const isGeneratingThis = generatingImageIndex === (msg.slideIndex - 1);
                    const hasImage = Boolean(targetSlide?.imageUrl);

                    return (
                      <div className="rounded-xl border border-neutral-750/70 bg-neutral-900/90 p-2.5 flex flex-col space-y-2 shadow-xs">
                        {hasImage ? (
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 truncate">
                              <img
                                src={targetSlide.imageUrl}
                                alt="slide visual"
                                className="w-10 h-10 object-cover rounded-lg border border-neutral-700 flex-shrink-0"
                              />
                              <div className="flex flex-col truncate">
                                <span className="text-[10px] text-emerald-400 font-semibold flex items-center space-x-1">
                                  <Check className="w-3 h-3" />
                                  <span>本页配图已就绪</span>
                                </span>
                                <span className="text-[9px] text-neutral-400 truncate max-w-[140px]">
                                  {targetSlide.imagePrompt || '定制商业插图'}
                                </span>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => onTriggerImageGen && onTriggerImageGen(msg.slideIndex - 1, extraPrompts[msg.slideIndex])}
                              disabled={isGeneratingThis}
                              className="px-2 py-1 rounded-lg bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-[10px] flex items-center space-x-1 border border-neutral-700 transition active:scale-95 disabled:opacity-50 flex-shrink-0"
                              title="让 GPT 重新渲染本页 16:9 完整 PPT 画面"
                            >
                              <RefreshCw className={`w-3 h-3 ${isGeneratingThis ? 'animate-spin text-blue-400' : 'text-neutral-400'}`} />
                              <span>{isGeneratingThis ? 'GPT 渲染中...' : '重新让 GPT 渲染'}</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center space-x-1.5 text-[10px] text-neutral-300 font-medium truncate">
                                <ImageIcon className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                                <span>GLM 蓝图就绪 · 待 GPT 渲染整页</span>
                              </div>

                              {/* Prominent Image Generation Button */}
                              <button
                                type="button"
                                onClick={() => onTriggerImageGen && onTriggerImageGen(msg.slideIndex - 1)}
                                disabled={isGeneratingThis}
                                className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition active:scale-95 disabled:opacity-50 flex-shrink-0 shadow-md"
                                title="点击让 GPT 渲染整张 16:9 完整 PPT 画面"
                              >
                                {isGeneratingThis ? (
                                  <>
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                    <span>GPT 渲染中...</span>
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="w-3.5 h-3.5 text-blue-200" />
                                    <span>🎨 让 GPT 渲染完整 PPT</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <div className="text-[9.5px] text-neutral-400 bg-black/40 px-2.5 py-1.5 rounded-lg border border-neutral-800/80 leading-relaxed">
                              💡 <strong>分工机制</strong>：GLM 已构思好排版蓝图与 16:9 提示词。若需微调可在对话框输入；确认无误后点击上方<strong>「🎨 让 GPT 渲染完整 PPT」</strong>即可由 GPT 输出整张画面。
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            <div className="flex items-center space-x-1 text-[9px] text-neutral-500 mt-1 px-1">
              <span>{msg.role === 'user' ? (msg.isRework ? '返工修改要求' : '您的要求') : 'AI Agent 响应'}</span>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-start">
            <div className="bg-neutral-850 border border-neutral-750/70 rounded-2xl rounded-bl-none p-3 text-xs text-neutral-300 flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-spin" />
              <span>
                {isReworkMode
                  ? `AI 正在对第 ${currentTargetIndex + 1} 页进行返工与重新排版...`
                  : `AI 正在构思第 ${currentSlideCount + 1} 页排版与视觉内容...`}
              </span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area with Mode Switcher & Drag-and-Drop */}
      <div className="p-3 border-t border-neutral-800 bg-[#0A0A0B]/95 flex flex-col space-y-2">
        {/* Mode Switcher Tabs (Only when deck has slides) */}
        {currentSlideCount > 0 && (
          <div className="flex items-center space-x-1 bg-neutral-900/90 p-1 rounded-xl border border-neutral-800 text-xs">
            <button
              type="button"
              onClick={() => onSetReworkTarget && onSetReworkTarget(activeSlideIndex)}
              className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg transition font-medium ${
                isReworkMode
                  ? 'bg-amber-950/70 border border-amber-600/50 text-amber-300 shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <RefreshCw className="w-3 h-3 text-amber-400" />
              <span>修改当前第 {activeSlideIndex + 1} 页</span>
            </button>

            <button
              type="button"
              onClick={() => onSetReworkTarget && onSetReworkTarget(null)}
              className={`flex-1 flex items-center justify-center space-x-1 py-1.5 px-2 rounded-lg transition font-medium ${
                !isReworkMode
                  ? 'bg-neutral-800 text-white shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <PlusCircle className="w-3 h-3 text-blue-400" />
              <span>制作新的一页 (第 {currentSlideCount + 1} 页)</span>
            </button>
          </div>
        )}

        {/* Active Rework Banner if in Rework Mode */}
        {isReworkMode && (
          <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-amber-950/40 border border-amber-600/40 text-[11px] text-amber-300 animate-in fade-in duration-200">
            <div className="flex items-center space-x-1.5 truncate">
              <RefreshCw className="w-3 h-3 text-amber-400 flex-shrink-0" />
              <span className="font-semibold">返工修订中：</span>
              <span className="text-amber-100 truncate">
                第 {currentTargetIndex + 1} 页「{activeSlide?.title || '当前页'}」
              </span>
            </div>
            <button
              type="button"
              onClick={() => onSetReworkTarget && onSetReworkTarget(null)}
              className="text-[10px] text-neutral-400 hover:text-white px-1.5 py-0.5 rounded bg-black/40 border border-neutral-700 ml-2 flex-shrink-0"
            >
              取消返工
            </button>
          </div>
        )}

        {/* Quick Suggestion Chips */}
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 text-[10px] text-neutral-400 scrollbar-none">
          <span className="text-neutral-500 flex-shrink-0">提示：</span>
          {isReworkMode ? (
            <>
              <button
                type="button"
                onClick={() => setInputText('精简本页文字，重点突出三个核心要点并强化视觉留白')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                精简提炼要点
              </button>
              <button
                type="button"
                onClick={() => setInputText('重新排版为核心量化数据指标卡形式')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                改为指标排版
              </button>
              <button
                type="button"
                onClick={() => setInputText('重拟主标题与副标题，更具高端专业说服力')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                重拟有力标题
              </button>
            </>
          ) : currentSlideCount === 0 ? (
            <>
              <button
                type="button"
                onClick={() => setInputText('生成极具视觉冲击力的封面：主标题、精辟副标题与主讲人信息')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                生成发布会封面
              </button>
              <button
                type="button"
                onClick={() => setInputText('极简商务封面：突出核心主题，严谨大气')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                极简商务封面
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setInputText('生成目录页：梳理本次分享的四个阶段与推进逻辑')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                目录结构页
              </button>
              <button
                type="button"
                onClick={() => setInputText('突出核心数据：重点呈现增长率+142%、效率提升3.8倍')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                数据指标页
              </button>
              <button
                type="button"
                onClick={() => setInputText('三阶段实施路线图：论证期、落地期与生态拓展期')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                阶段流程页
              </button>
              <button
                type="button"
                onClick={() => setInputText('总结页：提炼关键共识并开放Q&A讨论')}
                className="flex-shrink-0 px-2 py-0.5 rounded-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300"
              >
                总结收尾页
              </button>
            </>
          )}
        </div>

        {/* Dropzone Container */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`relative rounded-2xl border transition-all ${
            isDragging
              ? 'border-blue-500 ring-2 ring-blue-500/30 bg-blue-950/30'
              : isReworkMode
              ? 'border-amber-600/50 bg-neutral-900/90 focus-within:border-amber-500'
              : 'border-neutral-800 bg-neutral-900/80 focus-within:border-neutral-600'
          }`}
        >
          {/* Drag Overlay visual */}
          {isDragging && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-blue-950/90 backdrop-blur-xs text-blue-200 text-xs font-medium pointer-events-none">
              <Sparkles className="w-5 h-5 mb-1 animate-bounce" />
              <span>松开鼠标立即添加图片到当前对话</span>
            </div>
          )}

          {/* Attached Images Thumbnail Bar */}
          {attachedImages.length > 0 && (
            <div className="p-2 pb-0 flex flex-wrap gap-2">
              {attachedImages.map((img, i) => (
                <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-neutral-700">
                  <img src={img} alt="attached" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setAttachedImages(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-red-600 transition"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Text input */}
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={
              isReworkMode
                ? `交代对第 ${currentTargetIndex + 1} 页的具体修改意见（换标题/精简要点/换排版），或直接拖入新图替换...`
                : currentSlideCount === 0
                ? '告诉 AI Agent 第 1 页封面要讲什么，或直接把 Logo/主图拖到此处...'
                : `告诉 AI Agent 第 ${currentSlideCount + 1} 页讲什么，或直接拖入图片到此处...`
            }
            rows={4}
            className="w-full bg-transparent text-white text-sm placeholder-neutral-500 p-3.5 pb-1 resize-none focus:outline-none leading-relaxed font-sans"
          />

          {/* Action Row */}
          <div className="p-2 pt-1 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {/* File upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition cursor-pointer"
                title="上传本地图片（支持多张，也可直接截图 Ctrl+V 粘贴）"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={(e) => {
                  if (e.target.files) handleFiles(e.target.files);
                }}
                accept="image/*"
                multiple
                className="hidden"
              />

              {/* Speech Recognition Voice Input Button */}
              <button
                type="button"
                onClick={toggleSpeechRecognition}
                className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  isListening
                    ? 'bg-rose-600 text-white animate-pulse shadow-md shadow-rose-900/50'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-800 border border-neutral-800/80'
                }`}
                title={isListening ? "正在录音，点击结束语音描述" : "开启语音描述（说话自动输入）"}
              >
                {isListening ? <MicOff className="w-4 h-4 text-white" /> : <Mic className="w-4 h-4 text-amber-400" />}
                <span>{isListening ? '正在聆听语音...' : '语音描述'}</span>
              </button>

              <span className="text-[10px] text-neutral-500 hidden sm:inline">
                支持语音描述 / 直接拖拽 / 粘贴图片
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={(!inputText.trim() && attachedImages.length === 0) || isLoading}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl font-medium text-xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed transition shadow-sm ${
                isReworkMode
                  ? 'bg-amber-500 hover:bg-amber-400 text-neutral-950 font-semibold'
                  : 'bg-white hover:bg-neutral-200 text-neutral-950'
              }`}
            >
              {isLoading ? (
                <>
                  <Sparkles className="w-3 h-3 animate-spin text-neutral-900" />
                  <span>处理中...</span>
                </>
              ) : isReworkMode ? (
                <>
                  <RefreshCw className="w-3 h-3" />
                  <span>更新第 {currentTargetIndex + 1} 页</span>
                </>
              ) : (
                <>
                  <span>
                    {currentSlideCount === 0 ? '生成第 1 页封面' : `生成第 ${currentSlideCount + 1} 页`}
                  </span>
                  <Send className="w-3 h-3 ml-0.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

