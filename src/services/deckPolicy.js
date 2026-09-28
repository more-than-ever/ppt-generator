// 前后端共用页数边界，已生成页数和模型输出都不能扩大立项页数。
export function getDeckLimit(deck = {}) {
  const requested = Number(deck.slideCount ?? deck.totalSlides);
  const fallback = deck.outline?.length || 6;
  return Math.max(3, Math.min(20, Number.isInteger(requested) && requested > 0 ? requested : fallback));
}

export function isPageInRange(page, total) {
  return Number.isInteger(page) && page >= 1 && page <= total;
}

// 只传用户原话和作用页；不把助手回复、历史图片混入用户资料。
export function collectUserHistory(messages = [], total = 6) {
  return (Array.isArray(messages) ? messages : []).flatMap(message => {
    if (message?.role !== 'user') return [];
    const text = typeof message.rawText === 'string' ? message.rawText : message.text;
    if (typeof text !== 'string' || !text.trim()) return [];
    const targetIndex = message.targetIndex == null ? null : message.targetIndex;
    if (targetIndex !== null && !isPageInRange(targetIndex + 1, total)) return [];
    return [{ role: 'user', text: text.trim(), targetIndex }];
  });
}

export function isSlideReady(slide) {
  return Boolean(slide && !/待规划/.test(slide.title || ''));
}

// 先补齐跳页产生的空位，最后一页已生成也不代表整套已齐全。
export function getNextSlideNumber(slides = [], total = 6) {
  for (let i = 0; i < total; i++) {
    if (!isSlideReady(slides[i])) return i + 1;
  }
  return null;
}

export function extractTargetPage(text = '', total = 6) {
  const cleaned = text.replace(/批准第\s*[0-9一二三四五六七八九十]+\s*页[，,。！\s]*/g, '');
  const match = cleaned.match(/第\s*([0-9一二三四五六七八九十]+)\s*页/);
  if (match) {
    const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
    const raw = match[1];
    if (/^\d+$/.test(raw)) return Number(raw);
    if (raw.includes('十')) {
      const [tens, ones] = raw.split('十');
      return (digits[tens] || 1) * 10 + (digits[ones] || 0);
    }
    return digits[raw] || null;
  }
  if (/(?:封面|首页|首面)/.test(cleaned)) return 1;
  if (/(?:末页|最后一页|尾页)/.test(cleaned)) return total;
  return null;
}
