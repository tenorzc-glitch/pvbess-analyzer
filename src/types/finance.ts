/** 单年现金流 */
export interface CashflowRow {
  year: number;
  soh: number;
  pvGeneration_kWh: number;
  gridSaving: number;
  dieselSaving: number;
  demandSaving: number;
  totalRevenue: number;
  opex: number;
  replacementCost: number;
  netCashflow: number;
  discountedCashflow: number;
  cumulativeDiscountedCF: number;
}

/** 方案财务结果 */
export interface FinanceResult {
  scenarioId: number;
  capex: number;
  annualRevenue: number;         // 首年收益
  npv: number;
  irr: number;
  paybackStatic: number;         // 静态回收期(年)
  paybackDynamic: number;        // 动态回收期(年)
  lcoe: number;
  benefitCostRatio: number;
  cashflow: CashflowRow[];
  baseline: {
    annualGridCost: number;
    annualDieselCost: number;
    annualDemandCharge: number;
    annualTotal: number;
  };
  /** 首年节省四分量分解（a+b = 电网费差，+c+d = 总节省，精确对账） */
  savingsBreakdown: {
    pvSelfUse: number;   // a) PV 自用替代市电
    arbitrage: number;   // b) 储能套利净值（放电价值 − 电网充电成本）
    demand: number;      // c) 需量费降低
    diesel: number;      // d) 柴油费降低
    total: number;       // a+b+c+d
  };
  /** 绿电溢价明细（仅 greenPremium.enabled 时存在） */
  greenPremium?: {
    annualGreenEnergy_kWh: number;
    annualPremium: number;
    totalPremium: number;
  };
  /** 断电损失明细（仅 outageLoss.enabled 时存在；E8 修复后以小时计） */
  outageLoss?: {
    totalUnserved_hours: number;
    annualLoss: number;
  };
}
