/**
 * 报告展示层币种换算（FX）：
 * - 引擎/财务层永远保持 params.currency（默认 BRL）原值，本模块只在"展示边界"换算一次；
 * - USD 模式：金额 ÷ rate（1 USD = rate BRL），格式化时才 round，内部不 round；
 * - 页脚口径声明（英文短句，jsPDF 内置 helvetica 无中文字体——双语报告页脚统一英文）。
 */

export type ReportCurrencyCode = 'BRL' | 'USD';

export interface ReportFx {
  /** 展示币种 */
  code: ReportCurrencyCode;
  /** 1 USD = rate BRL */
  rate: number;
  /** 货币符号 */
  sym: string;
  /** BRL → 展示币种（BRL 时恒等） */
  to: (brl: number) => number;
  /** 换算 + 缩写格式化：≥1M `1.23M`，≥1k `45.6k`，否则取整 */
  money: (brl: number) => string;
  /** 换算 + 全精度千分位整数（现金流表用） */
  moneyFull: (brl: number) => string;
  /** 页脚口径短句（英文；USD 含 FX 段） */
  footerNote: () => string;
}

/** 缩写格式化（接受任意币种的数值） */
export function fmtMoneyShort(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}k`;
  return v.toFixed(0);
}

export const DEFAULT_FX_RATE = 5.0723;

export function createReportFx(code: ReportCurrencyCode, rate: number): ReportFx {
  const validRate = Number.isFinite(rate) && rate > 0 && rate < 100 ? rate : DEFAULT_FX_RATE;
  const sym = code === 'USD' ? 'US$' : 'R$';
  const to = (brl: number) => (code === 'USD' ? brl / validRate : brl);
  return {
    code,
    rate: validRate,
    sym,
    to,
    money: (brl) => `${fmtMoneyShort(to(brl))} ${sym}`,
    moneyFull: (brl) => `${Math.round(to(brl)).toLocaleString('en-US')} ${sym}`,
    footerNote: () =>
      code === 'USD'
        ? `All figures in USD. FX: 1 USD = ${validRate} BRL.`
        : `All figures in BRL (R$).`,
  };
}
