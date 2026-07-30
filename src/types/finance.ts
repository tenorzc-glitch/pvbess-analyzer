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
}
