/**
 * 投资收益章（报告改版核心页）：
 * CAPEX 三卡（底部彩条样式）+ 红绿分区累计现金流图 + Y0–Y10 完整现金流表
 * （Year / Gross benefit / OPEX / Net / Cumulative undisc.，累计列红绿字显示跨越点）。
 */
import { Table } from 'antd';
import { TFunction } from 'i18next';
import ReactECharts from 'echarts-for-react';
import { FinanceResult } from '../../types/finance';
import { ReportFx } from '../../utils/report-fx';
import { buildPaybackCashflowOption, applyChartTextStyle, CHART_TEXT_LIGHT_BG } from '../../utils/report-charts';

interface InvestBlockProps {
  t: TFunction;
  fin: FinanceResult;
  capexPV: number;
  capexBESS: number;
  fx: ReportFx;
}

function CapexCard({ label, value, bar }: { label: string; value: string; bar: string }) {
  return (
    <div style={{
      flex: 1, background: '#ffffff', border: '1px solid #e8e8e8', borderRadius: 8,
      padding: '10px 14px 0', overflow: 'hidden',
    }}>
      <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: '#262626', paddingBottom: 8 }}>{value}</div>
      <div style={{ height: 4, background: bar, margin: '0 -14px' }} />
    </div>
  );
}

export default function InvestBlock({ t, fin, capexPV, capexBESS, fx }: InvestBlockProps) {
  // 未折现累计（与 buildPaybackCashflowOption 同算法：netCashflow 前缀和，Y0 = -CAPEX）
  let acc = 0;
  const rows = fin.cashflow
    .filter((r) => r.year <= 10)
    .map((r) => {
      acc += r.netCashflow;
      return { ...r, key: r.year, cumUndisc: acc };
    });

  const moneyCell = (v: number) => fx.moneyFull(v);
  const cumCell = (v: number) => (
    <span style={{ color: v < 0 ? '#cf1322' : '#237804', fontWeight: 600 }}>{fx.moneyFull(v)}</span>
  );

  const columns = [
    { title: t('report.invest.year'), dataIndex: 'year', key: 'year', width: 64, render: (v: number) => `Y${v}` },
    { title: t('report.invest.colGross'), dataIndex: 'totalRevenue', key: 'rev', align: 'right' as const, render: moneyCell },
    { title: t('report.invest.opex'), dataIndex: 'opex', key: 'opex', align: 'right' as const, render: moneyCell },
    { title: t('report.invest.net'), dataIndex: 'netCashflow', key: 'net', align: 'right' as const, render: moneyCell },
    { title: t('report.invest.colCumUndisc'), dataIndex: 'cumUndisc', key: 'cum', align: 'right' as const, render: cumCell },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <CapexCard label={t('report.invest.capexPV')} value={fx.money(capexPV)} bar="#fa8c16" />
        <CapexCard label={t('report.invest.capexBESS')} value={fx.money(capexBESS)} bar="#13c2c2" />
        <CapexCard label={t('report.invest.capexTotal')} value={fx.money(fin.capex)} bar="#1677ff" />
      </div>
      <ReactECharts option={applyChartTextStyle(buildPaybackCashflowOption(t, fin, 10, fx), CHART_TEXT_LIGHT_BG)} style={{ height: 320 }} />
      <Table
        size="small"
        pagination={false}
        dataSource={rows}
        columns={columns}
        style={{ marginTop: 10 }}
      />
    </>
  );
}
