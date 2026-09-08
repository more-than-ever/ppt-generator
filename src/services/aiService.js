// Ensure browser localStorage NEVER stores secret API keys (for privacy and confidentiality)
try {
  localStorage.removeItem('llm_key');
  localStorage.removeItem('gptimage2_key');
} catch (e) {}

export const fetchConfig = async () => {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Backend not responding, using local fallback:', err);
  }
  return {
    hasGptimage2Key: false,
    gptimage2ApiUrl: 'https://api.openai.com/v1',
    hasLlmKey: false,
    llmApiUrl: 'https://open.bigmodel.cn/api/paas/v4',
    llmModel: 'glm-4-flash',
  };
};

export const saveConfig = async (config) => {
  // Only non-sensitive URLs/models may be kept in localStorage
  if (config.gptimage2ApiUrl) localStorage.setItem('gptimage2_url', config.gptimage2ApiUrl);
  if (config.llmApiUrl) localStorage.setItem('llm_url', config.llmApiUrl);
  if (config.llmModel) localStorage.setItem('llm_model', config.llmModel);

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...config, persist: true })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (err) {
    console.warn('Failed to save to server:', err);
  }
  return { success: true };
};

export const generateOutline = async ({ topic, slideCount = 6, style = 'minimal', language = 'zh' }) => {
  try {
    const res = await fetch('/api/generate-outline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        slideCount,
        style,
        language
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn('API call failed, running browser-side generator:', err);
  }

  // Pure frontend fallback in case backend is offline
  return {
    success: true,
    isMock: true,
    data: {
      title: topic,
      subtitle: '基于极简排版系统生成的结构化演示文稿',
      slides: Array.from({ length: slideCount }).map((_, i) => ({
        id: i + 1,
        type: i === 0 ? 'cover' : i === 1 ? 'agenda' : i === slideCount - 1 ? 'summary' : 'cards',
        title: i === 0 ? topic : `核心议题 0${i}: 深度洞察与规划`,
        subtitle: `关于 ${topic} 的第 ${i + 1} 部分论述`,
        bullets: [
          '系统化梳理关键业务逻辑与技术落地指标',
          '建立数据驱动的闭环反馈机制与协作流程',
          '全面降低实施与迁移成本，提升组织效能'
        ],
        imagePrompt: `Clean modern minimalist render for ${topic}, abstract architecture, elegant lighting`,
        speakerNotes: `这里是第 ${i + 1} 页的演讲要点阐述。`
      }))
    }
  };
};

export const generateSlideImage = async ({
  prompt,
  fullSlidePrompt,
  slideIndex,
  style = '3d',
  theme = 'dark',
  onProgress = null
}) => {
  try {
    // 1. Submit async task to avoid any long-lived socket timeout (Clash / VPN / proxy safe)
    const initRes = await fetch('/api/image-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        fullSlidePrompt,
        slideIndex,
        style,
        theme
      })
    });

    if (initRes.ok) {
      const initData = await initRes.json();
      if (initData.status === 'completed' && initData.result?.url) {
        return initData.result;
      }

      const taskId = initData.taskId;
      if (taskId) {
        // Poll every 2 seconds until completed, failed, or timeout (max 180s = 90 polls)
        const maxPolls = 90;
        for (let i = 0; i < maxPolls; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try {
            const pollRes = await fetch(`/api/image-tasks/${taskId}`);
            if (pollRes.ok) {
              const pollData = await pollRes.json();
              if (onProgress && pollData.elapsed !== undefined) {
                onProgress({ elapsed: pollData.elapsed, status: pollData.status });
              }

              if (pollData.status === 'completed' && pollData.result?.url) {
                return pollData.result;
              }
              if (pollData.status === 'failed') {
                console.warn('Image task failed:', pollData.error);
                return {
                  url: null,
                  prompt: prompt || 'Presentation illustration',
                  isPlaceholder: true,
                  isFailed: true,
                  errorReason: pollData.error || '生图接口响应异常'
                };
              }
            }
          } catch (pollErr) {
            console.warn('Polling error, retrying:', pollErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn('Image generation error:', err);
  }

  return {
    url: null,
    prompt: prompt || 'Presentation illustration',
    isPlaceholder: true,
    isFailed: true,
    errorReason: '连接生图服务超时，请检查服务状态或稍后重试'
  };
};

export const chatGenerateSlide = async ({
  topic,
  userPrompt,
  userImages = [],
  slideIndex = 1,
  deckStyle = { name: '极简暗黑', theme: 'dark', customPrompt: '极简现代' },
  history = [],
  isRework = false,
  currentSlideData = null,
  targetIndex = 0
}) => {
  try {
    const res = await fetch('/api/chat-slide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        userPrompt,
        userImages,
        slideIndex,
        deckStyle,
        history,
        isRework,
        currentSlideData,
        targetIndex
      })
    });

    if (res.ok) {
      const data = await res.json();
      return data.slide;
    }
  } catch (err) {
    console.warn('chatGenerateSlide API error:', err);
  }

  // Client-side fallback if server unreachable
  if (isRework && currentSlideData) {
    return {
      ...currentSlideData,
      imageUrl: userImages[0] || currentSlideData.imageUrl,
      userUploaded: userImages.length > 0 || currentSlideData.userUploaded,
      subtitle: `已根据「${userPrompt.slice(0, 15)}」完成返工修订`
    };
  }

  return {
    id: Date.now(),
    slideIndex,
    type: slideIndex === 1 ? 'cover' : 'cards',
    title: userPrompt.slice(0, 20),
    subtitle: `遵循锁定风格【${deckStyle?.name}】定制呈现`,
    bullets: [
      '系统化梳理核心逻辑与业务指标',
      '建立标准化作业流程与敏捷协作',
      '量化分析与持续闭环迭代'
    ],
    imageUrl: userImages[0] || null,
    userUploaded: userImages.length > 0,
    speakerNotes: '这是该页的演讲备注。'
  };
};

export const testLlmConnection = async ({ apiKey, apiUrl, model }) => {
  try {
    const res = await fetch('/api/test-llm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, apiUrl, model })
    });
    return await res.json();
  } catch (err) {
    return { success: false, error: err.message };
  }
};

export const recommendDeckStyle = async ({ topic }) => {
  try {
    const res = await fetch('/api/recommend-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic
      })
    });
    if (res.ok) {
      const data = await res.json();
      return data.style;
    }
  } catch (err) {
    console.warn('recommendDeckStyle fetch error:', err);
  }

  return {
    id: 'ai-matched',
    name: '极简素雅留白',
    theme: 'light',
    reason: '经典包豪斯极简美学，突出信息可读性与高级质感',
    customPrompt: 'clean minimalist aesthetic, ample whitespace, natural lighting',
    accentColor: '#3B82F6'
  };
};



