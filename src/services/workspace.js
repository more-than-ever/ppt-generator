import { useCallback, useEffect, useRef, useState } from "react";
import { validateDeck } from "../../shared/deck.js";
export async function api(
  url,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await res.json();
  if (!res.ok || result.success === false)
    throw Object.assign(new Error(result.error || "操作失败"), {
      status: res.status,
    });
  return result;
}
export function downloadJson(data, name) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("文件读取失败"));
    r.readAsDataURL(file);
  });
}
export function useWorkspace() {
  const [deck, setDeck] = useState(null),
    [assets, setAssets] = useState({}),
    [status, setStatus] = useState("saved"),
    [saveError, setSaveError] = useState("");
  const [historyState, setHistoryState] = useState({ undo: 0, redo: 0 });
  const ref = useRef(null),
    dirty = useRef(false),
    timer = useRef(null),
    saving = useRef(null),
    seq = useRef(0),
    revision = useRef(0);
  const undo = useRef([]),
    redo = useRef([]),
    group = useRef({}),
    writer = useRef(null),
    recoveredEntry = useRef(null),
    dismissed = useRef(new Set());
  if (!writer.current) writer.current = crypto.randomUUID();
  const pendingKey = (id) => `slideflow.pending.${writer.current}.${id}`;
  const remember = (value) => {
    try {
      localStorage.setItem(
        pendingKey(value.id),
        JSON.stringify({ deck: value, at: Date.now() }),
      );
      return true;
    } catch {
      setSaveError("浏览器暂存空间不足，请尽快保存或下载备份");
    }
  };
  const forgetSaved = (id) => {
    try {
      localStorage.removeItem(pendingKey(id));
      const prior = recoveredEntry.current;
      if (prior && localStorage.getItem(prior.key) === prior.raw)
        localStorage.removeItem(prior.key);
      recoveredEntry.current = null;
    } catch {}
  };
  const publish = (value) => {
    ref.current = value;
    setDeck(value);
  };
  const updateHistory = () =>
    setHistoryState({ undo: undo.current.length, redo: redo.current.length });
  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (saving.current) {
      await saving.current;
      if (dirty.current) return flush();
      return ref.current;
    }
    if (!ref.current || !dirty.current) return ref.current;
    const work = async () => {
      setStatus("saving");
      setSaveError("");
      try {
        while (dirty.current) {
          const snapshot = ref.current,
            start = seq.current;
          const result = await api(
            `/api/decks/${snapshot.id}`,
            { deck: snapshot, expectedRevision: revision.current },
            "PUT",
          );
          revision.current = result.deck.revision;
          if (seq.current === start) {
            publish(result.deck);
            dirty.current = false;
            forgetSaved(snapshot.id);
          } else {
            publish({ ...ref.current, revision: revision.current });
            remember(ref.current);
          }
          setAssets((previous) => ({ ...previous, ...result.assets }));
        }
        setStatus("saved");
      } catch (e) {
        setStatus(e.status === 409 ? "conflict" : "error");
        setSaveError(e.message);
        throw e;
      }
    };
    saving.current = work();
    try {
      await saving.current;
      return ref.current;
    } finally {
      saving.current = null;
    }
  }, []);
  function change(next, groupId = "") {
    const before = ref.current;
    if (!before) return;
    const value = typeof next === "function" ? next(before) : next;
    if (value === before) return;
    if (
      !groupId ||
      group.current.id !== groupId ||
      Date.now() - group.current.at > 800
    )
      undo.current = [...undo.current, before].slice(-20);
    group.current = { id: groupId, at: Date.now() };
    redo.current = [];
    updateHistory();
    seq.current++;
    dirty.current = true;
    publish(value);
    remember(value);
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush().catch(() => {}), 800);
  }
  async function open(result) {
    await flush();
    const value = result.deck;
    let recovered = null;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          !key?.startsWith("slideflow.pending.") ||
          !key.endsWith(`.${value.id}`)
        )
          continue;
        try {
          const raw = localStorage.getItem(key);
          if (dismissed.current.has(raw)) continue;
          const entry = JSON.parse(raw);
          const pending = validateDeck(entry.deck);
          if (pending.id !== value.id) continue;
          if (!recovered || entry.at > recovered.at)
            recovered = { ...entry, deck: pending, key, raw };
        } catch {}
      }
    } catch {}
    const restore =
      recovered &&
      window.confirm(
        "发现这份文稿有未提交的本机修改。是否恢复？若其他窗口已保存新版本，将提示冲突，不会覆盖。",
      );
    recoveredEntry.current = restore ? recovered : null;
    if (recovered && !restore) dismissed.current.add(recovered.raw);
    publish(restore ? recovered.deck : value);
    setAssets(result.assets || {});
    revision.current = ref.current.revision;
    dirty.current = Boolean(restore);
    seq.current++;
    undo.current = [];
    redo.current = [];
    updateHistory();
    setSaveError("");
    setStatus(restore ? "dirty" : "saved");
    if (restore) {
      remember(ref.current);
      timer.current = setTimeout(() => flush().catch(() => {}), 800);
    }
  }
  async function reload() {
    clearTimeout(timer.current);
    if (saving.current) await saving.current.catch(() => {});
    const snapshot = ref.current,
      version = seq.current;
    const result = await api(`/api/decks/${snapshot.id}`);
    if (seq.current !== version)
      throw new Error("读取期间又发生编辑，未丢弃新修改，请重新操作");
    forgetSaved(snapshot.id);
    dirty.current = false;
    publish(null);
    await open(result);
  }
  async function close() {
    await flush();
    publish(null);
    setAssets({});
  }
  function travel(direction) {
    const from = direction === "undo" ? undo : redo,
      to = direction === "undo" ? redo : undo;
    if (!from.current.length) return;
    const current = ref.current,
      chosen = from.current.at(-1);
    from.current = from.current.slice(0, -1);
    to.current = [...to.current, current].slice(-20);
    const value = {
      ...chosen,
      revision: revision.current,
      review: null,
      slides: chosen.slides.map((s) => ({
        ...s,
        contentRevision:
          Math.max(
            s.contentRevision,
            current.slides.find((p) => p.id === s.id)?.contentRevision || 0,
          ) + 1,
      })),
    };
    seq.current++;
    dirty.current = true;
    publish(value);
    remember(value);
    updateHistory();
    group.current = {};
    setStatus("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush().catch(() => {}), 800);
  }
  useEffect(() => {
    const before = (e) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      clearTimeout(timer.current);
    };
  }, []);
  return {
    deck,
    ref,
    assets,
    setAssets,
    status,
    saveError,
    change,
    flush,
    open,
    reload,
    close,
    travel,
    historyState,
    version: seq,
  };
}
