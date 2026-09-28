// ==========================================
// 📝 单页生成 /api/chat-slide
// 职责：把「主题 + 大纲节点 + 用户输入（可含图片）」变成一页可直接出图的结构化幻灯片
// 流程：组织提示词 → 调 GLM（有图走 GLM-4V）→ 解析/清洗 → 选版式 → 统一生图提示词
// ==========================================
import {
  LAYOUT_CATALOG,
  describeLayoutMenu,
  pickLayout,
  getLayoutIssues,
  compileVisualSubject,
  buildFullSlidePrompt,
  buildDesignTokens,
  getLayoutMeta
} from './designSystem.js';
import { buildFactPolicy, CONTENT_POLICY, COPY_POLICY, findCopyIssues, normalizeText, STAT_RE } from './textGuards.js';
import { getDeckLimit, isPageInRange, extractTargetPage, collectUserHistory } from '../src/services/deckPolicy.js';

// ------------------------------------------
// 用户输入解析工具
// ------------------------------------------
function extractUserCustomVisual(text) {
  if (!text || typeof text !== 'string') return null;
  const blockMatch = text.match(/(?:图中图|配图要求|配图|插图|画一张|画一个|画面是|画面为|画面要求|视觉呈现|主图是|生图是|图片要求)[:：\s]*([^]+?)(?=(?:\n\s*(?:标题|主标题|要点|核心要点|正文|内容|文字)[:：])|$)/i);
  if (blockMatch && blockMatch[1] && blockMatch[1].trim().length > 2) return blockMatch[1].trim();
  const lineMatch = text.match(/(?:图中图|配图|插图|画一张|画一个|画面是|画面为|画面要求|视觉呈现|主图是|生图是)[:：\s]*([^\n]+)/i);
  return lineMatch ? lineMatch[1].trim() : null;
}

// ------------------------------------------
// 模型输出解析
// ------------------------------------------
function robustParseSlideJson(content) {
  if (typeof content !== 'string' || !content.trim()) return null;
  const match = content.match(/\{[\s\S]*\}/);
  const jsonStr = match ? match[0] : content.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  try {
    return JSON.parse(jsonStr);
  } catch (err1) {
    try {
      return JSON.parse(jsonStr.replace(/,\s*([\}\]])/g, '$1').replace(/[\x00-\x1F\x7F-\x9F]/g, ' '));
    } catch (err2) {
      // 不用逐字段正则拼造一份可能丢正文或修改范围的“成功”结果。
      return null;
    }
  }
}

// 只规整字段形态；不因条目短而丢弃，也不拼接相邻内容。
function normalizeBullets(bullets) {
  if (!Array.isArray(bullets)) return [];
  return bullets.map(b => {
    if (typeof b === 'string') return b.trim();
    if (!b || typeof b !== 'object') return '';
    const head = b.title || b.heading || b.head || '';
    const body = b.description || b.body || b.text || '';
    return head && body ? `【${head}】：${body}` : normalizeText(head || body);
  });
}

const EDIT_FIELDS = ['title', 'subtitle', 'keyMessage', 'bullets', 'visual', 'visionAnalysis'];
const COPY_FIELDS = ['title', 'subtitle', 'keyMessage', 'bullets'];
const copyLength = text => [...String(text || '').replace(/\s/g, '')].length;

function targetText(slide, target) {
  if (!target || !COPY_FIELDS.includes(target.field)) return undefined;
  if (target.field === 'bullets') return Number.isInteger(target.bulletIndex) && target.bulletIndex >= 0
    ? slide.bullets?.[target.bulletIndex] : undefined;
  if (target.bulletIndex != null) return undefined;
  return slide[target.field];
}

function targetIsEditable(edit, target) {
  return edit.fields.includes(target.field) && (target.field !== 'bullets'
    || edit.replaceBullets || edit.bulletIndices.includes(target.bulletIndex));
}

// 核对冲突指向的保留内容和用户原话；语义判断仍来自模型，不伪称程序能核验事实。
function inspectRevisionConflict(claim, current, edit, userPrompt) {
  if (claim == null || claim === '') return { issues: [] };
  const invalid = () => ({ issues: ['冲突声明缺少可核对的锁定字段或用户原话。请重查：有解时constraintConflict=null；无解时指出保留字段的原文、锁定要求与相反修改要求。格式示例不是用户约束。'] });
  if (typeof claim !== 'object' || Array.isArray(claim)) return invalid();
  const value = targetText(current, claim);
  const compact = text => String(text || '').replace(/\s/g, '');
  const supplied = compact(userPrompt);
  if (typeof value !== 'string' || targetIsEditable(edit, claim)
    || typeof claim.currentText !== 'string' || !claim.currentText.trim() || !compact(value).includes(compact(claim.currentText))
    || !['lockQuote', 'changeQuote', 'reason'].every(k => typeof claim[k] === 'string' && claim[k].trim())
    || compact(claim.lockQuote) === compact(claim.changeQuote)
    || !supplied.includes(compact(claim.lockQuote)) || !supplied.includes(compact(claim.changeQuote))) return invalid();
  return { issues: [`保留内容“${claim.currentText}”与要求“${claim.changeQuote}”存在冲突：${claim.reason}`], conflict: true };
}

function inspectShortening(current, slide, edit) {
  return (edit.shorten || []).flatMap(target => {
    const text = targetText(slide, target);
    const size = copyLength(text);
    const label = target.field === 'bullets' ? `第${target.bulletIndex + 1}条` : target.field;
    if (typeof text !== 'string') return [`${label}的精简结果缺失，不能用删除目标条目假装达到字数要求`];
    return size <= target.maxChars ? [] : [`${label}精简目标未达到：原${copyLength(targetText(current, target))}字，现${size}字，目标≤${target.maxChars}字；删重复铺陈，保留必要事实，不截断句子`];
  });
}

// 模型解释语义，程序按声明的修改范围合并，不从输入关键词猜测并覆盖全文。
export function applySlideRevision(current, candidate, edit) {
  const invalid = reason => ({ slide: null, issues: [reason] });
  if (!edit || !Array.isArray(edit.fields) || edit.fields.some(f => !EDIT_FIELDS.includes(f))
    || !['keep', 'auto', 'pinned'].includes(edit.layout)
    || !Array.isArray(edit.bulletIndices) || typeof edit.replaceBullets !== 'boolean') {
    return invalid('修订必须提供合法edit：fields、bulletIndices、replaceBullets和layout');
  }
  const oldBullets = current.bullets || [];
  if (edit.bulletIndices.some(i => !Number.isInteger(i) || i < 0 || i >= oldBullets.length)) return invalid('bulletIndices必须指向原正文中存在的零起始位置');
  if (!edit.fields.includes('bullets') && (edit.replaceBullets || edit.bulletIndices.length)) return invalid('未修改正文时不能声明正文替换范围');
  if (edit.shorten !== undefined && !Array.isArray(edit.shorten)) return invalid('edit.shorten必须为精简目标数组，无精简要求时为空');
  for (const target of edit.shorten || []) {
    const before = targetText(current, target);
    if (typeof before !== 'string' || !targetIsEditable(edit, target) || !Number.isInteger(target.maxChars)
      || target.maxChars < 1 || target.maxChars >= copyLength(before)) {
      return invalid('精简目标必须指向允许修改的原文，maxChars为小于原长度的正整数；不得为未要求修改的字段设置目标');
    }
  }
  const slide = { ...current };
  for (const field of edit.fields) {
    if (field !== 'bullets') {
      if (candidate[field] === undefined) return invalid(`缺少本次需要修改的字段${field}`);
      slide[field] = candidate[field];
    }
  }
  if (edit.fields.includes('bullets')) {
    if (!Array.isArray(candidate.bullets)) return invalid('正文修订需要完整bullets数组');
    if (edit.replaceBullets) slide.bullets = [...candidate.bullets];
    else {
      if (!edit.bulletIndices.length || candidate.bullets.length !== oldBullets.length) return invalid('局部修改必须保留正文数量，并指明修改的条目位置');
      const indices = new Set(edit.bulletIndices);
      slide.bullets = oldBullets.map((b, i) => indices.has(i) ? candidate.bullets[i] : b);
    }
  }
  if (edit.layout !== 'keep') {
    for (const field of ['type', 'layoutId', 'layoutConcept', 'visual']) {
      if (candidate[field] !== undefined) slide[field] = candidate[field];
    }
  }
  return { slide, issues: [] };
}

// ------------------------------------------
// LLM 调用
// ------------------------------------------
async function callChat({ url, key, model, messages, temperature = 0.5, jsonMode = true }) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers['Authorization'] = `Bearer ${key}`;
  const endpoint = `${url.replace(/\/$/, '')}/chat/completions`;
  const payload = { model, messages, temperature };
  let response = await fetch(endpoint, {
    method: 'POST', headers,
    body: JSON.stringify(jsonMode ? { ...payload, response_format: { type: 'json_object' } } : payload)
  });
  if (!response.ok && response.status === 400 && jsonMode) {
    response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
  }
  return response;
}

// ------------------------------------------
// 提示词
// ------------------------------------------
function buildOutputSchema({ isCover, targetSlideNum, currentSlideId, titleHint, isRework }) {
  return `{
  "slideIndex": ${targetSlideNum},
  "type": "${isCover ? 'cover' : 'cards | process | metrics | compare | statement | summary'}",
  "title": ${JSON.stringify(titleHint)},
  "subtitle": "${isCover ? '封面副标题：一句话主张，或 汇报人/场合 信息' : ''}",
  "keyMessage": "本页核心信息",
  "bullets": ${isCover ? '[]' : '["本页实际条目"]'},
  "layoutId": "${isCover ? 'cover-hero' : '从版式菜单中选一个 id'}",
  "layoutConcept": "用一两句中文说明为什么选这个版式、阅读顺序与视觉重点",
  "layoutPinned": false,
${isRework ? '  "constraintConflict": null,\n  "edit": {"fields": [], "bulletIndices": [], "replaceBullets": false, "layout": "keep", "shorten": []},\n' : ''}  "visual": {
    "medium": "photo | vector | 3d | diagram | dashboard | abstract",
    "subject": "English: the concrete object / scene / schematic to draw, tied to this page's content",
    "composition": "English: framing and viewpoint",
    "lighting": "English: light and mood"
  },
  "visionAnalysis": "若用户提供了图片：30-60 字中文描述图片内容与它在本页的作用；否则留空",
  "id": ${JSON.stringify(currentSlideId)}
}`;
}

function buildAutoSystemPrompt(ctx) {
  const { isCover, isLast, targetSlideNum, totalSlides, layoutMenu, schema, hasUserImage } = ctx;

  const pageRole = isCover
    ? `本页是封面（第 1 页）。title 是这套 PPT 的正式名称（≤16 字，来自主题，不要口号化）；subtitle 是一句话主张或汇报人/场合信息（用户给了就用用户的，否则用全篇主张）；bullets 必须为空数组；layoutId 固定 cover-hero；visual 描述一张有气势、与主题直接相关的封面画面。`
    : isLast
      ? `本页是总结页（第 ${targetSlideNum} 页，最后一页）。提炼已有内容的核心判断与下一步；不重抄前页的完整措施，不添加新承诺，不强制行动口号或凑足三条。`
      : `本页是正文第 ${targetSlideNum} 页（共 ${totalSlides} 页）。只讲大纲分配给本页的内容，不要把整套大纲塞进来，也不要重复已完成页面。`;

  return `你是一名中文演示文稿的内容策划兼版式设计师。你的目标：让听众读懂本页核心信息，结论有依据，页面可以直接拿去演示。
【本页角色】${pageRole}
【版本衔接】已制作页面的最新文案优先于旧大纲初稿；但最新文案本身不等于事实依据。用户纠正了某项事实时，用其最新原话校对所有相关稿件，不能因为初始主题、全篇主张或旧稿仍写着旧说法而恢复它。
【篇幅边界】全套严格 ${totalSlides} 页，本页 ${targetSlideNum}，后面仅余 ${totalSlides - targetSlideNum} 页。普通“继续”保持初稿的议题与有效论据；先用最新已确认页面校对本页初稿，再修正空话或口径冲突，不侵占后页任务。第 ${totalSlides} 页只收束已有论证，不提出留待下一页的问题。

【写作步骤】
1. 先明确本页任务与已有依据，写出互不重复、能独立读懂的bullets；说明具体对象、做法或判断条件，不为凑具体感发明事实。
2. 从这些依据归纳keyMessage，不先编结论再凑数据；检查各条是否真正支撑同一判断，建议不冒充事实。
3. 根据条目之间的关系选版式 layoutId（并列→卡片/分栏；先后→流程/时间线；对比→双栏；有真实数字→大数字看板；一个结论为主→金句页）。
4. 最后决定是否需要 visual：只有选定版式包含画框或全景背景时才设计配图；开放分栏、证据栏、矩阵、对比和流程页用信息本身做视觉，不硬塞汽车/工厂等大照片。${hasUserImage ? '\n   ⚠️ 用户已提供图片，页面会预留画框直接放用户的图，所以 visual 可以留空；请在 visionAnalysis 中说明图片内容与它在本页的作用，并让文案与图片呼应。' : ''}

${COPY_POLICY}

【版式菜单（layoutId 只能从中选择）】
${layoutMenu}

请只输出一个合法 JSON 对象，不要输出任何其他文字：
${schema}`;
}

function buildCustomSystemPrompt(ctx) {
  const { isCover, layoutMenu, schema, detectedCustomVisual, hasUserImage } = ctx;
  return `你是一名演示文稿排版设计师兼文案编辑。当前是【用户自主模式】：内容由用户提供，你只负责整理与排版，不得替用户发明内容。

【忠实原则】
1. 保留用户的全部事实、数据、专有名词、观点和语气；只做结构化、去重、补全语法、调整顺序。
2. 不得新增用户没写的数字、案例、机构、结论；也不得在每条末尾追加“共同进步”“提高成绩”“营造氛围”这类用户没说的效果描述。用户只给 1-2 条要点就只输出 1-2 条，不凑数。
   ✅ 用户写“每周五下午组织一次班级例会，收集大家的意见” → “【每周例会】：每周五下午组织一次班级例会，收集大家的意见”
   ❌ → “…收集大家的意见，确保每位同学的声音被听到，营造民主氛围”（后半句是自己加的）
3. 有必要加小标题时从原文提炼；短标签就是内容本身，不必再拆出小标题和正文。
4. 用户明确写了标题就用用户的标题。
5. 中文文案里不夹英文单词（用户原文中的专有名词除外）。${isCover ? '\n6. 本页是封面：bullets 为空数组，subtitle 用用户提供的主张/汇报人信息。' : ''}

【图片】
${hasUserImage
  ? '- 用户上传了图片，页面会预留画框直接放用户的图；请在 visionAnalysis 中用 30-60 字中文说明图片内容与它在本页的作用，并让文案与图片呼应；visual 可留空。'
  : detectedCustomVisual
    ? `- 用户指定了配图描述："${detectedCustomVisual}"。请把它忠实翻译成英文填入 visual.subject（保留用户描述的主体、场景与细节），并补充 composition / lighting；medium 按描述判断。`
    : '- 先按内容关系选版式；只有版式包含画框或全景背景时才填写visual。无图版式留空，不强塞配图。'}

【表达与容量】保留原意、完整句子与必要解释。用户的短要点原样保留，不设最低字数，不为了填满模板扩写。按实际条目关系选择兼容版式，小标题可以短于4字；未提出的内容不动。只有用户明确要求删减或重组时才改变条目数量。

${COPY_POLICY}

【版式菜单（layoutId 只能从中选择）】
${layoutMenu}

请只输出一个合法 JSON 对象，不要输出任何其他文字：
${schema}`;
}

// ------------------------------------------
// 主处理器
// ------------------------------------------
export function createChatSlideHandler({ getRuntimeConfig }) {
  return async function chatSlideHandler(req, res) {
    const {
      topic = '',
      userPrompt,
      userImages = [],
      slideIndex = 1,
      deckStyle = { name: '极简暗黑', theme: 'dark', customPrompt: '极简现代' },
      history = [],
      isRework = false,
      currentSlideData = null,
      targetIndex = 0,
      globalOutline = null,
      totalSlides = 6,
      generationMode = 'auto',
      existingSlides = [],
      deckMeta = null,
      apiKey,
      apiUrl,
      model
    } = req.body;

    const runtimeConfig = getRuntimeConfig();
    const activeKey = runtimeConfig.llmApiKey || apiKey;
    const activeUrl = runtimeConfig.llmApiUrl || (apiKey ? apiUrl : null) || 'https://api.deepseek.com';
    const activeModel = runtimeConfig.llmModel || (apiKey ? model : null) || 'deepseek-flash';

    if (typeof userPrompt !== 'string' || userPrompt.trim() === '') {
      return res.status(400).json({ error: '请交代这一页要讲什么内容或修改要求' });
    }
    const total = getDeckLimit({ totalSlides: deckMeta?.plannedSlideCount || totalSlides, outline: globalOutline });
    const targetSlideNum = isRework ? Number(targetIndex) + 1 : Number(slideIndex);
    const explicitPage = extractTargetPage(userPrompt, total);
    if (!isPageInRange(targetSlideNum, total) || (explicitPage !== null && !isPageInRange(explicitPage, total))) {
      return res.status(400).json({ error: `本套 PPT 固定为 ${total} 页，页码必须在 1–${total} 之间。`, code: 'SLIDE_LIMIT_REACHED', totalSlides: total });
    }

    // 用户图片：最多取 2 张（版式目录最多两个画框）
    const incomingImages = (Array.isArray(userImages) ? userImages : []).filter(u => typeof u === 'string' && u.startsWith('data:image/'));
    const validUserImages = (incomingImages.length ? incomingImages : isRework ? currentSlideData?.userImageUrls || [] : [])
      .filter(u => typeof u === 'string' && u.startsWith('data:image/'))
      .slice(0, 2);
    const userImageCount = validUserImages.length;
    const hasUserImage = userImageCount > 0;

    // 视觉路由：智谱端点 + 有图 → GLM-4V
    let effectiveModel = activeModel;
    let isVisionMode = false;
    if (hasUserImage && (activeUrl.includes('bigmodel.cn') || /glm-4v|vision/i.test(activeModel))) {
      effectiveModel = /glm-4v/i.test(activeModel) ? activeModel : 'glm-4v-flash';
      isVisionMode = true;
      console.log(`[Vision Engine] ${userImageCount} user image(s) → ${effectiveModel}`);
    }

    const isCustomMode = generationMode === 'custom';
    const isCover = targetSlideNum === 1;
    const isLast = targetSlideNum === total && total > 1;

    if (isRework && (!currentSlideData || !Array.isArray(currentSlideData.bullets))) {
      return res.status(400).json({ error: '缺少当前页完整内容，无法安全执行局部修改' });
    }
    const doneSlides = (Array.isArray(existingSlides) ? existingSlides : [])
      .filter(s => s && isPageInRange(s.slideIndex, total) && s.slideIndex !== targetSlideNum && s.title)
      .sort((a, b) => a.slideIndex - b.slideIndex);
    const latest = new Map(doneSlides.map(s => [s.slideIndex, s]));
    if (isRework) latest.set(targetSlideNum, currentSlideData);
    const effectiveOutline = (Array.isArray(globalOutline) ? globalOutline : []).slice(0, total).map((node, i) => {
      const slide = latest.get(node.slideIndex || i + 1);
      return slide ? { ...node, title: slide.title, keyMessage: slide.keyMessage, type: slide.type,
        draftBullets: slide.bullets, suggestedLayout: slide.layoutId } : node;
    });
    const currentNode = effectiveOutline.find(n => n.slideIndex === targetSlideNum) || effectiveOutline[targetSlideNum - 1] || null;
    const prevLayoutIds = doneSlides.filter(s => s.slideIndex < targetSlideNum && s.layoutId).map(s => s.layoutId);
    const rawUserPrompt = userPrompt.trim();
    const detectedCustomVisual = extractUserCustomVisual(rawUserPrompt);
    const schema = buildOutputSchema({ isCover, targetSlideNum, isRework,
      currentSlideId: currentSlideData?.id || Date.now(), titleHint: currentSlideData?.title || currentNode?.title || '' });
    const promptCtx = { isCover, isLast, targetSlideNum, totalSlides: total, deckMeta, currentNode,
      layoutMenu: describeLayoutMenu(), schema, hasUserImage, detectedCustomVisual };
    const revisionRule = isRework ? `【局部修改契约】
先理解完整指令中的修改对象和保留对象，再填写edit，并返回完整页面，不只返回被改的一条。
- fields只列本次允许修改的字段：${EDIT_FIELDS.join('、')}。未提及的部分不改，不因润色正文顺手改标题。
- 修改部分正文：fields包含bullets，bulletIndices列原条目的零起始位置（第二条是1），replaceBullets=false；其余条目原样保留。
- 只有明确提交整页替换、增删或重排条目时，replaceBullets=true；普通局部修订不能重建整页。
- layout=keep表示保持版式；auto表示用户要求重新选版式；pinned表示用户明确指定了某个版式，layoutId必须对应指定对象。只改文字默认keep，只改排版时fields为空。
- 否定词必须作用于完整要求：“布局不变，把正文缩短”是改文案、保留布局。只改排版仍可更新type来表达新的内容关系，但不得改正文。
- shorten只在用户要求精简时填写目标数组，每项为{"field":"bullets","bulletIndex":1,"maxChars":30}；title/subtitle/keyMessage不填bulletIndex。目标只覆盖允许修改的原文：用户给出字数或比例就按要求折算；普通“精简”以减少约20%-30%为参考，轻微调整服从用户要求。数组中的每个目标都会按实际字符数验收，计标点、不计空白；没有精简要求填[]。删重复铺陈，不截断句子，不把目标放宽到只少一个字来假装完成。
- constraintConflict正常为null。只有本次修改与明确锁定的已有内容不能同时成立时，填写对象：field（title/subtitle/keyMessage/bullets）、bulletIndex（仅正文）、currentText（冲突的原文）、lockQuote（用户锁定要求的原话）、changeQuote（相反修改要求的原话）、reason（具体矛盾与需要放开的字段）。引用只能来自当前页和本次要求，不能编造；格式示例、短标签没有解释或正常的保留说明都不是冲突。先核对合并后的结论与正文，不交付矛盾稿，也不自行扩大修改范围。` : '';
    const systemInstruction = `${CONTENT_POLICY}\n${buildFactPolicy({ allowPublicSources: !isCustomMode })}\n【历史与本次要求】历史记录是背景，不是待重复执行的命令。当前明确要求优先于同一对象的历史要求；本页历史中仍适用的内容限制继续保留，但不重复执行旧的精简、删除、重排动作。其他页的局部锁定不作用于本页；只继承用户明确面向全篇的要求。未标注目标页的旧记录只作资料参考，不猜测作用范围。\n【语言】文案与版式说明使用自然中文，专有名词保留原文；仅visual的绘图描述使用英文。\n${isCustomMode ? buildCustomSystemPrompt(promptCtx) : buildAutoSystemPrompt(promptCtx)}\n${revisionRule}\n【版式约定】type与layoutId必须兼容。内容关系与容量优先于去重；layoutPinned只在用户明确指定版式时为true，模型自选为false。`;
    const slideText = s => [s?.title, s?.subtitle, s?.keyMessage, ...(s?.bullets || [])].filter(Boolean).join('\n');
    const userHistory = collectUserHistory(history, total);
    const historyText = entries => entries.map(({ text, targetIndex }, i) =>
      `${i + 1}. ${targetIndex === null ? '未标注目标页' : `第${targetIndex + 1}页`}：${text}`).join('\n');
    const pageHistory = userHistory.filter(entry => entry.targetIndex === targetSlideNum - 1);
    const otherHistory = userHistory.filter(entry => entry.targetIndex !== targetSlideNum - 1);
    // 只有用户原话进入数字来源集合；最新稿用于版本衔接，不为自身提供证据。
    const sourceText = [topic, ...userHistory.map(entry => entry.text), rawUserPrompt].join('\n');
    const userContent = [
      `【初始主题与资料；后续修订可以纠正其中的旧信息】\n${topic || '演示汇报'}\n当前第${targetSlideNum}/${total}页`,
      pageHistory.length ? `【本页用户历史；按时间从旧到新，仅保留仍适用的要求】\n${historyText(pageHistory)}` : '',
      otherHistory.length ? `【其他页或未定位的用户历史；资料参考，局部锁定不作用于本页】\n${historyText(otherHistory)}` : '',
      deckMeta ? `【全篇策划参考；主张须服从最新依据】\n${JSON.stringify({ genre: deckMeta.genreLabel, thesis: deckMeta.thesis, audience: deckMeta.audience })}` : '',
      `【全篇任务分配；已有页面以最新修订为准】\n${effectiveOutline.map(n => `第${n.slideIndex}页：${n.title}；任务：${n.scope || ''}；结论：${n.keyMessage || ''}`).join('\n')}`,
      currentNode ? `【本页任务与初稿；生成前用下方最新文案校对口径】\n${JSON.stringify(currentNode)}` : '',
      `【已有页面的最新文案；版本参考而非已核验依据，事实口径须回到用户最新原话】\n${doneSlides.map(s => `第${s.slideIndex}页：\n${slideText(s)}`).join('\n\n')}`,
      `【已用版式】${prevLayoutIds.join(' → ') || '无'}；只在同样适配内容的方案之间考虑变化。`,
      isRework ? `【当前页完整基准】\n${JSON.stringify({ title: currentSlideData.title, subtitle: currentSlideData.subtitle || '', keyMessage: currentSlideData.keyMessage || '',
        bullets: currentSlideData.bullets, type: currentSlideData.type, layoutId: currentSlideData.layoutId,
        layoutConcept: currentSlideData.layoutConcept, customVisualSubject: currentSlideData.customVisualSubject,
        copyLengths: { title: copyLength(currentSlideData.title), subtitle: copyLength(currentSlideData.subtitle),
          keyMessage: copyLength(currentSlideData.keyMessage), bullets: currentSlideData.bullets.map(copyLength) } })}` : '',
      `【用户本次完整要求；优先于旧初稿】\n${rawUserPrompt}`,
      hasUserImage ? `【图片】共${userImageCount}张，选择有足够画框的版式，保留全部图片。` : '',
      '只输出JSON。先检查文案支持结论、未改部分保持原样、版式匹配内容，再提交。'
    ].filter(Boolean).join('\n\n');

    // ---------- 一次生成 + 最多一次统一修正，校验通过才交付 ----------
    const isLocalUrl = activeUrl.includes('localhost') || activeUrl.includes('127.0.0.1');
    if (!activeKey && !isLocalUrl) return res.status(503).json({ error: '请先配置文案模型，未生成替代模板' });
    let fixedEdit = null;
    const evaluate = raw => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { issues: ['需要返回完整JSON对象'] };
      let slide = { ...raw, bullets: normalizeBullets(raw.bullets) };
      let edit = null;
      if (isRework) {
        edit = fixedEdit || raw.edit;
        const merged = applySlideRevision(currentSlideData, slide, edit);
        if (merged.issues.length) return merged;
        slide = merged.slide;
      }
      const issues = [];
      if (isRework) {
        const conflict = inspectRevisionConflict(raw.constraintConflict, currentSlideData, edit, rawUserPrompt);
        if (conflict.conflict) return { ...conflict, edit };
        issues.push(...conflict.issues, ...inspectShortening(currentSlideData, slide, edit));
      }
      for (const field of ['title', 'subtitle', 'keyMessage']) {
        if (slide[field] !== undefined && typeof slide[field] !== 'string') issues.push(`${field}必须是字符串`);
        slide[field] = normalizeText(slide[field]);
      }
      if (!slide.title) issues.push('缺少有实际内容的标题');
      if (slide.title.length > 60 || slide.keyMessage.length > 180) issues.push('标题或结论过长，请自然精简，不截断句子');
      if (isCover) { slide.type = 'cover'; slide.bullets = []; }
      else if (isLast) slide.type = 'summary';
      else if (!['cards', 'process', 'metrics', 'compare', 'statement'].includes(slide.type)) issues.push('正文页type必须表达实际内容关系');
      if (!isCover && (!slide.bullets.length || slide.bullets.some(b => !b))) issues.push('正文必须包含完整、非空的独立条目');
      if (slide.type === 'metrics' && !STAT_RE.test(slide.bullets.join(' '))) issues.push('没有数字指标时不能选择metrics，应按实际内容关系选版式');
      slide.bullets.forEach((b, i) => {
        if (!isRework || (edit.fields.includes('bullets') && (edit.replaceBullets || edit.bulletIndices.includes(i)))) {
          issues.push(...findCopyIssues(b, { sourceText, checkHollow: !isCustomMode, allowPublicSources: !isCustomMode }));
        }
      });
      // 结论可以复用正文中已说明的指标，正文自身仍独立检查其依据。
      for (const field of ['title', 'subtitle', 'keyMessage']) {
        if (!isRework || edit.fields.includes(field)) issues.push(...findCopyIssues(slide[field], {
          sourceText: `${sourceText}\n${slide.bullets.join('\n')}`, checkHollow: !isCustomMode, allowPublicSources: !isCustomMode
        }));
      }
      const requested = normalizeText(slide.layoutId);
      const layoutId = pickLayout({
        requestedLayoutId: requested,
        pinnedLayoutId: (isRework ? edit.layout === 'pinned' : raw.layoutPinned === true) ? requested : '',
        preservedLayoutId: isRework && edit.layout === 'keep' ? currentSlideData.layoutId : '',
        plannedLayoutId: isRework ? '' : currentNode?.suggestedLayout || '',
        excludedLayoutId: isRework && edit.layout === 'auto' ? currentSlideData.layoutId : '',
        requiresVisual: Boolean(detectedCustomVisual), type: slide.type, bullets: slide.bullets, slide,
        bulletCount: slide.bullets.length, isCover, userImageCount, prevLayoutIds, isLastSlide: isLast
      });
      issues.push(...getLayoutIssues(layoutId, slide.bullets, slide));
      if (layoutId) {
        const meta = getLayoutMeta(layoutId);
        slide.layoutId = layoutId;
        slide.layoutName = meta.name;
        slide.isFullBleed = meta.isFullBleed;
        if (layoutId !== requested || !normalizeText(slide.layoutConcept)) slide.layoutConcept = `${meta.name}：${LAYOUT_CATALOG[layoutId].whenToUse}`;
      }
      return { slide, edit, issues: [...new Set(issues)] };
    };
    let slideData = null;
    const messages = [{ role: 'system', content: systemInstruction }, { role: 'user', content: isVisionMode
      ? [{ type: 'text', text: userContent }, ...validUserImages.map(u => ({ type: 'image_url', image_url: { url: u } }))]
      : userContent }];
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await callChat({ url: activeUrl, key: activeKey, model: effectiveModel, messages, temperature: isCustomMode ? 0.3 : 0.5 });
        if (!response.ok) return res.status(502).json({ error: `文案模型暂不可用（${response.status}），原页面未更改` });
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const result = evaluate(robustParseSlideJson(content));
        if (!result.issues.length) { slideData = result.slide; break; }
        if (result.edit) fixedEdit = result.edit;
        if (result.conflict || attempt === 1) return res.status(422).json({ error: `本次方案尚未满足要求，原页面未更改：${result.issues.slice(0, 3).join('；')}`, code: result.conflict ? 'SLIDE_CONSTRAINT_CONFLICT' : 'SLIDE_VALIDATION_FAILED' });
        messages.push({ role: 'assistant', content: typeof content === 'string' ? content : '' }, {
          role: 'user', content: `请只修正这些问题，返回完整JSON：\n${result.issues.join('\n')}\n${fixedEdit ? `修改范围固定为${JSON.stringify(fixedEdit)}，不得扩大。` : ''}保留已有事实与用户原意，不增加新数据，不拼接独立步骤，不擅自加页。格式、文案和容量在这一次修正中一起检查。`
        });
      }
    } catch (err) {
      console.warn('[chat-slide] 文案请求失败：', err.message);
      return res.status(502).json({ error: '文案服务连接失败，原页面未更改，请稍后重试' });
    }
    slideData.id = currentSlideData?.id || slideData.id || Date.now();
    slideData.slideIndex = targetSlideNum;
    slideData.totalSlides = total;
    delete slideData.edit;
    delete slideData.layoutPinned;
    delete slideData.constraintConflict;
    const layoutMeta = getLayoutMeta(slideData.layoutId);

    // ---------- 视觉 ----------
    const tokens = buildDesignTokens(deckStyle);
    let visualSubject = '';
    if (!hasUserImage && (layoutMeta.isFullBleed || layoutMeta.userImageFrames.length > 0)) {
      const v = slideData.visual;
      if (v && typeof v === 'object' && String(v.subject || '').trim().length > 6) {
        visualSubject = compileVisualSubject(v, tokens);
      } else if (typeof v === 'string' && v.trim().length > 10) {
        visualSubject = compileVisualSubject(v, tokens);
      } else if (String(slideData.customVisualSubject || '').trim().length > 10) {
        visualSubject = String(slideData.customVisualSubject).trim();
      } else if (isCustomMode && detectedCustomVisual) {
        visualSubject = compileVisualSubject({ medium: 'photo', subject: `user-specified scene: ${detectedCustomVisual}` }, tokens);
      } else {
        const idea = currentNode?.visualIdea ? `, inspired by: ${currentNode.visualIdea}` : '';
        visualSubject = compileVisualSubject({
          medium: isCover ? 'photo' : 'vector',
          subject: `a concrete, recognisable scene or object that represents "${slideData.title}" within the theme "${topic}"${idea}`,
          composition: isCover ? 'wide cinematic framing with the subject on the right third' : 'centred subject with generous margins inside the frame',
          lighting: 'soft, even, premium'
        }, tokens);
      }
    }
    slideData.customVisualSubject = visualSubject;
    delete slideData.visual;

    slideData.visionAnalysis = String(slideData.visionAnalysis || '').trim();
    if (hasUserImage && !slideData.visionAnalysis) slideData.visionAnalysis = `本页预留 ${userImageCount} 个画框放置您上传的图片`;

    slideData.fullSlideImagePrompt = buildFullSlidePrompt({
      slide: slideData, deckStyle, layoutId: layoutMeta.id, visualSubject,
      slideIndex: targetSlideNum, totalSlides: total, userImageCount
    });

    // ---------- 用户图片：不再覆盖 imageUrl，改为画框叠加 ----------
    if (hasUserImage) {
      slideData.userImageUrls = validUserImages;
      slideData.userImageFrames = layoutMeta.userImageFrames.slice(0, userImageCount);
    } else if (isRework && currentSlideData?.userImageUrls?.length && currentSlideData.layoutId === layoutMeta.id) {
      slideData.userImageUrls = currentSlideData.userImageUrls;
      slideData.userImageFrames = currentSlideData.userImageFrames || layoutMeta.userImageFrames.slice(0, currentSlideData.userImageUrls.length);
    } else {
      slideData.userImageUrls = [];
      slideData.userImageFrames = [];
    }

    // 只在实际内容变化时使旧画面失效；无改动的确认不制造额外重绘。
    const unchanged = isRework && !incomingImages.length
      && ['title', 'subtitle', 'keyMessage', 'layoutId', 'customVisualSubject', 'bullets'].every(field =>
        JSON.stringify(slideData[field] ?? '') === JSON.stringify(currentSlideData[field] ?? ''));
    slideData.imageUrl = unchanged ? currentSlideData.imageUrl || null : null;
    slideData.userUploaded = false;
    slideData.generationMode = generationMode;
    slideData.metrics = null;
    slideData.speakerNotes = '';

    return res.json({ success: true, slide: slideData, isRework, targetIndex, isMock: false });
  };
}
