import { createServer as httpServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { createServer as viteServer } from 'vite';
import { createApp } from '../server.js';
import { png } from './fixtures.mjs';

// 独立模拟供应商及数据目录，验收不会读取密钥或修改用户文稿。
const imageAttempts = new Map();
const provider = httpServer(async (req, res) => {
  let raw = ''; for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw || '{}');
  res.setHeader('Content-Type', 'application/json');
  if (req.url.endsWith('/images/generations')) {
    const n = imageAttempts.get(body.prompt) || 0; imageAttempts.set(body.prompt, n + 1);
    if (!n && body.prompt.includes('失败重试')) { res.statusCode = 503; res.end(JSON.stringify({ error: '模拟图片失败' })); return; }
    await new Promise(r => setTimeout(r, 150));
    res.end(JSON.stringify({ data: [{ b64_json: png.split(',')[1] }] })); return;
  }
  const system = body.messages?.[0]?.content || '';
  let user = {}; try { user = JSON.parse(body.messages?.[1]?.content || '{}'); } catch {}
  let result;
  if (system.includes('你只复核')) result = { issues: [{ slideId: user.slides[1].id, field: 'bullets.0', message: '模拟复核：请核对该条与资料的对应范围。', suggestion: '逐项核对资料范围。' }] };
  else if (system.includes('只能修改指定的一个字段')) {
    if (user.instruction?.includes('延迟')) await new Promise(r => setTimeout(r, 2000));
    result = { text: user.instruction?.includes('口语') ? '我们先核对资料。' : '逐项核对资料。', title: '未授权标题不得写入', provenance: [] };
  } else if (system.includes('一次写出整套正文')) result = { design: { name: '松烟黛绿', mood: '东方雅致，纸感留白', palette: { bg: '#F4F6F3', card: '#FFFFFF', text: '#1F2A24', muted: '#5C6B62', accent: '#2E6B4F', border: '#D8E0DA' } }, slides: Array.from({ length: user.pages }, (_, i) => ({
    type: i === 0 ? 'cover' : i === user.pages - 1 ? 'summary' : 'cards',
    title: i === 0 ? user.title : i === user.pages - 1 ? '回顾资料与核对事项' : `资料整理 ${i}`,
    subtitle: i === 0 ? user.audience : '', keyMessage: '核对资料，保留边界。',
    bullets: i === 0 ? [] : ['先核对资料中的事实和适用范围。', '保留原文限定条件，不新增承诺。'],
    visualIdea: '简洁文件夹插图', provenance: {},
  })) };
  else { res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] })); return; }
  res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(result) } }] }));
});
provider.listen(0, '127.0.0.1'); await once(provider, 'listening');
const base = `http://127.0.0.1:${provider.address().port}`;
const root = path.resolve('.test-data'); await fs.mkdir(root, { recursive: true });
const dataDir = await fs.mkdtemp(path.join(root, 'browser-'));
const configuration = { llmApiKey: '', llmApiUrl: base, llmModel: 'mock-text', gptimage2ApiKey: '', gptimage2ApiUrl: base, gptimage2Model: 'mock-image' };
const { app } = await createApp({ dataDir, config: configuration, configPath: path.join(dataDir, '.env') });
const server = app.listen(3181, '127.0.0.1'); await once(server, 'listening');
process.env.SLIDEFLOW_API_URL = 'http://127.0.0.1:3181';
const vite = await viteServer({ server: { host: '127.0.0.1', port: 5173, strictPort: true } });
await vite.listen();
console.log('模拟验收已就绪：http://127.0.0.1:3181；视觉样本：http://127.0.0.1:5173/tests/visual.html');
async function stop() { await vite.close(); server.closeAllConnections(); provider.closeAllConnections(); server.close(); provider.close(); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
