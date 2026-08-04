import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { FinanceResult, InputParams } from '../types';
import { BrandMap, HWEstimate } from './brand';
import i18n from '../i18n';

/** 报告导出选项 */
export interface ReportOptions {
  /** 包含绿电溢价明细 */
  includeGreen: boolean;
  /** 包含断电损失明细 */
  includeOutage: boolean;
  /** 附加 HW 品牌对比 Sheet */
  compareHW: boolean;
  /** compareHW 为 true 时必填 */
  hwEstimate?: HWEstimate | null;
  /** 品牌参数（对比 Sheet 展示用） */
  brands?: BrandMap;
}

/**
 * 用 html2canvas 截取指定 DOM 元素，生成 A4 纵向 PDF 并保存。
 * 内容超出一页时自动分页。
 */
export async function exportPDF(elementId: string, fileName: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) {
    throw new Error(`exportPDF: element #${elementId} not found`);
  }

  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  // 按页面宽度等比缩放图片
  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  const imgData = canvas.toDataURL('image/png');

  if (imgHeight <= pageHeight) {
    pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
  } else {
    // 分页：按 pageHeight 切片绘制
    let remaining = imgHeight;
    let position = 0;
    while (remaining > 0) {
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      remaining -= pageHeight;
      if (remaining > 0) {
        pdf.addPage();
        position -= pageHeight;
      }
    }
  }

  pdf.save(`${fileName}.pdf`);
}

/**
 * 生成投资报告 Excel（标签全部经 i18n，随当前语言导出）：
 *  Sheet 1 财务指标
 *  Sheet 2 现金流（项目寿命全程）
 *  Sheet 3 关键参数
 *  Sheet 4 HW 品牌对比（可选）
 */
export async function exportExcelReport(
  financeResult: FinanceResult,
  scenarioName: string,
  params: InputParams,
  options?: ReportOptions
): Promise<void> {
  const t = i18n.t.bind(i18n);
  const opts: ReportOptions = {
    includeGreen: options?.includeGreen ?? true,
    includeOutage: options?.includeOutage ?? true,
    compareHW: options?.compareHW ?? false,
    hwEstimate: options?.hwEstimate,
    brands: options?.brands,
  };
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PV·BESS Analyzer';
  wb.created = new Date();

  // ─── Sheet 1: 财务指标 ───
  const sheet1 = wb.addWorksheet(t('excel.sheets.finance'));
  sheet1.columns = [
    { header: t('excel.headers.metric'), key: 'metric', width: 28 },
    { header: t('excel.headers.value'), key: 'value', width: 22 },
  ];
  sheet1.getRow(1).font = { bold: true };

  const metricRows: Array<[string, string]> = [
    [t('excel.rows.scenario'), scenarioName],
    [t('excel.rows.capex'), financeResult.capex.toFixed(2)],
    [t('excel.rows.revenue'), financeResult.annualRevenue.toFixed(2)],
    [t('excel.rows.npv'), financeResult.npv.toFixed(2)],
    [t('excel.rows.irr'), `${(financeResult.irr * 100).toFixed(2)}%`],
    [t('excel.rows.paybackStatic'), financeResult.paybackStatic.toFixed(2)],
    [t('excel.rows.paybackDynamic'), financeResult.paybackDynamic.toFixed(2)],
    [t('excel.rows.lcoe'), financeResult.lcoe.toFixed(4)],
    [t('excel.rows.bcRatio'), financeResult.benefitCostRatio.toFixed(3)],
  ];
  // 绿电溢价明细（可选）
  if (opts.includeGreen && financeResult.greenPremium) {
    metricRows.push(
      [t('excel.rows.greenEnergy'), financeResult.greenPremium.annualGreenEnergy_kWh.toFixed(0)],
      [t('excel.rows.greenPremium'), financeResult.greenPremium.annualPremium.toFixed(2)],
      [t('excel.rows.greenTotal'), financeResult.greenPremium.totalPremium.toFixed(2)],
    );
  }
  // 断电损失明细（可选）
  if (opts.includeOutage && financeResult.outageLoss) {
    metricRows.push(
      [t('excel.rows.unservedHours'), financeResult.outageLoss.totalUnserved_hours.toFixed(1)],
      [t('excel.rows.outageLoss'), financeResult.outageLoss.annualLoss.toFixed(2)],
    );
  }
  for (const [m, v] of metricRows) {
    sheet1.addRow({ metric: m, value: v });
  }

  // ─── Sheet 2: 现金流 ───
  const sheet2 = wb.addWorksheet(t('excel.sheets.cashflow'));
  sheet2.columns = [
    { header: t('excel.cashflow.year'), key: 'year', width: 8 },
    { header: t('excel.cashflow.soh'), key: 'soh', width: 10 },
    { header: t('excel.cashflow.pvGen'), key: 'pvGeneration', width: 20 },
    { header: t('excel.cashflow.gridSaving'), key: 'gridSaving', width: 16 },
    { header: t('excel.cashflow.dieselSaving'), key: 'dieselSaving', width: 16 },
    { header: t('excel.cashflow.demandSaving'), key: 'demandSaving', width: 16 },
    { header: t('excel.cashflow.totalRevenue'), key: 'totalRevenue', width: 16 },
    { header: t('excel.cashflow.opex'), key: 'opex', width: 14 },
    { header: t('excel.cashflow.netCF'), key: 'netCashflow', width: 16 },
    { header: t('excel.cashflow.discCF'), key: 'discountedCashflow', width: 22 },
    { header: t('excel.cashflow.cumDCF'), key: 'cumulativeDCF', width: 18 },
  ];
  sheet2.getRow(1).font = { bold: true };

  for (const row of financeResult.cashflow) {
    sheet2.addRow({
      year: row.year,
      soh: row.soh,
      pvGeneration: row.pvGeneration_kWh,
      gridSaving: row.gridSaving,
      dieselSaving: row.dieselSaving,
      demandSaving: row.demandSaving,
      totalRevenue: row.totalRevenue,
      opex: row.opex,
      netCashflow: row.netCashflow,
      discountedCashflow: row.discountedCashflow,
      cumulativeDCF: row.cumulativeDiscountedCF,
    });
  }

  // ─── Sheet 3: 关键参数 ───
  const sheet3 = wb.addWorksheet(t('excel.sheets.params'));
  sheet3.columns = [
    { header: t('excel.headers.param'), key: 'param', width: 32 },
    { header: t('excel.headers.value'), key: 'value', width: 22 },
  ];
  sheet3.getRow(1).font = { bold: true };

  const paramRows: Array<[string, string | number]> = [
    [t('excel.rows.pvCapacity'), params.pv.capacity_kWp],
    [t('excel.rows.derating'), params.pv.deratingFactor],
    [t('excel.rows.chargeEff'), params.bess.efficiencyCharge],
    [t('excel.rows.dischargeEff'), params.bess.efficiencyDischarge],
    [t('excel.rows.socUpper'), params.bess.socMax],
    [t('excel.rows.socLower'), params.bess.socMin],
    [t('excel.rows.dieselPrice'), params.diesel.fuelPrice_perL],
    [t('excel.rows.contractDemand'), params.grid.contractDemand_kW],
    [t('excel.rows.tariffType'), params.grid.tariffType],
    [t('excel.rows.flatPrice'), params.grid.flatPrice_perkWh],
    [t('excel.rows.peakPrice'), params.grid.peakPrice_perkWh],
    [t('excel.rows.pvCost'), params.capex.pvCost_perkW],
    [t('excel.rows.bessCost'), params.capex.bessCost_perkWh],
    [t('excel.rows.projectLife'), params.financial.projectLife],
    [t('excel.rows.discountRate'), params.financial.discountRate],
    [t('excel.rows.priceGrowth'), params.financial.priceGrowth],
    [t('excel.rows.opexGrowth'), params.financial.opexGrowth],
    [t('excel.rows.taxRate'), params.financial.taxRate],
    [t('excel.rows.currencyCode'), params.currency.code],
    [t('excel.rows.currencySymbol'), params.currency.symbol],
  ];
  for (const [p, v] of paramRows) {
    sheet3.addRow({ param: p, value: v });
  }

  // ─── Sheet 4: HW 品牌对比（可选） ───
  if (opts.compareHW && opts.hwEstimate && opts.brands) {
    const hw = opts.hwEstimate;
    const brands = opts.brands;
    const sheet4 = wb.addWorksheet(t('excel.sheets.hwCompare'));
    sheet4.columns = [
      { header: t('excel.headers.metric'), key: 'metric', width: 30 },
      { header: t('excel.headers.industry'), key: 'industry', width: 18 },
      { header: 'HW', key: 'hw', width: 18 },
      { header: t('excel.headers.deltaHW'), key: 'delta', width: 18 },
    ];
    sheet4.getRow(1).font = { bold: true };

    // 行业侧 10 年口径（现金流表前 10 年）
    const cf10 = financeResult.cashflow.filter((r) => r.year <= 10);
    const revenue10Ind = cf10.reduce((s, r) => s + r.totalRevenue, 0);
    const npv10Ind = cf10.reduce((s, r) => s + r.discountedCashflow, 0);
    const opexInd1 = financeResult.cashflow.find((r) => r.year === 1)?.opex ?? 0;

    const cmpRows: Array<[string, string | number, string | number, string | number]> = [
      [t('excel.rows.rte'), brands.industry_avg.rte, brands.HW.rte, brands.HW.rte - brands.industry_avg.rte],
      [t('excel.rows.rteSplit'), Math.sqrt(brands.industry_avg.rte).toFixed(4), Math.sqrt(brands.HW.rte).toFixed(4), (Math.sqrt(brands.HW.rte) - Math.sqrt(brands.industry_avg.rte)).toFixed(4)],
      [t('excel.rows.dod'), brands.industry_avg.dod, brands.HW.dod, brands.HW.dod - brands.industry_avg.dod],
      [t('excel.rows.operatingDays'), brands.industry_avg.operatingDaysPerYear, brands.HW.operatingDaysPerYear, brands.HW.operatingDaysPerYear - brands.industry_avg.operatingDaysPerYear],
      [t('excel.rows.sohY10'), (brands.industry_avg.sohCurve[9] ?? 0).toFixed(3), (brands.HW.sohCurve[9] ?? 0).toFixed(3), ((brands.HW.sohCurve[9] ?? 0) - (brands.industry_avg.sohCurve[9] ?? 0)).toFixed(3)],
      [t('excel.rows.bessCost'), brands.industry_avg.costPerKWh, brands.HW.costPerKWh, brands.HW.costPerKWh - brands.industry_avg.costPerKWh],
      [t('excel.rows.capex'), financeResult.capex.toFixed(2), hw.capex.toFixed(2), (hw.capex - financeResult.capex).toFixed(2)],
      [t('excel.rows.opexYear1'), opexInd1.toFixed(2), hw.opexYear1.toFixed(2), (hw.opexYear1 - opexInd1).toFixed(2)],
      [t('excel.rows.revenue10'), revenue10Ind.toFixed(2), hw.revenue10.toFixed(2), (hw.revenue10 - revenue10Ind).toFixed(2)],
      [t('excel.rows.npv10'), npv10Ind.toFixed(2), hw.npv10.toFixed(2), (hw.npv10 - npv10Ind).toFixed(2)],
      [t('excel.rows.paybackStatic'), financeResult.paybackStatic.toFixed(2), hw.paybackStatic.toFixed(2), (hw.paybackStatic - financeResult.paybackStatic).toFixed(2)],
      [t('excel.rows.throughput10'), '-', `${(hw.throughput10 / 1000).toFixed(0)} MWh`, '-'],
    ];
    for (const [m, i, h, d] of cmpRows) {
      sheet4.addRow({ metric: m, industry: i, hw: h, delta: d });
    }
    sheet4.addRow({});
    sheet4.addRow({ metric: t('excel.hwNote') });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pv-bess-report.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
