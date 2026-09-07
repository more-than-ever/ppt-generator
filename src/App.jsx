import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ChatPanel from './components/ChatPanel';
import SlideViewer from './components/SlideViewer';
import OutlineEditor from './components/OutlineEditor';
import SettingsModal from './components/SettingsModal';
import DeckInitModal from './components/DeckInitModal';
import { chatGenerateSlide, fetchConfig, generateSlideImage } from './services/aiService';
import { exportToPptx } from './services/pptxExport';
import { CheckCircle2, RotateCcw, Lock } from 'lucide-react';

export default function App() {
  const [presentation, setPresentation] = useState(null);
  const [deckStyle, setDeckStyle] = useState({
    id: 'dark',
    name: '极简暗黑',
    theme: 'dark',
    customPrompt: 'minimalist dark slate aesthetic'
  });
  const [messages, setMessages] = useState([]);
  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [reworkTarget, setReworkTarget] = useState(null);
  const [generatingImageIndex, setGeneratingImageIndex] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isOutlineOpen, setIsOutlineOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const [imageModel, setImageModel] = useState('gpt-image-2');
  const [toastMessage, setToastMessage] = useState(null);

  useEffect(() => {
    fetchConfig().then((cfg) => {
      setHasKey(cfg.hasGptimage2Key || cfg.hasLlmKey);
      if (cfg.gptimage2Model) {
        setImageModel(cfg.gptimage2Model);
      }
    });
  }, []);

  const handleSwitchImageModel = async (newModel) => {
    setImageModel(newModel);
    await saveConfig({ gptimage2Model: newModel });
    showToast(newModel === 'gpt-image-2-vip' ? '🚀 已切换为 VIP 极速通道 (约2000积分/次)' : '✨ 已切换为 gpt-image-2 经济通道 (约600积分/次)');
  };

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Initial deck creation and locked style setup
  const handleStartDeck = ({ topic, deckStyle: chosenStyle }) => {
    setDeckStyle(chosenStyle);
    setPresentation({
      title: topic,
      slides: []
    });
    setActiveSlideIndex(0);
    setReworkTarget(null);

    const styleNote = chosenStyle.reason
      ? `🎨 **AI 匹配设计基调**：已为您自动量身确定并锁定为【${chosenStyle.name}】\n💡 **设计依据**：${chosenStyle.reason}`
      : `🎨 **AI 匹配设计基调**：已为您自动锁定为【${chosenStyle.name}】`;

    setMessages([
      {
        role: 'assistant',
        text: `👋 您好！演示文稿【${topic}】已成功立项。\n\n${styleNote}\n\n💬 **专属提示**：若您在后续制作过程中对风格调性有任何不同想法，随时可以在对话框中直接告诉我调整！\n\n现在请在下方交代【第 1 页（封面）】要讲什么（例如主标题、副标题），支持随时拖入或粘贴本地图片！`
      }
    ]);

    showToast(`演示文稿已立项，风格已锁定为【${chosenStyle.name}】`);
  };

  const toBulletText = (b) => (typeof b === 'string' ? b : (b?.title ? `${b.title}：${b.description || ''}` : String(b || '')));

  const formatSlideAssistantReply = (slide, slideIndex, isRework = false) => {
    let conceptSection = '';
    if (slide.layoutConcept) {
      conceptSection = `📐 **版面与视觉布局安排**：\n> ${slide.layoutConcept}\n\n`;
    }

    let bulletsSection = '';
    if (slide.bullets && slide.bullets.length > 0) {
      bulletsSection = `📝 **为您精修润色与拓展的页面文案**（供您审阅）：\n${slide.bullets.map((b, i) => `  ${i + 1}. ${toBulletText(b)}`).join('\n\n')}\n\n`;
    }

    const prefix = isRework
      ? `🔄 **第 ${slideIndex} 页 排版规划与文案已完成修订**`
      : `📋 **第 ${slideIndex} 页 排版规划与文案已完成精修润色**`;

    const isCover = slideIndex === 1 || slide.type === 'cover';
    const titleBlock = isCover
      ? `- **封面主标题**：${slide.title}\n${slide.subtitle ? `- **封面副标题**：${slide.subtitle}\n` : ''}`
      : `- **本页标题**：${slide.title}\n`;

    return `${prefix}

${titleBlock}
${conceptSection}${bulletsSection}💡 **请您审阅并决定**：
- 本页版面图文空间规划与精修文案已在上方列出供您审阅；
- 若满意当前排版构思与文案，点击下方【交付 GPT 渲染整页】按钮即可由 GPT 直接渲染整张 16:9 成品 PPT；
- 若需调整内容、增删论据或重构布局，您可以随时在下方直接输入或点击【语音描述】说话交代！`;
  };

  const handleGenerateImageForSlide = async (slideIndex, extraPrompt = '', customPres = null) => {
    const currentPres = customPres || presentation;
    if (!currentPres || !currentPres.slides[slideIndex]) return;
    setGeneratingImageIndex(slideIndex);

    const targetSlide = currentPres.slides[slideIndex];
    const fullSlidePrompt = extraPrompt && extraPrompt.trim()
      ? `${targetSlide.fullSlideImagePrompt || targetSlide.imagePrompt || targetSlide.title}。补充视觉细节要求：${extraPrompt.trim()}`
      : (targetSlide.fullSlideImagePrompt || targetSlide.imagePrompt || targetSlide.title);

    try {
      const res = await generateSlideImage({
        prompt: targetSlide.imagePrompt || targetSlide.title,
        fullSlidePrompt,
        slideIndex,
        style: deckStyle.id === 'custom' ? (deckStyle.customPrompt || 'custom') : (deckStyle.id || '3d'),
        theme: deckStyle.theme || 'dark',
        onProgress: ({ elapsed }) => {
          showToast(`🎨 正在由 GPT 渲染第 ${slideIndex + 1} 页 16:9 画卷... (${elapsed}秒 / 约70秒)`);
        }
      });

      if (res?.url) {
        setPresentation(prev => {
          if (!prev) return prev;
          const newSlides = [...prev.slides];
          if (!newSlides[slideIndex]) return prev;
          newSlides[slideIndex] = {
            ...newSlides[slideIndex],
            imageUrl: res.url,
            imagePrompt: res.prompt || fullSlidePrompt,
            userUploaded: false
          };
          return { ...prev, slides: newSlides };
        });
        setActiveSlideIndex(slideIndex);

        const isFallback = Boolean(res.isPlaceholder);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: isFallback
              ? `⚠️ **第 ${slideIndex + 1} 页已匹配高质感留白兜底画面**\n\n> **接口提示**：${res.errorReason || '当前生图服务未成功返回有效图像'}。\n> 系统已为您自动填充符合设计规范的极简背景。若您使用的是第三方中转代理，可在设置中检查配置。`
              : `🎨 **第 ${slideIndex + 1} 页已由 GPT 渲染生成整张 16:9 完整 PPT 画面！**\n\n已自动嵌入右侧演示画布。若满意可继续交代下一页内容，若想修改也可随时提出！`,
            slideIndex: slideIndex + 1
          }
        ]);

        showToast(isFallback ? `已为第 ${slideIndex + 1} 页匹配设计感背景` : `第 ${slideIndex + 1} 页完整 PPT 画面已由 GPT 渲染完成！`);
      }
    } catch (err) {
      console.error('Failed to generate image:', err);
      showToast(`生图出现异常: ${err.message || '请检查本地网络或后端服务'}`);
    } finally {
      setGeneratingImageIndex(null);
    }
  };

  // Extract explicit target page requested by the user, respecting customer's direct input
  const extractUserTargetPage = (text, totalSlides = 0) => {
    if (!text) return null;
    const numMap = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };

    // Matches "第X页", "第 X 页", "第三页", "第3页", etc.
    const m = text.match(/第\s*([0-9一二三四五六七八九十]+)\s*页/);
    if (m && m[1]) {
      const n = numMap[m[1]] || parseInt(m[1], 10);
      if (!isNaN(n) && n > 0) return n;
    }

    // Matches "封面", "首页", "第一页"
    if (/(?:封面|首页|首面)/.test(text)) {
      return 1;
    }

    // Matches "末页", "最后一页", "尾页"
    if (/(?:末页|最后一页|尾页)/.test(text) && totalSlides > 0) {
      return totalSlides;
    }

    return null;
  };

  // 2. Chat turn-by-turn slide generator & rework engine (Everything follows customer input)
  const handleSendMessage = async ({ text, images = [], isRework = false, targetIndex = activeSlideIndex }) => {
    if (!presentation) return;
    setIsLoading(true);

    // 检查用户是否仅下达“生图/渲染画面”指令
    const wantsOnlyImage = /(?:生图|生成图片|渲染|画出来|画图|出图|生成画面|渲染画面)/i.test(text) &&
      !/(?:修改|文案|重写|写一下|内容|观点|重新排版|润色|大纲|策划)/i.test(text);

    if (wantsOnlyImage && presentation && presentation.slides.length > 0) {
      const explicitPage = extractUserTargetPage(text, presentation.slides.length);
      const targetIdx = explicitPage ? explicitPage - 1 : activeSlideIndex;
      if (presentation.slides[targetIdx]) {
        showToast(`已交付 GPT 渲染第 ${targetIdx + 1} 页 16:9 终稿画面...`);
        await handleGenerateImageForSlide(targetIdx);
        setIsLoading(false);
        return;
      }
    }

    // 确定目标页码与意图
    let isReworkMode = isRework;
    let activeTarget = targetIndex;
    let targetSlideIndex = presentation.slides.length + 1;

    const explicitPage = extractUserTargetPage(text, presentation.slides.length);
    if (explicitPage !== null) {
      targetSlideIndex = explicitPage;
      if (explicitPage <= presentation.slides.length) {
        isReworkMode = true;
        activeTarget = explicitPage - 1;
      } else {
        isReworkMode = false;
        activeTarget = explicitPage - 1;
      }
    } else {
      const isExplicitNewPageIntent = /(?:下一页|再加一页|新增一页|新起一页|创建下一页|制作下一页|加一页|制作新)/.test(text);
      const isModificationIntent = /(?:修改|改一下|重新生成|重做|返工|调整|补充|配图|换成|换个|删掉|变一下|调整为|调一下|这里|当前页|这页|太小|太大|太长|太短|太空|太满|丰富|文案|内容|换字|换色|重写|不够|详细|具体)/.test(text);
      
      if (!isExplicitNewPageIntent && (isReworkMode || reworkTarget !== null || isModificationIntent || presentation.slides.length > 0)) {
        isReworkMode = true;
        activeTarget = (targetIndex !== undefined && targetIndex >= 0) ? targetIndex : (reworkTarget !== null ? reworkTarget : activeSlideIndex);
        targetSlideIndex = activeTarget + 1;
      } else {
        isReworkMode = false;
        targetSlideIndex = presentation.slides.length + 1;
        activeTarget = presentation.slides.length;
      }
    }

    const userMsg = {
      role: 'user',
      text: isReworkMode
        ? `【第 ${activeTarget + 1} 页修改】：${text}`
        : (explicitPage ? `【第 ${targetSlideIndex} 页要求】：${text}` : text),
      images,
      isRework: isReworkMode,
      targetIndex: activeTarget
    };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);

    try {
      if (isReworkMode && presentation.slides.length > 0 && activeTarget < presentation.slides.length) {
        const currentSlideData = presentation.slides[activeTarget];
        const revisedSlide = await chatGenerateSlide({
          topic: presentation.title,
          userPrompt: text,
          userImages: images,
          slideIndex: targetSlideIndex,
          deckStyle,
          history: updatedMessages.slice(-4),
          isRework: true,
          currentSlideData,
          targetIndex: activeTarget
        });

        const newSlides = [...presentation.slides];
        newSlides[activeTarget] = revisedSlide;
        setPresentation(prev => ({
          ...prev,
          slides: newSlides
        }));
        setActiveSlideIndex(activeTarget);
        setReworkTarget(null);

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: formatSlideAssistantReply(revisedSlide, targetSlideIndex, true),
            slideIndex: targetSlideIndex
          }
        ]);

        showToast(`已完成第 ${targetSlideIndex} 页文案精修与排版更新！`);

        const wantsImage = /(?:生图|生成图片|渲染|画出来|画图|出图|画一张|生成整页|生成画面)/i.test(text);
        if (wantsImage && !revisedSlide.imageUrl && (!images || images.length === 0)) {
          handleGenerateImageForSlide(activeTarget, '', { ...presentation, slides: newSlides });
        }
      } else {
        const newSlide = await chatGenerateSlide({
          topic: presentation.title,
          userPrompt: text,
          userImages: images,
          slideIndex: targetSlideIndex,
          deckStyle,
          history: updatedMessages.slice(-4),
          isRework: false
        });

        let newSlides = [...presentation.slides];
        if (targetSlideIndex > newSlides.length + 1) {
          while (newSlides.length < targetSlideIndex - 1) {
            const padNum = newSlides.length + 1;
            newSlides.push({
              id: Date.now() + padNum + Math.random(),
              slideIndex: padNum,
              type: 'cards',
              title: `第 ${padNum} 页（待规划）`,
              subtitle: '在左侧对话框输入内容即可实时生成本页',
              bullets: ['随时在对话框交代本页要点', '或点击左侧导航自由切换浏览'],
              speakerNotes: '',
              layoutConcept: '留白待编辑布局'
            });
          }
        }

        newSlides.push(newSlide);
        setPresentation(prev => ({
          ...prev,
          slides: newSlides
        }));
        const newActiveIndex = newSlides.length - 1;
        setActiveSlideIndex(newActiveIndex);

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            text: formatSlideAssistantReply(newSlide, targetSlideIndex, false),
            slideIndex: targetSlideIndex
          }
        ]);

        showToast(`已完成第 ${targetSlideIndex} 页文案精修与排版规划！`);

        const wantsImage = /(?:生图|生成图片|渲染|画出来|画图|出图|画一张|生成整页|生成画面)/i.test(text);
        if (wantsImage && !newSlide.imageUrl && (!images || images.length === 0)) {
          handleGenerateImageForSlide(newActiveIndex, '', { ...presentation, slides: newSlides });
        }
      }
    } catch (err) {
      console.error('Failed to process message:', err);
      showToast('操作失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateSlide = (index, updatedFields) => {
    if (!presentation) return;
    const newSlides = [...presentation.slides];
    newSlides[index] = { ...newSlides[index], ...updatedFields };
    setPresentation({ ...presentation, slides: newSlides });
  };

  const handleDeleteSlide = (index) => {
    if (!presentation || presentation.slides.length <= 1) return;
    const newSlides = presentation.slides.filter((_, i) => i !== index);
    setPresentation({ ...presentation, slides: newSlides });
    if (activeSlideIndex >= newSlides.length) {
      setActiveSlideIndex(newSlides.length - 1);
    }
  };

  const handleAddSlide = () => {
    if (!presentation) return;
    const nextIdx = presentation.slides.length + 1;
    handleSendMessage({
      text: `生成第 ${nextIdx} 页：重点拆解核心策略与保障措施`
    });
  };

  const handleSelectSlide = (index) => {
    setActiveSlideIndex(index);
    setReworkTarget(index); // 用户在右下缩略图或画布点到哪一面，AI 就默认当前修改那一面
  };

  const handleRequestRework = (index) => {
    handleSelectSlide(index);
    showToast(`已切换至第 ${index + 1} 页修改模式`);
  };

  const handleGenerateFirstSlide = () => {
    handleSendMessage({
      text: `请为【${presentation?.title || '演示文稿'}】生成高规格第 1 页封面，呈现精辟主副标题与高级极简视觉`
    });
  };

  const handleExport = async () => {
    if (!presentation || presentation.slides.length === 0) {
      showToast('当前暂无幻灯片可导出，请先生成页面');
      return;
    }
    setIsExporting(true);
    try {
      await exportToPptx(presentation, deckStyle.theme || 'dark');
      showToast('PowerPoint (.pptx) 演示文稿导出成功！');
    } catch (err) {
      console.error('Export error:', err);
      showToast('导出出错，请检查后重试');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0A0A0B] text-neutral-100 overflow-hidden">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-neutral-900 border border-neutral-700 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <Header
        hasKey={hasKey}
        imageModel={imageModel}
        onChangeImageModel={handleSwitchImageModel}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onExport={handleExport}
        isExporting={isExporting}
        hasSlides={Boolean(presentation && presentation.slides.length > 0)}
        currentTheme={deckStyle.theme || 'dark'}
        onChangeTheme={(th) => setDeckStyle(prev => ({ ...prev, theme: th }))}
        onEnterFullscreen={() => setIsFullscreen(true)}
      />

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden">
        {!presentation ? (
          /* Step 0: Deck Initialization & Style Anchor Locking */
          <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto">
            <DeckInitModal onStartDeck={handleStartDeck} isLoading={isLoading} />
          </div>
        ) : (
          /* Step 1 & 2: Split-Screen Conversational Interactive Workspace */
          <div className="flex-1 flex flex-col md:flex-row w-full h-[calc(100vh-57px)] overflow-hidden">
            {/* Left: Conversational Chat Panel with Drag & Drop */}
            <ChatPanel
              deckStyle={deckStyle}
              messages={messages}
              onSendMessage={handleSendMessage}
              isLoading={isLoading}
              currentSlideCount={presentation.slides.length}
              onSelectSlide={handleSelectSlide}
              activeSlideIndex={activeSlideIndex}
              activeSlide={presentation.slides[activeSlideIndex]}
              slides={presentation.slides}
              reworkTarget={reworkTarget}
              onSetReworkTarget={setReworkTarget}
              onTriggerImageGen={handleGenerateImageForSlide}
              generatingImageIndex={generatingImageIndex}
            />

            {/* Right: Real-time 16:9 Slide Canvas & Thumbnail Rail */}
            <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto bg-[#07080A]">
              {/* Workspace Top Toolbar */}
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-neutral-800/60">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-semibold text-white truncate max-w-xs">
                    {presentation.title}
                  </span>
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center space-x-1">
                    <Lock className="w-2.5 h-2.5" />
                    <span>风格锁定中</span>
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => {
                      if (window.confirm('确认重新开始并创建新演示文稿吗？当前内容若未导出将重置。')) {
                        setPresentation(null);
                        setMessages([]);
                        setReworkTarget(null);
                      }
                    }}
                    className="flex items-center space-x-1 text-xs text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition"
                    title="创建新 PPT"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>新建演示</span>
                  </button>
                </div>
              </div>

              {/* Slide Canvas */}
              <div className="flex-1 flex flex-col justify-center max-w-5xl mx-auto w-full">
                <SlideViewer
                  presentation={presentation}
                  activeSlideIndex={activeSlideIndex}
                  onSelectSlide={handleSelectSlide}
                  onUpdateSlide={handleUpdateSlide}
                  onAddSlide={handleAddSlide}
                  onDeleteSlide={handleDeleteSlide}
                  currentTheme={deckStyle.theme || 'dark'}
                  isFullscreen={isFullscreen}
                  onExitFullscreen={() => setIsFullscreen(false)}
                  onRequestRework={handleRequestRework}
                  onGenerateFirstSlide={handleGenerateFirstSlide}
                  deckStyle={deckStyle}
                  onTriggerImageGen={handleGenerateImageForSlide}
                  generatingImageIndex={generatingImageIndex}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal (Clean image2 vs vip switcher) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        currentModel={imageModel}
        onConfigSaved={(m) => {
          if (m) setImageModel(m);
          fetchConfig().then((cfg) => {
            setHasKey(cfg.hasGptimage2Key || cfg.hasLlmKey);
          });
        }}
      />
    </div>
  );
}
