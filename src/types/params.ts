/** 输入参数（完整） */
export interface InputParams {
  timeStep: number;               // h, 默认 0.25 (15分钟)

  pv: {
    capacity_kWp: number;         // DC 容量
    deratingFactor: number;       // 综合衰减系数 0.75-0.85
  };

  bess: {
    cRate: number;                // PCS 倍率
    efficiencyCharge: number;     // 充电效率（= sqrt(RTE)）
    efficiencyDischarge: number;  // 放电效率（= sqrt(RTE)）
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
    /** 自定义分时电价时段表（非空时覆盖 profile 内建电价；空 = 沿用 profile/峰谷两档） */
    tariffSegments?: Array<{ start: string; end: string; price: number }>;
    peakPrice_perkWh: number;
    offPeakPrice_perkWh: number;
    flatPrice_perkWh: number;
    feedInEnabled: boolean;       // 馈网上网开关（默认 false：富余 PV 弃光）
    feedInPrice_perkWh: number;   // 上网电价（开关开启时生效）
    enablePeakArbitrage: boolean;
    /** 电网停电模型（引擎级注入，不依赖 profile 的 gridAvailable） */
    outage: {
      eventDaysPerMonth: number[]; // [12] 每月发生停电的工作日数
      eventMinutes: number;        // 每次停电时长（分钟），<=60
      windowStart: string;         // 停电窗口起始时刻 'HH:MM'
    };
  };

  /** CAPEX 两项全包口径（均含线缆、安装、运输等附属费用） */
  capex: {
    pvCost_perkW: number;         // 光伏全包单价（货币/kWp）
    bessCost_perkWh: number;      // 储能全包单价（货币/kWh，含 PCS）
  };

  opex: {
    pvFixedOpexRate: number;      // 光伏运维费率 %光伏CAPEX/年
    bessFixedOpexRate: number;    // 储能运维费率 %储能CAPEX/年
    dieselMaintenancePerkWh: number; // 油机维护成本（货币/kWh 发电量）
    balancingVisitsY1to3: number;    // 前 3 年每年人工上站均衡次数
    balancingVisitsY4plus: number;   // 第 4 年起每年均衡次数
    balancingCrew: number;           // 每次上站人数
    balancingHoursPerCabinet: number;// 每柜每人耗时（小时）
    cabinetEnergyKwh: number;        // 单柜容量（kWh），柜数=ceil(BESS/该值)
    laborRate: number;            // 人工单价（货币/人·h）
    travelCost: number;           // 单次差旅
    equipmentCost: number;        // 单次均衡设备成本
    coolantInterval: number;      // 冷却液更换周期(年)
    coolantCost: number;          // 单次冷却液更换成本
  };

  financial: {
    projectLife: number;          // 项目寿命(年)，默认 15
    discountRate: number;         // 折现率，默认 12%
    priceGrowth: number;          // 电价/需量费年增长
    opexGrowth: number;           // OPEX 年增长
    taxRate: number;              // 税率（简化：对净现金流课税）
  };

  load: {
    pumpRatedPower_kW: number;
    pumpStartMultiplier: number;
  };

  /** 有效工作日配置 */
  workDays: {
    effectiveDaysPerYear: number;  // 年有效工作天数，默认 300（仅 UI 参考，引擎按月度数组推导）
    rainyMonths: number[];         // 雨季月份 [1-12]，默认 [12, 1, 2, 3]
    rainyOutageDays: number[];     // 各雨季月份停运天数
    maintenanceDaysPerMonth: number[]; // 每月检修天数 [12]
    stoppageLoadFactor: number;    // 停运日负荷系数：停运=光储停机，工厂按"月均负荷×该系数"平坦运行（电网/柴油供电），默认 0.1
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

  /** 静态汇率表：1 单位外币 = X BRL（BRL 为基准=1）。
   * 切换货币时所有单价字段按 rate[from]/rate[to] 换算；模板中可编辑后上传刷新 */
  exchangeRates: Record<string, number>;

  sohCurve: number[];              // SOH 衰减曲线（长度应等于 projectLife）
  selectedScheme: number;          // Dashboard 显示方案序号
}
