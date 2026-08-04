import ExcelJS from 'exceljs';
import { InputParams, ScenarioConfig } from '../types';
import i18n from '../i18n';

/**
 * 参数 sheet 行定义：dotted key + 标签 i18n key + 单位/说明（语言无关）
 * A 列 = 参数 key（隐藏列，A1 恒为 'key'，是导入解析的唯一依据 → 语言无关）
 */
const PARAM_ROWS: Array<{ key: string; labelKey: string; unit?: string }> = [
  { key: 'pv.capacity_kWp', labelKey: 'excel.rows.pvCapacity', unit: 'kWp' },
  { key: 'pv.deratingFactor', labelKey: 'excel.rows.derating' },
  { key: 'bess.cRate', labelKey: 'excel.rows.pcsRate', unit: 'C' },
  { key: 'bess.efficiencyCharge', labelKey: 'excel.rows.chargeEff' },
  { key: 'bess.efficiencyDischarge', labelKey: 'excel.rows.dischargeEff' },
  { key: 'bess.socMax', labelKey: 'excel.rows.socMax' },
  { key: 'bess.socMin', labelKey: 'excel.rows.socMin' },
  { key: 'bess.socInitial', labelKey: 'excel.rows.socInitial' },
  { key: 'diesel.ratedPower_kW', labelKey: 'excel.rows.dieselRated', unit: 'kW' },
  { key: 'diesel.fuelPrice_perL', labelKey: 'excel.rows.dieselPrice', unit: 'curr/L' },
  { key: 'grid.contractDemand_kW', labelKey: 'excel.rows.contractDemand', unit: 'kW' },
  { key: 'grid.demandCharge_perKW', labelKey: 'excel.rows.demandCharge', unit: 'curr/kW·mo' },
  { key: 'grid.excessDemandRate', labelKey: 'excel.rows.excessRate', unit: 'curr/kW·mo' },
  { key: 'grid.tariffType', labelKey: 'excel.rows.tariffType', unit: 'flat | tou' },
  { key: 'grid.flatPrice_perkWh', labelKey: 'excel.rows.flatPrice', unit: 'curr/kWh' },
  { key: 'grid.peakPrice_perkWh', labelKey: 'excel.rows.peakPrice', unit: 'curr/kWh' },
  { key: 'grid.offPeakPrice_perkWh', labelKey: 'excel.rows.offPeakPrice', unit: 'curr/kWh' },
  { key: 'capex.pvCost_perkW', labelKey: 'excel.rows.pvCost', unit: 'curr/kW' },
  { key: 'capex.bessCost_perkWh', labelKey: 'excel.rows.bessCost', unit: 'curr/kWh' },
  { key: 'opex.pvFixedOpexRate', labelKey: 'excel.rows.pvOpexRate' },
  { key: 'opex.bessFixedOpexRate', labelKey: 'excel.rows.bessOpexRate' },
  { key: 'financial.projectLife', labelKey: 'excel.rows.projectLife', unit: 'yr' },
  { key: 'financial.discountRate', labelKey: 'excel.rows.discountRate' },
  { key: 'financial.priceGrowth', labelKey: 'excel.rows.priceGrowth' },
  { key: 'financial.opexGrowth', labelKey: 'excel.rows.opexGrowth' },
  { key: 'financial.taxRate', labelKey: 'excel.rows.taxRate' },
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

/** 构建模板工作簿（标签按当前语言生成；A 列 key 隐藏，导入时语言无关） */
export async function buildTemplateWorkbook(
  params: InputParams,
  scenarios?: ScenarioConfig[]
): Promise<ExcelJS.Workbook> {
  const t = i18n.t.bind(i18n);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PV-BESS Analyzer';
  workbook.created = new Date();

  // Sheet 1: 参数（A=key 隐藏列为导入唯一依据）
  const paramSheet = workbook.addWorksheet(t('excel.sheets.params'));
  paramSheet.columns = [
    { header: 'key', key: 'key', width: 32, hidden: true },
    { header: t('excel.headers.label'), key: 'label', width: 36 },
    { header: t('excel.headers.value'), key: 'value', width: 20 },
    { header: t('excel.headers.unit'), key: 'unit', width: 16 },
  ];
  paramSheet.getRow(1).font = { bold: true };
  for (const row of PARAM_ROWS) {
    paramSheet.addRow({
      key: row.key,
      label: t(row.labelKey),
      value: getPathValue(params, row.key),
      unit: row.unit ?? '',
    });
  }

  // Sheet 2: 方案（预填当前 6 档真实值，指令⑧：模板自带合理数据）
  const scenarioSheet = workbook.addWorksheet(t('excel.sheets.scenarios'));
  scenarioSheet.columns = [
    { header: 'id', key: 'id', width: 8 },
    { header: 'name', key: 'name', width: 24 },
    { header: 'pvCapacity_kWp', key: 'pvCapacity_kWp', width: 18 },
    { header: 'bessCapacity_kWh', key: 'bessCapacity_kWh', width: 20 },
    { header: 'pcsPower_kW', key: 'pcsPower_kW', width: 16 },
  ];
  scenarioSheet.getRow(1).font = { bold: true };
  const pvKwp = getPathValue(params, 'pv.capacity_kWp');
  const tiers = scenarios && scenarios.length > 0
    ? scenarios
    : [1, 2, 3, 4, 5, 6].map((i) => ({
        id: i, name: '', pvCapacity_kWp: pvKwp, bessCapacity_kWh: 0, pcsPower_kW: 0,
      }));
  for (const s of tiers) {
    scenarioSheet.addRow({
      id: s.id,
      name: s.name || t('excel.schemeName', { n: s.id }),
      pvCapacity_kWp: s.pvCapacity_kWp ?? pvKwp,
      bessCapacity_kWh: s.bessCapacity_kWh,
      pcsPower_kW: s.pcsPower_kW,
    });
  }

  return workbook;
}

/** 生成并下载 Excel 模板 */
export async function downloadExcelTemplate(
  params: InputParams,
  scenarios?: ScenarioConfig[]
): Promise<void> {
  const workbook = await buildTemplateWorkbook(params, scenarios);
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

/** 解析上传的 Excel 文件，返回部分 InputParams（按 A 列 key 解析 → 语言无关） */
export async function parseExcelUpload(file: File): Promise<Partial<InputParams>> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return parseWorkbookParams(workbook);
}

/** 从工作簿解析参数（A1 === 'key' 定位参数表；抽离以便无头测试） */
export function parseWorkbookParams(workbook: ExcelJS.Workbook): Partial<InputParams> {
  const t = i18n.t.bind(i18n);

  // 语言无关定位：A1 === 'key' 的工作表即参数表
  const sheet = workbook.worksheets.find(
    (ws) => String(ws.getCell('A1').value ?? '').trim() === 'key'
  );
  if (!sheet) {
    throw new Error(t('excel.errors.missingParamsSheet'));
  }

  const result: any = {};
  const knownKeys = new Set(PARAM_ROWS.map((r) => r.key));

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
