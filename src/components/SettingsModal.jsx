import React, { useState, useEffect } from "react";
import { api } from "../services/workspace.js";
export default function SettingsModal({ isOpen, onClose, onConfigSaved }) {
  const [form, setForm] = useState({}),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (isOpen) {
      setMessage("");
      setError("");
      api("/api/config")
        .then(setForm)
        .catch((e) => setError(e.message));
    }
  }, [isOpen]);
  if (!isOpen) return null;
  const change = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function save() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api("/api/config", form);
      setForm(result);
      onConfigSaved?.(result);
      setMessage("设置已保存在本机。密钥不会进入文稿或备份。");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function test() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await api("/api/test-llm", {
        apiKey: form.llmApiKey,
        apiUrl: form.llmApiUrl,
        model: form.llmModel,
      });
      setMessage(r.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <section
        className="modal settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <header>
          <h2 id="settings-title">本机模型设置</h2>
          <button onClick={onClose} disabled={busy}>
            关闭
          </button>
        </header>
        {[
          ["llm", "文案模型", "hasLlmKey"],
          ["gptimage2", "图片模型", "hasGptimage2Key"],
        ].map(([prefix, label, flag]) => (
          <fieldset key={prefix}>
            <legend>{label}</legend>
            <label>
              API基础地址
              <input
                value={form[`${prefix}ApiUrl`] || ""}
                onChange={(e) => change(`${prefix}ApiUrl`, e.target.value)}
                placeholder="https://api.example.com/v1"
              />
            </label>
            <label>
              实际模型名称
              <input
                value={form[`${prefix}Model`] || ""}
                onChange={(e) => change(`${prefix}Model`, e.target.value)}
              />
            </label>
            <label>
              API Key · {form[flag] ? "已配置，留空保持不变" : "尚未配置"}
              <input
                type="password"
                autoComplete="new-password"
                value={form[`${prefix}ApiKey`] || ""}
                onChange={(e) => change(`${prefix}ApiKey`, e.target.value)}
              />
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={Boolean(form[`clear_${prefix}ApiKey`])}
                onChange={(e) =>
                  change(`clear_${prefix}ApiKey`, e.target.checked)
                }
              />
              清除此密钥
            </label>
          </fieldset>
        ))}
        <p className="muted">
          配图使用所填模型；生成可能由供应商计费。图片连接通过设计面板主动生成验证，不在保存设置时付费测试。
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}
        <footer>
          <button disabled={busy} onClick={test}>
            测试当前文案模型
          </button>
          <button className="primary" disabled={busy} onClick={save}>
            {busy ? "处理中…" : "保存设置"}
          </button>
        </footer>
      </section>
    </div>
  );
}
