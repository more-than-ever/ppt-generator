import pptxgen from 'pptxgenjs';

// Preset color themes for PPTX
export const THEMES = {
  dark: {
    id: 'dark',
    name: '极简暗黑 (Minimal Dark)',
    bg: '0F1115',
    cardBg: '1A1D24',
    primary: 'FFFFFF',
    secondary: '9CA3AF',
    accent: '3B82F6',
    border: '2B303C',
    font: 'Segoe UI'
  },
  light: {
    id: 'light',
    name: '素雅极简白 (Clean White)',
    bg: 'FAFAFA',
    cardBg: 'FFFFFF',
    primary: '18181B',
    secondary: '71717A',
    accent: '2563EB',
    border: 'E4E4E7',
    font: 'Segoe UI'
  },
  tech: {
    id: 'tech',
    name: '深蓝极客 (Cyber Blue)',
    bg: '0B1329',
    cardBg: '132145',
    primary: 'F8FAFC',
    secondary: '94A3B8',
    accent: '06B6D4',
    border: '1E3A8A',
    font: 'Segoe UI'
  },
  warm: {
    id: 'warm',
    name: '优雅温暖 (Warm Cream)',
    bg: 'F7F4EB',
    cardBg: 'FFFFFF',
    primary: '292524',
    secondary: '78716C',
    accent: 'D97706',
    border: 'E7E5E4',
    font: 'Georgia'
  }
};

export const exportToPptx = async (presentationData, themeKey = 'dark') => {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_16x9';

  const theme = THEMES[themeKey] || THEMES.dark;
  const { title: presentationTitle, slides = [] } = presentationData;

  slides.forEach((slideData, idx) => {
    const slide = pptx.addSlide();
    slide.background = { color: theme.bg };

    // Set speaker notes if available
    if (slideData.speakerNotes) {
      slide.addNotes(slideData.speakerNotes);
    }

    // If slide has a full 16:9 GPT-rendered presentation slide image, embed it full-bleed
    if (slideData.imageUrl && !slideData.userUploaded) {
      try {
        const imgConfig = slideData.imageUrl.startsWith('data:')
          ? { data: slideData.imageUrl, x: 0, y: 0, w: '100%', h: '100%' }
          : { path: slideData.imageUrl, x: 0, y: 0, w: '100%', h: '100%' };
        slide.addImage(imgConfig);
        return;
      } catch (e) {
        console.warn('Could not add full-bleed slide image to PPTX, falling back to layout rendering:', e);
      }
    }

    // Header watermark / Category
    if (slideData.type !== 'cover') {
      slide.addText(presentationTitle.toUpperCase(), {
        x: 0.8,
        y: 0.4,
        w: 8.0,
        h: 0.3,
        fontSize: 10,
        color: theme.secondary,
        fontFace: theme.font,
        bold: true,
        charSpacing: 2
      });

      // Slide number badge
      slide.addText(`0${idx + 1} / 0${slides.length}`, {
        x: 11.5,
        y: 0.4,
        w: 1.5,
        h: 0.3,
        fontSize: 10,
        color: theme.secondary,
        fontFace: theme.font,
        align: 'right'
      });
    }

    switch (slideData.type) {
      case 'cover': {
        const hasImg = Boolean(slideData.imageUrl);
        const textWidth = hasImg ? 6.6 : 10.5;

        // Large minimalist cover layout
        slide.addShape(pptx.ShapeType.rect, {
          x: 0.8,
          y: 1.8,
          w: 0.15,
          h: 1.6,
          fill: { color: theme.accent }
        });

        slide.addText(slideData.title || presentationTitle, {
          x: 1.2,
          y: 1.6,
          w: textWidth,
          h: 2.2,
          fontSize: 38,
          bold: true,
          color: theme.primary,
          fontFace: theme.font,
          valign: 'middle'
        });

        if (slideData.subtitle) {
          slide.addText(slideData.subtitle, {
            x: 1.2,
            y: 4.0,
            w: textWidth,
            h: 0.8,
            fontSize: 17,
            color: theme.secondary,
            fontFace: theme.font
          });
        }

        // Cover bullets / metadata
        if (slideData.bullets && slideData.bullets.length > 0) {
          const bulletTexts = slideData.bullets.map(b => ({
            text: `•  ${b}\n`,
            options: { fontSize: 13, color: theme.secondary, breakLine: true }
          }));

          slide.addText(bulletTexts, {
            x: 1.2,
            y: 5.0,
            w: textWidth,
            h: 1.5,
            fontFace: theme.font
          });
        }

        // If cover has image, embed it on the right side
        if (hasImg) {
          try {
            slide.addImage({
              path: slideData.imageUrl,
              x: 8.2,
              y: 1.6,
              w: 4.3,
              h: 4.3,
              sizing: { type: 'cover', w: 4.3, h: 4.3 }
            });
          } catch (e) {
            console.warn('Could not add image to PPTX:', e);
          }
        }
        break;
      }

      case 'metrics': {
        // Title & subtitle
        renderSlideHeader(slide, slideData, theme);

        const metrics = slideData.metrics && slideData.metrics.length > 0
          ? slideData.metrics
          : [
              { value: '+128%', label: '核心业务增长' },
              { value: '3.5x', label: '流程自动化效率' },
              { value: '99.4%', label: '高可用保障' }
            ];

        // 3 Cards layout for metrics
        const cardWidth = 3.6;
        const startX = 0.8;
        const gap = 0.45;
        const cardY = 2.2;
        const cardH = 2.4;

        metrics.forEach((m, mIdx) => {
          const x = startX + mIdx * (cardWidth + gap);
          // Metric card background
          slide.addShape(pptx.ShapeType.roundRect, {
            x,
            y: cardY,
            w: cardWidth,
            h: cardH,
            rectRadius: 0.1,
            fill: { color: theme.cardBg },
            line: { color: theme.border, width: 1 }
          });

          // Metric value
          slide.addText(m.value, {
            x: x + 0.3,
            y: cardY + 0.4,
            w: cardWidth - 0.6,
            h: 1.0,
            fontSize: 44,
            bold: true,
            color: theme.accent,
            fontFace: theme.font,
            align: 'center'
          });

          // Metric label
          slide.addText(m.label, {
            x: x + 0.3,
            y: cardY + 1.4,
            w: cardWidth - 0.6,
            h: 0.7,
            fontSize: 14,
            color: theme.primary,
            fontFace: theme.font,
            align: 'center',
            bold: true
          });
        });

        // Bullets underneath
        if (slideData.bullets && slideData.bullets.length > 0) {
          const bulletTexts = slideData.bullets.map(b => ({
            text: `✔  ${b}    `,
            options: { fontSize: 12, color: theme.secondary }
          }));
          slide.addText(bulletTexts, {
            x: 0.8,
            y: 5.0,
            w: 11.5,
            h: 1.2,
            fontFace: theme.font
          });
        }
        break;
      }

      case 'agenda':
      case 'process': {
        renderSlideHeader(slide, slideData, theme);

        const items = slideData.bullets || [];
        const cardW = 11.7;
        const startY = 2.2;
        const itemH = 1.0;
        const gap = 0.25;

        items.forEach((item, bIdx) => {
          const y = startY + bIdx * (itemH + gap);
          slide.addShape(pptx.ShapeType.roundRect, {
            x: 0.8,
            y,
            w: cardW,
            h: itemH,
            rectRadius: 0.08,
            fill: { color: theme.cardBg },
            line: { color: theme.border, width: 1 }
          });

          // Number index circle
          slide.addShape(pptx.ShapeType.oval, {
            x: 1.1,
            y: y + 0.22,
            w: 0.55,
            h: 0.55,
            fill: { color: theme.accent }
          });

          slide.addText(`${bIdx + 1}`, {
            x: 1.1,
            y: y + 0.22,
            w: 0.55,
            h: 0.55,
            fontSize: 12,
            bold: true,
            color: 'FFFFFF',
            align: 'center',
            valign: 'middle'
          });

          // Item text
          slide.addText(item, {
            x: 1.9,
            y: y + 0.15,
            w: cardW - 2.2,
            h: 0.7,
            fontSize: 15,
            color: theme.primary,
            fontFace: theme.font,
            bold: true,
            valign: 'middle'
          });
        });
        break;
      }

      case 'cards':
      default: {
        renderSlideHeader(slide, slideData, theme);

        const bullets = slideData.bullets || [];
        const hasImg = Boolean(slideData.imageUrl);

        if (hasImg) {
          // 2-Column Split: Left bullets list (w: 6.2), Right image (w: 5.0)
          const leftWidth = 6.2;
          const startY = 2.2;
          const itemH = 1.1;
          const gap = 0.25;

          bullets.slice(0, 3).forEach((bullet, bIdx) => {
            const y = startY + bIdx * (itemH + gap);
            slide.addShape(pptx.ShapeType.roundRect, {
              x: 0.8,
              y,
              w: leftWidth,
              h: itemH,
              rectRadius: 0.08,
              fill: { color: theme.cardBg },
              line: { color: theme.border, width: 1 }
            });

            // Accent pill
            slide.addShape(pptx.ShapeType.rect, {
              x: 1.0,
              y: y + 0.2,
              w: 0.08,
              h: 0.7,
              fill: { color: theme.accent }
            });

            const parts = bullet.split(/[:：]/);
            const itemTitle = parts.length > 1 ? parts[0].trim() : `核心要点 0${bIdx + 1}`;
            const itemDesc = parts.length > 1 ? parts.slice(1).join('：').trim() : bullet;

            slide.addText(itemTitle, {
              x: 1.3,
              y: y + 0.1,
              w: leftWidth - 1.5,
              h: 0.35,
              fontSize: 14,
              bold: true,
              color: theme.primary,
              fontFace: theme.font
            });

            slide.addText(itemDesc, {
              x: 1.3,
              y: y + 0.45,
              w: leftWidth - 1.5,
              h: 0.55,
              fontSize: 11,
              color: theme.secondary,
              fontFace: theme.font
            });
          });

          // Right image
          try {
            slide.addImage({
              path: slideData.imageUrl,
              x: 7.4,
              y: 2.2,
              w: 5.1,
              h: 4.1,
              sizing: { type: 'contain', w: 5.1, h: 4.1 }
            });
          } catch (e) {
            console.warn('Could not add image to cards in PPTX:', e);
          }
        } else {
          // Standard 3-column cards
          const colCount = Math.min(bullets.length, 3) || 1;
          const colWidth = (11.7 - (colCount - 1) * 0.4) / colCount;
          const cardY = 2.2;
          const cardH = 3.9;

          bullets.slice(0, 3).forEach((bullet, bIdx) => {
            const x = 0.8 + bIdx * (colWidth + 0.4);

            slide.addShape(pptx.ShapeType.roundRect, {
              x,
              y: cardY,
              w: colWidth,
              h: cardH,
              rectRadius: 0.1,
              fill: { color: theme.cardBg },
              line: { color: theme.border, width: 1 }
            });

            slide.addShape(pptx.ShapeType.rect, {
              x: x + 0.4,
              y: cardY + 0.5,
              w: 0.4,
              h: 0.08,
              fill: { color: theme.accent }
            });

            const parts = bullet.split(/[:：]/);
            const itemTitle = parts.length > 1 ? parts[0].trim() : `战略维度 0${bIdx + 1}`;
            const itemDesc = parts.length > 1 ? parts.slice(1).join('：').trim() : bullet;

            slide.addText(itemTitle, {
              x: x + 0.4,
              y: cardY + 0.8,
              w: colWidth - 0.8,
              h: 0.6,
              fontSize: 18,
              bold: true,
              color: theme.primary,
              fontFace: theme.font
            });

            slide.addText(itemDesc, {
              x: x + 0.4,
              y: cardY + 1.5,
              w: colWidth - 0.8,
              h: 1.8,
              fontSize: 14,
              color: theme.secondary,
              fontFace: theme.font,
              lineSpacing: 22
            });
          });
        }
        break;
      }
    }
  });

  const safeFilename = (presentationTitle || 'presentation')
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 30);
  await pptx.writeFile({ fileName: `${safeFilename}.pptx` });
};

function renderSlideHeader(slide, slideData, theme) {
  slide.addText(slideData.title || '', {
    x: 0.8,
    y: 0.8,
    w: 11.5,
    h: 0.7,
    fontSize: 26,
    bold: true,
    color: theme.primary,
    fontFace: theme.font
  });

  if (slideData.subtitle) {
    slide.addText(slideData.subtitle, {
      x: 0.8,
      y: 1.45,
      w: 11.5,
      h: 0.4,
      fontSize: 13,
      color: theme.secondary,
      fontFace: theme.font
    });
  }
}
