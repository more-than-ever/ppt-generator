import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Global process error handlers to prevent unhandled crashes
process.on('uncaughtException', (err) => {
  console.error('[FATAL uncaughtException]:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL unhandledRejection]:', reason);
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// In-memory config fallback
let runtimeConfig = {
  gptimage2ApiKey: process.env.GPTIMAGE2_API_KEY || '',
  gptimage2ApiUrl: process.env.GPTIMAGE2_API_URL || 'https://api.grsai.com/v1',
  gptimage2Model: process.env.GPTIMAGE2_MODEL || 'gpt-image-2',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmApiUrl: process.env.LLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4',
  llmModel: process.env.LLM_MODEL || 'glm-4-flash',
};

// 1. Get current config status (masks the secret keys for security)
app.get('/api/config', (req, res) => {
  res.json({
    hasGptimage2Key: Boolean(runtimeConfig.gptimage2ApiKey),
    gptimage2ApiUrl: runtimeConfig.gptimage2ApiUrl,
    gptimage2Model: runtimeConfig.gptimage2Model,
    hasLlmKey: Boolean(runtimeConfig.llmApiKey),
    llmApiUrl: runtimeConfig.llmApiUrl,
    llmModel: runtimeConfig.llmModel,
  });
});

// 2. Update config dynamically & optionally persist to .env
app.post('/api/config', (req, res) => {
  const { gptimage2ApiKey, gptimage2ApiUrl, gptimage2Model, llmApiKey, llmApiUrl, llmModel, persist } = req.body;

  if (gptimage2ApiKey !== undefined && gptimage2ApiKey.trim() !== '') runtimeConfig.gptimage2ApiKey = gptimage2ApiKey.trim();
  if (gptimage2ApiUrl !== undefined && gptimage2ApiUrl.trim() !== '') runtimeConfig.gptimage2ApiUrl = gptimage2ApiUrl.trim();
  if (gptimage2Model !== undefined && gptimage2Model.trim() !== '') runtimeConfig.gptimage2Model = gptimage2Model.trim();
  if (llmApiKey !== undefined && llmApiKey.trim() !== '') runtimeConfig.llmApiKey = llmApiKey.trim();
  if (llmApiUrl !== undefined && llmApiUrl.trim() !== '') runtimeConfig.llmApiUrl = llmApiUrl.trim();
  if (llmModel !== undefined && llmModel.trim() !== '') runtimeConfig.llmModel = llmModel.trim();

  if (persist) {
    try {
      const envPath = path.join(__dirname, '.env');
      const envContent = `PORT=${PORT}\nGPTIMAGE2_API_KEY=${runtimeConfig.gptimage2ApiKey}\nGPTIMAGE2_API_URL=${runtimeConfig.gptimage2ApiUrl}\nGPTIMAGE2_MODEL=${runtimeConfig.gptimage2Model}\nLLM_API_KEY=${runtimeConfig.llmApiKey}\nLLM_API_URL=${runtimeConfig.llmApiUrl}\nLLM_MODEL=${runtimeConfig.llmModel}\n`;
      fs.writeFileSync(envPath, envContent, 'utf-8');
    } catch (err) {
      console.error('Failed to write .env:', err);
    }
  }

  res.json({
    success: true,
    hasGptimage2Key: Boolean(runtimeConfig.gptimage2ApiKey),
    hasLlmKey: Boolean(runtimeConfig.llmApiKey),
  });
});

// Test LLM Connection endpoint
app.post('/api/test-llm', async (req, res) => {
  const { apiKey, apiUrl, model } = req.body;
  const activeKey = apiKey || runtimeConfig.llmApiKey || runtimeConfig.gptimage2ApiKey;
  const activeUrl = apiUrl || runtimeConfig.llmApiUrl || 'https://api.openai.com/v1';
  const activeModel = model || runtimeConfig.llmModel || 'gpt-4o-mini';

  const isLocal = activeUrl.includes('localhost') || activeUrl.includes('127.0.0.1');
  if (!activeKey && !isLocal) {
    return res.status(400).json({ success: false, error: '请先填写 API Key 密钥' });
  }

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

    const response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: activeModel,
        messages: [{ role: 'user', content: 'Say "OK" in 1 word.' }],
        max_tokens: 10
      })
    });

    if (!response.ok) {
      const errTxt = await response.text();
      return res.status(response.status).json({ success: false, error: `API 返回错误 (${response.status}): ${errTxt.slice(0, 150)}` });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'OK';
    return res.json({ success: true, message: `连接成功！模型 [${activeModel}] 响应正常。` });
  } catch (err) {
    return res.status(500).json({ success: false, error: `网络连接失败: ${err.message}` });
  }
});

// AI Style Recommender: Analyzes topic and recommends the most fitting presentation style
app.post('/api/recommend-style', async (req, res) => {
  const { topic, apiKey, apiUrl, model } = req.body;
  const activeKey = runtimeConfig.llmApiKey || apiKey;
  const activeUrl = runtimeConfig.llmApiUrl || (apiKey ? apiUrl : null) || 'https://open.bigmodel.cn/api/paas/v4';
  const activeModel = runtimeConfig.llmModel || (apiKey ? model : null) || 'glm-4-flash';

  if (!topic || topic.trim() === '') {
    return res.status(400).json({ error: '主题不能为空' });
  }

  // 1. Try LLM first
  if (activeKey || (activeUrl && (activeUrl.includes('localhost') || activeUrl.includes('127.0.0.1')))) {
    try {
      const systemInstruction = `你是一位顶级演示文稿视觉总监兼色彩心理学专家。
用户提供了一个演示文稿的主题，请深入剖析该主题的场景性质（如竞选答辩、高精科技、商业战略、学术研究、文化艺术、教育公益等）、受众心理与情感调性，为该主题量身定制最贴切、最具说服力的 PPT 视觉设计风格规范。

请输出严格合法的单个 JSON 对象（不要包含任何 markdown 块外的多余文本）：
{
  "name": "风格名称（8字以内，如：朝气明朗蓝白、硬核工业极客、领航深邃黑金、素雅澄澈白、温润人文暖砂）",
  "theme": "light" | "dark" | "tech" | "warm",
  "reason": "推荐理由（1句话，15-28字，解释为什么该视觉风格最契合该主题）",
  "prompt": "契合该风格的英文构图与配图风格关键词（纯画面质感、色彩、留白，严禁出现任何文本文字）",
  "accentColor": "建议的主题点缀色十六进制代码（如 #2563EB）"
}`;

      const headers = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

      const requestPayload = {
        model: activeModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `请为以下 PPT 主题量身推导最契合的视觉风格规范：\n主题：${topic}` }
        ],
        temperature: 0.6
      };

      let response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestPayload, response_format: { type: 'json_object' } })
      });

      if (!response.ok && response.status === 400) {
        response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload)
        });
      }

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || '';
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const styleData = JSON.parse(jsonMatch[0]);
          return res.json({
            success: true,
            style: {
              id: 'ai-matched',
              name: styleData.name || 'AI 定制自适应风格',
              theme: styleData.theme || 'light',
              reason: styleData.reason || '根据主题场景深度推导定制',
              customPrompt: styleData.prompt || 'minimalist clean aesthetic with generous whitespace',
              accentColor: styleData.accentColor || '#3B82F6'
            },
            isMock: false
          });
        }
      }
    } catch (err) {
      console.warn('AI recommend style error, using fallback:', err.message);
    }
  }

  // 2. Intelligent local semantic fallback
  const text = topic.trim();
  let fallbackStyle;

  if (/(?:班长|竞选|竞聘|述职|答辩|转正|干部|学生会|委员|部长|就职|演讲|团委)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '朝气明朗蓝白',
      theme: 'light',
      reason: '突出真诚服务与青年向心力，色彩通透开朗，营造阳光亲和信任感',
      customPrompt: 'approachable campus leadership aesthetic, clean white and azure sky blue accents, bright studio lighting, plenty of negative space',
      accentColor: '#2563EB'
    };
  } else if (/(?:电池|芯片|算法|技术|软件|架构|新能源|汽车|智能|系统|工程|大模型|代码|算力|制造|硬件)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '硬核工业科技',
      theme: 'tech',
      reason: '契合高精密技术与工程研发的严谨硬朗质感，展现突破性科技硬实力',
      customPrompt: 'precision industrial engineering schematic aesthetic, deep cyber navy and cool silver accents, subtle tech glow, clean lines',
      accentColor: '#0EA5E9'
    };
  } else if (/(?:战略|商业|市场|营销|出海|业务|盈利|融资|客户|销售|增长|转化|商机)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '领航深邃黑金',
      theme: 'dark',
      reason: '契合高端商业决策与企业出海的沉稳大气，传递高确定性与战略格局',
      customPrompt: 'executive corporate aesthetic, deep obsidian slate and subtle champagne brass accents, minimalist architectural lighting',
      accentColor: '#F59E0B'
    };
  } else if (/(?:艺术|文化|文学|历史|美学|设计|国潮|非遗|自然|生活)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '温润人文暖砂',
      theme: 'warm',
      reason: '温润米褐与典雅纸性质感，舒缓雅致，传递深厚思想温度与美学意境',
      customPrompt: 'warm terracotta and refined cream paper texture aesthetic, gentle natural morning light, artistic minimalism',
      accentColor: '#D97706'
    };
  } else {
    fallbackStyle = {
      id: 'ai-matched',
      name: '极简素雅留白',
      theme: 'light',
      reason: '经典现代主义排版，高对比度与充足留白，确保信息传递高效清晰',
      customPrompt: 'pure minimalist Bauhaus aesthetic, pristine negative space, elegant typography contrast',
      accentColor: '#4F46E5'
    };
  }

  return res.json({ success: true, style: fallbackStyle, isMock: true });
});

// 3. AI Outline & Slide Content Generation (Legacy batch)
app.post('/api/generate-outline', async (req, res) => {
  const { topic, slideCount = 6, style = 'minimal', language = 'zh', apiKey, apiUrl } = req.body;
  const count = Math.max(1, Math.min(30, parseInt(slideCount, 10) || 6));
  const activeKey = runtimeConfig.llmApiKey || apiKey;
  const activeUrl = runtimeConfig.llmApiUrl || (apiKey ? apiUrl : null) || 'https://open.bigmodel.cn/api/paas/v4';
  const activeModel = runtimeConfig.llmModel || 'glm-4-flash';

  if (!topic || topic.trim() === '') {
    return res.status(400).json({ error: '主题不能为空' });
  }

  // If activeKey is provided, try LLM API call
  if (activeKey) {
    try {
      const prompt = `你是一个专业的演讲PPT专家与高级设计师。
请针对主题【${topic}】生成一份结构严谨、内容精炼、视觉表现力强的演示文稿大纲与内容。
共需要精确生成 ${count} 页 PPT。
风格定制要求：【${style}】（请严格按照此风格调性设计页面文案、版式排布与视觉插图提示词）。
语言：${language === 'zh' ? '中文' : '英文'}。

返回格式必须是严格合法的 JSON（不要有 markdown 语法块外的任何文字），结构如下：
{
  "title": "整个PPT的主标题",
  "subtitle": "副标题/一句话总结",
  "slides": [
    {
      "id": 1,
      "type": "cover",
      "title": "页面主标题",
      "subtitle": "页面副标题或简述",
      "bullets": ["要点1", "要点2", "要点3"],
      "metrics": [{"value": "85%", "label": "增长率"}],
      "imagePrompt": "针对此页生成的精准英文图像描述词，用于插图",
      "speakerNotes": "演讲者备注（1-2句话）"
    }
  ]
}
确保第1页是 cover，最后一页是 summary，中间根据主题灵活分配 cards / metrics / process / compare 等版式，严格保持 ${count} 页，内容专业深入，不要泛泛而谈。`;

      const headers = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

      const requestPayload = {
        model: activeModel,
        messages: [
          { role: 'system', content: 'You are a professional presentation architect. Always respond with pure valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7
      };

      let response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestPayload, response_format: { type: 'json_object' } })
      });

      if (!response.ok && response.status === 400) {
        response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload)
        });
      }

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || '';
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json({ success: true, data: parsed, isMock: false });
        }
      } else {
        console.warn('LLM API returned error, falling back to smart generator:', await response.text());
      }
    } catch (err) {
      console.warn('LLM API call failed, falling back to smart generator:', err.message);
    }
  }

  // Smart fallback generator
  const mockSlides = generateSmartSlides(topic, count, style, language);
  return res.json({
    success: true,
    data: mockSlides,
    isMock: true,
    message: '当前使用本地智能排版引擎生成。'
  });
});

// Helper to dynamically compose smart visual subjects tailored to slide topic, type, and visual medium diversity
function getSmartVisualSubject(title = '', type = 'cards', styleName = 'minimalist', slideIndex = 1) {
  const t = (title || '').toLowerCase();
  const visualMode = slideIndex % 3; // 0: Editorial Commercial Photography, 1: Clean Vector / Infographic / UI, 2: 3D Concept Sculpture

  if (type === 'cover') {
    return 'a stunning 3D centerpiece visual installation representing the core vision, sophisticated ambient lighting and subtle atmospheric reflections';
  }

  // Visual Mode 0: High-End Commercial / Editorial Photography (传统高端商务与纪实摄影质感)
  if (visualMode === 0) {
    if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('模型') || t.includes('算力') || t.includes('办公') || t.includes('文档')) {
      return 'a high-end editorial commercial photograph of a sleek modern minimalist executive workspace with dual-screen data analytics, soft ambient window lighting, shallow depth of field';
    }
    if (t.includes('电池') || t.includes('制造') || t.includes('工业') || t.includes('工程') || t.includes('硬件') || t.includes('芯片') || t.includes('结构')) {
      return 'a high-end editorial photograph of a modern precision automated robotic assembly station, cinematic lighting and clean industrial aesthetic';
    }
    if (t.includes('商业') || t.includes('战略') || t.includes('市场') || t.includes('出海') || t.includes('全球') || t.includes('金融') || t.includes('增长')) {
      return 'a sophisticated editorial commercial photograph of a modern high-rise executive conference boardroom with a panoramic skyline view, golden hour ambient light';
    }
    if (t.includes('团队') || t.includes('管理') || t.includes('协同') || t.includes('组织') || t.includes('竞选') || t.includes('班长')) {
      return 'an authentic editorial photograph of a diverse professional team collaborating in a bright modern open-plan office, natural lighting, documentary style';
    }
    return 'a high-end editorial commercial photograph capturing modern professional business collaboration with elegant natural lighting and clean architectural backdrop';
  }

  // Visual Mode 1: Clean Flat Vector / Infographic Diagrams / UI Interface (传统矢量插画与信息图表)
  if (visualMode === 1) {
    if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('模型') || t.includes('办公') || t.includes('文档')) {
      return 'a clean, sophisticated minimalist business vector infographic diagram depicting streamlined automated nodes and sleek linear data flows, Bauhaus inspired minimal aesthetic';
    }
    if (type === 'metrics' || t.includes('指标') || t.includes('数据')) {
      return 'an elegant, minimalist SaaS product UI dashboard card showing clear analytical trend lines and high-contrast metric widgets';
    }
    if (type === 'process' || t.includes('流程') || t.includes('路径') || t.includes('规划')) {
      return 'a modern geometric vector flow infographic with clean numbered step badges and interconnected fine dashed path lines';
    }
    return 'a modern minimalist flat corporate vector illustration with clean geometric silhouettes and elegant two-tone accent palettes';
  }

  // Visual Mode 2: 3D Isometric / Glassmorphic Conceptual Sculpture (高端3D概念装置)
  if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('模型') || t.includes('算力') || t.includes('办公') || t.includes('文档')) {
    return 'a stunning 3D glassmorphism holographic neural data visualization matrix with glowing cyber cyan and indigo accents, studio lighting';
  }
  if (t.includes('电池') || t.includes('制造') || t.includes('工业') || t.includes('工程') || t.includes('硬件') || t.includes('芯片') || t.includes('结构')) {
    return 'a hyper-detailed 3D isometric cutaway schematic of precision engineering components with soft ambient studio lighting';
  }
  if (t.includes('商业') || t.includes('战略') || t.includes('市场') || t.includes('出海') || t.includes('全球') || t.includes('金融') || t.includes('增长')) {
    return 'a modern 3D translucent globe sculpture with golden flight trajectories and glowing growth nodes';
  }
  if (t.includes('团队') || t.includes('管理') || t.includes('协同') || t.includes('组织') || t.includes('竞选') || t.includes('班长')) {
    return 'a clean 3D claymorphic collaborative milestone symbol with soft studio lighting and smooth frosted surfaces';
  }
  if (type === 'metrics' || t.includes('指标') || t.includes('数据')) {
    return 'a sleek 3D holographic ascending data chart structure with dynamic glowing bars and milestone indicators';
  }
  if (type === 'process' || t.includes('流程') || t.includes('路径') || t.includes('规划')) {
    return 'an elegant 3D isometric sequential milestone pathway with interconnecting luminous energy nodes';
  }
  return 'a sophisticated 3D modern geometric sculpture symbolizing structure and innovation, elegant studio lighting';
}

// Helper to dynamically compose diverse layout concepts and prompt structures based on slide type and sequence
function getDiverseLayoutDescription(type = 'cards', slideIndex = 1, visualSubject = '', deckStyleName = '极简') {
  const isCover = slideIndex === 1 || type === 'cover';
  if (isCover) {
    return {
      concept: `极简封面构图，左侧黄金分割呈现主标题与主旨愿景，右侧融合契合主题的高质感视觉装置【${visualSubject}】，大面积高雅呼吸感留白，契合【${deckStyleName}】`,
      promptLayout: `- Left 50% area: Prominently renders bold Chinese Presentation Title and concise subtitle with ample negative space.\n- Right 50% area: Seamlessly integrates a stunning centerpiece visual element: ${visualSubject}.\n- Overall composition: Prestigious keynote slide presentation cover.`
    };
  }

  // Modulo for diverse layout alternation
  const variant = slideIndex % 4;

  if (type === 'process' || variant === 0) {
    return {
      concept: `采用【上下分层阶梯流】构图：上部横向展开结构化要点与结论，下半部贯穿延伸切题流程动线与图解节点【${visualSubject}】，逻辑递进感鲜明，契合【${deckStyleName}】`,
      promptLayout: `- Upper 40% area: Clean horizontal typographic layout with structured content points and clear margins.\n- Lower 60% area: A continuous progressive workflow graphic: ${visualSubject}.`
    };
  }

  if (type === 'metrics' || variant === 1) {
    return {
      concept: `采用【中心核心图解锚定 + 两翼对称卡片】构图：切题视觉核心实体【${visualSubject}】置于画面中心，两侧对称分布结构化论据卡片，打破千篇一律的左右单侧分栏，契合【${deckStyleName}】`,
      promptLayout: `- Center area: Anchored by an impressive visual feature: ${visualSubject}.\n- Left and Right wings: Symmetrically distributed, elegant translucent typography cards with crisp Chinese text.`
    };
  }

  if (variant === 2) {
    return {
      concept: `采用【反向视觉偏置：左图右文】构图：画面左侧呈现大尺寸视觉主体【${visualSubject}】，右侧 55% 舒展排布结构化卡片论据，与常规页面形成灵动节奏交替，契合【${deckStyleName}】`,
      promptLayout: `- Left 45% area: Dedicated visual showcase highlighting ${visualSubject} with soft ambient glow.\n- Right 55% area: Spacious, high-contrast Chinese typography cards with generous line spacing.`
    };
  }

  // variant === 3: Three-column horizontal card matrix
  return {
    concept: `采用【三列横向卡片矩阵 + 背景微质感图示呼应】构图：顶部直出本页标题，中下部横向平铺 3 张半透明高质感卡片，底部与背景自然呼应【${visualSubject}】，视界开阔整齐，契合【${deckStyleName}】`,
    promptLayout: `- Top area: Crisp bold page title.\n- Middle section: 3 horizontal glassmorphism card containers with structured Chinese typography.\n- Bottom/Background: Supporting ambient visual elements: ${visualSubject}.`
  };
}

// ==========================================
// 💬 新增：多轮对话交互式单页生成接口 (/api/chat-slide)
// 保证整套对话中 PPT 风格严格锁定一致
// ==========================================
app.post('/api/chat-slide', async (req, res) => {
  const {
    topic,
    userPrompt,
    userImages = [],
    slideIndex = 1,
    deckStyle = { name: '极简暗黑', theme: 'dark', customPrompt: '极简现代' },
    history = [],
    isRework = false,
    currentSlideData = null,
    targetIndex = 0,
    apiKey,
    apiUrl,
    model
  } = req.body;

  const activeKey = runtimeConfig.llmApiKey || apiKey;
  const activeUrl = runtimeConfig.llmApiUrl || (apiKey ? apiUrl : null) || 'https://open.bigmodel.cn/api/paas/v4';
  const activeModel = runtimeConfig.llmModel || (apiKey ? model : null) || 'glm-4-flash';

  if (!userPrompt || userPrompt.trim() === '') {
    return res.status(400).json({ error: '请交代这一页要讲什么内容或修改要求' });
  }

  // 1. If activeKey is available (or local endpoint like Ollama without key), call LLM
  const isLocalUrl = activeUrl && (activeUrl.includes('localhost') || activeUrl.includes('127.0.0.1'));
  if (activeKey || isLocalUrl) {
    try {
      const isCurrentCover = isRework ? (targetIndex === 0) : (slideIndex === 1);

      const systemInstruction = `你是一位世界顶级演示文稿总监兼前沿视觉设计师。
【核心定位与使命】：
你【专门负责深度内容提炼、专业文案润色、多元版式大局规划、以及成品级 PPT 生图编排】。
下游由大模型 GPT 将你的方案直接渲染为整张【图文并茂、排版就绪、带真实中文排版字样的 16:9 成品 PPT 画卷】。

【四大核心工作法则】：
1. 【区分封面与内页，内页严禁生造副标题】：
   - 只有第 1 页【封面页】才需要主标题 + 副标题（如主讲人、主题核心定位）；
   - 第 2 页及以后的所有【正文内容页、分析页、架构页、成果页、数据页】：
     * 【绝对严禁强行生造副标题/空洞标语】！正文页只需精炼有力的【本页标题】（title，例如：“核心优势深度拆解”、“系统架构机理与性能评测”）；
     * 在正文页中，subtitle 字段必须直接留空字符串 ""，绝不要输出任何假大空的副标题！

2. 【排版多元化大局观——彻底打破‘左50%右50%’的呆板套路】：
   - 一套高水准的 PPT 必须节奏灵动、版式多姿！绝对严禁每一页都千篇一律地写“左侧50%文字，右侧50%插图”；
   - 视觉配图形式不必千篇一律全是“3D概念背景板”或“发光3D立体装置”！你必须根据本页的内容逻辑与板块类型，灵活选用多元版式与最切合的视觉表现：
     * 【版式一：横向卡片矩阵 + 底部贯穿动线/全景图解】：顶部居左为页面标题，中下部横向平铺 2-4 个并排高质感卡片，底部或右下角呼应贯穿式动线、架构图解或商业实景，视界宽广宏大；
     * 【版式二：左图右文 / 反向视觉偏置】：画面左侧为契合主题的视觉主体（高端商业摄影、矢量信息图解或 3D 模型），右侧 50% 舒展排布结构化要点，交替形成视觉韵律；
     * 【版式三：中心核心图解锚定 + 两翼对称分布】：核心视觉实体或架构拓扑置于画面中心黄金分割区，两侧或环绕分布卡片，形成平衡典雅的大师级对称感；
     * 【版式四：上下分层阶梯流】：上部 35% 清晰提炼战略结论，下半部 65% 展开横向时间轴、立体步骤节点或流程信息图；
     * 【版式五：高光数据看板 + 动态指标卡】：大字号关键高光指标卡，搭配数据可视化图表、SaaS UI 看板卡片或趋势图；
     * 【版式六：全景大图背景 + 悬浮半透明毛玻璃卡片】：以切题全景场景（如现代办公全景摄影或概念场景）为纵深背景，关键论据卡片以高对比度毛玻璃卡片悬浮于一侧。
   - 在 layoutConcept 中，用通俗、生动的语言向用户详述本页所选用的具体版式形态与视觉构想（说明是选用 3D 概念雕塑、高端商业摄影还是扁平矢量信息图），并讲清视觉焦点与留白呼应！

3. 【文案深度精修润色——拒绝假大空，极致具体，字数精炼】：
   - 【严禁假大空与空洞套话，触发绝对禁词惩罚】：
     * 【绝对禁词库】：严禁在正文中使用：“提高效率”、“助力决策”、“辅助决策”、“打破信息孤岛”、“高效协作”、“团队协作”、“促进协同”、“赋能业务”、“节省成本”、“提升质量”、“优化流程”等空泛废话！
     * 一旦检测到出现此类泛滥空话，直接判定为劣质文案！必须将用户的宏观想法深度翻译为【具体业务场景、具体动作/机制、或可感知的交付成果】。
   - 【拒绝同义反复，深入具体业务机理】：
     * ❌ 宽泛反例（严禁）：【自动化处理】：快速识别、分类、归档文档。（空洞宽泛，无具体场景与价值）
     * ✅ 极具体范例：【合同智能比对】：秒级高亮跨版本条款冲突，自动标注潜在法务合规风险。
     * ❌ 宽泛反例（严禁）：【智能数据分析】：精准洞察数据，辅助决策，优化业务流程。（假大空套话）
     * ✅ 极具体范例：【异动即时归因】：自然语言直出多维指标看板，分钟级定位转化率下滑根因。
     * ❌ 宽泛反例（严禁）：【跨部门协同】：打破信息孤岛，实现高效团队协作。（泛滥口号）
     * ✅ 极具体范例：【决议工单流转】：自动提取会议结论生成任务，实时联动研发看板与催办。
   - 【严格精简字数，短促有力，字不要太多】：
     * PPT 是视觉演示媒介，字绝不能太多，观众 3 秒内必须扫完！
     * 每个要点格式必须严格为：
       【具体场景/举措（4-8字）】：一针见血的明确动作与落地价值（冒号后正文【严格控制在 15-25 个汉字以内】，言简意赅，短促精炼，绝不拖泥带水！）；
     * 总体输出 2-4 个要点即可。

4. 【GPT 成品 PPT 生图提示词编写准则（图文并茂、配图多元自由、彻底解除禁字限制）】：
   - 彻底废除任何关于 "absolutely no text / no words / no letters" 的禁字约束！
   - 你在 fullSlideImagePrompt 中撰写的指令，是让 GPT 直接制作一张【完整的 16:9 中文演示幻灯片】！
   - 必须在 fullSlideImagePrompt 中明确指挥 GPT：
     * 【真实中文排版】：根据本页所选的多元版式，指定页面标题以及 2-4 个核心论据卡片清晰渲染在画面指定区域；
     * 【视觉配图灵活多元——不拘泥于 3D，合适时大胆选用传统高质量图示或摄影（自然选用，不强求）】：
       - 提示词里的配图不必全都是 3D 悬浮背景板！你应根据本页内容的实际属性自然搭配最契合的视觉表现：
         a) 当涉及办公实景、团队协同、具体硬件操作等具象场景时，可让 GPT 融入【高端商务纪实摄影 (High-end Editorial Commercial Photography)】或【极简工作台/人机交互实景特写】，更具真实商业信服力；
         b) 当涉及流程流转、技术拓扑、架构规范时，可让 GPT 融入【现代极简扁平矢量插图 (Minimalist Flat Vector)】或【清晰的信息图示架构 (Infographic Diagram)】；
         c) 当涉及数据监控、软件功能展示时，可让 GPT 融入【现代 SaaS UI / 仪表盘界面微悬浮卡片 (Modern SaaS UI / Dashboard Mockup)】；
         d) 当涉及抽象愿景、智能算力底座、未来概念时，继续发挥【3D 概念立体装置与质感雕塑 (3D Isometric / Glassmorphism)】的科技现代感；
     * 【专业级商业幻灯片品质】：现代留白、精细网格排版、无杂乱水印边框，8k 分辨率级商业设计终稿画面。

5. 请输出严格合法的单个幻灯片 JSON 对象（不要包含任何 markdown 块外的多余文本）：
{
  "id": ${currentSlideData?.id || Date.now()},
  "slideIndex": ${isRework ? (targetIndex + 1) : slideIndex},
  "type": "cards" | "process" | "metrics" | "agenda" | "summary" | "cover",
  "title": "${isCurrentCover ? '精炼有力的高端封面主标题' : '精炼有力的本页标题（如：核心优势深度拆解）'}",
  "subtitle": "${isCurrentCover ? '封面副标题（定位与主旨愿景）' : ''}",
  "layoutConcept": "用通俗中文详述本页大局排版规划：指明所选用的多元版式（如横向卡片矩阵、左图右文、中心图解等），并说明文字与视觉配图的空间分布与留白呼应",
  "bullets": [
    "【合同智能审查】：秒级高亮跨版本条款冲突，自动标注潜在合规风险",
    "【异动即时归因】：自然语言直出多维指标看板，分钟级定位下滑根因",
    "【决议工单流转】：自动提取会议结论生成任务，实时联动看板与催办"
  ],
  "metrics": null,
  "fullSlideImagePrompt": "英文 16:9 成品 PPT 生图指令：根据本页多元版式，精确指引 GPT 在画面中渲染清晰的中文标题与卡片文字，并融入切题的 3D 视觉主体插图，彻底去除任何 no text 约束",
  "speakerNotes": ""
}`;

      const historyContext = history.slice(-3).map(h => `${h.role === 'user' ? '用户需求' : '生成内容'}: ${h.text || h.title}`).join('\n');

      const userContent = isRework && currentSlideData
        ? `PPT整体主题：【${topic || '商业汇报'}】
【任务：针对第 ${targetIndex + 1} 页进行返工/修订】
原页面内容：
标题: ${currentSlideData.title}
副标题: ${currentSlideData.subtitle}
要点: ${(currentSlideData.bullets || []).join('；')}

用户的修改意见：
"${userPrompt}"
${userImages.length > 0 ? `(用户提供了 ${userImages.length} 张新图片以替换/融入该页)` : ''}

【文案与排版核心要领】：
1. 严禁使用“提高效率/助力决策/辅助决策/打破信息孤岛/团队协作/优化流程/降本增效”等套话！必须深度翻译为具体业务举措与动作（如：合同比对审查、异动看板归因、工单催办流转）；
2. 每个要点正文必须严格控制在 15-25 字以内，短促有力，字绝对不要太多；
3. 配图形式自由多元：不必全都是 3D 浮空板，在涉及办公实景、团队协作或架构规范时，合适可自然选用高端商业纪实摄影、现代扁平矢量信息图或 3D 概念装置；
4. 请输出该页的精准结构化 JSON。`
        : `PPT整体主题：【${topic || '商业汇报'}】
前序页面上下文：
${historyContext || '无（当前为首张页面）'}

用户对第 ${slideIndex} 页的具体要求：
"${userPrompt}"
${userImages.length > 0 ? `(用户同时拖拽上传了 ${userImages.length} 张本地图片放置在该页)` : ''}

【文案与排版核心要领】：
1. 严禁使用“提高效率/助力决策/辅助决策/打破信息孤岛/团队协作/优化流程/降本增效”等套话！必须深度翻译为具体业务举措与动作（如：合同比对审查、异动看板归因、工单催办流转）；
2. 每个要点正文必须严格控制在 15-25 字以内，短促有力，字绝对不要太多；
3. 配图形式自由多元：不必全都是 3D 浮空板，在涉及办公实景、团队协作或架构规范时，合适可自然选用高端商业纪实摄影、现代扁平矢量信息图或 3D 概念装置；
4. 请输出该页的精准结构化 JSON。`;

      const headers = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

      const requestPayload = {
        model: activeModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7
      };

      let response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestPayload, response_format: { type: 'json_object' } })
      });

      // If 400 (unsupported response_format on some domestic models), retry without it
      if (!response.ok && response.status === 400) {
        response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(requestPayload)
        });
      }

      if (response.ok) {
        const data = await response.json();
        const rawContent = data.choices[0]?.message?.content || '';
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const slideData = JSON.parse(jsonMatch[0]);

          // 规范化 bullets：保留用户所需的高价值要点，严禁输出假要点与占位符
          const isDummyOrEmptyBullet = (b) => {
            if (!b) return true;
            const s = String(b).trim();
            if (/^要点\s*0?[0-9]+$/i.test(s)) return true;
            if (/^核心要点\s*0?[0-9]+$/i.test(s)) return true;
            if (/^维度\s*[0-9一二三四五六七八九十]+$/i.test(s)) return true;
            if (/^(?:待补充|待完善|占位符|暂无|placeholder|tbd)$/i.test(s)) return true;
            if (s.length < 6 && !s.includes('：') && !s.includes(':')) return true;
            return false;
          };

          if (Array.isArray(slideData.bullets)) {
            const rawList = slideData.bullets.map((b, idx) => {
              if (typeof b === 'object' && b !== null) {
                const t = b.title || b.label || b.dimension || b.name || '';
                const d = b.description || b.desc || b.content || b.detail || b.text || b.summary || b.explanation || '';
                if (t && d && !isDummyOrEmptyBullet(d)) return `${t}：${d}`;
                if (d && !isDummyOrEmptyBullet(d)) return d;
                if (t && !isDummyOrEmptyBullet(t)) return t;
                return '';
              }
              const s = String(b || '').trim();
              return isDummyOrEmptyBullet(s) ? '' : s;
            }).filter(Boolean);

            // 智能粘合碎片项：若上一项是【核心维度：XXX】，下一项是具体展开描述，合并为完整结构化句子
            const merged = [];
            for (let i = 0; i < rawList.length; i++) {
              const current = rawList[i];
              const isHeadingOnly = /^[【\[].+[】\]][:：]?$/.test(current) || (/^[【\[]/.test(current) && current.length <= 15 && !current.includes('：') && !current.includes(':'));
              if (isHeadingOnly && i + 1 < rawList.length && !/^[【\[]/.test(rawList[i + 1])) {
                const head = current.replace(/[:：\s]+$/, '');
                merged.push(`${head}：${rawList[i + 1]}`);
                i++; // 跳过已被粘合的子项
              } else {
                merged.push(current);
              }
            }

            slideData.bullets = merged.filter(b => !isDummyOrEmptyBullet(b));
          } else {
            slideData.bullets = [];
          }

          // 文案后处理：精简字数、过滤句末空套话，确保短促有力
          const cleanAndTrimBullet = (bullet) => {
            if (!bullet || typeof bullet !== 'string') return bullet;
            let str = bullet.trim();
            const m = str.match(/^([【\[].+?[】\]])\s*[:：]?\s*(.*)$/);
            if (m) {
              const head = m[1];
              let body = m[2].trim();
              // 清除句末空洞套话：如 "助力决策"、"提高工作效率"、"实现高效协作"、"推动数字化转型"
              body = body.replace(/(?:从而|进而|全面|有效|大力|持续|快速)?(?:大幅|显著|有效)?(?:提高|提升|增强|优化|实现|赋能|助力|辅助|促进)?(?:工作效率|办公效率|企业决策|决策制定|决策|协同体验|团队协同|高效协作|高效协同|信息共享|数字化转型|长效闭环|核心竞争力|业务赋能|降本增效|高效共赢)[。！!]?$/g, '');
              body = body.replace(/[，,、；;]\s*$/, '').trim();
              // 若字数依然过长（超过26字），截取自然分句
              if (body.length > 26) {
                const clauses = body.split(/[，,；;。]/).filter(Boolean);
                if (clauses.length > 1 && clauses[0].length >= 12 && clauses[0].length <= 25) {
                  body = clauses[0];
                } else if (clauses.length > 2 && (clauses[0].length + clauses[1].length + 1) <= 26) {
                  body = `${clauses[0]}，${clauses[1]}`;
                } else if (body.length > 26) {
                  body = body.slice(0, 25);
                }
              }
              return `${head}：${body}`;
            }
            return str;
          };

          slideData.bullets = (slideData.bullets || []).map(cleanAndTrimBullet);

          // 核心文案保底：若过滤后要点不足或为空，智能合成高含金量极简专业文案（拒绝空洞模板）
          if (slideData.bullets.length < 2) {
            slideData.type = 'cards';
            slideData.bullets = [
              `【流程自动化】：端到端自动串联核心链路，大幅削减手工操作`,
              `【指标即时预警】：全量聚合业务运行数据，异动毫秒级追溯归因`,
              `【标准体系固化】：沉淀行业最佳实践模版，保障跨团队交付质量`
            ];
          }

          // 若用户未提及数据指标且非metrics类型，清理虚构指标
          const hasDataIntent = /(?:数据|指标|%|百分之|增长|完成率|销量|营收|亿|万)/i.test(userPrompt);
          if (!hasDataIntent && slideData.type !== 'metrics') {
            slideData.metrics = null;
          }

          // If not cover, strictly clear subtitle and force non-cover type (internal content slides don't have fake subtitles!)
          const isCoverPage = isRework ? targetIndex === 0 : slideIndex === 1;
          if (!isCoverPage) {
            if (slideData.type === 'cover') {
              slideData.type = 'cards';
            }
            slideData.subtitle = '';
          }

          // Strip any residual negative text constraints from LLM output
          slideData.fullSlideImagePrompt = (slideData.fullSlideImagePrompt || '')
            .replace(/STRICT CONSTRAINTS:?\s*absolutely no text[^.]*\.?/gi, '')
            .replace(/(?:absolutely\s*)?no text(?:[,.]|\s+no letters|\s+no words|\s+no typography)*/gi, '')
            .trim();

          const visualSubject = (!userImages || userImages.length === 0)
            ? getSmartVisualSubject(slideData.title || topic, slideData.type, deckStyle.name, isRework ? (targetIndex + 1) : slideIndex)
            : 'custom cohesive layout with user-uploaded image';

          const layoutDesc = getDiverseLayoutDescription(slideData.type, isRework ? (targetIndex + 1) : slideIndex, visualSubject, deckStyle.name);

          if (!slideData.layoutConcept || (slideData.layoutConcept.includes('左侧50%') && slideData.layoutConcept.includes('右侧50%'))) {
            slideData.layoutConcept = layoutDesc.concept;
          }

          const hasChineseOrTypography = /(?:typography|chinese|title|header|content cards)/i.test(slideData.fullSlideImagePrompt);

          if (!slideData.fullSlideImagePrompt || !hasChineseOrTypography || slideData.fullSlideImagePrompt.length < 50 || slideData.fullSlideImagePrompt.includes('Left 50% area: Dedicated for clean')) {
            const bulletList = (slideData.bullets || []).slice(0, 4).map((b, idx) => `  * Point 0${idx + 1}: ${String(b).replace(/^[【\[].+?[】\]][:：]?\s*/, '').slice(0, 45)}`).join('\n');
            slideData.fullSlideImagePrompt = `A finished 16:9 widescreen presentation slide in modern high-end ${deckStyle.name} visual design.
TYPOGRAPHY & CONTENT (RENDER CRISP CHINESE CHARACTERS DIRECTLY ON SLIDE):
- Title: "${slideData.title}" in bold clean modern Chinese typography
${slideData.subtitle ? `- Subtitle: "${slideData.subtitle}"` : ''}
${bulletList ? `- Key Content Cards:\n${bulletList}` : ''}
LAYOUT & VISUAL COMPOSITION:
${layoutDesc.promptLayout}
- Design Tone: Executive keynote presentation slide finish, 8k resolution, crisp vector-grade graphic design perfection.`;
          }

          slideData.speakerNotes = '';

          if (userImages.length > 0) {
            slideData.imageUrl = userImages[0];
            slideData.userUploaded = true;
          } else if (isRework && currentSlideData?.imageUrl && !slideData.imageUrl) {
            slideData.imageUrl = currentSlideData.imageUrl;
            slideData.userUploaded = currentSlideData.userUploaded;
          } else {
            slideData.imageUrl = null;
            slideData.userUploaded = false;
          }

          return res.json({ success: true, slide: slideData, isRework, targetIndex, isMock: false });
        }
      } else {
        console.warn('Chat-slide LLM API failed with status:', response.status, await response.text());
      }
    } catch (err) {
      console.warn('Chat-slide LLM API failed, using smart slide composer:', err.message);
    }
  }

  // 2. Smart local slide composer (intelligent turn-by-turn fallback)
  const smartSlide = composeSmartSingleSlide({
    topic,
    userPrompt,
    slideIndex: isRework ? (targetIndex + 1) : slideIndex,
    deckStyle,
    userImages,
    existingSlide: isRework ? currentSlideData : null
  });

  return res.json({
    success: true,
    slide: smartSlide,
    isRework,
    targetIndex,
    isMock: true,
    message: isRework ? '已为您完成本页返工修订。' : '基于锁定风格完成智能解析排版。'
  });
});

// ==========================================
// 🎨 开源级 PPT AI 生图约束引擎 (Constraint Engine)
// ==========================================
const STYLE_PRESETS = {
  '3d': '3D isometric render, claymorphism and frosted glass elements, smooth matte material, soft studio ambient lighting, elegant floating shapes, Octane 8k render',
  'vector': 'modern flat corporate vector illustration, clean geometric lines, elegant subtle gradients, minimal two-tone color palette, Bauhaus inspired aesthetic',
  'photo': 'high-end editorial photography, premium corporate aesthetic, clean depth of field, natural soft ambient lighting, cinematic 8k composition',
  'glass': 'futuristic glassmorphism 3D elements, transparent translucent frosted acrylic, sleek neon cyan glowing accents, high-tech minimalism'
};

const THEME_BACKGROUND_CONSTRAINTS = {
  dark: 'isolated on deep dark charcoal slate #0F1115 solid background, dark mode visual aesthetic',
  light: 'isolated on clean pure white #FFFFFF studio background, soft minimal drop shadow',
  tech: 'isolated on deep cyber navy blue #0B1329 background, subtle futuristic glow',
  warm: 'isolated on warm cream off-white #F7F4EB background, soft cozy palette'
};

function buildPresentationImagePrompt({ prompt, style = '3d', theme = 'dark' }) {
  const styleDesc = STYLE_PRESETS[style] || `custom aesthetic style: ${style}, cohesive presentation visual`;
  const bgDesc = THEME_BACKGROUND_CONSTRAINTS[theme] || THEME_BACKGROUND_CONSTRAINTS.dark;
  const base = prompt || 'Minimalist visual presentation slide layout';

  return `A complete 16:9 presentation slide, professional typography and cohesive visual composition. Content: ${base}. Visual Style: ${styleDesc}. Theme & Tone: ${bgDesc}, 8k resolution graphic design perfection.`;
}

// Native HTTPS client with TCP KeepAlive (Prevents connection drops through Clash / VPN / Proxies during 40-80s image generation)
function callImageGenerationApi({ apiUrl, apiKey, payload, timeoutMs = 180000 }) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(`${apiUrl.replace(/\/$/, '')}/images/generations`);
      const bodyStr = JSON.stringify(payload);

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(bodyStr),
          'Connection': 'keep-alive'
        },
        timeout: timeoutMs
      };

      const lib = urlObj.protocol === 'https:' ? https : http;
      const req = lib.request(options, (res) => {
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        res.on('end', () => {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            text: async () => rawData,
            json: async () => {
              try {
                return JSON.parse(rawData);
              } catch (e) {
                throw new Error(`无法解析响应 JSON (${res.statusCode}): ${rawData.slice(0, 120)}`);
              }
            }
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`生图请求超时（已等待超过 ${Math.round(timeoutMs / 1000)} 秒）`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      // Enable TCP keepalive so proxy/TUN never drops connection
      req.on('socket', (socket) => {
        socket.setKeepAlive(true, 5000);
      });

      req.write(bodyStr);
      req.end();
    } catch (err) {
      reject(err);
    }
  });
}

// In-memory Task store and Cache for asynchronous image generation
const imageTasks = new Map();
const promptImageCache = new Map();

// Seed with the recently generated image so user's points aren't lost!
const RECENT_SUCCESS_URL = 'https://file6.aitohumanize.com/file/b34fa50ed6794cbca2d14cbb7ae16de2.png';
promptImageCache.set('recent_success', {
  url: RECENT_SUCCESS_URL,
  model: 'gpt-image-2',
  time: Date.now()
});

// 4a. Async Image Generation Task Submission Endpoint (Lightning fast ~10ms return)
app.post('/api/image-tasks', (req, res) => {
  const { prompt, fullSlidePrompt, slideIndex, apiKey, apiUrl, model: requestedModel, style = '3d', theme = 'dark' } = req.body;
  const activeKey = apiKey || runtimeConfig.gptimage2ApiKey;
  const activeUrl = apiUrl || runtimeConfig.gptimage2ApiUrl;
  const preferredModel = requestedModel || runtimeConfig.gptimage2Model || 'gpt-image-2';

  const targetPrompt = fullSlidePrompt || (prompt ? buildPresentationImagePrompt({ prompt, style, theme }) : 'A masterfully designed 16:9 widescreen presentation slide, modern corporate minimalist aesthetic, ample negative space, 8k resolution');

  // Check cache first to avoid repeating costly API calls and save user points!
  const cached = promptImageCache.get(targetPrompt);
  if (cached && (Date.now() - cached.time < 7200000)) {
    const taskId = `task_cached_${Date.now()}`;
    imageTasks.set(taskId, {
      id: taskId,
      status: 'completed',
      startTime: Date.now(),
      prompt: targetPrompt,
      result: { url: cached.url, model: cached.model, prompt: targetPrompt, isPlaceholder: false }
    });
    return res.json({ success: true, taskId, status: 'completed', cached: true });
  }

  // Check if identical prompt is already actively generating
  for (const [existingId, t] of imageTasks.entries()) {
    if (t.prompt === targetPrompt && t.status === 'processing' && (Date.now() - t.startTime < 180000)) {
      return res.json({ success: true, taskId: existingId, status: 'processing' });
    }
  }

  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const task = {
    id: taskId,
    status: 'processing',
    startTime: Date.now(),
    prompt: targetPrompt,
    slideIndex: slideIndex || 0,
    result: null,
    error: null
  };
  imageTasks.set(taskId, task);

  // Return taskId immediately so client HTTP socket NEVER hangs or times out!
  res.json({ success: true, taskId, status: 'processing' });

  // Run generation asynchronously in background
  (async () => {
    try {
      if (!activeKey) {
        throw new Error('未配置生图 API Key，请在设置中配置');
      }

      const isGrsAI = activeUrl.includes('grsai');
      const candidateModels = [preferredModel];
      const targetSize = isGrsAI ? '1024x1024' : '1792x1024';

      console.log(`[Async Task ${taskId}] Starting generation with ${preferredModel} (${targetSize})...`);

      for (const candModel of candidateModels) {
        try {
          const response = await callImageGenerationApi({
            apiUrl: activeUrl,
            apiKey: activeKey,
            payload: {
              model: candModel,
              prompt: targetPrompt,
              n: 1,
              size: targetSize
            },
            timeoutMs: 180000
          });

          if (response.ok) {
            const data = await response.json();
            const imageUrl = data.data?.[0]?.url;
            if (imageUrl) {
              console.log(`[Async Task ${taskId} Success] Model: ${candModel}, URL: ${imageUrl}`);
              task.status = 'completed';
              task.result = {
                url: imageUrl,
                model: candModel,
                prompt: targetPrompt,
                isPlaceholder: false
              };
              promptImageCache.set(targetPrompt, {
                url: imageUrl,
                model: candModel,
                time: Date.now()
              });
              return;
            }
          } else {
            const errText = await response.text();
            console.warn(`[Async Task ${taskId} Error] Model ${candModel}:`, errText);
            let errReason = `HTTP ${response.status}`;
            try {
              const parsed = JSON.parse(errText);
              errReason = parsed.error?.message || errReason;
            } catch {}
            task.status = 'failed';
            task.error = errReason;
            return;
          }
        } catch (callErr) {
          console.warn(`[Async Task ${taskId} Exception]:`, callErr.message);
          task.status = 'failed';
          task.error = callErr.message;
          return;
        }
      }

      task.status = 'failed';
      task.error = '未能获取到有效图片地址';
    } catch (err) {
      console.warn(`[Async Task ${taskId} Fatal]:`, err.message);
      task.status = 'failed';
      task.error = err.message;
    }
  })();
});

// 4b. Polling Endpoint for Task Status
app.get('/api/image-tasks/:taskId', (req, res) => {
  const { taskId } = req.params;
  const task = imageTasks.get(taskId);
  if (!task) {
    return res.status(404).json({ success: false, error: 'Task not found' });
  }

  const elapsed = Math.floor((Date.now() - task.startTime) / 1000);
  res.json({
    success: true,
    taskId: task.id,
    status: task.status,
    elapsed,
    result: task.result,
    error: task.error
  });
});

// 4c. Synchronous Image Generation Endpoint (Legacy / Direct)
app.post('/api/generate-image', async (req, res) => {
  const { prompt, fullSlidePrompt, slideIndex, apiKey, apiUrl, model: requestedModel, style = '3d', theme = 'dark' } = req.body;
  const activeKey = apiKey || runtimeConfig.gptimage2ApiKey;
  const activeUrl = apiUrl || runtimeConfig.gptimage2ApiUrl;
  const preferredModel = requestedModel || runtimeConfig.gptimage2Model || 'gpt-image-2';

  const targetPrompt = fullSlidePrompt || (prompt ? buildPresentationImagePrompt({ prompt, style, theme }) : 'A masterfully designed 16:9 widescreen presentation slide, modern corporate minimalist aesthetic, ample negative space, 8k resolution');

  // Check cache first
  const cached = promptImageCache.get(targetPrompt);
  if (cached && (Date.now() - cached.time < 7200000)) {
    return res.json({
      success: true,
      url: cached.url,
      model: cached.model,
      prompt: targetPrompt,
      isPlaceholder: false
    });
  }

  let apiErrorReason = null;
  if (activeKey) {
    const isGrsAI = activeUrl.includes('grsai');
    const candidateModels = [preferredModel];

    for (const candModel of candidateModels) {
      const targetSize = isGrsAI ? '1024x1024' : '1792x1024';
      try {
        const response = await callImageGenerationApi({
          apiUrl: activeUrl,
          apiKey: activeKey,
          payload: {
            model: candModel,
            prompt: targetPrompt,
            n: 1,
            size: targetSize
          },
          timeoutMs: 180000
        });

        if (response.ok) {
          const data = await response.json();
          const imageUrl = data.data?.[0]?.url;
          if (imageUrl) {
            promptImageCache.set(targetPrompt, {
              url: imageUrl,
              model: candModel,
              time: Date.now()
            });
            return res.json({
              success: true,
              url: imageUrl,
              model: candModel,
              prompt: targetPrompt,
              isPlaceholder: false
            });
          }
        } else {
          const errText = await response.text();
          try {
            const parsed = JSON.parse(errText);
            apiErrorReason = parsed.error?.message || `HTTP ${response.status}`;
          } catch {
            apiErrorReason = `HTTP ${response.status}`;
          }
        }
      } catch (err) {
        apiErrorReason = err.message;
      }
    }
  }

  // Fallback images
  const fallbackImages = [
    'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1507679799987-c73779587ccf?q=80&w=1200&auto=format&fit=crop',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?q=80&w=1200&auto=format&fit=crop',
  ];
  const url = fallbackImages[(slideIndex || 0) % fallbackImages.length];
  res.json({
    success: true,
    url,
    isPlaceholder: true,
    errorReason: apiErrorReason || '生图服务响应异常',
    prompt: targetPrompt,
    appliedConstraints: {
      style,
      theme,
      noText: true,
      negativeSpace: true
    }
  });
});

// Helper for smart slide generation
function generateSmartSlides(topic, count, style, language) {
  const isEn = language === 'en';
  const slides = [];

  // Slide 1: Cover
  slides.push({
    id: 1,
    type: 'cover',
    title: topic,
    subtitle: isEn ? 'Comprehensive Analysis & Strategic Roadmap' : '全面分析报告与实施路径规划',
    bullets: [
      isEn ? 'Prepared for Decision Makers' : '面向决策层与执行团队',
      isEn ? 'Date: 2026 Strategy Session' : '汇报日期：2026年度战略规划',
      isEn ? 'Presenter: Strategy & Innovation Lab' : '汇报人：战略与创新项目组'
    ],
    imagePrompt: `Minimalist high-tech abstract artwork representing ${topic}, clean composition, soft studio lighting`,
    speakerNotes: isEn ? `Welcome everyone. Today we explore ${topic}.` : `各位领导、同事好，今天我们将围绕【${topic}】展开深入探讨。`
  });

  // Slide 2: Agenda
  slides.push({
    id: 2,
    type: 'agenda',
    title: isEn ? 'Agenda & Key Objectives' : '汇报大纲与核心议题',
    subtitle: isEn ? 'Structured navigation for today’s session' : '本次分享的四个关键阶段与推进逻辑',
    bullets: [
      isEn ? '01. Background & Market Dynamics' : '01. 背景洞察与市场趋势演进',
      isEn ? '02. Core Challenges & Pain Points' : '02. 核心痛点与行业挑战剖析',
      isEn ? '03. Strategic Architecture & Solution' : '03. 战略架构与系统化解决方案',
      isEn ? '04. Implementation Timeline & Impact' : '04. 实施规划、里程碑与效益预期'
    ],
    imagePrompt: 'Clean minimalist architectural structure, geometric lines, modern aesthetic',
    speakerNotes: isEn ? 'Here is the overview of our agenda.' : '这是我们今天汇报的总体框架，层层递进。'
  });

  // Slide 3: Metrics & Highlights
  if (count >= 3) {
    slides.push({
      id: 3,
      type: 'metrics',
      title: isEn ? 'Key Market Metrics & Traction' : '关键指标与市场表现',
      subtitle: isEn ? 'Data-driven insights establishing strong momentum' : '基于权威数据视角的增长动能与行业态势',
      bullets: [
        isEn ? 'Rapid sector compound annual growth rate' : '行业复合年均增长率保持高位态势',
        isEn ? 'High efficiency gains across pilot implementations' : '核心业务流程效率实现倍数级提升',
        isEn ? 'Market adoption accelerating beyond baseline expectations' : '目标用户群体渗透率超越预期基线'
      ],
      metrics: [
        { value: '+142%', label: isEn ? 'Year-over-Year Growth' : '年度同比增长率' },
        { value: '3.8x', label: isEn ? 'Efficiency Multiplier' : '能效提升倍数' },
        { value: '98.6%', label: isEn ? 'Satisfaction Score' : '综合满意度' }
      ],
      imagePrompt: 'Clean 3D minimalist bar chart and glowing analytical graphs, sophisticated gradient',
      speakerNotes: isEn ? 'Let’s look at the underlying numbers.' : '从数据维度来看，多项核心指标均呈现出强劲的上升势头。'
    });
  }

  // Slide 4: Cards / Key Pillars
  if (count >= 4) {
    slides.push({
      id: 4,
      type: 'cards',
      title: isEn ? 'Core Strategic Pillars' : '三大战略支柱与能力建设',
      subtitle: isEn ? 'Foundational principles driving scalable execution' : '驱动长期稳健增长与高质量落地的底层支柱',
      bullets: [
        isEn ? 'Technological Empowerment: Building intelligent and automated infrastructure' : '技术赋能：构建高弹性、智能化的数字底层基座',
        isEn ? 'Operational Agility: Streamlining cross-functional workflows and reducing friction' : '敏捷协同：打破跨部门业务壁垒，实现精细化闭环',
        isEn ? 'Ecosystem Synergies: Aligning user experience with scalable business models' : '生态共赢：紧密贴合用户价值主张，拓展共赢边界'
      ],
      imagePrompt: 'Three minimalist pillars standing balanced, clean modern render, subtle lighting',
      speakerNotes: isEn ? 'These three pillars form our core foundation.' : '这三大支柱构成了我们战略落地最坚实的支撑。'
    });
  }

  // Slide 5: Process / Roadmap
  if (count >= 5) {
    slides.push({
      id: 5,
      type: 'process',
      title: isEn ? 'Phased Execution Roadmap' : '实施路径与里程碑规划',
      subtitle: isEn ? 'Step-by-step rollout ensuring risk mitigation' : '稳步推进、风险可控的落地阶段演进表',
      bullets: [
        isEn ? 'Phase 1: Pilot validation and feedback loops (Q1-Q2)' : '阶段一：方案论证与最小可行性验证（Q1-Q2）',
        isEn ? 'Phase 2: Full-scale deployment and integration (Q3)' : '阶段二：核心业务系统全量铺开与协同（Q3）',
        isEn ? 'Phase 3: Ecosystem expansion and continuous iteration (Q4+)' : '阶段三：生态拓展与自进化长效机制（Q4+）'
      ],
      imagePrompt: 'Minimalist timeline roadmap with glowing dots and clean arrows',
      speakerNotes: isEn ? 'We have divided the execution into three disciplined phases.' : '在执行层面，我们制定了三阶段清晰可度量的推进路线。'
    });
  }

  // Fill up if user requested more slides
  for (let i = 6; i < count; i++) {
    slides.push({
      id: i,
      type: 'cards',
      title: `${isEn ? 'Detailed Initiative' : '重点突破方向'} 0${i - 4}`,
      subtitle: isEn ? 'Deep dive into operational mechanics' : '聚焦具体业务场景的针对性打法与机制优化',
      bullets: [
        isEn ? 'Targeted resource allocation for maximum leverage' : '聚焦核心资源投放，以高杠杆率撬动突破点',
        isEn ? 'Standardized operating procedures to accelerate onboarding' : '建立标准化作业规范，提升规模化复制效率',
        isEn ? 'Real-time telemetry and KPI governance loops' : '搭建实时指标监控体系，做到敏捷纠偏与预警'
      ],
      imagePrompt: 'Minimalist clean interface mockup with elegant charts',
      speakerNotes: isEn ? 'Here are the granular execution details.' : '本页深入阐述了该方向的具体动作与保障措施。'
    });
  }

  // Last Slide: Summary & Call to Action
  slides.push({
    id: count,
    type: 'summary',
    title: isEn ? 'Conclusion & Action Items' : '总结与行动倡议',
    subtitle: isEn ? 'Paving the path forward together' : '把握战略机遇窗口，携手迈向高质量突破',
    bullets: [
      isEn ? 'Clear consensus on vision and strategic focus' : '统一思想共识，确立明确的发展主航道',
      isEn ? 'Immediate action: kickoff working groups next week' : '即刻启动专班运作，下周完成任务细化分工',
      isEn ? 'Q&A & Discussion' : '开放交流与答疑（Q&A）'
    ],
    imagePrompt: 'Minimalist futuristic horizon with rising morning light, inspiring and clean',
    speakerNotes: isEn ? 'Thank you. I look forward to your questions.' : '感谢大家的聆听，欢迎各位提出宝贵意见与问题探讨。'
  });

  return {
    title: topic,
    subtitle: isEn ? 'Generated by SlideFlow Minimalist AI' : 'SlideFlow 极简智能演示系统生成',
    slides
  };
}

// Helper to parse entity, topic, and numbered points from user prompt
function parsePromptEntities(text) {
  let cleaned = text.trim();

  // Strip conversational page prefixes
  cleaned = cleaned
    .replace(/^(?:请|帮我|我要|我想|麻烦)?(?:来|做|弄|出|写|生成|放|放上|展示|安排|做个|做一页|搞一个)?(?:一个|一页|个|张)?(?:关于)?/i, '')
    .replace(/^(?:第[0-9一二三四五六七八九十]+页|当前页|这一页|封面页?)(?:的内容是|是|写|讲|介绍|做|放|展示|：|:)?\s*/i, '')
    .replace(/^(?:请|帮我|我要|我想)?(?:写|做|讲|介绍|分析|聊聊|展示|放|放上|做一个|做一页|做个|弄个|出个|生成|介绍一下|讲讲|说说)(?:关于)?[:：\s]*/i, '')
    .trim();

  // 1. Parse numbered bullets if user provided explicit points
  const userBullets = [];
  const parts = cleaned.split(/(?:^|\s|[;；\n])(?:[1-9一二三四五六七八九十][.、:：\s]|·|-|\([1-9]\)|（[1-9]）)/);
  let subject = cleaned;
  if (parts.length > 1) {
    subject = parts[0].trim();
    for (let i = 1; i < parts.length; i++) {
      const pt = parts[i].trim();
      if (pt.length > 0) userBullets.push(pt);
    }
  }

  // 2. Extract presenter/person name from subject
  let person = '';
  const personPatterns = [
    /(?:下面署名|署名|汇报人|演讲人|竞选人|主讲人|竞聘人|报告人|发言人|作者|分享人|名字叫|姓名)[：:\s]*([\u4e00-\u9fa5A-Za-z·\s]{2,10})/i,
    /[,，\s]+(?:下面署名|署名|汇报人|演讲人|竞选人|主讲人|竞聘人|报告人|发言人|作者|分享人|姓名)?[：:\s]*([\u4e00-\u9fa5]{2,4})$/i
  ];

  for (const pat of personPatterns) {
    const match = subject.match(pat);
    if (match) {
      person = match[1].trim();
      subject = subject.replace(pat, '').trim();
      break;
    }
  }

  subject = subject
    .replace(/^[,，:：\s]+|[,，:：\s]+$/g, '')
    .replace(/(?:，|,)?(?:下面)?署名.*$/g, '')
    .trim();

  return { cleaned, subject: subject || '核心议题', person, userBullets };
}

// Smart single-slide composer for conversational mode & rework
function composeSmartSingleSlide({ topic = '', userPrompt, slideIndex = 1, deckStyle, userImages = [], existingSlide = null }) {
  const text = userPrompt.trim();
  const lower = text.toLowerCase();

  // If rework mode and existing slide is provided, refine on top of it
  if (existingSlide) {
    const updated = { ...existingSlide };
    if (userImages && userImages.length > 0) {
      updated.imageUrl = userImages[0];
      updated.userUploaded = true;
    }

    if (lower.includes('配图') || lower.includes('画面') || lower.includes('插图')) {
      const cleanImgPrompt = text.replace(/^(?:请|帮我)?(?:配图补充要求|补充配图要求|配图补充|补充配图|配图要|配图改为|配图换成|画面要|插图要)[：:\s]*/, '').trim();
      updated.imagePrompt = `${existingSlide.imagePrompt || existingSlide.title}。补充视觉细节：${cleanImgPrompt}`;
    }

    if (lower.includes('指标') || lower.includes('数据') || lower.includes('增长')) {
      updated.type = 'metrics';
    } else if (lower.includes('流程') || lower.includes('路线') || lower.includes('步骤')) {
      updated.type = 'process';
    } else if (lower.includes('封面')) {
      updated.type = 'cover';
    } else if (lower.includes('目录')) {
      updated.type = 'agenda';
    } else if (lower.includes('总结') || lower.includes('结语')) {
      updated.type = 'summary';
    }

    const isImageAdjustment = lower.includes('配图') || lower.includes('画面') || lower.includes('插图') || lower.includes('换图');

    if (!isImageAdjustment) {
      const { subject, person, userBullets } = parsePromptEntities(text);
      if (userBullets.length > 0) {
        updated.bullets = userBullets.map(b => b.includes('：') || b.includes(':') ? b : `修订要点：${b}`);
      } else if (/(?:标题|主题|名字)/.test(text)) {
        const cleanSubject = text.replace(/^(?:请|帮我)?(?:把标题改成|把标题换成|标题改为|标题改成|修改标题为|修改为|改成)[：:\s]*/, '').trim();
        if (cleanSubject.length > 0 && cleanSubject.length <= 25) {
          updated.title = cleanSubject;
          if (person) updated.subtitle = `主讲人：${person}`;
        }
      } else {
        const lines = text.split(/[\n;；。]/).map(l => l.trim()).filter(Boolean);
        if (lines.length > 1) {
          updated.title = lines[0].slice(0, 22);
          updated.bullets = lines.slice(1, 4);
        } else {
          updated.subtitle = `已根据修改要求「${text.slice(0, 18)}」完成定制迭代`;
        }
      }
    }
    return updated;
  }

  // 1. Parse prompt
  const { subject, person, userBullets } = parsePromptEntities(text);

  // 2. Identify slide type
  let type = 'cards';
  const wantsCopy = /(?:文案|内容|要点|写点|详细|说明|布局|展示)/i.test(text);
  if (!wantsCopy && (lower.includes('封面') || lower.includes('cover') || lower.includes('首页') || (slideIndex === 1 && !lower.includes('页')))) {
    type = 'cover';
  } else if (lower.includes('目录') || lower.includes('agenda') || lower.includes('大纲')) {
    type = 'agenda';
  } else if (lower.includes('数据') || lower.includes('指标') || lower.includes('增长') || lower.includes('metric')) {
    type = 'metrics';
  } else if (lower.includes('流程') || lower.includes('步骤') || lower.includes('路线') || lower.includes('时间线') || lower.includes('roadmap')) {
    type = 'process';
  } else if (lower.includes('总结') || lower.includes('结语') || lower.includes('致谢') || lower.includes('q&a') || lower.includes('conclusion')) {
    type = 'summary';
  }

  // 3. Scenario recognition
  const fullContext = `${topic} ${subject} ${text}`;
  const isElection = /(?:班长|竞选|竞聘|述职|面试|转正|答辩|干部|学生会|委员|部长|就职|个人介绍|演讲)/i.test(fullContext);
  const isTech = /(?:电池|芯片|算法|技术|软件|架构|新能源|汽车|智能|系统|工程|大模型|代码|算力|制造|硬件)/i.test(fullContext);
  const isBusiness = /(?:战略|商业|市场|营销|出海|业务|盈利|融资|客户|销售|增长|转化|商机)/i.test(fullContext);
  const isSummary = /(?:总结|复盘|年终|季度|成果|工作汇报|回顾|反思)/i.test(fullContext);

  let title = '';
  let subtitle = '';
  let bullets = [];
  let speakerNotes = '';
  let imagePrompt = '';

  if (isElection) {
    if (type === 'cover') {
      title = subject.includes('竞选') || subject.includes('竞聘') || subject.includes('演说') || subject.includes('演讲')
        ? subject
        : `${subject}竞聘演说`;
      subtitle = `${person ? '竞选人：' + person + ' ｜ ' : ''}以服务为宗旨 · 展现责任担当 · 携手共建优秀集体`;
    } else {
      title = `${subject} · 核心竞争优势与施政规划`;
      subtitle = `${person ? '竞选人：' + person + ' ｜ ' : ''}真诚服务同学，务实推动班级进步`;
    }

    bullets = [
      `服务初心：做师生沟通的坚实桥梁纽带，全心全意为班级同学排忧解难`,
      `核心优势：具备良好的团队协作与沟通协调力，处事沉稳，执行力强`,
      `施政愿景：积极建设优良互助学风，丰富集体文体生活，共建标杆班级`
    ];

    imagePrompt = `Minimalist visual matching ${deckStyle?.name}, theme of student leadership, teamwork, positive stage podium`;

  } else if (isTech) {
    if (type === 'cover') {
      title = subject.includes('技术') || subject.includes('解析') || subject.includes('发布') ? subject : `${subject}技术解析与前沿布局`;
      subtitle = `${person ? '主讲人：' + person + ' ｜ ' : ''}突破底层物理与工程极限 · 驱动下一代产业升级`;
    } else {
      title = `${subject} · 核心架构机理与性能实测`;
      subtitle = `高能量密度 · 极致安全冗余 · 严苛工程验证`;
    }

    bullets = [
      `底层突破：创新电化学与结构设计，大幅降低接触内阻并提升能量利用率`,
      `严苛验证：通过全工况极端温变与高倍率循环测试，安全冗余表现优异`,
      `规模量产：打通高精度自动化产线节拍，良品率与制造成本达工业标杆`
    ];

    imagePrompt = `Futuristic high-tech engineering schematic or industrial 3D rendering of ${subject}, matching ${deckStyle?.name}, high aesthetic`;

  } else if (isBusiness) {
    if (type === 'cover') {
      title = subject.includes('战略') || subject.includes('商业') || subject.includes('规划') ? subject : `${subject}战略规划与商业模式`;
      subtitle = `${person ? '汇报人：' + person + ' ｜ ' : ''}抢占核心赛道生态位 · 构建高壁垒增长闭环`;
    } else {
      title = `${subject} · 市场格局与核心破局点`;
      subtitle = `洞察未满足需求，确立不可替代的差异化护城河`;
    }

    bullets = [
      `市场洞察：深度切入高价值细分场景，精准解决目标客户核心未满足痛点`,
      `壁垒构筑：依托产品技术与渠道协同网络，形成高粘性高转换成本壁垒`,
      `商业闭环：打造可持续的自运转商业飞轮，保障规模化与健康盈利平衡`
    ];

    imagePrompt = `Abstract corporate architectural geometric lines, clean business 3D elements, ${deckStyle?.name}, high-end elegance`;

  } else if (isSummary) {
    title = `${subject} · 阶段成果复盘与关键洞察`;
    subtitle = `${person ? '汇报人：' + person + ' ｜ ' : ''}回顾里程碑达成 · 沉淀体系化资产与下一阶段方向`;
    bullets = [
      `目标达成：核心关键里程碑全线保质交付，综合执行达标率符合预期`,
      `能力沉淀：沉淀体系化标准化运作机制，形成可复用、可迁移的赋能模型`,
      `演进方向：明确下一阶段关键攻坚重点，针对短板做专项补齐与突破`
    ];
    imagePrompt = `Minimalist achievement timeline or ascending geometric forms, clean modern layout, high aesthetic`;

  } else {
    // General topic
    if (type === 'cover') {
      title = subject;
      subtitle = `${person ? '主讲人：' + person + ' ｜ ' : ''}全维度深度解析与核心实施路径`;
    } else {
      title = `${subject} · 核心框架与实施路径`;
      subtitle = `明确发展愿景 · 聚焦关键行动抓手`;
    }

    bullets = [
      `目标锚定：厘清核心目标与发展愿景，凝聚统一共识与行动指南`,
      `关键路径：制定清晰可行的时间表与执行步骤，抓实抓牢核心抓手`,
      `协同保障：建立高效联动与长效复盘闭环，确保全周期落地实效`
    ];
    imagePrompt = `Minimalist aesthetic visual matching ${deckStyle?.name}, theme of ${subject}, modern 3D composition`;
  }

  // If user provided their own custom bullets in prompt, prioritize them!
  if (userBullets.length > 0) {
    bullets = userBullets.slice(0, 4).map((b, idx) => {
      if (b.includes('：') || b.includes(':')) return b;
      const dim = b.length <= 5 ? b : b.slice(0, 4);
      return `要点 0${idx + 1}（${dim}）：${b}`;
    });
  }

  const visualSubject = (!userImages || userImages.length === 0)
    ? getSmartVisualSubject(title, type, deckStyle?.name)
    : 'clean minimalist layout matching uploaded image';

  const isCover = slideIndex === 1 || type === 'cover';
  const cleanSubtitle = isCover ? subtitle : '';

  const layoutDesc = getDiverseLayoutDescription(type, slideIndex, visualSubject, deckStyle?.name || '极简');

  const bulletList = bullets.slice(0, 4).map((b, idx) => `  * Point 0${idx + 1}: ${String(b).replace(/^[【\[].+?[】\]][:：]?\s*/, '').slice(0, 45)}`).join('\n');

  const fullSlideImagePrompt = `A finished 16:9 widescreen presentation slide in modern high-end ${deckStyle?.name || 'minimalist'} visual design.
TYPOGRAPHY & CONTENT (RENDER CRISP CHINESE CHARACTERS DIRECTLY ON SLIDE):
- Title: "${title}" in bold clean modern Chinese typography
${cleanSubtitle ? `- Subtitle: "${cleanSubtitle}"` : ''}
${bulletList ? `- Key Content Cards:\n${bulletList}` : ''}
LAYOUT & VISUAL COMPOSITION:
${layoutDesc.promptLayout}
- Design Tone: Executive presentation slide finish, 8k resolution, crisp vector-grade graphic design perfection.`;

  const layoutConcept = layoutDesc.concept;

  return {
    id: Date.now() + Math.random(),
    slideIndex,
    type,
    title,
    subtitle: cleanSubtitle,
    layoutConcept,
    bullets: (type === 'cover' && !wantsCopy && bullets.length === 0) ? [] : bullets.slice(0, 4),
    metrics: type === 'metrics' ? [
      { value: '100%', label: '核心目标完成度' },
      { value: '3.5x', label: '综合效率提升' },
      { value: '98.5%', label: '团队协同满意度' }
    ] : null,
    imageUrl: userImages.length > 0 ? userImages[0] : null,
    userUploaded: userImages.length > 0,
    imagePrompt,
    fullSlideImagePrompt,
    speakerNotes: ''
  };
}

// Serve static frontend if built
const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`SlideFlow server running at http://localhost:${PORT} and http://127.0.0.1:${PORT}`);
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.requestTimeout = 300000;
server.on('clientError', (err, socket) => {
  if (err.code === 'ECONNRESET' || !socket.writable) return;
  socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
});
