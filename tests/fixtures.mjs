import { makeDeck } from '../shared/deck.js';
import { LAYOUT_CATALOG } from '../shared/layouts.js';
import { NEUTRAL_DESIGN } from '../shared/design.js';

// 模拟“模型在生成初稿时定制”的风格样本，覆盖浅底、深底与暖色三种方向。
export const sampleDesigns = [
  NEUTRAL_DESIGN,
  {
    name: '曜黑鎏金',
    mood: '暗夜金属质感，克制高对比',
    palette: { bg: '#0E0E12', card: '#17171E', text: '#F2F2F5', muted: '#9B9BA4', accent: '#D4AF37', border: '#2C2C36' },
  },
  {
    name: '松烟黛绿',
    mood: '东方雅致，纸感留白',
    palette: { bg: '#F4F6F3', card: '#FFFFFF', text: '#1F2A24', muted: '#5C6B62', accent: '#2E6B4F', border: '#D8E0DA' },
  },
];

export const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jbeUAAAAASUVORK5CYII=';
export const paragraphs = [
  '【统计范围】：整车出口与海外工厂的本地销售属于不同统计口径。评估海外经营时，应分别说明两类数据的覆盖范围，避免只用出口量推断企业全部海外销量。',
  '【经营条件】：进入目标市场之前，应分别评估车辆认证、备件供应和维修响应能力。建议先完成服务准备，再决定渠道覆盖范围，避免交付之后无法及时处理故障。',
  '【执行建议】：建议先选择能够提供交付和维修支持的合作伙伴开展试点。试点期间记录客户反馈与实际服务成本，再根据这些结果判断是否扩大投入。',
];
export function fixtureDeck(count = 4) {
  const d = makeDeck({ title: '本机验收样例', audience: '设计团队', slideCount: count });
  d.slides = d.slides.map((s, i) => ({ ...s,
    title: i === 0 ? '本机验收样例' : i === count - 1 ? '回顾与后续核对' : `资料整理 ${i}`,
    bullets: i === 0 ? [] : ['核对已有资料中的3类口径', '保留2条明确边界'],
  }));
  d.sources = [{ id: 'source-1', name: '验收合成资料', text: [d.title, d.audience, ...d.slides.flatMap(s => [s.title, ...s.bullets])].join('\n') }];
  return d;
}
export const visualCases = [
  ...[2, 5, 6, 8].flatMap(count => ['process-horizontal', 'timeline-vertical'].map(layout => ({ name: `${layout}-${count}`, layout, patch: { title: `${count}步资料核对流程`, bullets: ['登记需求', '确认范围', '收集资料', '逐条比对', '记录疑点', '补充依据', '确认修改', '归档回访'].slice(0, count) } }))),
  { name: '长文配图', layout: 'image-top-story', patch: { title: '从统计口径到执行建议：保留长文的全部限定条件', bullets: paragraphs } },
  { name: '长标题混排', layout: 'editorial-columns', patch: { title: '讨论 API 与中文排版时，先确认输入资料的范围，再核对每个字段的完整表达', bullets: ['【输入范围】：中文与 English words 混排，保留 API、JSON 和 Microsoft YaHei 等技术术语，不把技术名称拆成无意义的字符。', '【核对方式】：明确字段、版本和来源；对没有依据的表述保留待核对标记，不因界面显示成功就宣称事实正确。'] } },
  { name: '纯文字封面', layout: 'cover-hero', patch: { title: '让事实与观点\n各有明确的位置', assets: [], omitVisual: true } },
  { name: '完整显示图片', layout: 'split-visual-right', patch: {} },
  { name: '背景裁切图片', layout: 'full-bleed-glass', patch: {} },
  { name: '等权采购对比', layout: 'compare-two-columns', patch: { title: '两种采购方案的取舍', bullets: ['【方案A】：内存16GB、存储512GB，保修1年。适用于现有需求；是否需要扩容仍待确认。', '【方案B】：内存32GB、存储1TB，保修3年。配置较高；是否值得增加预算需要结合实际使用判断。'] } },
];
export function visualFixture(name) {
  const spec = visualCases.find(c => c.name === name);
  if (!spec) throw new Error('视觉样例不存在');
  return { ...layoutFixture(spec.layout), ...spec.patch };
}
export function layoutFixture(layoutId) {
  const l = LAYOUT_CATALOG[layoutId];
  const count = l.minBullets;
  return {
    id: `sample-${layoutId}`, contentRevision: 1, type: l.types[0], layoutId,
    title: l.forCover ? '把复杂问题\n讲清楚' : '让每一条信息，都有明确位置',
    subtitle: 'SlideFlow · 原生可编辑演示文稿',
    keyMessage: '先说明依据，再表达判断。',
    bullets: Array.from({ length: count }, (_, i) => l.mode === 'metrics' ? `参与人数：${20 + i * 10}人` : l.types[0] === 'process' ? ['登记需求', '确认范围', '准备资料', '完成核对', '归档回访'][i % 5] : ['明确问题与适用范围', '保留原文事实和条件', '逐项核对表达与依据', '选择适合的展示关系'][i]),
    assets: l.userImageFrames.map((_, i) => ({ id: `image-${i}`, fit: l.backgroundFrame ? 'cover' : 'contain' })),
    omitVisual: false, provenance: {},
  };
}
