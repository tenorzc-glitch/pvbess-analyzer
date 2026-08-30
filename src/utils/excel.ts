import ExcelJS from 'exceljs';
import { InputParams, ScenarioConfig, ProfileData, ProfileInterval, AmbientTempData } from '../types';
import i18n from '../i18n';

/**
 * 参数 sheet 行定义：dotted key + 标签 i18n key + 单位/说明（语言无关）
 * A 列 = 参数 key（隐藏列，A1 恒为 'key'，是导入解析的唯一依据 → 语言无关）
 *
 * 采集缺口补丁（模块A）：
 * - 新增停电/运行日历/柴发最小出力/人工差旅/断电损失/绿电溢价/币种字段
 * - 数组型字段（eventDaysPerMonth 等）在单元格内以英文逗号分隔，解析时拆分
 * - 布尔型字段（enabled）以 true/false 文本解析
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
  { key: 'diesel.minStablePower_kW', labelKey: 'excel.rows.dieselMinStable', unit: 'kW' },
  { key: 'diesel.fuelPrice_perL', labelKey: 'excel.rows.dieselPrice', unit: 'curr/L' },
  { key: 'grid.contractDemand_kW', labelKey: 'excel.rows.contractDemand', unit: 'kW' },
  { key: 'grid.demandCharge_perKW', labelKey: 'excel.rows.demandCharge', unit: 'curr/kW·mo' },
  { key: 'grid.excessDemandRate', labelKey: 'excel.rows.excessRate', unit: 'curr/kW·mo' },
  { key: 'grid.tariffType', labelKey: 'excel.rows.tariffType', unit: 'flat | tou' },
  { key: 'grid.flatPrice_perkWh', labelKey: 'excel.rows.flatPrice', unit: 'curr/kWh' },
  { key: 'grid.peakPrice_perkWh', labelKey: 'excel.rows.peakPrice', unit: 'curr/kWh' },
  { key: 'grid.offPeakPrice_perkWh', labelKey: 'excel.rows.offPeakPrice', unit: 'curr/kWh' },
  { key: 'grid.outage.eventDaysPerMonth', labelKey: 'excel.rows.outageDays', unit: 'comma-sep ×12' },
  { key: 'grid.outage.eventMinutes', labelKey: 'excel.rows.outageMinutes', unit: 'min' },
  { key: 'grid.outage.windowStart', labelKey: 'excel.rows.outageWindow', unit: 'HH:MM' },
  { key: 'workDays.effectiveDaysPerYear', labelKey: 'excel.rows.effectiveDays', unit: 'days' },
  { key: 'workDays.rainyMonths', labelKey: 'excel.rows.rainyMonths', unit: 'comma-sep' },
  { key: 'workDays.rainyOutageDays', labelKey: 'excel.rows.rainyOutageDays', unit: 'comma-sep' },
  { key: 'workDays.maintenanceDaysPerMonth', labelKey: 'excel.rows.maintenanceDays', unit: 'comma-sep ×12' },
  { key: 'workDays.stoppageLoadFactor', labelKey: 'excel.rows.stoppageLoadFactor' },
  { key: 'capex.pvCost_perkW', labelKey: 'excel.rows.pvCost', unit: 'curr/kW' },
  { key: 'capex.bessCost_perkWh', labelKey: 'excel.rows.bessCost', unit: 'curr/kWh' },
  { key: 'opex.pvFixedOpexRate', labelKey: 'excel.rows.pvOpexRate' },
  { key: 'opex.bessFixedOpexRate', labelKey: 'excel.rows.bessOpexRate' },
  { key: 'opex.laborRate', labelKey: 'excel.rows.laborRate', unit: 'curr/person·h' },
  { key: 'opex.travelCost', labelKey: 'excel.rows.travelCost', unit: 'curr/trip' },
  { key: 'outageLoss.enabled', labelKey: 'excel.rows.outageLossEnabled', unit: 'true | false' },
  { key: 'outageLoss.dailyProductionValue', labelKey: 'excel.rows.dailyProductionValue', unit: 'curr/day' },
  { key: 'outageLoss.lossRate', labelKey: 'excel.rows.lossRate' },
  { key: 'greenPremium.enabled', labelKey: 'excel.rows.greenPremiumEnabled', unit: 'true | false' },
  { key: 'greenPremium.premiumRate', labelKey: 'excel.rows.greenPremiumRate', unit: 'curr/kWh' },
  { key: 'financial.projectLife', labelKey: 'excel.rows.projectLife', unit: 'yr' },
  { key: 'financial.discountRate', labelKey: 'excel.rows.discountRate' },
  { key: 'financial.priceGrowth', labelKey: 'excel.rows.priceGrowth' },
  { key: 'financial.opexGrowth', labelKey: 'excel.rows.opexGrowth' },
  { key: 'financial.taxRate', labelKey: 'excel.rows.taxRate' },
  { key: 'currency.code', labelKey: 'excel.rows.currencyCode', unit: 'BRL | USD | …' },
  { key: '_meta.country', labelKey: 'excel.rows.country', unit: 'brazil | cn_zhejiang | …' },
];

/** 曲线 sheet 标识（A1 隐藏 key，语言无关） */
const CURVE_SHEETS = [
  { key: 'profile:load_kW', labelKey: 'excel.sheets.loadCurve', colLabelKey: 'excel.rows.loadKw' },
  { key: 'profile:pvPerUnit', labelKey: 'excel.sheets.pvCurve', colLabelKey: 'excel.rows.pvPerUnit' },
  { key: 'profile:ambientTemp', labelKey: 'excel.sheets.tempCurve', colLabelKey: 'excel.rows.ambientTemp' },
] as const;

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** 数组型参数 key → 逗号分隔字符串互转 */
const ARRAY_KEYS = new Set([
  'grid.outage.eventDaysPerMonth',
  'workDays.rainyMonths',
  'workDays.rainyOutageDays',
  'workDays.maintenanceDaysPerMonth',
]);
/** 布尔型参数 key → true/false 文本互转 */
const BOOL_KEYS = new Set([
  'outageLoss.enabled',
  'greenPremium.enabled',
]);
/** 字符串型参数 key（不做数值转换） */
const STRING_KEYS = new Set([
  'grid.tariffType',
  'grid.outage.windowStart',
  'currency.code',
]);

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

/** 序列化为单元格值（数组→CSV 文本，布尔→true/false） */
function serializeCell(key: string, value: any): any {
  if (ARRAY_KEYS.has(key) && Array.isArray(value)) return value.join(',');
  if (BOOL_KEYS.has(key)) return value ? 'true' : 'false';
  return value;
}

/** 反序列化单元格值 */
function deserializeCell(key: string, raw: any): any {
  if (ARRAY_KEYS.has(key)) {
    const parts = String(raw).split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
    return parts.length > 0 ? parts : undefined;
  }
  if (BOOL_KEYS.has(key)) {
    return String(raw).trim().toLowerCase() === 'true';
  }
  if (key === 'grid.tariffType') return String(raw).trim() === 'tou' ? 'tou' : 'flat';
  if (STRING_KEYS.has(key)) return String(raw).trim();
  if (typeof raw === 'string' && raw !== '' && !isNaN(Number(raw))) return Number(raw);
  return raw;
}

/** 按 dotted path 取值（_meta.* 伪路径：从调用方上下文取，不进 params） */
function getMetaValue(key: string, country?: string): any {
  if (key === '_meta.country') return country ?? '';
  return undefined;
}

/** 构建模板工作簿（标签按当前语言生成；A 列 key 隐藏，导入时语言无关） */
export async function buildTemplateWorkbook(
  params: InputParams,
  scenarios?: ScenarioConfig[],
  profile?: ProfileData | null,
  ambientTemp?: AmbientTempData | null,
  country?: string,
): Promise<ExcelJS.Workbook> {
  const t = i18n.t.bind(i18n);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PV-BESS Analyzer';
  workbook.created = new Date();

  // Sheet 1: 参数（A=key 隐藏列为导入唯一依据）
  const paramSheet = workbook.addWorksheet(t('excel.sheets.params'));
  paramSheet.columns = [
    { header: 'key', key: 'key', width: 34, hidden: true },
    { header: t('excel.headers.label'), key: 'label', width: 36 },
    { header: t('excel.headers.value'), key: 'value', width: 22 },
    { header: t('excel.headers.unit'), key: 'unit', width: 18 },
  ];
  paramSheet.getRow(1).font = { bold: true };
  for (const row of PARAM_ROWS) {
    const value = row.key.startsWith('_meta.')
      ? getMetaValue(row.key, country)
      : serializeCell(row.key, getPathValue(params, row.key));
    paramSheet.addRow({
      key: row.key,
      label: t(row.labelKey),
      value,
      unit: row.unit ?? '',
    });
  }

  // Sheet 2: 方案（预填当前 6 档真实值）
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

  // Sheet 3-5: 曲线矩阵（96 行 × 12 月；A1=key 隐藏列为导入依据）
  const curveData: Record<string, (m: number, slot: number) => number | ''> = {
    'profile:load_kW': (m, slot) => profile?.[m]?.[slot]?.load_kW ?? '',
    'profile:pvPerUnit': (m, slot) => profile?.[m]?.[slot]?.pvPerUnit ?? '',
    'profile:ambientTemp': (m, slot) => ambientTemp?.profile?.[m]?.[slot] ?? '',
  };
  for (const cs of CURVE_SHEETS) {
    const ws = workbook.addWorksheet(t(cs.labelKey));
    // 隐藏 key 列
    ws.getColumn(1).hidden = true;
    ws.getCell('A1').value = cs.key;
    ws.getCell('B1').value = 'time';
    for (let m = 0; m < 12; m++) ws.getCell(1, 3 + m).value = `M${m + 1}`;
    ws.getRow(1).font = { bold: true };
    const getVal = curveData[cs.key];
    for (let slot = 0; slot < 96; slot++) {
      const hh = Math.floor(slot / 4);
      const mm = (slot % 4) * 15;
      ws.getCell(2 + slot, 2).value = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      for (let m = 0; m < 12; m++) {
        ws.getCell(2 + slot, 3 + m).value = getVal(m, slot);
      }
    }
    ws.getColumn(2).width = 10;
    for (let m = 0; m < 12; m++) ws.getColumn(3 + m).width = 10;
  }

  return workbook;
}

/** 生成并下载 Excel 模板 */
export async function downloadExcelTemplate(
  params: InputParams,
  scenarios?: ScenarioConfig[],
  profile?: ProfileData | null,
  ambientTemp?: AmbientTempData | null,
  country?: string,
): Promise<void> {
  const workbook = await buildTemplateWorkbook(params, scenarios, profile, ambientTemp, country);
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

/** 上传解析结果：参数 + 可选曲线 */
export interface ExcelUploadResult {
  params: Partial<InputParams>;
  profile?: ProfileData;
  ambientTemp?: AmbientTempData;
}

/** 品牌参数 Excel 导出（每品牌一列 × 每参数一行） */
export interface BrandExportRow {
  /** 参数字段名（导入时按此回写，语言无关） */
  field: string;
  labelKey: string;
  get: (b: any) => string | number;
}

export const BRAND_EXPORT_ROWS: BrandExportRow[] = [
  { field: 'rte', labelKey: 'excel.rows.rte', get: (b) => b.rte },
  { field: 'dod', labelKey: 'excel.rows.dod', get: (b) => b.dod },
  { field: 'operatingDaysPerYear', labelKey: 'excel.rows.operatingDays', get: (b) => b.operatingDaysPerYear },
  { field: '_sohY10', labelKey: 'excel.rows.sohY10', get: (b) => b.sohCurve[9] ?? 0 },
  { field: 'sohCurve', labelKey: 'excel.rows.sohCurve', get: (b) => b.sohCurve.map((v: number) => v.toFixed(3)).join(',') },
  { field: 'costPerKWh', labelKey: 'excel.rows.epcUnitPrice', get: (b) => b.costPerKWh },
  { field: 'opexRate', labelKey: 'excel.rows.opexRate', get: (b) => b.opexRate },
  { field: 'warrantyCostPerKWhYear', labelKey: 'excel.rows.warrantyCost', get: (b) => b.warrantyCostPerKWhYear },
  { field: 'socMinOffgrid', labelKey: 'excel.rows.socMinOffgrid', get: (b) => b.socMinOffgrid },
  { field: 'socMaxOffgrid', labelKey: 'excel.rows.socMaxOffgrid', get: (b) => b.socMaxOffgrid },
  { field: 'needsIsolationTransformer', labelKey: 'excel.rows.needsIsolationTransformer', get: (b) => (b.needsIsolationTransformer ? 'true' : 'false') },
  { field: 'transformerEfficiencyLoss', labelKey: 'excel.rows.transformerEfficiencyLoss', get: (b) => b.transformerEfficiencyLoss },
  { field: 'needsManualBalancing', labelKey: 'excel.rows.needsManualBalancing', get: (b) => (b.needsManualBalancing ? 'true' : 'false') },
  { field: 'needsCoolantReplacement', labelKey: 'excel.rows.needsCoolantReplacement', get: (b) => (b.needsCoolantReplacement ? 'true' : 'false') },
  { field: 'coolantIntervalYears', labelKey: 'excel.rows.coolantIntervalYears', get: (b) => b.coolantIntervalYears },
  { field: 'coolantCostPerEvent', labelKey: 'excel.rows.coolantCostPerEvent', get: (b) => b.coolantCostPerEvent },
  { field: 'autoCalibration', labelKey: 'excel.rows.autoCalibration', get: (b) => (b.autoCalibration ? 'true' : 'false') },
  { field: 'calibrationVisitCost', labelKey: 'excel.rows.calibrationVisitCost', get: (b) => b.calibrationVisitCost },
  { field: 'calibrationIntervalMonths', labelKey: 'excel.rows.calibrationIntervalMonths', get: (b) => b.calibrationIntervalMonths },
];

/** 生成品牌参数对比工作簿（A 列隐藏字段名 = 导入依据；附计算逻辑 sheet 说明 OPEX 组成） */
export async function buildBrandWorkbook(
  brands: Array<{ id: string; label: string; params: any }>,
): Promise<ExcelJS.Workbook> {
  const t = i18n.t.bind(i18n);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PV-BESS Analyzer';
  const ws = workbook.addWorksheet(t('excel.sheets.brandParams'));
  ws.getCell('A1').value = 'brand_param';
  ws.getCell('B1').value = t('excel.headers.label');
  brands.forEach((b, i) => {
    ws.getCell(1, 3 + i).value = b.label;
  });
  ws.getRow(1).font = { bold: true };
  ws.getColumn(1).hidden = true;
  ws.getColumn(2).width = 36;
  brands.forEach((_b, i) => { ws.getColumn(3 + i).width = 16; });
  BRAND_EXPORT_ROWS.forEach((row, ri) => {
    ws.getCell(2 + ri, 1).value = row.field;
    ws.getCell(2 + ri, 2).value = t(row.labelKey);
    brands.forEach((b, bi) => {
      ws.getCell(2 + ri, 3 + bi).value = row.get(b.params);
    });
  });

  // 计算逻辑说明 sheet：OPEX 构成与单价来源（保持主界面简洁，细节在此呈现）
  const doc = workbook.addWorksheet(t('excel.sheets.calcLogic'));
  doc.getColumn(1).width = 34;
  doc.getColumn(2).width = 90;
  const lines: Array<[string, string]> = [
    [t('excel.logic.opexTitle'), t('excel.logic.opexFormula')],
    [t('excel.logic.fixedTitle'), t('excel.logic.fixedFormula')],
    [t('excel.logic.balancingTitle'), t('excel.logic.balancingFormula')],
    [t('excel.logic.coolantTitle'), t('excel.logic.coolantFormula')],
    [t('excel.logic.calibrationTitle'), t('excel.logic.calibrationFormula')],
    [t('excel.logic.warrantyTitle'), t('excel.logic.warrantyFormula')],
    [t('excel.logic.gainTitle'), t('excel.logic.gainFormula')],
    [t('excel.logic.noteTitle'), t('excel.logic.noteBody')],
  ];
  lines.forEach(([k, v], i) => {
    doc.getCell(1 + i, 1).value = k;
    doc.getCell(1 + i, 1).font = { bold: true };
    doc.getCell(1 + i, 2).value = v;
    doc.getCell(1 + i, 2).alignment = { wrapText: true, vertical: 'top' };
  });
  return workbook;
}

/** 解析品牌参数工作簿（A1='brand_param' 定位；A 列字段名回写） */
export function parseBrandWorkbook(
  workbook: ExcelJS.Workbook,
): Array<{ label: string; params: Record<string, any> }> {
  const t = i18n.t.bind(i18n);
  const ws = workbook.worksheets.find(
    (s) => String(s.getCell('A1').value ?? '').trim() === 'brand_param'
  );
  if (!ws) throw new Error(t('excel.errors.missingBrandSheet'));

  // 表头品牌列（第 3 列起）
  const brandCols: Array<{ col: number; label: string }> = [];
  for (let c = 3; c <= ws.columnCount; c++) {
    const label = String(ws.getCell(1, c).value ?? '').trim();
    if (label) brandCols.push({ col: c, label });
  }
  const result = brandCols.map((b) => ({ label: b.label, params: {} as Record<string, any> }));

  const fieldMap = new Map(BRAND_EXPORT_ROWS.filter((r) => !r.field.startsWith('_')).map((r) => [r.field, r.field]));
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const field = String(row.getCell(1).value ?? '').trim();
    if (!fieldMap.has(field)) return;
    brandCols.forEach((b, bi) => {
      const raw0 = row.getCell(b.col).value;
      const raw = raw0 && typeof raw0 === 'object' && 'result' in (raw0 as any) ? (raw0 as any).result : raw0;
      if (raw == null || raw === '') return;
      if (field === 'sohCurve') {
        const arr = String(raw).split(',').map((s) => Number(s.trim())).filter((n) => !Number.isNaN(n));
        if (arr.length > 0) result[bi].params[field] = arr;
      } else if (raw === 'true' || raw === 'false') {
        result[bi].params[field] = raw === 'true';
      } else if (!isNaN(Number(raw))) {
        result[bi].params[field] = Number(raw);
      }
    });
  });
  return result;
}

/** 下载品牌参数 Excel */
export async function downloadBrandExcel(
  brands: Array<{ id: string; label: string; params: any }>,
): Promise<void> {
  const workbook = await buildBrandWorkbook(brands);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bess-brand-params.xlsx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 解析上传的 Excel 文件（按 A 列 key 解析 → 语言无关） */
export async function parseExcelUpload(file: File): Promise<ExcelUploadResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return parseWorkbook(workbook);
}

/** 从工作簿解析参数 + 曲线（抽离以便无头测试） */
export function parseWorkbook(workbook: ExcelJS.Workbook): ExcelUploadResult {
  const t = i18n.t.bind(i18n);

  // ── 参数表 ──
  const paramSheet = workbook.worksheets.find(
    (ws) => String(ws.getCell('A1').value ?? '').trim() === 'key'
  );
  if (!paramSheet) {
    throw new Error(t('excel.errors.missingParamsSheet'));
  }

  const params: any = {};
  const knownKeys = new Set(PARAM_ROWS.map((r) => r.key));

  paramSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // 跳过表头
    const key = String(row.getCell(1).value ?? '').trim();
    const value = row.getCell(3).value;
    if (!key || !knownKeys.has(key)) return;

    // exceljs 可能返回 { formula, result } 或富文本对象
    const raw = value && typeof value === 'object' && 'result' in (value as any)
      ? (value as any).result
      : value;
    if (raw == null) return;

    const parsed = deserializeCell(key, raw);
    if (parsed === undefined) return;
    setPathValue(params, key, parsed);
  });

  // ── 曲线表（可选）──
  const readCurve = (sheetKey: string): number[][] | null => {
    const ws = workbook.worksheets.find(
      (s) => String(s.getCell('A1').value ?? '').trim() === sheetKey
    );
    if (!ws) return null;
    const out: number[][] = [];
    for (let m = 0; m < 12; m++) out.push([]);
    for (let slot = 0; slot < 96; slot++) {
      for (let m = 0; m < 12; m++) {
        const raw = ws.getCell(2 + slot, 3 + m).value;
        const v = raw != null && raw !== '' ? Number(raw) : NaN;
        out[m].push(Number.isNaN(v) ? 0 : v);
      }
    }
    return out;
  };

  const loadCurve = readCurve('profile:load_kW');
  const pvCurve = readCurve('profile:pvPerUnit');
  const tempCurve = readCurve('profile:ambientTemp');

  let profile: ProfileData | undefined;
  if (loadCurve) {
    // 默认填充规则（决策点：上传曲线只需负荷列；其余自动生成）
    const peak = Number(getPathValue(params, 'grid.peakPrice_perkWh') ?? 1.734);
    const offpeak = Number(getPathValue(params, 'grid.offPeakPrice_perkWh') ?? 0.748);
    profile = [];
    for (let m = 0; m < 12; m++) {
      const month: ProfileInterval[] = [];
      for (let slot = 0; slot < 96; slot++) {
        const h = slot / 4;
        // 峰段 17:30–20:30 → slot 70–81
        const isPeak = h >= 17.5 && h < 20.5;
        month.push({
          load_kW: loadCurve[m][slot],
          pvPerUnit: pvCurve ? pvCurve[m][slot] : 0,
          gridAvailable: true,
          gridPrice: isPeak ? peak : offpeak,
          daysInMonth: DAYS_PER_MONTH[m],
        });
      }
      profile.push(month);
    }
  }

  const ambientTemp: AmbientTempData | undefined = tempCurve
    ? {
        unit: '°C',
        granularity: '15min × 96 points × 12 months',
        note: 'uploaded via Excel template',
        monthlyMean: [],
        diurnalAmplitude: 0,
        profile: tempCurve,
      }
    : undefined;

  return { params, profile, ambientTemp };
}
