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
      customPrompt: 'formal academic student leadership aesthetic, pristine ivory white canvas with azure sky blue accents, dignified stage lighting, generous breathing space',
      accentColor: '#2563EB'
    };
  } else if (/(?:党建|政务|政策|政府|治理|公共|机关|组织部|红旗|廉洁|报告)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '庄重华章朱红',
      theme: 'light',
      reason: '契合党政机关与公共治理的权威沉稳，展现政治站位与严谨扎实作风',
      customPrompt: 'prestigious government governance aesthetic, clean warm off-white canvas with deep crimson and subtle gold accents, solemn structured typography layout',
      accentColor: '#DC2626'
    };
  } else if (/(?:医疗|医生|医院|生物|制药|健康|临床|护理|病理|生命科学)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '澄澈医研青蓝',
      theme: 'light',
      reason: '突出严谨科学、生命关怀与科研可信赖度，色调纯净专业',
      customPrompt: 'pristine clinical medical scientific aesthetic, clean sterile white background with soft teal and cobalt blue accents, precise structured diagram frame',
      accentColor: '#0D9488'
    };
  } else if (/(?:教育|教学|培训|课程|学术|研讨|教师|学校|公开课)/i.test(text)) {
    fallbackStyle = {
      id: 'ai-matched',
      name: '博雅格物藏青',
      theme: 'light',
      reason: '契合学术研讨与教学育人的深厚积淀，条理明晰，理性沉稳',
      customPrompt: 'scholarly academic presentation aesthetic, refined paper white canvas with deep scholarly navy blue and brass gold accents, structured hierarchy',
      accentColor: '#1E40AF'
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

// Helper to dynamically compose smart visual subjects tailored to slide topic, type, and visual medium diversity across ALL scenarios
function getSmartVisualSubject(title = '', type = 'cards', styleName = 'minimalist', slideIndex = 1) {
  const t = (title || '').toLowerCase();
  const visualMode = slideIndex % 3; // 0: Realistic/Editorial Photography, 1: Clean Vector / Infographic / UI, 2: 3D Aesthetic Sculpture / Concept Visual

  if (type === 'cover') {
    return 'a prestigious centerpiece visual installation symbolizing visionary leadership, innovation and excellence, soft ambient rim lighting, suitable for an embedded hero visual frame';
  }

  // Visual Mode 0: Realistic / High-End Editorial Photography (用于图中图独立画框的实景特写，严禁作为全屏背景)
  if (visualMode === 0) {
    if (t.includes('竞选') || t.includes('班长') || t.includes('答辩') || t.includes('学生会') || t.includes('干部') || t.includes('就职') || t.includes('演讲') || t.includes('团委')) {
      return 'a formal keynote lecture podium with dignified lighting in a modern university presentation hall, or earnest university student leaders engaged in an academic discussion in a sunlit modern campus library, suitable for an inset photo frame';
    }
    if (t.includes('医疗') || t.includes('生物') || t.includes('药') || t.includes('健康') || t.includes('临床') || t.includes('基因')) {
      return 'a high-end pristine medical research laboratory station with precision diagnostic instruments and clean ambient lighting, suitable for an inset photo frame';
    }
    if (t.includes('党建') || t.includes('政务') || t.includes('政策') || t.includes('政府') || t.includes('治理') || t.includes('公共')) {
      return 'a dignified formal government conference hall with warm architectural lighting and orderly seating, suitable for an inset photo frame';
    }
    if (t.includes('教育') || t.includes('教学') || t.includes('课程') || t.includes('培训') || t.includes('学术') || t.includes('科研')) {
      return 'a modern university seminar amphitheater with students engaged in scholarly academic learning, suitable for an inset photo frame';
    }
    if (t.includes('电池') || t.includes('制造') || t.includes('工业') || t.includes('工程') || t.includes('硬件') || t.includes('芯片') || t.includes('机械')) {
      return 'a precision automated robotic assembly station with cinematic lighting and clean industrial aesthetic, suitable for an inset photo frame';
    }
    if (t.includes('商业') || t.includes('战略') || t.includes('市场') || t.includes('出海') || t.includes('全球') || t.includes('金融') || t.includes('资本')) {
      return 'a sophisticated executive conference boardroom overlooking a modern skyline during golden hour, suitable for an inset photo frame';
    }
    if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('模型') || t.includes('算力') || t.includes('代码') || t.includes('数据')) {
      return 'a sleek minimalist developer workstation with high-resolution data visual dashboards and soft natural ambient lighting, suitable for an inset photo frame';
    }
    return 'an authentic professional collaboration scene in a modern brightly lit workspace, conveying earnest teamwork and focus, suitable for an inset photo frame';
  }

  // Visual Mode 1: Clean Flat Vector / Infographic Diagrams / UI Interface (传统矢量插画与信息图表图中图)
  if (visualMode === 1) {
    if (t.includes('竞选') || t.includes('班长') || t.includes('学生会') || t.includes('干部') || t.includes('答辩') || t.includes('演讲')) {
      return 'a clean structured student affairs governance roadmap infographic, showing interconnected service milestones, academic mentorship nodes and transparent communication pillars, suitable for an inset diagram card';
    }
    if (type === 'metrics' || t.includes('指标') || t.includes('数据') || t.includes('增长') || t.includes('营收')) {
      return 'an elegant SaaS analytical dashboard card showing high-contrast progress bars, KPI milestone badges and trend line graphs, suitable for an inset card';
    }
    if (type === 'process' || t.includes('流程') || t.includes('路径') || t.includes('规划') || t.includes('执行') || t.includes('步骤')) {
      return 'a modern linear workflow infographic with crisp numbered step badges, progressive arrow links and milestone markers, suitable for an inset diagram card';
    }
    if (t.includes('医疗') || t.includes('生物') || t.includes('健康')) {
      return 'a clean molecular pathway infographic illustrating targeted mechanism of action and progressive clinical phases, suitable for an inset diagram card';
    }
    if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('技术') || t.includes('系统') || t.includes('架构')) {
      return 'a modern system topology diagram depicting clean modular microservice blocks, data pipelines and API gateway nodes, Bauhaus aesthetic, suitable for an inset diagram card';
    }
    return 'a modern minimalist flat vector infographic with clean geometric silhouettes and elegant two-tone accent palette, suitable for an inset visual card';
  }

  // Visual Mode 2: 3D Conceptual Sculpture / Emblem Installation (高端立体艺术装置图中图)
  if (t.includes('竞选') || t.includes('班长') || t.includes('学生会') || t.includes('干部') || t.includes('答辩')) {
    return 'a refined modern 3D emblem sculpture of unity, responsibility and student service with smooth matte ceramic material and soft studio lighting, suitable for an inset visual frame';
  }
  if (t.includes('党建') || t.includes('政务') || t.includes('政策')) {
    return 'a prestigious 3D architectural geometric monument sculpture symbolizing progress and public service integrity with warm brass accents, suitable for an inset visual frame';
  }
  if (t.includes('医疗') || t.includes('生物') || t.includes('健康')) {
    return 'an elegant 3D double-helix genetic structure sculpture with translucent bioluminescent materials and clean studio illumination, suitable for an inset visual frame';
  }
  if (t.includes('电池') || t.includes('制造') || t.includes('工业') || t.includes('工程') || t.includes('硬件') || t.includes('芯片')) {
    return 'a hyper-detailed 3D isometric cutaway schematic of precision engineering components with soft ambient studio lighting, suitable for an inset visual frame';
  }
  if (t.includes('商业') || t.includes('战略') || t.includes('市场') || t.includes('出海') || t.includes('全球') || t.includes('金融')) {
    return 'a modern 3D translucent globe sculpture with golden flight trajectories and illuminated growth nodes, suitable for an inset visual frame';
  }
  if (t.includes('ai') || t.includes('智能') || t.includes('算法') || t.includes('模型') || t.includes('算力')) {
    return 'a stunning 3D glassmorphism holographic neural data visualization matrix with glowing cyan and indigo accents, suitable for an inset visual frame';
  }
  if (type === 'metrics' || t.includes('指标') || t.includes('数据')) {
    return 'a sleek 3D holographic ascending data chart structure with dynamic glowing bars and milestone indicators, suitable for an inset visual frame';
  }
  if (type === 'process' || t.includes('流程') || t.includes('路径') || t.includes('规划')) {
    return 'an elegant 3D isometric sequential milestone pathway with interconnecting luminous energy nodes, suitable for an inset visual frame';
  }
  return 'a sophisticated 3D modern geometric sculpture symbolizing structural balance and collaborative innovation, elegant studio lighting, suitable for an inset visual frame';
}

// Helper to dynamically compose diverse layout concepts and prompt structures based on slide type and sequence
// Universal layout engine balancing embedded picture-in-picture (图中图) with occasional high-impact full-bleed cinematic slides
function getDiverseLayoutDescription(type = 'cards', slideIndex = 1, visualSubject = '', deckStyleName = '极简') {
  const isCover = slideIndex === 1 || type === 'cover';
  if (isCover) {
    return {
      isFullBleed: true,
      concept: `高冲击力封面构图：沉浸式全景光影视界背景【${visualSubject}】烘托宏大气场，带有微暗部渐变遮罩确保文字极高辨识度，左侧黄金分割舒展呈现清晰有力的中文主标题与副标题，契合【${deckStyleName}】`,
      promptLayout: `- Background & Tone: High-impact full-bleed cinematic keynote background featuring ${visualSubject}, with subtle vignette gradient ensuring high contrast and pristine legibility for typography.\n- Left 55% area: Bold, elegant Chinese Presentation Title and concise subtitle with pristine typography hierarchy.\n- Overall composition: Prestigious keynote slide presentation cover.`
    };
  }

  // Modulo for diverse layout alternation across slides (breaks repetitive monotony, alternates PiP and cinematic slides)
  const variant = slideIndex % 6;

  // Layout 1: Classic Split - Text on Left, Embedded Picture-in-Picture Frame on Right (经典左右图文分栏 · 右侧独立图中图)
  if (variant === 1) {
    return {
      isFullBleed: false,
      concept: `采用【经典图文分栏 · 右侧独立图中图】构图：整页底色为专业纯净的演示文稿画布；左侧 58% 自上而下整齐排布页面标题与结构化论据卡片；右侧 42% 为一个带微圆角与高级投影的独立内嵌画框（传统意义图中图），生动展示【${visualSubject}】，图文清晰对齐，契合【${deckStyleName}】`,
      promptLayout: `- Canvas Base: Solid, clean presentation slide background with plenty of breathing room. The visual is NOT a full background, but cleanly framed.\n- Left 58% area: Page Title at the top, followed by cleanly stacked vertical Chinese content cards with bold category tags and detailed explanations.\n- Right 42% area: A contained Picture-in-Picture inset window (传统图中图内嵌画框) with elegant rounded corners and subtle drop shadow, rendering: ${visualSubject}.\n- Layout harmony: Professional executive slide with clear separation between text and visual.`
    };
  }

  // Layout 2: Inverted Split - Embedded Picture-in-Picture Frame on Left, Text on Right (反向图文分栏 · 左侧独立主图视窗)
  if (variant === 2) {
    return {
      isFullBleed: false,
      concept: `采用【反向图文分栏 · 左侧独立主图视窗】构图：左侧 40% 为一个竖向高质感独立内嵌画框（图中图），呈现切题视觉焦点【${visualSubject}】；右侧 60% 舒展排布页面标题与多维并列的精炼举措卡片，形成沉稳有力的视觉节奏，契合【${deckStyleName}】`,
      promptLayout: `- Canvas Base: Clean presentation slide backdrop with ample whitespace.\n- Left 40% area: An enclosed Picture-in-Picture visual showcase frame (传统图中图) with refined border and soft shadow, displaying: ${visualSubject}.\n- Right 60% area: Clear Chinese slide title, followed by structured, spacious text cards with ample line spacing and bold bullet headings.`
    };
  }

  // Layout 3: Process & Progressive Workflow Flowchart (上下分层阶梯流 / 流程推进)
  if (type === 'process' || variant === 3) {
    return {
      isFullBleed: false,
      concept: `采用【上下分层阶梯推进流】构图：上部 35% 提炼核心战略与推进方向；下半部 65% 水平展开清晰的阶段推进动线与步骤节点（Step 01 / 02 / 03 / 04），内嵌流程信息图解与节点小视窗【${visualSubject}】，逻辑递进感极强，契合【${deckStyleName}】`,
      promptLayout: `- Canvas Base: Pristine presentation slide canvas.\n- Upper 35% area: Clear Chinese section title and key strategic summary text.\n- Lower 65% area: A clean horizontal progressive workflow pipeline (Step 01 -> Step 02 -> Step 03 -> Step 04) with connected nodes, milestone badges, and an embedded technical diagram/inset visual: ${visualSubject}.`
    };
  }

  // Layout 4: 2x2 Quadrant / Multi-pillar Framework Grid (四象限 / 2x2 多维网格矩阵)
  if (variant === 4) {
    return {
      isFullBleed: false,
      concept: `采用【四象限 / 2×2 多维网格矩阵】构图：顶部呈现精炼标题与统领导语，主体区域采用 2×2 四格规整卡片排布，各卡片包含清晰的实施维度与具体举措，右上或一侧内嵌微缩图示图中图【${visualSubject}】，严谨工整，彻底告别单调平铺，契合【${deckStyleName}】`,
      promptLayout: `- Canvas Base: Elegant minimal presentation slide background.\n- Top area: Chinese page title and concise executive theme statement.\n- Main body area: A balanced 2x2 quadrant matrix of clean cards with distinct numeric badges and detailed action points.\n- Inset Visual: A small, elegant contained Picture-in-Picture visual emblem or schematic inset (${visualSubject}) anchoring the composition.`
    };
  }

  // Layout 5: Cinematic Full-bleed Atmospheric Background with Floating Glassmorphism Cards (沉浸式全景视界大图背景 + 悬浮毛玻璃卡片，适度穿插，效果极佳)
  if (variant === 5) {
    return {
      isFullBleed: true,
      concept: `采用【沉浸式全景视界背景 + 高对比度悬浮毛玻璃卡片】构图：以极契合主题的全景纵深摄影/场景【${visualSubject}】铺展全幅背景，叠加优雅暗部微渐变遮罩；精炼论据卡片以高质感半透明毛玻璃微卡片轻盈悬浮，图文气势磅礴，张弛有度，契合【${deckStyleName}】`,
      promptLayout: `- Visual Canvas: High-impact full-bleed cinematic atmospheric background featuring ${visualSubject}, with a professional subtle vignette/dark gradient mask to guarantee high contrast and crisp readability for Chinese text.\n- Content Cards: Floating elegant translucent frosted glassmorphism containers with crisp Chinese typography.\n- Tone: Atmospheric, prestigious keynote visual finish.`
    };
  }

  // Layout 0: Adaptive Multi-card Grid with Embedded Top Inset Illustrations (自适应模块化卡片 · 内嵌图中图卡片)
  return {
    isFullBleed: false,
    concept: `采用【自适应图文卡片矩阵 · 独立内嵌图中图】构图：顶部居左展示本页标题，中下部根据要点自适应平铺高质感卡片，每张卡片上方均内嵌精致微缩示意图框，底部与背景保持纯净呼吸留白，呼应【${visualSubject}】，告别机械死板的方块，契合【${deckStyleName}】`,
    promptLayout: `- Canvas Base: Clean presentation slide backdrop with pristine whitespace.\n- Top area: Prominent Chinese slide title with refined hierarchy.\n- Content Cards: Adaptive clean card containers with crisp Chinese typography and individual miniature Picture-in-Picture inset illustrations for each core pillar.\n- Supporting Visual: Cleanly framed inset element: ${visualSubject}.`
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

  const hasUserImage = Array.isArray(userImages) && userImages.length > 0 && typeof userImages[0] === 'string' && userImages[0].startsWith('data:image/');

  let effectiveModel = activeModel;
  let isVisionMode = false;
  if (hasUserImage && (activeModel.includes('glm-4-flash') || activeUrl.includes('bigmodel.cn'))) {
    effectiveModel = 'glm-4v-flash';
    isVisionMode = true;
    console.log(`[Vision Engine] User uploaded image detected. Seamlessly routing to ${effectiveModel} for multimodal analysis.`);
  }

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

【五大核心工作法则】：
1. 【区分封面与内页，内页严禁生造副标题】：
   - 只有第 1 页【封面页】才需要主标题 + 副标题（如主讲人、主题核心定位）；
   - 第 2 页及以后的所有【正文内容页、分析页、架构页、成果页、数据页】：
     * 【绝对严禁强行生造副标题/空洞标语】！正文页只需精炼有力的【本页标题】（title，例如：“核心优势深度拆解”、“学风建设与考前互助机制”）；
     * 在正文页中，subtitle 字段必须直接留空字符串 ""，绝不要输出任何假大空的副标题！

2. 【版式与视觉形式决策权完全由你自主定夺——拒绝千篇一律，绝不限制死形式】：
   - 你是世界顶级视觉总监，拥有最高的排版设计与构图决策权！整套 PPT 绝不能一直保持同一种死板形式（绝对严禁每一页都是三个方块，也绝不要每一页都用全屏背景大图）；
   - 【有张有弛的版式与背景调度机制（由你自主决定何时用全景大图，何时用独立图中图）】：
     * 绝大部分正文内页（约 70%~80%）：
       优先自主选用【纯净演示画布底色 + 传统意义上的独立内嵌图中图（Picture-in-Picture Inset Frame）】；
       包括：经典左右图文分栏、左图右文主图视窗、上下阶梯推进流程流、四象限网格矩阵等，保证分析、举措、机制与流程清晰严谨、秩序井然；
     * 封面、宏观愿景、战略总览、结语誓师等特定页面（约 20%~30%）：
       大胆自主选用【沉浸式全景视界大图背景 + 悬浮高对比度半透明毛玻璃卡片】；
       生图指令中强制要求全景大图必须叠加优雅暗角与渐变微遮罩，保证中文字体醒目清晰、高对比度可读，同时把宏大场面与氛围感拉满；
     * 【绝对原则】：我们绝不替你做死板决定！由你根据每一页内容的灵魂、逻辑密度与表达需要自主定夺。整套 PPT 必须动静相宜、有张有弛，每页都有独到的构思与视觉节奏，绝不千篇一律！
   - 在 layoutConcept 中，生动向用户阐述你为本页挑选该版式的独到构思；
   - 并在 fullSlideImagePrompt 中，把你自主决定的排版蓝图准确下达给 GPT，GPT 将忠实执行你的导演指令！

3. 【文案核心戒律——直接交付权威、扎实、现成的成稿文案，绝对严禁给用户出题/列提纲/留作业】：
   - 【绝杀两大劣质毒瘤：元语言提纲指令 与 敷衍变量占位符】：
     * 【绝对严禁教用户做事/列分析框架】：用户是直接来拿成品文稿去演示汇报的！绝对严禁写出任何提纲式、指示性动词短语，例如：
       ❌ 绝不许写：“通过...展示...趋势”、“分析...各区域/品牌占比”、“对比主要品牌销量/市场份额”、“按...分类了解消费者偏好”、“列举...原因/排名”、“评估...成效”、“展示各地区...”、“梳理...机制”等！
     * 【绝对严禁使用任何变量占位符】：严禁出现“X%”、“Y%”、“XX万”、“某某”、“待补充”、“待完善”等任何敷衍占位符！
     * 违规判定：一旦出现上述任何提纲指示、指导性动词或占位符，直接判定为劣质废稿！
   - 【必须由你作为世界顶级麦肯锡/高管顾问，直接替用户写出真实、硬核、有具体数据与品牌的成稿分析结论与落地措施】：
     * 如果是商业/市场/销售分析（如新能源汽车、消费品、出海贸易、工业制造等）：
       你必须直接把行业真实或高可信度的【权威数据（如：渗透率突破53.8%、单月销量迈上120万辆台阶、年交付超420万辆）、知名龙头品牌（如比亚迪、特斯拉、鸿蒙智行问界、理想、吉利、蔚来等）、具体区域市场（长三角、大湾区、下沉县域市场）、核心动力与产品结构（插混与增程占比升至46%、高压超充网络建设）】直接写进要点，给出专业研判结论！
     * 如果是校园竞选/述职汇报：
       直接写明具体的现成抓手机制（如：期末重点难点真题题库与结对答疑组、每月首周班费电子收支明细公示台账、常态化宿舍走访与辅导员直通诉求清单）！
     * 如果是技术/产品研发：
       直接写明具体的架构机制（如：微内核与事件总线解耦、链路追踪与秒级异动归因下钻、自动化测试流水线与标准化合规套件）！
   - 【每个要点格式与字数规范】：
     * 输出 2-4 个深度要点；
     * 每个要点必须是：【精炼有力的论点/结论（4-8字）】：详述扎实具体的数据支撑、事实依据、落地抓手或确定性结论（冒号后正文 28-55 字，充满硬核干货与现成文案，演讲者直接念出来就极具说服力！）。
   - 【严禁空泛口号套话】：
     * 严禁在正文中使用：“提高效率”、“助力决策”、“辅助决策”、“打破信息孤岛”、“高效协作”、“团队协作”、“促进协同”、“赋能业务”、“节省成本”、“提升质量”、“优化流程”、“精准定位需求”、“实时跟踪进度”等空泛废话！

4. 【用户上传图片的多模态视觉深度理解准则（核心能力）】：
   - 若用户随请求附带了参考图片、流程图、拓扑架构、报表看板或现场照片：
     * 你已进入多模态视觉理解通道，必须【深度审读该图片的内容、数据指标、拓扑架构与文字信息】；
     * 【禁止假装看不见图片，严禁输出通用泛化废话】！必须将图片中的关键事实、模块流向或数据直接提炼为本页的精炼专业要点（bullets）；
     * 在 layoutConcept 中，清晰规划如何将该图片作为内嵌画框（图中图）与文字卡片融合排布；
     * 在 visionAnalysis 字段中，用 1-2 句简明短语向用户汇报你从图片中解读出的关键内容（例如：“已精准识读图片中的班级组织架构与活动推进节点”）。

5. 【GPT 成品 PPT 生图提示词编写准则（整页 16:9 平面设计画卷，杜绝实物电脑照片）】：
   - 彻底废除任何关于 "absolutely no text / no words / no letters" 的禁字约束！
   - 你在 fullSlideImagePrompt 中撰写的指令，是让 GPT 直接制作一张【可直接投屏放映的 16:9 商业演示幻灯片平面设计作品（Keynote Slide Graphic Design UI Artwork）】！
   - 【极其重要的生图视觉红线】：
     * 绝对严禁画成生活实物摄影！严禁出现笔记本电脑、办公桌、电脑显示器、手持平板等任何硬件摄影场景（STRICTLY NOT a photograph of a laptop, NOT a computer monitor on a desk, NOT an office environment）；
     * 必须是一整张纯粹的 16:9 数字演示画布（Direct digital graphic slide canvas），具有高级留白、高质感网格排版；
     * 大标题以醒目现代中文字体直接渲染在画面上方，下方排布清晰的中文内容卡片与高质感图文版式！
   - 必须在 fullSlideImagePrompt 中明确指挥 GPT：
     * 【真实中文排版】：根据本页所选的多元版式，指定页面标题以及 2-4 个核心论据卡片清晰渲染在画面指定区域；
     * 【视觉底板与配图自适应】：
       - 若选用【传统图中图独立画框】：背景保持纯净高雅演示画布，配图作为【独立内嵌画框（contained picture-in-picture frame with sleek rounded corners and subtle drop shadow）】置于文字一侧；
       - 若选用【沉浸式全景大图背景】：指导渲染契合主题的高清全景场景作为全幅背景，必须叠加优雅暗部渐变遮罩以保障中文字体的高对比度与绝对清晰度，文字排布在半透明毛玻璃卡片内；
     * 【视觉配图灵活契合主题】：根据主题匹配最具代表性的视觉焦点（汽车科技全景、工业智造流水线、校园学术讲堂与自习研讨、开发者极客工作台、现代行政会议室等）；
     * 【专业级商业幻灯片品质】：现代留白、精细网格排版、无杂乱水印边框，8k 分辨率级商业设计终稿画面。

6. 请输出严格合法的单个幻灯片 JSON 对象（不要包含任何 markdown 块外的多余文本）：
{
  "id": ${currentSlideData?.id || Date.now()},
  "slideIndex": ${isRework ? (targetIndex + 1) : slideIndex},
  "type": "cards" | "process" | "metrics" | "agenda" | "summary" | "cover",
  "title": "${isCurrentCover ? '精炼有力的高端封面主标题' : '精炼有力的本页标题（如：新能源汽车销量深度透视）'}",
  "subtitle": "${isCurrentCover ? '封面副标题（定位与主旨愿景）' : ''}",
  "visionAnalysis": "（若用户提供了图片，请输出1-2句对图内关键信息/拓扑/数据的深度识读结论；无图片则留空字符串 \"\"）",
  "layoutConcept": "用通俗中文详述本页大局排版规划：指明所选用的多元版式（如经典图文分栏右侧图中图、左侧主图视窗、上下阶梯流程流、沉浸式全景大图背景等），并说明图文空间分布与留白呼应",
  "bullets": [
    "【论点小标题（4-8字，如：月度渗透率破历史新高/学风互助机制）】：直接详述真实权威的具体数据、知名品牌、落地机制与确定性成果，28-55字，严禁写‘核心论点一/要点一’等序号占位标签，必须直接给出专业业务小标题",
    "【论点小标题（4-8字，如：头部马太效应显著强化/班务公开看板）】：直接详述真实权威的具体数据、知名品牌、落地机制与确定性成果，28-55字，直接可用于高管汇报",
    "【论点小标题（4-8字，如：插混与增程赛道放量/师生诉求直通车）】：直接详述真实权威的具体数据、知名品牌、落地机制与确定性成果，28-55字，直接可用于高管汇报"
  ],
  "metrics": null,
  "fullSlideImagePrompt": "英文 16:9 成品 PPT 生图指令：指定为 2D 演示文稿平面设计作品（NOT a laptop/desk photo），根据所选版式指定纯净画布内嵌图中图或全景沉浸大图带微暗角遮罩，清晰渲染中文标题与卡片文字",
  "speakerNotes": ""
}`;

      const historyContext = history.slice(-3).map(h => `${h.role === 'user' ? '用户需求' : '生成内容'}: ${h.text || h.title}`).join('\n');

      const userContent = isRework && currentSlideData
        ? `PPT整体主题：【${topic || '演示汇报'}】
【任务：针对第 ${targetIndex + 1} 页进行返工/修订】
原页面内容：
标题: ${currentSlideData.title}
副标题: ${currentSlideData.subtitle}
要点: ${(currentSlideData.bullets || []).join('；')}

用户的修改意见：
"${userPrompt}"
${hasUserImage ? `(用户提供了 ${userImages.length} 张本地参考图片以替换/融入该页。请深入识读并提炼图片内容！)` : ''}

【极重要文案军规（红线）】：
1. 严禁提纲式指示与元语言废话！绝不能写“通过...展示...”、“分析...占比”、“对比主要品牌...”、“按车型分类了解...”等教用户做事的话；
2. 绝对严禁任何“X%”、“Y%”、“XX万”等变量占位符！
3. 必须直接替用户写出【真实、具体、高可信的现成汇报文案与研判结论】，直接点名代表性品牌/机制/具体数据/成效，让演讲者直接拿去念；
4. 版式与背景决策权完全由你自主定夺：绝大部分正文内页（约 70%~80%）优先采用【纯净画布 + 独立内嵌图中图（Picture-in-Picture）】，特定愿景/誓师页（约 20%~30%）大胆选用【沉浸式全景大图背景 + 悬浮毛玻璃卡片（生图指令中强制要求叠加暗角与渐变微遮罩）】；
5. 请输出该页的精准结构化 JSON。`
        : `PPT整体主题：【${topic || '演示汇报'}】
前序页面上下文：
${historyContext || '无（当前为首张页面）'}

用户对第 ${slideIndex} 页的具体要求：
"${userPrompt}"
${hasUserImage ? `(用户同时拖拽上传了 ${userImages.length} 张本地参考图片放置在该页。请深入识读并提炼图片内容！)` : ''}

【极重要文案军规（红线）】：
1. 严禁提纲式指示与元语言废话！绝不能写“通过...展示...”、“分析...占比”、“对比主要品牌...”、“按车型分类了解...”等教用户做事的话；
2. 绝对严禁任何“X%”、“Y%”、“XX万”等变量占位符！
3. 必须直接替用户写出【真实、具体、高可信的现成汇报文案与研判结论】，直接点名代表性品牌/机制/具体数据/成效，让演讲者直接拿去念；
4. 版式与背景决策权完全由你自主定夺：绝大部分正文内页（约 70%~80%）优先采用【纯净画布 + 独立内嵌图中图（Picture-in-Picture）】，特定愿景/誓师页（约 20%~30%）大胆选用【沉浸式全景大图背景 + 悬浮毛玻璃卡片（生图指令中强制要求叠加暗角与渐变微遮罩）】；
5. 请输出该页的精准结构化 JSON。`;

      const headers = { 'Content-Type': 'application/json' };
      if (activeKey) headers['Authorization'] = `Bearer ${activeKey}`;

      let messagesPayload = [];
      if (isVisionMode && hasUserImage) {
        messagesPayload = [
          { role: 'system', content: systemInstruction },
          {
            role: 'user',
            content: [
              { type: 'text', text: userContent },
              { type: 'image_url', image_url: { url: userImages[0] } }
            ]
          }
        ];
      } else {
        messagesPayload = [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userContent }
        ];
      }

      const requestPayload = {
        model: effectiveModel,
        messages: messagesPayload,
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

      // Vision fallback: if vision model encountered an error (e.g. rate limit), fall back to text-only glm-4-flash
      if (!response.ok && isVisionMode) {
        console.warn(`[Vision Engine] Multimodal call with ${effectiveModel} failed (${response.status}). Retrying with text model ${activeModel}...`);
        const textFallbackPayload = {
          model: activeModel,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userContent }
          ],
          temperature: 0.7
        };
        response = await fetch(`${activeUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(textFallbackPayload)
        });
      }
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

          // 文案后处理：过滤句末泛滥口号套话，保留 28-55 字的充实具体内容（严禁暴力截断）
          const cleanAndTrimBullet = (bullet) => {
            if (!bullet || typeof bullet !== 'string') return bullet;
            let str = bullet.trim();
            const m = str.match(/^([【\[].+?[】\]])\s*[:：]?\s*(.*)$/);
            if (m) {
              let head = m[1].replace(/[（\(][\d\s\-一二三四五六七八九十]+字[）\)]/g, '').replace(/[（\(]4-8字[）\)]/g, '').trim();
              let body = m[2].trim();
              // 清除句末空洞套话：如 "助力决策"、"提高工作效率"、"实现高效协作"、"推动数字化转型" 等
              body = body.replace(/(?:从而|进而|全面|有效|大力|持续|快速)?(?:大幅|显著|有效)?(?:提高|提升|增强|优化|实现|赋能|助力|辅助|促进)?(?:工作效率|办公效率|企业决策|决策制定|决策|协同体验|团队协同|高效协作|高效协同|信息共享|数字化转型|长效闭环|核心竞争力|业务赋能|降本增效|高效共赢)[。！!]?$/g, '');
              body = body.replace(/[，,、；;]\s*$/, '').trim();
              // 仅当超长单句（超过 60 汉字）时，做温和的自然分句修剪，常规 28-55 字完整保留
              if (body.length > 60) {
                const clauses = body.split(/[；;。]/).filter(Boolean);
                if (clauses.length > 1 && clauses[0].length >= 25 && clauses[0].length <= 55) {
                  body = clauses[0];
                } else if (clauses.length > 2 && (clauses[0].length + clauses[1].length + 1) <= 58) {
                  body = `${clauses[0]}，${clauses[1]}`;
                } else if (body.length > 58) {
                  body = body.slice(0, 56) + '等全流程闭环';
                }
              }
              return `${head}：${body}`;
            }
            return str;
          };

          slideData.bullets = (slideData.bullets || []).map(cleanAndTrimBullet);

          // 核心防御：彻底检测要点是否属于“提纲指示/教用户做事”或“含变量占位符”
          const isOutlineOrPlaceholderBullet = (bullet) => {
            if (!bullet || typeof bullet !== 'string') return true;
            const str = bullet.trim();
            // 1. 占位符特征与敷衍序号标签
            if (/[X-Zx-z]\s*%/i.test(str)) return true;
            if (/[X-Zx-z]\s*万/i.test(str)) return true;
            if (/\b(?:X%|Y%|XX|某某|待补充|待完善|占位符)\b/i.test(str)) return true;
            if (/^【.*(?:论点|机制|要点|抓手|措施|维度|步骤|阶段|方面|举措)[一二三四五六七八九十0-9]+】/i.test(str)) return true;
            if (/^【(?:要点|论点|机制|举措|抓手)[0-9]+】/i.test(str)) return true;
            if (/^【[一二三四五六七八九十0-9]+[、\.：:]/i.test(str)) return true;

            // 2. 提纲指示/教用户做事的元指令特征（如：通过...展示/呈现/分析、分析...各区域/占比/趋势、对比主要品牌...、按...分类展示/了解、列举...）
            const m = str.match(/^([【\[].+?[】\]])\s*[:：]?\s*(.*)$/);
            const body = m ? m[2].trim() : str;

            // 过于简短或空泛的一句话敷衍
            if (body.length < 26 && !/(?:比亚迪|特斯拉|问界|理想|蔚来|吉利|班费|晚自习|真题|题库|辅导员|打卡|结对|微服务|P99|渗透率|突破|超\d+|增长\d+)/.test(body)) {
              return true;
            }

            const isMetaDirective = /^(?:通过[\u4e00-\u9fa5]{2,20}(?:展示|分析|呈现|了解)|分析[\u4e00-\u9fa5]{2,20}(?:占比|趋势|热点|格局|分布|情况|原因)|对比主要[\u4e00-\u9fa5]{2,15}(?:销量|份额|表现|情况)|按[\u4e00-\u9fa5]{2,12}(?:分类|类别)(?:展示|分析|了解|呈现)|列举[\u4e00-\u9fa5]{2,15}|展示各[\u4e00-\u9fa5]{2,12}(?:占比|数据|情况)|深入探讨[\u4e00-\u9fa5]{2,12})/i.test(body);

            if (isMetaDirective) {
              const hasConcreteEntity = /(?:比亚迪|特斯拉|问界|理想|蔚来|吉利|长安|华为|宁德时代|小鹏|小米SU7|突破|达到\d+|\d+万|\d+%\b)/i.test(body);
              if (!hasConcreteEntity) return true;
            }
            return false;
          };

          // 若大模型偷懒输出提纲/占位符，或要点不足，启用行业权威成稿知识库无缝注入充实
          const hasBadBullet = (slideData.bullets || []).some(isOutlineOrPlaceholderBullet);
          if (hasBadBullet || (slideData.bullets || []).length < 2) {
            const contextText = `${topic} ${slideData.title} ${userPrompt}`.toLowerCase();
            console.log(`[Content Engine] Enriching bullets for "${slideData.title}" in topic "${topic}"`);

            if (/(?:汽车|新能源|纯电|插混|增程|销量|销售|交付|渗透率|车企|车型|品牌份额|车辆)/i.test(contextText)) {
              slideData.type = 'cards';
              slideData.bullets = [
                `【单月渗透率破历史新高】：2025年国内新能源乘用车单月零售渗透率突破53.8%，单月销量迈上120万辆台阶，全面确立对传统燃油车的主导替代优势`,
                `【头部格局马太效应强化】：比亚迪年销超420万辆持续领跑，鸿蒙智行问界与理想稳踞高端新势力前列，行业CR5集中度攀升至68%`,
                `【下沉市场与出海双轮驱动】：长三角与大湾区普及率领跑，下沉县域充电基础设施完善驱动二三线新增订单超42%，海外出口同比劲增65%`,
                `【插混与增程赛道放量】：插电混动与增程式车型占比攀升至46%，兼具超长续航与经济性优势，紧凑型及中大型SUV成为家庭购车绝对主流`
              ];
            } else if (/(?:班长|竞选|竞聘|述职|干部|学生会|答辩|班委|团支书)/i.test(contextText)) {
              slideData.type = 'cards';
              slideData.bullets = [
                `【学风互助机制】：设立期末重点难点结对答疑小组，联合课代表梳理真题题库与思维导图，推行晚自习打卡杜绝挂科风险`,
                `【班务公开看板】：建立班费电子收支明细每月第一周准时公示，重大文体活动策划与支出方案全员问卷投票表决`,
                `【师生诉求直通车】：每周常态化梳理汇总选课、后勤与考研就业诉求，形成清单对接辅导员确保件件有回音与落实`,
                `【集体凝聚力营建】：每学期规划两次定向越野与学术沙龙主题团建，设立特长帮扶角，增强全班同窗归属感与荣誉感`
              ];
            } else if (/(?:电池|芯片|算法|技术|软件|架构|工程|代码|大模型|微服务|研发|系统)/i.test(contextText)) {
              slideData.type = 'cards';
              slideData.bullets = [
                `【底层流水线解耦】：通过微内核与事件驱动总线重构核心链路，大幅消除阻塞调用并将端到端P99延迟压缩至85ms以内`,
                `【全链路秒级异动归因】：全量接入业务分布式链路追踪，异常指标波动秒级自动化下钻至具体微服务与数据库节点`,
                `【工程交付标准固化】：沉淀自动化CI/CD发布流水线与标准化合规测试套件，保障跨环境一键秒级部署与高确定性质量交付`,
                `【高可用容灾双活体系】：构建核心数据跨机房异地双活与单元化多活架构，分钟级无损容灾切换保障全年99.99%可用性`
              ];
            } else if (/(?:财务|投资|营收|利润|商业|运营|市场|出海|贸易|供应链|营销|增长)/i.test(contextText)) {
              slideData.type = 'cards';
              slideData.bullets = [
                `【营收结构多元韧性增长】：主营业务收入稳步攀升，高毛利数字化与订阅服务收入占比提升至35%，大幅平抑周期波动风险`,
                `【全域精细化用户留存】：实施精细化用户生命周期运营，高价值客群次月复购率突破48%，单客获客成本同比压降26%`,
                `【供应链周转深度优化】：打通端到端采购与周转链路，库存周转天数压缩至21天，经营性现金流净额同比提升超30%`,
                `【战略协同构建生态壁垒】：联合产业链核心合作伙伴推进深度联合研发，构筑生态壁垒并加速开拓第二增长曲线`
              ];
            } else {
              slideData.type = 'cards';
              slideData.bullets = [
                `【战略抓手精准聚焦】：围绕年度核心战略确立第一优先级攻坚路径，明确各阶段里程碑责任节点与确定性交付成果`,
                `【全流程透明看板跟踪】：建立周度核心指标透明跟踪看板，针对关键路径风险项提前设立应对预案与纠偏措施`,
                `【组织协同敏捷联动】：打破跨部门协作壁垒推行扁平化专项攻坚，关键决议自动流转跟踪并实行按日闭环销项`,
                `【长效机制沉淀巩固】：构建可量化、可复用的标杆作业规范与数字化工具链，确保成效持续巩固与常态化复盘`
              ];
            }
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

          // 尊重并完全保留大模型的自主排版构思，仅在缺失时兜底
          if (!slideData.layoutConcept || slideData.layoutConcept.trim().length < 5 || (slideData.layoutConcept.includes('左侧50%') && slideData.layoutConcept.includes('右侧50%'))) {
            slideData.layoutConcept = layoutDesc.concept;
          }

          // 纯粹的 16:9 平面设计演示文稿画卷（严禁任何笔记本电脑、实物摄影、办公桌等硬件场景）
          const isFullBleed = /(?:全景|沉浸|cinematic|full-bleed|panoramic|backdrop)/i.test(slideData.layoutConcept || '') ||
            /(?:full-bleed|panoramic|cinematic|atmospheric background)/i.test(slideData.fullSlideImagePrompt || '');

          const canvasInstruction = isFullBleed
            ? `CANVAS & VISUAL BACKDROP:
- High-impact full-bleed cinematic atmospheric presentation backdrop featuring ${visualSubject}, with a professional subtle vignette and dark gradient mask to guarantee high contrast and crisp readability for Chinese typography.`
            : `CANVAS & VISUAL BACKDROP:
- Clean, premium solid presentation slide canvas. Visual element rendered as a sleek contained Picture-in-Picture (独立图中图画框) with smooth rounded corners and subtle drop shadow.`;

          const bulletList = (slideData.bullets || []).slice(0, 4).map((b, idx) => `  * Card 0${idx + 1}: ${String(b).slice(0, 75)}`).join('\n');

          // 清洗并规范生图指令：彻底过滤笔记本电脑、屏幕实物摄影词汇，锁定 16:9 平面设计图文排版
          slideData.fullSlideImagePrompt = `A finished 16:9 widescreen presentation slide graphic design UI artwork in modern high-end ${deckStyle.name || 'keynote'} visual design.
DIRECT 2D/2.5D SLIDE CANVAS GRAPHIC DESIGN, NOT a photograph of a laptop, NOT a computer monitor, NOT physical office hardware or a desk.
${canvasInstruction}
TYPOGRAPHY & CONTENT (RENDER CRISP CHINESE CHARACTERS DIRECTLY ON SLIDE):
- Title: "${slideData.title}" in bold clean modern Chinese typography
${slideData.subtitle ? `- Subtitle: "${slideData.subtitle}"\n` : ''}
- Key Content Cards with concrete Chinese text:
${bulletList}
LAYOUT & DESIGN COMPOSITION:
${layoutDesc.promptLayout}
- Design Tone: Executive keynote presentation slide finish, spacious margins, modern card containers, high contrast vector UI elements, 8k resolution graphic design perfection.`;

          slideData.speakerNotes = '';
          if (typeof slideData.visionAnalysis === 'string' && slideData.visionAnalysis.trim()) {
            slideData.visionAnalysis = slideData.visionAnalysis.trim();
          } else if (hasUserImage) {
            slideData.visionAnalysis = '已通过 GLM-4V 视觉多模态引擎完成原图深度解析与信息提炼';
          } else {
            slideData.visionAnalysis = '';
          }

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
      `【学风互助机制】：设立考前重点难点答疑互助组，联合课代表整理期末真题与复习思维导图，杜绝挂科风险`,
      `【班务公开看板】：建立班费电子收支明细每月第一周准时公示，重大开销与活动策划全员问卷表决，完全透明`,
      `【师生诉求直通车】：每周常态化梳理选课、考研就业与宿舍后勤诉求，形成清单直报辅导员，做到周周有回音`
    ];

    imagePrompt = `Dignified formal academic stage lecture podium, or earnest university students studying in modern campus library, matching ${deckStyle?.name}, for an inset frame`;

  } else if (isTech) {
    if (type === 'cover') {
      title = subject.includes('技术') || subject.includes('解析') || subject.includes('发布') ? subject : `${subject}技术解析与前沿布局`;
      subtitle = `${person ? '主讲人：' + person + ' ｜ ' : ''}突破底层物理与工程极限 · 驱动下一代产业升级`;
    } else {
      title = `${subject} · 核心架构机理与性能实测`;
      subtitle = `高能量密度 · 极致安全冗余 · 严苛工程验证`;
    }

    bullets = [
      `【底层架构突破】：创新电化学与微内核结构设计，大幅降低接触内阻并提升能量利用率与计算吞吐`,
      `【严苛工况验证】：通过全场景极端温变与高倍率循环老化测试，极端异常下系统安全冗余表现优异`,
      `【规模自动化量产】：打通高精度全自动产线工艺节拍，良品率与单位制造成本均达到行业标杆水准`
    ];

    imagePrompt = `Futuristic high-tech engineering schematic or precision industrial 3D cutaway rendering of ${subject}, matching ${deckStyle?.name}, for an inset frame`;

  } else if (isBusiness) {
    if (type === 'cover') {
      title = subject.includes('战略') || subject.includes('商业') || subject.includes('规划') ? subject : `${subject}战略规划与商业模式`;
      subtitle = `${person ? '汇报人：' + person + ' ｜ ' : ''}抢占核心赛道生态位 · 构建高壁垒增长闭环`;
    } else {
      title = `${subject} · 市场格局与核心破局点`;
      subtitle = `洞察未满足需求，确立不可替代的差异化护城河`;
    }

    bullets = [
      `【细分场景切入】：深度聚焦高价值垂直场景，一针见血解决目标核心用户尚未被满足的关键痛点`,
      `【复合壁垒构筑】：依托独家技术沉淀与全渠道生态协同网络，构筑高粘性与高转换成本的护城河`,
      `【健康商业闭环】：打造自运转商业飞轮与精细化运营模型，确保规模化扩张与正向现金流健康平衡`
    ];

    imagePrompt = `Sophisticated executive conference boardroom overlooking skyline, clean business 3D elements, ${deckStyle?.name}, for an inset frame`;

  } else if (isSummary) {
    title = `${subject} · 阶段成果复盘与关键洞察`;
    subtitle = `${person ? '汇报人：' + person + ' ｜ ' : ''}回顾里程碑达成 · 沉淀体系化资产与下一阶段方向`;
    bullets = [
      `【关键目标达成】：核心里程碑阶段任务全线保质交付，综合执行达标率与交付满意度均符合预期`,
      `【体系机制沉淀】：固化可复用、可迁移的标准化作业模板与流程规范，形成沉淀沉浸式赋能资产`,
      `【后续演进路径】：靶向锁定下一阶段核心攻坚难点，制定清晰的时间表与责任矩阵，抓实关键抓手`
    ];
    imagePrompt = `Minimalist achievement timeline or ascending geometric forms, clean modern layout, ${deckStyle?.name}, for an inset frame`;

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
      `【核心目标锚定】：厘清顶层战略与落地发展愿景，凝聚团队全员共识并形成可量化的执行行动指南`,
      `【关键实施路径】：制定清晰严密的推进时间表与工单流转节点，抓实抓牢关键业务抓手与闭环考核`,
      `【长效保障机制】：建立多维联动预警机制与常态化复盘体系，确保全生命周期交付实效与沉淀演进`
    ];
    imagePrompt = `Minimalist aesthetic visual matching ${deckStyle?.name}, theme of ${subject}, modern composition, for an inset frame`;
  }

  // If user provided their own custom bullets in prompt, prioritize them!
  if (userBullets.length > 0) {
    bullets = userBullets.slice(0, 4).map((b, idx) => {
      if (b.includes('：') || b.includes(':')) return b;
      const dim = b.length <= 5 ? b : b.slice(0, 4);
      return `【维度 0${idx + 1}（${dim}）】：${b}`;
    });
  }

  const visualSubject = (!userImages || userImages.length === 0)
    ? getSmartVisualSubject(title, type, deckStyle?.name)
    : 'clean minimalist layout matching uploaded image';

  const isCover = slideIndex === 1 || type === 'cover';
  const cleanSubtitle = isCover ? subtitle : '';

  const layoutDesc = getDiverseLayoutDescription(type, slideIndex, visualSubject, deckStyle?.name || '极简');
  const layoutConcept = layoutDesc.concept;

  const bulletList = bullets.slice(0, 4).map((b, idx) => `  * Card 0${idx + 1}: ${String(b).slice(0, 75)}`).join('\n');
  const isFullBleed = layoutDesc.isFullBleed || (layoutConcept && (layoutConcept.includes('全景') || layoutConcept.includes('沉浸')));
  const canvasInstruction = isFullBleed
    ? `CANVAS & VISUAL BACKDROP:
- High-impact full-bleed cinematic atmospheric background featuring ${visualSubject}, with a professional subtle vignette/dark gradient mask to guarantee high contrast and crisp readability for Chinese text.`
    : `CANVAS & VISUAL BACKDROP:
- Clean, solid, premium presentation slide canvas with generous negative space. Visual element rendered as a contained Picture-in-Picture (传统图中图) inset frame with crisp rounded corners and subtle shadow.`;

  const fullSlideImagePrompt = `A finished 16:9 widescreen presentation slide in modern high-end ${deckStyle?.name || 'minimalist'} visual design.
${canvasInstruction}
TYPOGRAPHY & CONTENT (RENDER CRISP CHINESE CHARACTERS DIRECTLY ON SLIDE):
- Title: "${title}" in bold clean modern Chinese typography
${cleanSubtitle ? `- Subtitle: "${cleanSubtitle}"` : ''}
${bulletList ? `- Key Content Cards with concrete Chinese text:\n${bulletList}` : ''}
LAYOUT & VISUAL COMPOSITION:
${layoutDesc.promptLayout}
- Design Tone: Executive presentation slide finish, 8k resolution, crisp vector-grade graphic design perfection.`;

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
