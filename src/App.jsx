import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Plus,
  Download,
  Play,
  Settings,
  Undo2,
  Redo2,
  Sparkles,
  Library,
  Check,
  ImagePlus,
} from "lucide-react";
import DeckInitModal from "./components/DeckInitModal.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import SlideViewer, { isEditingTarget } from "./components/SlideViewer.jsx";
import SceneCanvas from "./components/SceneCanvas.jsx";
import {
  api,
  downloadJson,
  readDataUrl,
  useWorkspace,
} from "./services/workspace.js";
import {
  makeDeck,
  newId,
  updateSlide,
  deckScenes,
  sourceIssues,
  visibleFields,
} from "../shared/deck.js";
import { createTextMeasurer, waitForFonts } from "../shared/slideScene.js";
import { LAYOUT_CATALOG } from "../shared/layouts.js";

const fieldName = (field) =>
  field.startsWith("bullets.")
    ? `正文 ${Number(field.split(".")[1]) + 1}`
    : { title: "标题", subtitle: "副标题", keyMessage: "策划结论" }[field] ||
      field;
const valueAt = (slide, field) =>
  field.startsWith("bullets.")
    ? slide.bullets[Number(field.split(".")[1])]
    : slide[field];
const taskNames = {
  queued: "排队中",
  running: "生成中",
  completed: "配图已就绪",
  failed: "配图失败",
  cancelled: "已取消",
  interrupted: "已中断",
  stale: "已过期",
};
const hasTextModel = (c) =>
  Boolean(
    c.llmModel &&
    (c.hasLlmKey ||
      /^http:\/\/(localhost|127\.0\.0\.1)/.test(c.llmApiUrl || "")),
  );
const hasImageModel = (c) =>
  Boolean(
    c.gptimage2Model &&
    (c.hasGptimage2Key ||
      /^http:\/\/(localhost|127\.0\.0\.1)/.test(c.gptimage2ApiUrl || "")),
  );

export default function App() {
  const w = useWorkspace(),
    { deck, assets } = w;
  const [library, setLibrary] = useState([]),
    [config, setConfig] = useState({}),
    [error, setError] = useState("");
  const [creating, setCreating] = useState(false),
    [settings, setSettings] = useState(false),
    [busy, setBusy] = useState("");
  const [index, setIndex] = useState(0),
    [panel, setPanel] = useState("content"),
    [mobilePane, setMobilePane] = useState("canvas"),
    [fullscreen, setFullscreen] = useState(false);
  const [field, setField] = useState("title"),
    [instruction, setInstruction] = useState(""),
    [proposal, setProposal] = useState(null),
    [maxChars, setMaxChars] = useState(30);
  const [versions, setVersions] = useState(null),
    [tasks, setTasks] = useState([]),
    [exportGate, setExportGate] = useState(false),
    [fonts, setFonts] = useState(false),
    [newSource, setNewSource] = useState(""),
    [styleRequest, setStyleRequest] = useState(""),
    [taskError, setTaskError] = useState(""),
    [inlinePrompt, setInlinePrompt] = useState("");
  const operation = useRef(false);
  const activeSlide = useRef(null);
  const measure = useMemo(() => createTextMeasurer(), [fonts]);
  const scenes = useMemo(
    () => (deck ? deckScenes(deck, assets, measure) : []),
    [deck, assets, measure],
  );
  const warnings = useMemo(() => (deck ? sourceIssues(deck) : []), [deck]);
  const current = deck?.slides[index],
    scene = scenes[index];
  // GPT 整页渲染的三态：成图（aiImage）→ 预览/导出吃整页图片；排队（aiRender）→
  // 预览降级为“文字+排版说明”；内容被编辑后两者都随版本失效，回退程序排版。
  const aiImage =
    current && current.aiImage?.contentRevision === current.contentRevision
      ? current.aiImage
      : null,
    aiRender =
      current &&
      !aiImage &&
      current.aiRender?.contentRevision === current.contentRevision
        ? current.aiRender
        : null;
  const renderTask = aiRender
    ? tasks.find((t) => t.requestId === aiRender.taskId)
    : null;
  activeSlide.current = current?.id;
  const structureErrors = scenes.flatMap((s, i) =>
    s.issues.map((issue) => ({
      ...issue,
      slideId: deck.slides[i].id,
      index: i,
    })),
  );
  const semantic = [
    ...(deck?.generationReview?.issues || []).map((i) => ({
      ...i,
      reviewKey: "generationReview",
    })),
    ...(deck?.review?.issues || []),
  ];
  const unconfirmed =
    warnings.filter((i) => !i.acknowledged).length +
    semantic.filter((i) => !i.acknowledged).length;
  const textReady = hasTextModel(config),
    imageReady = hasImageModel(config);
  const refreshLibrary = () =>
    api("/api/decks").then((r) => setLibrary(r.decks));
  useEffect(() => {
    refreshLibrary().catch((e) => setError(e.message));
    api("/api/config")
      .then(setConfig)
      .catch((e) => setError(e.message));
    waitForFonts()
      .then(() => setFonts(true))
      .catch(() => setError("字体加载失败，导出前请重新打开页面"));
  }, []);
  useEffect(() => {
    if (!creating && !settings && !exportGate && !versions && !fullscreen)
      return;
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const dialog =
      dialogs.at(-1) || document.querySelector(".presentation-overlay");
    if (!dialog) return;
    const previous = document.activeElement;
    const blocked = [...document.querySelector(".app-shell").children].filter(
      (el) => !el.contains(dialog),
    );
    const priorInert = blocked.map((el) => el.inert);
    blocked.forEach((el) => {
      el.inert = true;
    });
    dialog.tabIndex = -1;
    const controls = () =>
      [
        ...dialog.querySelectorAll(
          'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]',
        ),
      ].filter((el) => el.getClientRects().length);
    const focus = () => (controls()[0] || dialog).focus();
    if (!dialog.contains(document.activeElement)) focus();
    const trap = (e) => {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Tab") {
        const list = controls(),
          first = list[0],
          last = list.at(-1);
        if (
          !first ||
          (e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === dialog)) ||
          (!e.shiftKey &&
            (document.activeElement === last ||
              document.activeElement === dialog))
        ) {
          e.preventDefault();
          (e.shiftKey ? last || dialog : first || dialog).focus();
        }
      } else if (e.key === "Escape" && dialogs.length) {
        e.preventDefault();
        e.stopPropagation();
        dialog.querySelector("header button:not(:disabled)")?.click();
      }
    };
    const keepFocus = (e) => {
      if (!dialog.contains(e.target)) focus();
    };
    document.addEventListener("keydown", trap, true);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("keydown", trap, true);
      document.removeEventListener("focusin", keepFocus);
      blocked.forEach((el, i) => {
        el.inert = priorInert[i];
      });
      if (previous?.isConnected && !previous.closest("[inert]"))
        previous.focus();
    };
  }, [creating, settings, exportGate, Boolean(versions), fullscreen]);
  useEffect(() => {
    setField("title");
    setProposal((p) => (p?.slideId === current?.id ? p : null));
    setInstruction("");
  }, [current?.id]);
  useEffect(() => {
    if (!deck?.id) {
      setTasks([]);
      setTaskError("");
      return;
    }
    let active = true;
    const poll = () =>
      api(`/api/image-tasks?deckId=${deck.id}`)
        .then((r) => {
          if (active) {
            setTasks(r.tasks);
            setTaskError((r.warnings || []).join("；"));
          }
        })
        .catch(() => {
          if (active)
            setTaskError(
              "配图任务状态暂时无法读取，正在重试；不会自动重新提交付费请求。",
            );
        });
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [deck?.id]);
  useEffect(() => {
    const key = (e) => {
      if (
        !deck ||
        creating ||
        settings ||
        exportGate ||
        versions ||
        fullscreen ||
        isEditingTarget(e)
      )
        return;
      if (
        (e.ctrlKey || e.metaKey) &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        w.travel(e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
      } else if (["ArrowRight", "ArrowDown", "PageDown"].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.min(deck.slides.length - 1, i + 1));
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function act(fn, label = "") {
    if (label && operation.current) return;
    if (label) {
      operation.current = true;
      setBusy(label);
    }
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      if (label) {
        operation.current = false;
        setBusy("");
      }
    }
  }
  async function open(id) {
    await w.flush();
    await w.open(await api(`/api/decks/${id}`));
    setIndex(0);
    setProposal(null);
    setError("");
    setPanel("content");
  }
  function patch(changes, group) {
    w.change((d) => updateSlide(d, current.id, changes, measure), group);
  }
  function patchField(name, value) {
    if (name.startsWith("bullets.")) {
      const next = [...current.bullets];
      next[Number(name.split(".")[1])] = value;
      patch({ bullets: next }, `${current.id}-${name}`);
    } else patch({ [name]: value }, `${current.id}-${name}`);
  }
  async function restyle() {
    const { design } = await api("/api/deck-restyle", {
      deck: w.ref.current,
      description: styleRequest.trim(),
    });
    // 换风格后旧 AI 页色块不再匹配新调色板，一并清掉重渲。
    w.change((prev) => ({
      ...prev,
      design,
      slides: prev.slides.map((s) => ({
        ...s,
        aiImage: null,
        aiRender: null,
      })),
    }));
    setStyleRequest("");
  }
  // 单页 GPT 整页渲染：aiRender 排队态与 aiImage 成图都只随本页内容版本生效，
  // 编辑文字（contentRevision 变化）后自动失效回退程序排版；写回不走 updateSlide，
  // 避免版本号被 +1 导致结果立刻失效。
  function patchSlideFields(slideId, patch) {
    w.change((prev) => ({
      ...prev,
      slides: prev.slides.map((s) =>
        s.id === slideId ? { ...s, ...patch } : s,
      ),
    }));
  }
  function applyRenderTask(task) {
    const s = w.ref.current?.slides.find((s) => s.id === task.slideId);
    if (
      task.kind !== "render" ||
      task.status !== "completed" ||
      !task.asset ||
      task.deckId !== w.ref.current?.id ||
      s?.contentRevision !== task.inputRevision ||
      s?.aiImage?.assetId === task.asset.id
    )
      return;
    w.setAssets((a) => ({ ...a, [task.asset.id]: task.asset }));
    patchSlideFields(task.slideId, {
      aiImage: { contentRevision: task.inputRevision, assetId: task.asset.id },
      aiRender: null,
    });
  }
  // 独立配图（kind=inline）任务完成后自动追加到页面插图列表，幂等去重。
  function applyInlineTask(task) {
    const s = w.ref.current?.slides.find((s) => s.id === task.slideId);
    if (
      task.kind !== "inline" ||
      task.status !== "completed" ||
      !task.asset ||
      task.deckId !== w.ref.current?.id ||
      !s ||
      (s.inlineImages || []).some((i) => i.assetId === task.asset.id)
    )
      return;
    w.setAssets((a) => ({ ...a, [task.asset.id]: task.asset }));
    patchSlideFields(task.slideId, {
      inlineImages: [
        ...(s.inlineImages || []),
        {
          id: crypto.randomUUID(),
          assetId: task.asset.id,
          placement: null,
          prompt: task.prompt || "",
        },
      ].slice(0, 6),
    });
  }
  useEffect(() => {
    if (!deck) return;
    for (const t of tasks) applyRenderTask(t);
    for (const t of tasks) applyInlineTask(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, deck?.id]);
  async function renderSlideNow() {
    const r = await api("/api/deck-render-slide", {
      deck: w.ref.current,
      slideId: current.id,
    });
    const { placements, ...slidePatch } = r.slidePatch;
    if (Array.isArray(placements)) {
      // 整页渲染方案带回了每张独立配图的摆位，按顺序写回对应插图。
      w.change((d) => ({
        ...d,
        slides: d.slides.map((s) =>
          s.id === current.id
            ? {
                ...s,
                inlineImages: (s.inlineImages || []).map((img, i) =>
                  placements[i] ? { ...img, placement: placements[i] } : img,
                ),
              }
            : s,
        ),
      }));
    }
    patchSlideFields(current.id, slidePatch);
    const list = await api(`/api/image-tasks?deckId=${deck.id}`);
    setTasks(list.tasks);
    if (r.done) {
      const task = list.tasks.find(
        (t) => t.requestId === r.slidePatch.aiRender.taskId,
      );
      if (task) applyRenderTask(task);
    }
  }
  function clearAiImage() {
    patchSlideFields(current.id, { aiImage: null });
  }
  function cancelRender() {
    const pending = current?.aiRender;
    if (!pending) return;
    act(async () => {
      await api(`/api/image-tasks/${pending.taskId}/cancel`, {});
      patchSlideFields(current.id, { aiRender: null });
      setTasks((await api(`/api/image-tasks?deckId=${deck.id}`)).tasks);
    });
  }
  async function review(snapshot = w.ref.current) {
    const version = w.version.current;
    try {
      const result = await api("/api/deck-review", { deck: snapshot });
      if (w.ref.current?.id !== snapshot.id || w.version.current !== version)
        throw new Error("文稿已改变，本次旧版本复核未写回，请重新检查");
      w.change((d) => ({ ...d, review: result.review }));
    } catch (e) {
      if (w.ref.current?.id === snapshot.id && w.version.current === version)
        w.change((d) => ({
          ...d,
          review: {
            status: "failed",
            error: e.message,
            revisions: Object.fromEntries(
              d.slides.map((s) => [s.id, s.contentRevision]),
            ),
            issues: [],
          },
        }));
      throw e;
    }
  }
  async function create(options) {
    if (operation.current) return;
    await w.flush();
    const draft = makeDeck(options);
    const result = await api("/api/decks", { deck: draft });
    await w.open(result);
    setIndex(0);
    setCreating(false);
    operation.current = true;
    try {
      if (options.ai) {
        setBusy("正在生成整套文案");
        const version = w.version.current;
        const generated = await api("/api/deck-draft", { deck: w.ref.current });
        if (w.version.current !== version || w.ref.current?.id !== draft.id)
          throw new Error("文稿已改变，初稿结果未覆盖当前编辑");
        w.change(generated.deck);
        if (generated.issues.length)
          setError(`初稿已保留，仍需处理：${generated.issues.join("；")}`);
      }
      if (options.images?.length && w.ref.current?.id === draft.id) {
        w.setAssets((previous) => ({
          ...previous,
          ...Object.fromEntries(options.images.map((a) => [a.id, a])),
        }));
        options.images.forEach((a, i) => {
          const slide = w.ref.current.slides[i];
          w.change((d) =>
            updateSlide(
              d,
              slide.id,
              { assets: [{ id: a.id, fit: "contain" }], omitVisual: false },
              measure,
            ),
          );
        });
      }
      await w.flush();
      if (options.ai) {
        setBusy("正在整套复核");
        await review();
        await w.flush();
      }
    } catch (e) {
      setError(e.message);
    } finally {
      operation.current = false;
      setBusy("");
    }
  }
  function replaceSources(next) {
    w.change((d) => ({
      ...d,
      sources: typeof next === "function" ? next(d.sources) : next,
      review: null,
      generationReview: null,
      confirmations: {},
      slides: d.slides.map((s) => ({
        ...s,
        contentRevision: s.contentRevision + 1,
      })),
    }));
    setProposal(null);
  }
  async function addSourceFile(file) {
    if (!file) return;
    if (
      !/\.(txt|md|markdown)$/i.test(file.name) ||
      file.size > 10 * 1024 * 1024
    )
      throw new Error("请添加10MB以内的TXT或Markdown");
    const id = w.ref.current.id,
      text = await file.text();
    if (text.length > 200000) throw new Error("单份文字资料不能超过20万字符");
    if (w.ref.current?.id !== id) throw new Error("已切换文稿，资料未写入");
    replaceSources((sources) => [
      ...sources,
      { id: newId(), name: file.name, text },
    ]);
  }
  async function backup(snapshot = w.ref.current) {
    const data = await api("/api/backups/export", { deck: snapshot });
    downloadJson(data, `${snapshot.title || "文稿"}.slideflow.json`);
  }
  async function importBackup(file) {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) throw new Error("备份超过100MB");
    const result = await api(
      "/api/backups/import",
      JSON.parse(await file.text()),
    );
    await w.open(result);
    setIndex(0);
    await refreshLibrary();
  }
  async function suggest(action = instruction, shorten = false) {
    const snapshot = w.ref.current,
      source = snapshot.slides[index],
      version = source.contentRevision;
    const result = await api("/api/deck-edit", {
      deck: snapshot,
      slideId: source.id,
      inputRevision: version,
      field,
      instruction: action,
      ...(shorten ? { maxChars: Number(maxChars) } : {}),
    });
    const latest = w.ref.current?.slides.find((s) => s.id === source.id);
    if (
      w.ref.current?.id !== snapshot.id ||
      latest?.contentRevision !== version ||
      activeSlide.current !== source.id
    )
      throw new Error("页面已改变，旧修改建议已丢弃");
    setProposal({ ...result, instruction: action });
  }
  function applyProposal() {
    const latest = w.ref.current?.slides.find((s) => s.id === proposal.slideId);
    if (
      proposal.deckId !== w.ref.current?.id ||
      latest?.contentRevision !== proposal.inputRevision
    ) {
      setError("建议已过期，请按当前版本重新生成");
      setProposal(null);
      return;
    }
    w.change((d) => {
      const changes = proposal.field.startsWith("bullets.")
        ? {
            bullets: latest.bullets.map((b, i) =>
              i === Number(proposal.field.split(".")[1]) ? proposal.after : b,
            ),
          }
        : { [proposal.field]: proposal.after };
      const next = updateSlide(
        d,
        latest.id,
        {
          ...changes,
          provenance: {
            ...latest.provenance,
            [proposal.field]: proposal.provenance || [],
          },
        },
        measure,
      );
      return {
        ...next,
        history: [
          ...d.history,
          {
            slideId: latest.id,
            text:
              proposal.instruction ||
              `采用${fieldName(proposal.field)}复核建议`,
            at: new Date().toISOString(),
          },
        ],
      };
    });
    setProposal(null);
  }
  async function uploadImage(file) {
    if (!file) return;
    if (
      file.size > 10 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new Error("请上传10MB以内的PNG、JPEG或WebP");
    if (current.assets.length >= 2) throw new Error("每页最多2张图片");
    const snapshot = current,
      dataUrl = await readDataUrl(file),
      image = new Image();
    image.src = dataUrl;
    await image.decode();
    const { asset } = await api("/api/assets", { dataUrl, name: file.name });
    if (
      w.ref.current?.id !== deck.id ||
      w.ref.current?.slides.find((s) => s.id === snapshot.id)
        ?.contentRevision !== snapshot.contentRevision
    )
      throw new Error("页面已改变，图片未覆盖当前编辑，请重新上传");
    w.setAssets((a) => ({ ...a, [asset.id]: asset }));
    patch({
      assets: [...snapshot.assets, { id: asset.id, fit: "contain" }],
      omitVisual: false,
    });
  }
  // 独立配图上色：支持一次多选上传，全部转码后一次性追加，页面被改动则整体放弃。
  async function uploadInlineImages(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if ((current.inlineImages || []).length + files.length > 6)
      throw new Error("每页最多6张插图");
    for (const file of files)
      if (
        file.size > 10 * 1024 * 1024 ||
        !["image/png", "image/jpeg", "image/webp"].includes(file.type)
      )
        throw new Error("请上传10MB以内的PNG、JPEG或WebP");
    const snapshot = current;
    const uploaded = await Promise.all(
      files.map(async (file) => {
        const dataUrl = await readDataUrl(file);
        const image = new Image();
        image.src = dataUrl;
        await image.decode();
        return api("/api/assets", { dataUrl, name: file.name });
      }),
    );
    if (w.ref.current?.id !== deck.id)
      throw new Error("文稿已改变，图片未加入当前页面");
    w.setAssets((a) => ({
      ...a,
      ...Object.fromEntries(uploaded.map(({ asset }) => [asset.id, asset])),
    }));
    patch({
      inlineImages: [
        ...(snapshot.inlineImages || []),
        ...uploaded.map(({ asset }) => ({
          id: crypto.randomUUID(),
          assetId: asset.id,
          placement: null,
          prompt: "",
        })),
      ].slice(0, 6),
    });
  }
  async function generateInlineImage() {
    const saved = await w.flush();
    const slide = saved.slides.find((s) => s.id === current.id);
    await api("/api/deck-inline-image", {
      deckId: saved.id,
      slideId: slide.id,
      prompt: inlinePrompt.trim(),
    });
    setTasks((await api(`/api/image-tasks?deckId=${saved.id}`)).tasks);
  }
  async function doExport() {
    if (!fonts) throw new Error("字体仍在加载");
    if (structureErrors.length) {
      setIndex(structureErrors[0].index);
      setPanel("check");
      setExportGate(false);
      throw new Error("存在结构、溢出或资产问题，请先处理后导出");
    }
    if (unconfirmed) throw new Error("请逐项查看并确认待核对内容");
    const saved = await w.flush();
    const { exportToPptx } = await import("./services/pptxExport.js");
    await exportToPptx({ ...saved, assets });
    setExportGate(false);
  }
  const pageState = (i) =>
    tasks.some(
      (t) =>
        t.slideId === deck.slides[i].id &&
        ["queued", "running"].includes(t.status),
    )
      ? "配图处理中"
      : scenes[i].issues.length
        ? "存在问题"
        : [...warnings, ...semantic].some(
              (v) => v.slideId === deck.slides[i].id && !v.acknowledged,
            )
          ? "待核对"
          : "可导出";
  const issueCard = (issue) => (
    <article
      key={issue.id}
      className={`issue-card ${issue.acknowledged ? "acknowledged" : ""}`}
    >
      <button
        className="text-link"
        onClick={() => {
          setIndex(deck.slides.findIndex((s) => s.id === issue.slideId));
          setField(issue.field);
        }}
      >
        {fieldName(issue.field)}
      </button>
      <p>{issue.message}</p>
      {issue.text && <blockquote>{issue.text}</blockquote>}
      {issue.refs?.map((r, i) => (
        <blockquote key={i}>
          {r.sourceId}：{r.quote}
        </blockquote>
      ))}
      {issue.suggestion && (
        <button
          onClick={() => {
            const s = deck.slides.find((s) => s.id === issue.slideId);
            setProposal({
              deckId: deck.id,
              slideId: s.id,
              inputRevision: s.contentRevision,
              field: issue.field,
              before: valueAt(s, issue.field),
              after: issue.suggestion,
            });
            setIndex(deck.slides.indexOf(s));
            setExportGate(false);
          }}
        >
          查看修订对比
        </button>
      )}
      <label className="check-line">
        <input
          type="checkbox"
          checked={Boolean(issue.acknowledged)}
          onChange={(e) => {
            const checked = e.target.checked;
            w.change((d) =>
              issue.text
                ? {
                    ...d,
                    confirmations: {
                      ...d.confirmations,
                      [issue.id]: checked ? issue.text : "",
                    },
                  }
                : {
                    ...d,
                    [issue.reviewKey || "review"]: {
                      ...d[issue.reviewKey || "review"],
                      issues: d[issue.reviewKey || "review"].issues.map((x) =>
                        x.id === issue.id ? { ...x, acknowledged: checked } : x,
                      ),
                    },
                  },
            );
          }}
        />
        我已查看，接受此项待核对风险
      </label>
    </article>
  );

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">S</span>
          <span>
            SlideFlow<small>本机演示工作台</small>
          </span>
        </div>
        {deck && (
          <>
            <span className="header-divider" />
            <input
              className="deck-name"
              aria-label="文稿名称"
              value={deck.title}
              maxLength={200}
              onChange={(e) =>
                w.change((d) => ({ ...d, title: e.target.value }), "deck-title")
              }
            />
            <span className={`save-status ${w.status}`} aria-live="polite">
              {
                {
                  saved: "已保存到本机",
                  dirty: "未保存",
                  saving: "保存中…",
                  error: "保存失败",
                  conflict: "版本冲突",
                }[w.status]
              }
            </span>
          </>
        )}
        <div className="header-actions">
          {deck && (
            <>
              <button
                title="撤销 Ctrl+Z"
                disabled={!w.historyState.undo}
                onClick={() => w.travel("undo")}
              >
                <Undo2 size={16} />
              </button>
              <button
                title="重做 Ctrl+Y"
                disabled={!w.historyState.redo}
                onClick={() => w.travel("redo")}
              >
                <Redo2 size={16} />
              </button>
              <button onClick={() => setFullscreen(true)}>
                <Play size={15} />
                演示
              </button>
              <button className="primary" onClick={() => setExportGate(true)}>
                <Download size={15} />
                导出 PPTX
              </button>
            </>
          )}
          <button title="模型设置" onClick={() => setSettings(true)}>
            <Settings size={18} />
          </button>
        </div>
      </header>
      {(error || w.saveError) && (
        <div className="error-banner" role="alert">
          <span>{w.saveError || error}</span>
          <div className="button-row">
            {w.saveError && (
              <>
                <button onClick={() => act(() => w.flush())}>重试保存</button>
                <button onClick={() => act(() => backup())}>
                  备份当前修改
                </button>
                <button
                  onClick={() =>
                    act(async () => {
                      if (
                        !window.confirm(
                          "将放弃当前未提交修改，读取服务端最新版本。请先下载备份；确定继续？",
                        )
                      )
                        return;
                      await w.reload();
                      setIndex(0);
                      setProposal(null);
                    }, "重新读取文稿")
                  }
                >
                  放弃本地修改并重新读取
                </button>
              </>
            )}
            <button onClick={() => setError("")} aria-label="关闭提示">
              ×
            </button>
          </div>
        </div>
      )}
      {deck && taskError && (
        <div className="error-banner" role="status">
          {taskError}
        </div>
      )}
      {!deck ? (
        <main className="library-main">
          <div className="library-heading">
            <div>
              <span className="eyebrow">YOUR IDEAS, CLEARLY PRESENTED</span>
              <h1>让想法，清晰呈现。</h1>
              <p>
                从资料到完整文稿，文案可修改，版式可检查，每一页都留在本机。
              </p>
            </div>
            <button className="primary large" onClick={() => setCreating(true)}>
              <Plus size={18} />
              新建演示文稿
            </button>
          </div>
          <div className="library-toolbar">
            <h2>
              <Library size={18} />
              我的文稿 <span>{library.length}</span>
            </h2>
            <div className="button-row">
              <label className="file-button">
                <Download size={15} />
                导入备份
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    act(() => importBackup(e.target.files[0]), "导入备份");
                    e.target.value = "";
                  }}
                />
              </label>
              <button onClick={() => act(refreshLibrary)}>刷新</button>
            </div>
          </div>
          <div className="deck-grid">
            {library.map((item) => (
              <article className="deck-card" key={item.id}>
                <button
                  className="deck-cover"
                  disabled={item.unreadable}
                  onClick={() => act(() => open(item.id), "打开文稿")}
                >
                  <strong>{item.title}</strong>
                  <small>{item.pages} 页</small>
                </button>
                <div className="deck-card-info">
                  <strong>{item.title}</strong>
                  <small>
                    {item.updatedAt
                      ? new Date(item.updatedAt).toLocaleString()
                      : "主文件无法读取"}
                  </small>
                  <div className="button-row">
                    <button
                      onClick={() =>
                        act(async () => {
                          const name = window.prompt("文稿新名称", item.title);
                          if (name?.trim()) {
                            const r = await api(`/api/decks/${item.id}`);
                            await api(
                              `/api/decks/${item.id}`,
                              {
                                deck: { ...r.deck, title: name },
                                expectedRevision: r.deck.revision,
                              },
                              "PUT",
                            );
                            await refreshLibrary();
                          }
                        })
                      }
                    >
                      重命名
                    </button>
                    <button
                      onClick={() =>
                        act(async () => {
                          await api(`/api/decks/${item.id}/copy`, {});
                          await refreshLibrary();
                        })
                      }
                    >
                      复制
                    </button>
                    <button
                      onClick={() =>
                        act(async () => {
                          const b = await api(`/api/decks/${item.id}/backup`);
                          downloadJson(b, `${item.title}.slideflow.json`);
                        })
                      }
                    >
                      备份
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        act(async () => {
                          if (
                            window.confirm(
                              `确认删除“${item.title}”？建议先备份。`,
                            )
                          ) {
                            await api(
                              `/api/decks/${item.id}`,
                              { expectedRevision: item.revision },
                              "DELETE",
                            );
                            await refreshLibrary();
                          }
                        })
                      }
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            ))}
            <button className="new-deck-card" onClick={() => setCreating(true)}>
              <Plus size={32} />
              <strong>开始一份新文稿</strong>
              <span>文字由程序排版，无需等待生图</span>
            </button>
          </div>
          <p className="library-note">
            <Check size={15} />
            可离线编辑与导出已保存的文稿；AI功能需要网络及模型配置。
          </p>
        </main>
      ) : (
        <>
          <nav className="workspace-toolbar">
            <button
              onClick={() =>
                act(async () => {
                  await w.close();
                  await refreshLibrary();
                }, "返回文稿库")
              }
            >
              <ArrowLeft size={15} />
              文稿库
            </button>
            <span>
              {deck.slides.length} 页 ·{" "}
              {deck.mode === "sources" ? "依据资料整理" : "AI扩展草稿"} ·{" "}
              {busy || "原生文字实时预览"}
            </span>
            <div className="button-row">
              <button
                onClick={() =>
                  act(async () => {
                    await w.flush();
                    setVersions(
                      (await api(`/api/decks/${deck.id}/versions`)).versions,
                    );
                  })
                }
              >
                版本记录
              </button>
              <button onClick={() => act(() => backup())}>备份</button>
              <button
                disabled={Boolean(busy) || !textReady}
                title={!textReady ? "请先配置文案模型" : ""}
                onClick={() => act(() => review(), "整套复核中")}
              >
                整套复核
              </button>
            </div>
          </nav>
          <nav className="mobile-tabs">
            {[
              ["pages", "页面"],
              ["canvas", "画布"],
              ["inspector", "编辑面板"],
            ].map(([key, label]) => (
              <button
                key={key}
                className={mobilePane === key ? "selected" : ""}
                onClick={() => setMobilePane(key)}
              >
                {label}
              </button>
            ))}
          </nav>
          <main className={`workspace mobile-${mobilePane}`}>
            <aside className="page-rail">
              <div className="rail-heading">
                页面{" "}
                <span>
                  {index + 1} / {deck.slides.length}
                </span>
              </div>
              {deck.slides.map((s, i) => (
                <button
                  key={s.id}
                  className={`thumbnail ${i === index ? "active" : ""}`}
                  onClick={() => {
                    setIndex(i);
                    setMobilePane("canvas");
                  }}
                >
                  <div className="thumbnail-canvas">
                    <SceneCanvas
                      scene={scenes[i]}
                      assets={assets}
                      label={`第${i + 1}页缩略图`}
                    />
                  </div>
                  <div>
                    <strong>{String(i + 1).padStart(2, "0")}</strong>
                    <span>{s.title || "未填写标题"}</span>
                  </div>
                  <small className={scenes[i].issues.length ? "warning" : ""}>
                    {pageState(i)}
                  </small>
                </button>
              ))}
            </aside>
            <section className="canvas-column">
              <div className="canvas-heading">
                <div>
                  <span className="eyebrow">
                    SLIDE {String(index + 1).padStart(2, "0")}
                  </span>
                  <h2>{current?.title || "开始编辑这一页"}</h2>
                </div>
                <span className="status-chip">{pageState(index)}</span>
              </div>
              {aiRender ? (
                <div className="render-pending">
                  <div className="render-pending-head">
                    <strong>
                      {renderTask?.status === "failed"
                        ? "整页图生成失败"
                        : "排版方案已定 · GPT Image 2 生成中"}
                    </strong>
                    <span className="muted">
                      {renderTask?.status === "failed"
                        ? `${renderTask.error || "供应商返回失败"}，可在右侧检查后重试`
                        : "完成后本页自动替换为整页图片"}
                    </span>
                  </div>
                  <p className="render-pending-desc">
                    {aiRender.description}
                  </p>
                  <div className="render-pending-fields">
                    {Object.entries(visibleFields(current)).map(
                      ([field, text]) => (
                        <p
                          key={field}
                          className={
                            field === "title" ? "pending-title" : ""
                          }
                        >
                          {text}
                        </p>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <SlideViewer
                  presentation={deck}
                  activeSlideIndex={index}
                  onSelectSlide={setIndex}
                  scenes={scenes}
                  assets={assets}
                />
              )}
              <div className="canvas-meta">
                <span>
                  {LAYOUT_CATALOG[current?.layoutId]?.name || "版式待调整"} ·
                  1600 × 900 · 16:9
                </span>
                <span>
                  {scene?.issues.length
                    ? `${scene.issues.length}项结构问题`
                    : "结构检查通过"}{" "}
                  · {fonts ? "字体已加载" : "字体加载中"}
                </span>
              </div>
              <section className="assistant-panel">
                <div className="assistant-heading">
                  <Sparkles size={16} />
                  <strong>文案助手</strong>
                  <span>只修改所选字段，先看对比再应用</span>
                </div>
                <div className="button-row">
                  <select
                    aria-label="AI修改字段"
                    value={field}
                    onChange={(e) => setField(e.target.value)}
                  >
                    {[
                      "title",
                      ...(current.type === "cover"
                        ? ["subtitle"]
                        : ["keyMessage"]),
                      ...current.bullets.map((_, i) => `bullets.${i}`),
                    ].map((f) => (
                      <option key={f} value={f}>
                        {fieldName(f)}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!textReady || Boolean(busy)}
                    onClick={() =>
                      act(
                        () => suggest("更口语化，保持事实、范围和原意不变"),
                        "生成修改建议",
                      )
                    }
                  >
                    口语化
                  </button>
                  <input
                    type="number"
                    aria-label="精简字数目标"
                    min="1"
                    value={maxChars}
                    onChange={(e) => setMaxChars(e.target.value)}
                  />
                  <button
                    disabled={!textReady || Boolean(busy)}
                    onClick={() =>
                      act(
                        () =>
                          suggest(
                            "按指定目标精简，保持必要主语和数据口径",
                            true,
                          ),
                        "精简建议生成中",
                      )
                    }
                  >
                    精简至目标字数
                  </button>
                </div>
                <div className="assistant-input">
                  <textarea
                    aria-label="修改要求"
                    rows={2}
                    placeholder={
                      textReady
                        ? "例如：减少铺陈，保留这条的原因和限制条件"
                        : "请先配置文案模型；右侧字段仍可直接编辑"
                    }
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                  />
                  <button
                    className="primary"
                    disabled={
                      !instruction.trim() || !textReady || Boolean(busy)
                    }
                    onClick={() => act(() => suggest(), "生成修改建议")}
                  >
                    提出修改
                  </button>
                </div>
                {proposal && (
                  <div className="change-preview">
                    <div className="diff-grid">
                      <div>
                        <small>修改前 · {fieldName(proposal.field)}</small>
                        <p>{proposal.before}</p>
                      </div>
                      <div>
                        <small>建议稿</small>
                        <p>{proposal.after}</p>
                      </div>
                    </div>
                    <div className="button-row">
                      <button className="primary" onClick={applyProposal}>
                        应用建议
                      </button>
                      <button onClick={() => setProposal(null)}>放弃</button>
                    </div>
                  </div>
                )}
              </section>
            </section>
            <aside className="inspector">
              <nav className="inspector-tabs">
                {[
                  ["content", "内容"],
                  ["design", "配图"],
                  ["style", "风格"],
                  ["check", "检查"],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    className={panel === key ? "active" : ""}
                    onClick={() => setPanel(key)}
                  >
                    {label}
                    {key === "check" &&
                      structureErrors.filter((e) => e.index === index).length >
                        0 && <i />}
                  </button>
                ))}
              </nav>
              <div className="inspector-body">
                {panel === "content" && (
                  <>
                    <h3>页面内容</h3>
                    {current.legacyImageUrl && (
                      <article className="issue-card">
                        <p>
                          这是旧整页图片，文字不可编辑。转换仅使用已有结构化文案，不把旧整页图当作插图。
                        </p>
                        <button
                          onClick={() =>
                            patch({
                              legacyImageUrl: "",
                              assets: [],
                              omitVisual: true,
                              layoutPinned: false,
                            })
                          }
                        >
                          转换为原生页面
                        </button>
                      </article>
                    )}
                    {[
                      "title",
                      ...(current.type === "cover"
                        ? ["subtitle"]
                        : ["keyMessage"]),
                    ].map((f) => (
                      <label key={f}>
                        {fieldName(f)}
                        {f === "keyMessage" && (
                          <small>仅金句版式在页面显示</small>
                        )}
                        <textarea
                          rows={f === "title" ? 2 : 3}
                          value={current[f] || ""}
                          onFocus={() => setField(f)}
                          onChange={(e) => patchField(f, e.target.value)}
                        />
                      </label>
                    ))}
                    {current.type !== "cover" && (
                      <>
                        <div className="section-heading">
                          <h3>正文条目</h3>
                          <button
                            onClick={() =>
                              patch({ bullets: [...current.bullets, ""] })
                            }
                          >
                            <Plus size={14} />
                            添加
                          </button>
                        </div>
                        {current.bullets.map((b, i) => (
                          <label key={i}>
                            <span className="field-toolbar">
                              正文 {i + 1}
                              <button
                                title="删除本条"
                                onClick={() =>
                                  patch({
                                    bullets: current.bullets.filter(
                                      (_, n) => n !== i,
                                    ),
                                  })
                                }
                              >
                                移除
                              </button>
                            </span>
                            <textarea
                              rows={4}
                              value={b}
                              onFocus={() => setField(`bullets.${i}`)}
                              onChange={(e) =>
                                patchField(`bullets.${i}`, e.target.value)
                              }
                            />
                          </label>
                        ))}
                      </>
                    )}
                    <details>
                      <summary>原始资料与修改历史</summary>
                      {deck.sources.map((s) => (
                        <article className="source-card" key={s.id}>
                          <strong>{s.name}</strong>
                          <small>{s.id}</small>
                          <textarea
                            aria-label={`资料 ${s.name}`}
                            rows={4}
                            value={s.text}
                            maxLength={200000}
                            onChange={(e) =>
                              replaceSources((sources) =>
                                sources.map((x) =>
                                  x.id === s.id
                                    ? { ...x, text: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                          <button
                            onClick={() => {
                              if (
                                window.confirm(
                                  `移除资料“${s.name}”？相关来源与复核结果会失效。`,
                                )
                              )
                                replaceSources((sources) =>
                                  sources.filter((x) => x.id !== s.id),
                                );
                            }}
                          >
                            移除资料
                          </button>
                        </article>
                      ))}
                      <label>
                        补充文字资料
                        <textarea
                          rows={4}
                          maxLength={200000}
                          value={newSource}
                          onChange={(e) => setNewSource(e.target.value)}
                        />
                      </label>
                      <div className="button-row">
                        <button
                          disabled={
                            !newSource.trim() || deck.sources.length >= 100
                          }
                          onClick={() => {
                            replaceSources((sources) => [
                              ...sources,
                              {
                                id: newId(),
                                name: "补充资料",
                                text: newSource,
                              },
                            ]);
                            setNewSource("");
                          }}
                        >
                          加入资料
                        </button>
                        <label className="file-button">
                          添加TXT / Markdown
                          <input
                            type="file"
                            accept=".txt,.md,.markdown"
                            onChange={(e) => {
                              const file = e.target.files[0];
                              e.target.value = "";
                              act(() => addSourceFile(file));
                            }}
                          />
                        </label>
                      </div>
                      <p className="muted">
                        补充或修改资料不会自动改写页面；请主动重新复核或选择字段修改。
                      </p>
                      {deck.history
                        .filter(
                          (h) => h.slideId === current.id || h.slideId === null,
                        )
                        .map((h, i) => (
                          <p className="source-card" key={i}>
                            {h.text}
                          </p>
                        ))}
                      {!deck.sources.length && (
                        <p className="muted">尚未提供文字资料。</p>
                      )}
                    </details>
                  </>
                )}
                {panel === "design" && (
                  <>
                    <h3>背景图</h3>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={current.omitVisual}
                        onChange={(e) =>
                          patch({ omitVisual: e.target.checked })
                        }
                      />
                      省略空画框，不生成配图
                    </label>
                    <label>
                      背景描述
                      <textarea
                        rows={3}
                        value={current.visualIdea || ""}
                        placeholder="描述背景氛围与意象；渲染整页图时作为背景指令"
                        onChange={(e) =>
                          patch({ visualIdea: e.target.value }, "visual")
                        }
                      />
                    </label>
                    <div className="button-row">
                      <label className="file-button">
                        <ImagePlus size={15} />
                        上传
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(e) => {
                            act(
                              () => uploadImage(e.target.files[0]),
                              "上传图片",
                            );
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {current.assets.map((a, i) => (
                      <div className="asset-card" key={`${a.id}-${i}`}>
                        <img src={assets[a.id]?.url} alt={`本页配图${i + 1}`} />
                        <select
                          aria-label="图片显示方式"
                          value={a.fit}
                          onChange={(e) =>
                            patch({
                              assets: current.assets.map((x, n) =>
                                n === i ? { ...x, fit: e.target.value } : x,
                              ),
                            })
                          }
                        >
                          <option value="contain">完整显示</option>
                          <option value="cover">居中裁切</option>
                        </select>
                        <button
                          onClick={() =>
                            patch({
                              assets: current.assets.filter((_, n) => n !== i),
                            })
                          }
                        >
                          移除图片
                        </button>
                      </div>
                    ))}
                    {tasks
                      .filter((t) => t.slideId === current.id)
                      .map((t) => (
                        <div className="task-card" key={t.requestId}>
                          <strong>
                            {t.status === "completed" &&
                            t.inputRevision !== current.contentRevision
                              ? "配图属于旧版本，未覆盖当前页面"
                              : taskNames[t.status]}
                          </strong>
                          <p>{t.error}</p>
                          {["queued", "running"].includes(t.status) && (
                            <button
                              onClick={() =>
                                act(async () => {
                                  await api(
                                    `/api/image-tasks/${t.requestId}/cancel`,
                                    {},
                                  );
                                  setTasks(
                                    (
                                      await api(
                                        `/api/image-tasks?deckId=${deck.id}`,
                                      )
                                    ).tasks,
                                  );
                                })
                              }
                            >
                              取消等待
                            </button>
                          )}
                        </div>
                      ))}
                    <h3>独立配图</h3>
                    <p className="muted">
                      插图作为页面元素叠加显示：程序排版与GPT整页渲染都会为它留位，不压文字；可上传多张，也可按描述生成。
                    </p>
                    <label>
                      插图描述
                      <textarea
                        rows={3}
                        value={inlinePrompt}
                        placeholder="描述想要的插图内容，如：金色海面上的出口货轮"
                        onChange={(e) => setInlinePrompt(e.target.value)}
                      />
                    </label>
                    <div className="button-row">
                      <label className="file-button">
                        <ImagePlus size={15} />
                        上传图片
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          multiple
                          onChange={(e) => {
                            act(
                              () => uploadInlineImages(e.target.files),
                              "上传插图",
                            );
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        disabled={
                          !imageReady ||
                          Boolean(busy) ||
                          !inlinePrompt.trim()
                        }
                        onClick={() => act(generateInlineImage, "生成插图")}
                      >
                        生成插图
                      </button>
                    </div>
                    {!imageReady && (
                      <p className="muted">
                        图片模型尚未配置；不影响编辑、预览与导出。
                      </p>
                    )}
                    {(current.inlineImages || []).map((img, i) => (
                      <div className="asset-card" key={img.id}>
                        <img
                          src={assets[img.assetId]?.url}
                          alt={`插图${i + 1}`}
                        />
                        <span className="muted">
                          {img.placement
                            ? "已按排版留位"
                            : "待渲染时自动留位"}
                        </span>
                        <button
                          onClick={() =>
                            patch({
                              inlineImages: (
                                current.inlineImages || []
                              ).filter((x) => x.id !== img.id),
                            })
                          }
                        >
                          移除插图
                        </button>
                      </div>
                    ))}
                  </>
                )}
                {panel === "style" && (
                  <>
                    <h3>视觉风格</h3>
                    <div className="style-card">
                      <div className="style-head">
                        <strong>{deck.design.name}</strong>
                        <span className="muted">{deck.design.mood}</span>
                      </div>
                    </div>
                    <label>
                      想要的风格
                      <textarea
                        rows={3}
                        value={styleRequest}
                        placeholder="描述感觉，如：深海蓝科技感，深色底配冷光点缀；留空则由AI依据主题自由定制"
                        onChange={(e) => setStyleRequest(e.target.value)}
                      />
                    </label>
                    <button
                      disabled={Boolean(busy) || !textReady}
                      title={!textReady ? "请先配置文案模型" : ""}
                      onClick={() => act(restyle, "定制风格")}
                    >
                      {deck.design.name === "素白"
                        ? "生成风格"
                        : "按描述重新生成"}
                    </button>
                    {!textReady && (
                      <p className="muted">
                        文案模型尚未配置；不影响当前风格预览与导出。
                      </p>
                    )}
                    <p className="muted">
                      配色只影响预览与导出的视觉呈现，正文与版式不变。
                    </p>
                  </>
                )}
                {panel === "check" && (
                  <>
                    {aiImage ? (
                      <>
                        <button
                          className="primary render-cta"
                          disabled={Boolean(busy) || !textReady}
                          onClick={() => act(renderSlideNow, "重新生成整页图")}
                        >
                          重新生成整页图
                        </button>
                        <button
                          className="primary render-cta"
                          disabled={Boolean(busy)}
                          onClick={clearAiImage}
                        >
                          清除图片，恢复程序排版
                        </button>
                      </>
                    ) : aiRender ? (
                      <>
                        {renderTask?.status === "failed" ? (
                          <p className="error">
                            整页图生成失败：
                            {renderTask.error || "供应商返回失败"}，可重试。
                          </p>
                        ) : (
                          <p className="success">
                            排版方案已定，图片生成中；此期间预览仅显示文字与排版说明。
                          </p>
                        )}
                        <button
                          className="primary render-cta"
                          disabled={Boolean(busy)}
                          onClick={
                            renderTask?.status === "failed"
                              ? () => act(renderSlideNow, "GPT渲染本页")
                              : cancelRender
                          }
                        >
                          {renderTask?.status === "failed"
                            ? "重新生成整页图"
                            : "取消生成"}
                        </button>
                      </>
                    ) : (
                      <button
                        className="primary render-cta"
                        disabled={Boolean(busy) || !textReady}
                        onClick={() => act(renderSlideNow, "GPT渲染本页")}
                      >
                        GPT 渲染本页
                      </button>
                    )}
                  </>
                )}
              </div>
            </aside>
          </main>
        </>
      )}
      {creating && (
        <DeckInitModal
          onClose={() => setCreating(false)}
          onCreate={create}
          hasModel={textReady}
        />
      )}
      <SettingsModal
        isOpen={settings}
        onClose={() => setSettings(false)}
        onConfigSaved={setConfig}
      />
      {fullscreen && deck && (
        <SlideViewer
          presentation={deck}
          activeSlideIndex={index}
          onSelectSlide={setIndex}
          scenes={scenes}
          assets={assets}
          isFullscreen
          onExitFullscreen={() => setFullscreen(false)}
        />
      )}
      {versions && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="版本记录"
          >
            <header>
              <h2>最近20次保存版本</h2>
              <button onClick={() => setVersions(null)}>关闭</button>
            </header>
            {!versions.length && <p>还没有可恢复的历史版本。</p>}
            {versions.map((v) => (
              <div className="version-row" key={v.revision}>
                <span>
                  版本 {v.revision} · {new Date(v.updatedAt).toLocaleString()}
                </span>
                <button
                  onClick={() =>
                    act(async () => {
                      if (
                        !window.confirm(
                          "恢复此版本？当前已保存稿仍保留在版本记录中。",
                        )
                      )
                        return;
                      const saved = await w.flush();
                      const result = await api(
                        `/api/decks/${deck.id}/restore`,
                        {
                          revision: v.revision,
                          expectedRevision: saved.revision,
                        },
                      );
                      await w.open(result);
                      setIndex(0);
                      setVersions(null);
                      setProposal(null);
                    }, "恢复版本")
                  }
                >
                  恢复
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
      {exportGate && deck && (
        <div className="modal-backdrop">
          <section
            className="modal export-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-title"
          >
            <header>
              <div>
                <h2 id="export-title">导出前检查</h2>
                <p>固定当前版本，导出可编辑的原生 PPTX。</p>
              </div>
              <button onClick={() => setExportGate(false)}>关闭</button>
            </header>
            {structureErrors.length > 0 && (
              <div className="error">
                {structureErrors.length} 项结构问题阻止导出。
                <button
                  onClick={() => {
                    setIndex(structureErrors[0].index);
                    setPanel("check");
                    setExportGate(false);
                  }}
                >
                  定位第一个问题
                </button>
              </div>
            )}
            <p className="muted">
              {deck.review?.status === "complete"
                ? "已完成一次模型语义复核，不代表事实已核验。"
                : "当前版本未完成整套语义复核；请逐页人工阅读。"}
              Office字体排字可能略有差异，导出后请在本机PowerPoint或WPS抽检。
            </p>
            {semantic.map(issueCard)}
            {warnings.map(issueCard)}
            <footer>
              <span>
                {unconfirmed} 项待确认 · {deck.slides.length} 页
              </span>
              <button
                className="primary"
                disabled={
                  Boolean(busy) || structureErrors.length > 0 || unconfirmed > 0
                }
                onClick={() => act(doExport, "导出中")}
              >
                下载可编辑 PPTX
              </button>
            </footer>
          </section>
        </div>
      )}
      {busy && !deck && (
        <div className="busy-indicator" role="status">
          {busy}…
        </div>
      )}
    </div>
  );
}
