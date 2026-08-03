import ExcelJS from 'exceljs';
import { InputParams } from '../types';

/** 参数 sheet 行定义：[键, 中文标签] */
const PARAM_ROWS: Array<[string, string]> = [
  ['pv.capacity_kWp', 'PV 容量 (kWp)'],
  ['pv.deratingFactor', 'PV 综合衰减系数'],
  ['pv.annualDegradation', 'PV 年衰减率'],
  ['bess.cRate', 'BESS PCS 倍率 (C)'],
  ['bess.efficiencyCharge', 'BESS 充电效率'],
  ['bess.efficiencyDischarge', 'BESS 放电效率'],
  ['bess.socMax', 'BESS 最大 SOC'],
  ['bess.socMin', 'BESS 最低 SOC'],
  ['bess.socInitial', 'BESS 初始 SOC'],
  ['diesel.ratedPower_kW', '柴油发电机额定功率 (kW)'],
  ['diesel.fuelPrice_perL', '柴油价格 (货币/L)'],
  ['grid.contractDemand_kW', '合同需量 (kW)'],
  ['grid.tariffType', '电价类型 (flat/tou)'],
  ['grid.flatPrice_perkWh', '平电价 (货币/kWh)'],
  ['grid.peakPrice_perkWh', '峰电价 (货币/kWh)'],
  ['grid.offPeakPrice_perkWh', '谷电价 (货币/kWh)'],
  ['capex.pvCost_perkW', 'PV 单位成本 (货币/kW)'],
  ['capex.bessCost_perkWh', 'BESS 单位成本 (货币/kWh)'],
  ['capex.pcsCost_perkW', 'PCS 单位成本 (货币/kW)'],
  ['financial.projectLife', '项目寿命 (年)'],
  ['financial.discountRate', '折现率'],
  ['financial.priceGrowth', '电价年增长率'],
];

/** 按 dotted path 取值 */
function getPathValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/** 按 dotted path 设值 */
function setPathValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] == null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/** 生成并下载 Excel 模板 */
export async function downloadExcelTemplate(params: InputParams): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PV-BESS Analyzer';
  workbook.created = new Date();

  // Sheet 1: 参数
  const paramSheet = workbook.addWorksheet('参数');
  paramSheet.columns = [
    { header: '参数键', key: 'key', width: 32 },
    { header: '说明', key: 'label', width: 36 },
    { header: '值', key: 'value', width: 20 },
  ];
  paramSheet.getRow(1).font = { bold: true };
  for (const [key, label] of PARAM_ROWS) {
    paramSheet.addRow({ key, label, value: getPathValue(params, key) });
  }

  // Sheet 2: 方案
  const scenarioSheet = workbook.addWorksheet('方案');
  scenarioSheet.columns = [
    { header: 'id', key: 'id', width: 8 },
    { header: 'name', key: 'name', width: 24 },
    { header: 'pvCapacity_kWp', key: 'pvCapacity_kWp', width: 18 },
    { header: 'bessCapacity_kWh', key: 'bessCapacity_kWh', width: 20 },
    { header: 'pcsPower_kW', key: 'pcsPower_kW', width: 16 },
  ];
  scenarioSheet.getRow(1).font = { bold: true };
  for (let i = 1; i <= 5; i++) {
    scenarioSheet.addRow({
      id: i,
      name: `方案 ${i}`,
      pvCapacity_kWp: getPathValue(params, 'pv.capacity_kWp'),
      bessCapacity_kWh: 0,
      pcsPower_kW: 0,
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pv-bess-template.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 解析上传的 Excel 文件，返回部分 InputParams */
export async function parseExcelUpload(file: File): Promise<Partial<InputParams>> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.getWorksheet('参数');
  if (!sheet) {
    throw new Error('未找到名为"参数"的工作表');
  }

  const result: any = {};
  const knownKeys = new Set(PARAM_ROWS.map(([k]) => k));

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 跳过表头
    const key = String(row.getCell(1).value ?? '').trim();
    const value = row.getCell(3).value;
    if (!key || !knownKeys.has(key)) return;

    // exceljs 可能返回 { formula, result } 或富文本对象
    const raw = value && typeof value === 'object' && 'result' in (value as any)
      ? (value as any).result
      : value;

    let parsed: any = raw;
    if (raw == null) return;

    if (key === 'grid.tariffType') {
      parsed = String(raw).trim() === 'tou' ? 'tou' : 'flat';
    } else if (typeof raw === 'string' && raw !== '' && !isNaN(Number(raw))) {
      parsed = Number(raw);
    } else if (typeof raw === 'number') {
      parsed = raw;
    } else if (typeof raw === 'boolean') {
      parsed = raw;
    } else {
      parsed = raw;
    }

    setPathValue(result, key, parsed);
  });

  return result as Partial<InputParams>;
}
