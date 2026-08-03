import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import ExcelJS from 'exceljs';
import { FinanceResult, InputParams } from '../types';
import { BrandMap, HWEstimate } from './brand';

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
 * 生成 10 年投资报告 Excel：
 *  Sheet 1 财务指标
 *  Sheet 2 现金流（10 年）
 *  Sheet 3 关键参数
 */
export async function exportExcelReport(
  financeResult: FinanceResult,
  scenarioName: string,
  params: InputParams,
  options?: ReportOptions
): Promise<void> {
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
  const sheet1 = wb.addWorksheet('财务指标');
  sheet1.columns = [
    { header: '指标', key: 'metric', width: 28 },
    { header: '数值', key: 'value', width: 22 },
  ];
  sheet1.getRow(1).font = { bold: true };

  const metricRows: Array<[string, string]> = [
    ['方案', scenarioName],
    ['CAPEX', financeResult.capex.toFixed(2)],
    ['首年收益', financeResult.annualRevenue.toFixed(2)],
    ['NPV', financeResult.npv.toFixed(2)],
    ['IRR', `${(financeResult.irr * 100).toFixed(2)}%`],
    ['静态回收期 (年)', financeResult.paybackStatic.toFixed(2)],
    ['动态回收期 (年)', financeResult.paybackDynamic.toFixed(2)],
    ['LCOE', financeResult.lcoe.toFixed(4)],
    ['B/C Ratio', financeResult.benefitCostRatio.toFixed(3)],
  ];
  // 绿电溢价明细（可选）
  if (opts.includeGreen && financeResult.greenPremium) {
    metricRows.push(
      ['年绿电消纳量 (kWh)', financeResult.greenPremium.annualGreenEnergy_kWh.toFixed(0)],
      ['年绿电溢价收益', financeResult.greenPremium.annualPremium.toFixed(2)],
      ['全生命周期溢价', financeResult.greenPremium.totalPremium.toFixed(2)],
    );
  }
  // 断电损失明细（可选）
  if (opts.includeOutage && financeResult.outageLoss) {
    metricRows.push(
      ['年未供电量 (kWh)', financeResult.outageLoss.totalUnserved_kWh.toFixed(0)],
      ['年断电损失', financeResult.outageLoss.annualLoss.toFixed(2)],
    );
  }
  for (const [m, v] of metricRows) {
    sheet1.addRow({ metric: m, value: v });
  }

  // ─── Sheet 2: 现金流 ───
  const sheet2 = wb.addWorksheet('现金流');
  sheet2.columns = [
    { header: 'Year', key: 'year', width: 8 },
    { header: 'SOH', key: 'soh', width: 10 },
    { header: 'PV Generation (kWh)', key: 'pvGeneration', width: 20 },
    { header: 'Grid Saving', key: 'gridSaving', width: 16 },
    { header: 'Diesel Saving', key: 'dieselSaving', width: 16 },
    { header: 'Demand Saving', key: 'demandSaving', width: 16 },
    { header: 'Total Revenue', key: 'totalRevenue', width: 16 },
    { header: 'OPEX', key: 'opex', width: 14 },
    { header: 'Net Cashflow', key: 'netCashflow', width: 16 },
    { header: 'Discounted Cashflow', key: 'discountedCashflow', width: 22 },
    { header: 'Cumulative DCF', key: 'cumulativeDCF', width: 18 },
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
  const sheet3 = wb.addWorksheet('参数');
  sheet3.columns = [
    { header: '参数', key: 'param', width: 32 },
    { header: '数值', key: 'value', width: 22 },
  ];
  sheet3.getRow(1).font = { bold: true };

  const paramRows: Array<[string, string | number]> = [
    ['PV 容量 (kWp)', params.pv.capacity_kWp],
    ['PV 综合衰减系数', params.pv.deratingFactor],
    ['BESS 充电效率', params.bess.efficiencyCharge],
    ['BESS 放电效率', params.bess.efficiencyDischarge],
    ['BESS SOC 上限', params.bess.socMax],
    ['BESS SOC 下限', params.bess.socMin],
    ['柴油价格 (货币/L)', params.diesel.fuelPrice_perL],
    ['合同需量 (kW)', params.grid.contractDemand_kW],
    ['电价类型', params.grid.tariffType],
    ['平电价 (货币/kWh)', params.grid.flatPrice_perkWh],
    ['峰电价 (货币/kWh)', params.grid.peakPrice_perkWh],
    ['PV 单位成本 (货币/kW)', params.capex.pvCost_perkW],
    ['BESS 单位成本 (货币/kWh)', params.capex.bessCost_perkWh],
    ['PCS 单位成本 (货币/kW)', params.capex.pcsCost_perkW],
    ['项目寿命 (年)', params.financial.projectLife],
    ['折现率', params.financial.discountRate],
    ['电价年增长率', params.financial.priceGrowth],
    ['OPEX 年增长率', params.financial.opexGrowth],
    ['税率', params.financial.taxRate],
    ['货币代码', params.currency.code],
    ['货币符号', params.currency.symbol],
  ];
  for (const [p, v] of paramRows) {
    sheet3.addRow({ param: p, value: v });
  }

  // ─── Sheet 4: HW 品牌对比（可选） ───
  if (opts.compareHW && opts.hwEstimate && opts.brands) {
    const hw = opts.hwEstimate;
    const brands = opts.brands;
    const sheet4 = wb.addWorksheet('HW 对比');
    sheet4.columns = [
      { header: '指标', key: 'metric', width: 30 },
      { header: '行业平均', key: 'industry', width: 18 },
      { header: 'HW', key: 'hw', width: 18 },
      { header: 'Δ (HW − 行业)', key: 'delta', width: 18 },
    ];
    sheet4.getRow(1).font = { bold: true };

    const cmpRows: Array<[string, string | number, string | number, string | number]> = [
      ['充电效率', brands.industry_avg.efficiencyCharge, brands.HW.efficiencyCharge, brands.HW.efficiencyCharge - brands.industry_avg.efficiencyCharge],
      ['放电效率', brands.industry_avg.efficiencyDischarge, brands.HW.efficiencyDischarge, brands.HW.efficiencyDischarge - brands.industry_avg.efficiencyDischarge],
      ['电池单价 (货币/kWh)', brands.industry_avg.costPerKWh, brands.HW.costPerKWh, brands.HW.costPerKWh - brands.industry_avg.costPerKWh],
      ['PCS 单价 (货币/kW)', brands.industry_avg.pcsCostPerKW, brands.HW.pcsCostPerKW, brands.HW.pcsCostPerKW - brands.industry_avg.pcsCostPerKW],
      ['OPEX 比率', brands.industry_avg.opexRate, brands.HW.opexRate, brands.HW.opexRate - brands.industry_avg.opexRate],
      ['CAPEX', financeResult.capex.toFixed(2), hw.capex.toFixed(2), (hw.capex - financeResult.capex).toFixed(2)],
      ['首年收益', financeResult.annualRevenue.toFixed(2), hw.annualRevenue.toFixed(2), (hw.annualRevenue - financeResult.annualRevenue).toFixed(2)],
      ['NPV', financeResult.npv.toFixed(2), hw.npv.toFixed(2), (hw.npv - financeResult.npv).toFixed(2)],
      ['IRR', `${(financeResult.irr * 100).toFixed(2)}%`, `${(hw.irr * 100).toFixed(2)}%`, `${((hw.irr - financeResult.irr) * 100).toFixed(2)}pp`],
      ['静态回收期 (年)', financeResult.paybackStatic.toFixed(2), hw.paybackStatic.toFixed(2), (hw.paybackStatic - financeResult.paybackStatic).toFixed(2)],
    ];
    for (const [m, i, h, d] of cmpRows) {
      sheet4.addRow({ metric: m, industry: i, hw: h, delta: d });
    }
    sheet4.addRow({});
    sheet4.addRow({ metric: '注：HW 列为同容量下的简化估算（效率/OPEX 差异调整），非重新仿真。' });
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
