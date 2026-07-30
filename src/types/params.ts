/** 输入参数（完整） */
export interface InputParams {
  timeStep: number;               // h, 默认 0.25 (15分钟)
  
  pv: {
    capacity_kWp: number;         // DC 容量
    deratingFactor: number;       // 综合衰减系数 0.75-0.85
    annualDegradation: number;    // 年衰减率 0.5%
  };

  bess: {
    cRate: number;                // PCS 倍率
    efficiencyCharge: number;     // 充电效率
    efficiencyDischarge: number;  // 放电效率
    socMax: number;               // 最大 SOC
    socMin: number;               // 技术最低 SOC
    socGridForming: number;       // 构网最低 SOC
    socDieselTrigger: number;     // 柴油启动 SOC
    socDieselStop: number;        // 柴油停止 SOC
    socInitial: number;           // 初始 SOC
  };

  diesel: {
    ratedPower_kW: number;
    minStablePower_kW: number;
    efficiency_kWhPerL: number;
    fuelPrice_perL: number;
    fuelPriceGrowth: number;
  };

  grid: {
    contractDemand_kW: number;
    demandCharge_perKW: number;
    excessDemandTolerance: number;
    excessDemandRate: number;     // 超需费率（通常是需量费的 N 倍）
    tariffType: 'tou' | 'flat';
    peakPrice_perkWh: number;
    offPeakPrice_perkWh: number;
    flatPrice_perkWh: number;
    feedInPrice_perkWh: number;   // 上网电价（0 表示不上网）
    enablePeakArbitrage: boolean;
  };

  capex: {
    pvCost_perkW: number;
    pvFixedCost: number;
    bessCost_perkWh: number;
    pcsCost_perkW: number;
    bessFixedCost: number;
    installationPct: number;      // 储能安装比例
    remoteTransport: number;
  };

  opex: {
    pvFixedOpexRate: number;      // %CAPEX/年
    bessFixedOpexRate: number;
    balancingSchedule: number[];  // 各阶段均衡次数/年 [Y1-2, Y3-5, Y6-10, Y11+]
    balancingCrew: number;        // 上站人数
    balancingHours: number;       // 每人单次工时
    laborRate: number;            // 人工单价
    travelCost: number;           // 单次差旅
    equipmentCost: number;        // 单次均衡设备成本
    coolantInterval: number;      // 冷却液更换周期(年)
    coolantCost: number;          // 单次冷却液更换成本
  };

  financial: {
    projectLife: number;          // 项目寿命(年)，默认 10
    discountRate: number;         // 折现率
    priceGrowth: number;          // 电价/需量费年增长
    opexGrowth: number;           // OPEX 年增长
    taxRate: number;              // 税率
  };

  load: {
    pumpRatedPower_kW: number;
    pumpStartMultiplier: number;
  };

  /** 有效工作日配置 */
  workDays: {
    effectiveDaysPerYear: number;  // 年有效工作天数，默认 300
    rainyMonths: number[];         // 雨季月份 [1-12]，默认 [12, 1, 2, 3]
    rainyOutageDays: number[];     // 各雨季月份停运天数
    maintenanceDaysPerMonth: number[]; // 每月检修天数 [12]
  };

  /** 绿电溢价配置 */
  greenPremium: {
    enabled: boolean;              // 是否启用
    premiumRate: number;           // 溢价单位金额/kWh，默认 0.02
  };

  /** 断电损失配置 */
  outageLoss: {
    enabled: boolean;
    dailyProductionValue: number;  // 日均产值
    lossRate: number;              // 损失率 0-1
  };

  /** 货币配置 */
  currency: {
    code: string;                  // 'BRL' | 'MXN' | 'USD' | 'EUR' | 'CNY' | ...
    symbol: string;                // 'R$' | 'MX$' | '$' | '€' | '¥'
    locale: string;                // 'pt-BR' | 'es-MX' | 'en-US' | ...
  };

  sohCurve: number[];              // SOH 衰减曲线（长度应等于 projectLife）
  selectedScheme: number;          // Dashboard 显示方案序号
}
