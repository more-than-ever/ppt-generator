import dotenv from "dotenv";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ContentService } from "../server/contentService.js";
import { makeDeck, sourceIssues } from "../shared/deck.js";
import { buildScene } from "../shared/slideScene.js";
import { ImageTasks, isGrsaiProvider } from "../server/imageTasks.js";
import { LocalStore } from "../server/store.js";

if (process.argv[2] === "--inspect") {
  const directory = path.resolve(process.argv[3]);
  for (const file of await fs.readdir(directory)) {
    if (!file.endsWith(".json") || file === "results.json") continue;
    const record = JSON.parse(
      await fs.readFile(path.join(directory, file), "utf8"),
    );
    console.log(
      JSON.stringify({
        name: record.name,
        input: record.input?.sources,
        error: record.error,
        slides: record.deck?.slides.map(
          ({ id, type, title, subtitle, keyMessage, bullets }) => ({
            id,
            type,
            title,
            subtitle,
            keyMessage,
            bullets,
          }),
        ),
        review: record.deck?.review?.issues,
        draftIssues: record.draftIssues,
      }),
    );
  }
  process.exit(0);
}
dotenv.config();
const config = {
  llmApiKey: process.env.LLM_API_KEY || "",
  llmApiUrl: process.env.LLM_API_URL || "",
  llmModel: process.env.LLM_MODEL || "",
};
if (process.env.LIVE_PRODUCT_TEST !== "1")
  throw new Error(
    "真实采样需显式设置 LIVE_PRODUCT_TEST=1；不会自动调用付费模型",
  );
if (process.argv[2] === "--images") {
  const imageConfig = {
    gptimage2ApiKey: process.env.GPTIMAGE2_API_KEY || "",
    gptimage2ApiUrl: process.env.GPTIMAGE2_API_URL || "",
    gptimage2Model: process.env.GPTIMAGE2_MODEL || "",
  };
  if (
    !imageConfig.gptimage2ApiKey ||
    imageConfig.gptimage2Model !== "gpt-image-2" ||
    !isGrsaiProvider(imageConfig.gptimage2ApiUrl)
  )
    throw new Error("需要已配置的Grsai GPT Image 2；未提交图片");
  const out = path.resolve("artifacts", `live-images-${Date.now()}`);
  await fs.mkdir(out, { recursive: true });
  const store = await new LocalStore(path.join(out, "store")).init();
  let deck = makeDeck({ title: "独立配图抽查", slideCount: 3 });
  const subjects = [
    "浅色背景上的桌面阅读角，一本无字打开的书与一株绿植，简洁柔和的编辑插画，无人物",
    "深蓝背景中两组相互连接的半透明几何方块，抽象知识整理概念，克制的科技插画",
  ];
  deck.slides[0] = {
    ...deck.slides[0],
    title: "把资料整理清楚",
    subtitle: "独立插图与原生可编辑文字",
    omitVisual: false,
    visualIdea: subjects[0],
  };
  deck.slides[1] = {
    ...deck.slides[1],
    title: "让信息各有位置",
    bullets: ["保留来源与完整表达", "先核对，再形成判断"],
    layoutId: "split-visual-right",
    omitVisual: false,
    visualIdea: subjects[1],
  };
  deck.slides[2] = {
    ...deck.slides[2],
    title: "完成抽查",
    bullets: ["图片不含页面文字", "文案由程序排版"],
    omitVisual: true,
  };
  deck = (await store.save(deck, 0)).deck;
  const originalFetch = globalThis.fetch;
  let submissions = 0,
    polls = 0;
  globalThis.fetch = (url, init) => {
    if (String(url).endsWith("/draw/completions")) {
      if (submissions >= 2) throw new Error("达到两张上限，禁止再次提交");
      submissions++;
      console.log(
        JSON.stringify({ phase: "image-submit", submissions, limit: 2 }),
      );
    } else if (String(url).endsWith("/draw/result")) polls++;
    return originalFetch(url, init);
  };
  const queue = await new ImageTasks(store, () => imageConfig).init();
  const tasks = [];
  try {
    for (const slide of deck.slides.slice(0, 2))
      tasks.push(
        await queue.enqueue({
          deckId: deck.id,
          slideId: slide.id,
          inputRevision: slide.contentRevision,
          slot: 0,
        }),
      );
    while (queue.active || tasks.some((t) => t.status === "queued"))
      await new Promise((r) => setTimeout(r, 500));
  } finally {
    globalThis.fetch = originalFetch;
  }
  const results = [];
  for (const [i, task] of tasks.entries()) {
    let imagePath;
    if (task.asset) {
      const asset = await store.read(store.file("assets", task.asset.id));
      imagePath = path.join(out, `image-${i + 1}.${asset.mime.split("/")[1]}`);
      await fs.writeFile(
        imagePath,
        Buffer.from(asset.dataUrl.split(",")[1], "base64"),
      );
      deck.slides[i].assets = [{ id: task.asset.id, fit: "contain" }];
    }
    results.push({
      status: task.status,
      error: task.error || "",
      prompt: task.prompt,
      imagePath,
    });
  }
  await fs.writeFile(
    path.join(out, "配图抽查.slideflow.json"),
    JSON.stringify(await store.backup(deck), null, 2),
  );
  await fs.writeFile(
    path.join(out, "results.json"),
    JSON.stringify(
      { submissions, polls, results, status: "待查看两张实际图片；未自动重试" },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ out, submissions, polls, results }));
  process.exit(
    tasks.length === 2 && tasks.every((t) => t.status === "completed") ? 0 : 1,
  );
}
if (!config.llmApiKey || !config.llmApiUrl || !config.llmModel)
  throw new Error("文案配置不完整，未调用真实模型");
const cases = [
  {
    name: "竞选-1",
    title: "班级学习委员竞选",
    audience: "同班同学",
    count: 4,
    text: "候选人小林做过两次课后习题讨论的组织者，愿意收集同学对讨论主题的建议。没有班干部任职经历，不承诺提高成绩，不承诺固定频率。围绕已有经历、做事方式和愿意承担的事情发言，保持同学之间自然的语气。",
  },
  {
    name: "竞选-2",
    title: "读书社活动负责人竞选",
    audience: "社团成员",
    count: 6,
    text: "候选人小周协助过一次书籍交换活动，负责登记参与者和整理书单。愿意在活动前询问成员阅读兴趣，结束后整理反馈。未组织过大型活动，未获得奖项，没有赞助资源。不新增每周活动、人数增长或经费承诺。",
  },
  {
    name: "产品-1",
    title: "团队知识库产品介绍",
    audience: "小团队负责人",
    count: 4,
    text: "产品当前支持全文检索、按成员设置文档访问权限、文档版本回溯。没有客户数量、效率收益、价格资料。试用依次包括：整理现有文档、导入试用空间、设置访问权限、收集试用反馈。四步必须独立保留且顺序不变。不新增自动问答、外部系统集成、无限存储。",
  },
  {
    name: "产品-2",
    title: "设备报修登记工具",
    audience: "园区后勤人员",
    count: 6,
    text: "当前工具提供报修表单、状态登记和维修记录导出；不提供自动诊断或自动派单。建议试用流程依次为登记报修、确认故障、准备备件、安排维修、现场验收、归档回访。六步独立，流程只用短标签，不补正文解释。未提供响应时效、收费价格和节约金额。",
  },
  {
    name: "比较-1",
    title: "团队电脑采购比较",
    audience: "采购小组",
    count: 4,
    text: "候选A：每台4800元，内存16GB，存储512GB，保修1年。候选B：每台6200元，内存32GB，存储1TB，保修3年。预算尚未确定，采购数量尚未确定。按价格、内存、存储、保修相同维度等权比较；不能推断性能倍数、故障率或总体节约。结尾列待确认需求，不擅自作已采购结论。",
  },
  {
    name: "比较-2",
    title: "活动场地选择",
    audience: "活动筹备组",
    count: 6,
    text: "场地A：可容纳40人，租金每半天1200元，离地铁步行5分钟，无投影设备。场地B：可容纳60人，租金每半天1800元，离地铁步行15分钟，提供投影设备。活动人数、日期和设备需求未定。比较容量、费用、交通和设备，不新增餐饮、停车或折扣事实，不宣称已经预订。",
  },
  {
    name: "科普-1",
    title: "相关不等于因果",
    audience: "刚接触统计的学生",
    count: 4,
    text: "相关表示两个变量在观察中一起变化，不能单凭相关断言一个变量造成另一个变量。可能有共同原因，也可能方向相反。虚构教学例子：炎热天气里冰淇淋销量与游泳人数可能同时上升；这不是冰淇淋让人去游泳的证明。不编造调查、样本量、研究机构或比例。",
  },
  {
    name: "科普-2",
    title: "认识机器学习的过拟合",
    audience: "非技术同事",
    count: 6,
    text: "过拟合指模型过度贴合训练资料，面对未见过的资料时表现可能变差。训练集用于学习，验证集用于选择设置，测试集用于最终评估。背熟练习题不等于能解新题只能作为类比，不能说机器学习等同于背答案。没有提供准确率数据或实验结论，不新增百分比。",
  },
  {
    name: "新主题-1",
    title: "社区种子交换活动准备",
    audience: "社区志愿者",
    count: 3,
    text: "活动尚在讨论阶段。建议带来种子的居民注明品种及采收时间，志愿者整理标签，参与者自行确认是否适合种植。日期、人数和场地均未确定；不承诺发芽率，不宣称已有参与成果。",
  },
  {
    name: "新主题-2",
    title: "个人旧照片整理",
    audience: "希望整理家庭资料的人",
    count: 3,
    text: "建议先复制原始照片作为备份，再按大致年代分组；不确定的人物和日期单独标为待核对。原始文件保留不覆盖。没有提供照片数量和整理时长，不新增技术自动识别能力或隐私保障承诺。",
  },
];
const selected = process.env.LIVE_CASE
  ? cases.filter((c) => c.name === process.env.LIVE_CASE)
  : cases;
const budget = Number(process.env.LIVE_CALL_LIMIT || 30);
if (!selected.length || !Number.isInteger(budget) || budget < 1 || budget > 30)
  throw new Error("采样名称或调用上限无效");
const out = path.resolve("artifacts", `live-${Date.now()}`);
await fs.mkdir(out, { recursive: true });
const service = new ContentService(() => config);
const json = service.json.bind(service);
let calls = 0,
  outputs = [];
service.json = async (messages) => {
  if (calls >= budget) throw new Error("达到本批真实文案请求上限，已停止");
  calls++;
  console.log(JSON.stringify({ phase: "request", calls, budget }));
  const raw = await json(messages);
  outputs.push(raw);
  return raw;
};
const results = [];
console.log(
  JSON.stringify({
    phase: "start",
    cases: selected.length,
    budget,
    imageCalls: 0,
  }),
);
for (const sample of selected) {
  const start = Date.now();
  outputs = [];
  const input = makeDeck({
    title: sample.title,
    audience: sample.audience,
    slideCount: sample.count,
    sources: [{ id: "source-1", name: "固定验收资料", text: sample.text }],
  });
  let result, draft;
  try {
    draft = await service.draft(input);
    const review = await service.review(draft.deck);
    const deck = { ...draft.deck, review };
    result = {
      name: sample.name,
      input,
      deck,
      draftIssues: draft.issues,
      structure: deck.slides.map(
        (s) => buildScene(s, { checkAssets: false }).issues,
      ),
      sources: sourceIssues(deck),
      rawOutputs: outputs,
    };
  } catch (e) {
    result = {
      name: sample.name,
      input,
      ...(draft ? { deck: draft.deck, draftIssues: draft.issues } : {}),
      error: e.message,
      rawOutputs: outputs,
    };
  }
  await fs.writeFile(
    path.join(out, `${sample.name}.json`),
    JSON.stringify(result, null, 2),
  );
  const entry = {
    name: sample.name,
    seconds: Math.round((Date.now() - start) / 1000),
    error: result.error || "",
    pages: result.deck?.slides.length || 0,
    structureIssues: result.structure?.flat().length || 0,
    draftIssues: result.draftIssues?.length || 0,
    reviewIssues: result.deck?.review?.issues.length || 0,
  };
  results.push(entry);
  console.log(JSON.stringify(entry));
  // 连接失败时不对同一故障重复付费等待；已生成的输出仍保留。
  if (
    result.error &&
    /连接中断|返回40[13]|返回429|返回50[234]/.test(result.error)
  )
    break;
}
await fs.writeFile(
  path.join(out, "results.json"),
  JSON.stringify(
    { calls, results, status: "待逐页人工连读，不代表事实已核验" },
    null,
    2,
  ),
);
console.log(`真实采样记录：${out}；文案请求${calls}次，图片请求0次。`);
if (
  results.length !== selected.length ||
  results.some((r) => r.error || r.structureIssues || r.draftIssues)
)
  process.exitCode = 1;
