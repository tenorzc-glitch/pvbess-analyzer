/**
 * 分块式 DOM → PDF 导出：
 * 容器内每个 [data-pdf-block] 独立 html2canvas，块界即分页界——
 * 解决旧 exportPDF 整页长图切片把卡片腰斩的问题。
 * - A4 portrait 595.28×841.89pt，边距 40pt，块间距 12pt
 * - 带 data-pdf-cover 的块独占整页（封面）
 * - 块高≤页高：整块放置（当前页放不下则换页）
 * - 块高>页高：离屏 canvas 按页高折算源像素切片
 * - JPEG 0.95（PNG 全报告约 5-15MB，JPEG 约 1-3MB）
 */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const GAP = 12;
const CONTENT_W = PAGE_W - 2 * MARGIN;   // 515.28
const CONTENT_H = PAGE_H - 2 * MARGIN;   // 761.89

function toJPEG(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.95);
}

function toPNG(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/** 页脚叠加选项：Pass 2 在导出前对每页画细灰线 + 左口径声明 + 右页码 */
export interface PdfFooterOptions {
  /** 左侧口径声明（英文短句，jsPDF 内置 helvetica 无中文字体） */
  footerLeft: string;
  /** 页码格式，默认 `${n}/${N}` */
  pageLabel?: (page: number, total: number) => string;
  /** 封面页（data-pdf-cover 独占页）是否跳过页脚，默认 true */
  skipCover?: boolean;
}

/**
 * antd 6 强制 CSS 变量模式（cssVar 不再可关），html2canvas 自研 CSS 解析器不评估 var()。
 * 在克隆文档阶段把源元素的计算样式（var() 已被浏览器解析为具体值）内联到克隆元素上，
 * 确定性消除 var(--ant-*) 造成的黑块/丢样式。
 */
const INLINE_PROPS = [
  'color', 'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'outline-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'text-align',
] as const;

function inlineComputedStyles(srcRoot: HTMLElement, cloneRoot: HTMLElement): void {
  const srcEls = [srcRoot, ...Array.from(srcRoot.querySelectorAll<HTMLElement>('*'))];
  const cloneEls = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll<HTMLElement>('*'))];
  const n = Math.min(srcEls.length, cloneEls.length);
  for (let i = 0; i < n; i++) {
    const cs = getComputedStyle(srcEls[i]);
    const target = cloneEls[i].style;
    for (const p of INLINE_PROPS) {
      target.setProperty(p, cs.getPropertyValue(p));
    }
  }
}

/** 离屏裁剪 canvas 的指定区域 */
function cropToCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
  }
  return c;
}

export async function exportBlocksPDF(
  container: HTMLElement,
  fileName: string,
  onProgress?: (done: number, total: number) => void,
  footer?: PdfFooterOptions,
): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-block]'));
  if (blocks.length === 0) throw new Error('no [data-pdf-block] in container');

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  let cursorY = 0;
  let first = true;
  let done = 0;
  const coverPages = new Set<number>();

  for (const el of blocks) {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
      onclone: (_doc, cloneEl) => inlineComputedStyles(el, cloneEl as HTMLElement),
    });
    done += 1;
    onProgress?.(done, blocks.length);

    const imgH = (canvas.height * CONTENT_W) / canvas.width; // 等比缩放到版心宽

    // 封面块：独占整页；深底白字用 PNG 避免 JPEG 压缩振铃
    if (el.hasAttribute('data-pdf-cover')) {
      if (!first) pdf.addPage();
      coverPages.add(pdf.getNumberOfPages());
      pdf.addImage(toPNG(canvas), 'PNG', MARGIN, MARGIN, CONTENT_W, CONTENT_H);
      cursorY = CONTENT_H; // 后续块强制换页
      first = false;
      continue;
    }

    if (imgH <= CONTENT_H) {
      // 整块放置；当前页放不下则换页
      if (cursorY + imgH > CONTENT_H) {
        if (!first) pdf.addPage();
        cursorY = 0;
      }
      pdf.addImage(toJPEG(canvas), 'JPEG', MARGIN, MARGIN + cursorY, CONTENT_W, imgH);
      cursorY += imgH + GAP;
    } else {
      // 超高块：按页高折算源像素逐片裁剪
      const sliceSrcH = (CONTENT_H * canvas.width) / CONTENT_W;
      for (let off = 0; off < canvas.height; off += sliceSrcH) {
        const h = Math.min(sliceSrcH, canvas.height - off);
        const slice = cropToCanvas(canvas, 0, off, canvas.width, h);
        if (!first || cursorY > 0) pdf.addPage();
        pdf.addImage(toJPEG(slice), 'JPEG', MARGIN, MARGIN, CONTENT_W, (h * CONTENT_W) / canvas.width);
        first = false;
        cursorY = CONTENT_H;
      }
      cursorY = 0;
    }
    first = false;
  }

  // Pass 2：页脚叠加（此时总页数已知）
  if (footer) {
    const total = pdf.getNumberOfPages();
    const skipCover = footer.skipCover ?? true;
    const pageLabel = footer.pageLabel ?? ((p: number, n: number) => `${p} / ${n}`);
    const yLine = PAGE_H - MARGIN + 14;
    const yText = PAGE_H - MARGIN + 26;
    for (let p = 1; p <= total; p++) {
      if (skipCover && coverPages.has(p)) continue;
      pdf.setPage(p);
      pdf.setDrawColor('#d9d9d9');
      pdf.setLineWidth(0.5);
      pdf.line(MARGIN, yLine, PAGE_W - MARGIN, yLine);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor('#8c8c8c');
      pdf.text(footer.footerLeft, MARGIN, yText);
      pdf.text(pageLabel(p, total), PAGE_W - MARGIN, yText, { align: 'right' });
    }
  }

  pdf.save(`${fileName}.pdf`);
}
