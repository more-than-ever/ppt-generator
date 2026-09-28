import React, { useState } from "react";
import { newId } from "../../shared/deck.js";
import { readDataUrl, api } from "../services/workspace.js";

export default function DeckInitModal({ onClose, onCreate, hasModel }) {
  const [form, setForm] = useState({
    title: "",
    audience: "",
    slideCount: 6,
    mode: "sources",
  });
  const [text, setText] = useState(""),
    [sources, setSources] = useState([]),
    [images, setImages] = useState([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function upload(files) {
    setBusy(true);
    setError("");
    try {
      const extraSources = [],
        extraImages = [];
      for (const file of files) {
        if (file.size > 10 * 1024 * 1024)
          throw new Error("每个资料文件须小于10MB");
        if (/\.(txt|md|markdown)$/i.test(file.name)) {
          const content = await file.text();
          if (content.length > 200000)
            throw new Error("文字资料过长，请分批整理");
          extraSources.push({ id: newId(), name: file.name, text: content });
        } else if (
          ["image/png", "image/jpeg", "image/webp"].includes(file.type)
        ) {
          if (images.length + extraImages.length >= 2)
            throw new Error("创建时最多选2张图片，之后可逐页上传");
          const dataUrl = await readDataUrl(file),
            image = new Image();
          image.src = dataUrl;
          await image.decode();
          const result = await api("/api/assets", { dataUrl, name: file.name });
          extraImages.push(result.asset);
        } else throw new Error("支持TXT、Markdown、PNG、JPEG和WebP");
      }
      setSources((s) => [...s, ...extraSources]);
      setImages((s) => [...s, ...extraImages]);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(ai) {
    if (!form.title.trim()) {
      setError("请先填写简短主题");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onCreate({
        ...form,
        sources: [
          ...sources,
          ...(text.trim() ? [{ id: newId(), name: "粘贴资料", text }] : []),
        ],
        images,
        ai,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        className="modal create-modal"
      >
        <header>
          <div>
            <span className="eyebrow">从想法到清晰表达</span>
            <h2 id="create-title">创建演示文稿</h2>
          </div>
          <button onClick={onClose} disabled={busy}>
            关闭
          </button>
        </header>
        <div className="form-grid">
          <label>
            主题
            <input
              autoFocus
              maxLength={200}
              placeholder="例如：面向设计团队的产品介绍"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </label>
          <label>
            听众 / 用途
            <input
              maxLength={500}
              placeholder="讲给谁听，希望解决什么问题"
              value={form.audience}
              onChange={(e) => update("audience", e.target.value)}
            />
          </label>
        </div>
        <fieldset className="form-group">
          <legend>总页数（含封面与结尾）</legend>
          <div className="button-row">
            {[4, 6, 8, 10].map((n) => (
              <button
                key={n}
                className={form.slideCount === n ? "selected" : ""}
                onClick={() => update("slideCount", n)}
              >
                {n} 页
              </button>
            ))}
            <input
              aria-label="自定页数"
              type="number"
              min="3"
              max="20"
              value={form.slideCount}
              onChange={(e) => update("slideCount", Number(e.target.value))}
            />
          </div>
        </fieldset>
        <label>
          参考资料
          <textarea
            rows={5}
            maxLength={200000}
            placeholder="粘贴已有事实、数据、经历或必须保留的表达；资料不会被当作标题。"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <div className="button-row">
          <label className="file-button">
            添加文字或图片
            <input
              type="file"
              multiple
              accept=".txt,.md,.markdown,.png,.jpg,.jpeg,.webp"
              disabled={busy}
              onChange={(e) => {
                upload([...e.target.files]);
                e.target.value = "";
              }}
            />
          </label>
          <span className="muted">
            图片完整显示；不自动识别图中文字为已核验资料。
          </span>
        </div>
        {[...sources, ...images].map((s) => (
          <div className="attachment" key={s.id}>
            <span>{s.name}</span>
            <button
              onClick={() => {
                setSources((list) => list.filter((v) => v.id !== s.id));
                setImages((list) => list.filter((v) => v.id !== s.id));
              }}
            >
              移除
            </button>
          </div>
        ))}
        <div className="form-grid">
          <label>
            创作方式
            <select
              value={form.mode}
              onChange={(e) => update("mode", e.target.value)}
            >
              <option value="sources">
                依据资料整理 · 可引用写明出处的公开事实
              </option>
              <option value="expand">
                允许AI扩展草稿 · 无依据内容待核对
              </option>
            </select>
            <p className="muted">生成整套初稿时由AI自动定制配色与风格。</p>
          </label>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <span className="muted">
            AI只写文案，文字由程序排版。配图需另行确认生成。
          </span>
          <div className="button-row">
            <button disabled={busy} onClick={() => submit(false)}>
              创建空白稿
            </button>
            <button
              className="primary"
              disabled={busy || !hasModel}
              title={!hasModel ? "请先配置文案模型；也可手动创建" : ""}
              onClick={() => submit(true)}
            >
              {busy ? "正在准备…" : "生成整套初稿"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
