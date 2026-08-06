/**
 * 报告封面（data-pdf-cover 独占页）：
 * 深海军蓝头版（chip 行 + 一句话定位 + 4 规格卡）+ 白底下半部（headline 段 + 4 指标卡彩条 + 口径说明 + 编制方行）。
 * html2canvas 约束：只用实色与 rgba 透明度（禁渐变/毛玻璃/阴影），深底文字一律显式 color。
 */
import { TFunction } from 'i18next';
import { ScenarioConfig } from '../../types/simulation';
import { ReportFx } from '../../utils/report-fx';

const NAVY = '#0b2545';

interface CoverBlockProps {
  t: TFunction;
  projectName: string;
  scenName: string;
  scen: ScenarioConfig;
  today: string;
  currencyCode: string;
  customerName: string;
  companyName: string;
  /** 节省占基线年度总费用 %（0-100） */
  savingPct: number;
  /** headline 段落插值 */
  baselineAnnual: number;
  firstYearNet: number;
  paybackStatic: number;
  npv10: number;
  lcoe10: number;
  includeHW: boolean;
  hwInverters: number;
  hwCabinets: number;
  fx: ReportFx;
}

/** 深底半透明规格卡 */
function SpecCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      flex: 1, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.25)',
      borderRadius: 8, padding: '12px 14px',
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#ffffff' }}>{value}</div>
    </div>
  );
}

/** 白底指标卡（底部 4px 彩条） */
function MetricCard({ label, value, bar }: { label: string; value: string; bar: string }) {
  return (
    <div style={{
      flex: 1, background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 8,
      padding: '12px 14px 0', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#262626', paddingBottom: 10, whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ height: 4, background: bar, margin: '0 -14px' }} />
    </div>
  );
}

export default function CoverBlock(p: CoverBlockProps) {
  const { t, fx } = p;
  const chip = (text: string) => (
    <span key={text} style={{
      display: 'inline-block', background: 'rgba(255,255,255,0.12)', color: '#ffffff',
      borderRadius: 12, padding: '3px 12px', fontSize: 11.5, marginRight: 8,
    }}>
      {text}
    </span>
  );

  return (
    <section
      data-pdf-block
      data-pdf-cover
      style={{ minHeight: 1068, display: 'flex', flexDirection: 'column' }}
    >
      {/* ── 深海军蓝头版 ── */}
      <div style={{ background: NAVY, padding: '40px 36px 32px', borderRadius: 4 }}>
        <div style={{ marginBottom: 28 }}>
          {chip(p.projectName)}
          {chip(p.scenName)}
          {chip(p.today)}
          {chip(p.currencyCode)}
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: '#ffffff', lineHeight: 1.35, marginBottom: 30, maxWidth: 620 }}>
          {t('report.cover.positioning', { pct: p.savingPct.toFixed(0) })}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <SpecCard label={t('report.cover.specPv')} value={`${p.scen.pvCapacity_kWp} kWp`} />
          <SpecCard label={t('report.cover.specInv')} value={`${p.hwInverters} × 100 kW`} />
          <SpecCard label={t('report.cover.specBess')} value={`${p.scen.pcsPower_kW} kW / ${p.scen.bessCapacity_kWh} kWh`} />
          {p.includeHW
            ? <SpecCard label={t('report.cover.specHwUnits')} value={`${p.hwCabinets} × 241 kWh`} />
            : <SpecCard label={t('report.params.pcs')} value={`${p.scen.pcsPower_kW} kW`} />}
        </div>
      </div>

      {/* ── 白底下半部 ── */}
      <div style={{ padding: '28px 8px 0', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#262626', marginBottom: 8 }}>
          {t('report.cover.headlineTitle')}
        </div>
        <div style={{ fontSize: 13, color: '#404040', lineHeight: 1.9, marginBottom: 24, maxWidth: 660 }}>
          {t('report.cover.headline', {
            baseline: fx.money(p.baselineAnnual),
            pv: p.scen.pvCapacity_kWp,
            bess: p.scen.bessCapacity_kWh,
            net: fx.money(p.firstYearNet),
            payback: p.paybackStatic.toFixed(2),
            npv: fx.money(p.npv10),
          })}
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
          <MetricCard label={t('report.cover.metricNpv')} value={fx.money(p.npv10)} bar="#1677ff" />
          <MetricCard label={t('report.cover.metricPayback')} value={`${p.paybackStatic.toFixed(2)} ${t('common.years')}`} bar="#389e0d" />
          <MetricCard label={t('report.cover.metricLcoe')} value={`${fx.to(p.lcoe10).toFixed(3)} ${fx.sym}/kWh`} bar="#fa8c16" />
          <MetricCard label={t('report.cover.metricNetY1')} value={fx.money(p.firstYearNet)} bar="#13c2c2" />
        </div>

        <div style={{ fontSize: 11.5, color: '#8c8c8c', lineHeight: 1.8, marginBottom: 20 }}>
          <div>{t('report.cover.methodNote')}</div>
          <div>{fx.footerNote()}</div>
        </div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid #f0f0f0', paddingTop: 14, fontSize: 12, color: '#595959', lineHeight: 2 }}>
          <span style={{ marginRight: 24 }}>{t('report.cover.preparedFor')}：{p.customerName || '—'}</span>
          <span style={{ marginRight: 24 }}>{t('report.cover.preparedBy')}：{p.companyName || '—'}</span>
          <span>{t('report.date')}：{p.today}</span>
        </div>
      </div>
    </section>
  );
}
