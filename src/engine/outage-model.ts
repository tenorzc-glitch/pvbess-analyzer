/**
 * 断电损失估算模型
 */

export interface OutageEstimate {
  totalOutageHours: number;
  productionLoss: number;
  annualLossValue: number;
  monthlyBreakdown: { month: number; hours: number; loss: number }[];
}

export interface GreenPremiumEstimate {
  annualGreenEnergy_kWh: number;
  premiumRate: number;       // 单位溢价
  annualPremium: number;
  total10YearPremium: number;
}

/**
 * 估算断电导致的咖啡生产损失
 * @param unservedHoursPerMonth - 每月未供电小时数
 * @param dailyProductionValue - 日均产值
 * @param lossRate - 生产中断损失率 (默认 0.5)
 */
export function estimateOutageLoss(
  unservedHoursPerMonth: number[],
  dailyProductionValue: number,
  lossRate: number = 0.5
): OutageEstimate {
  const monthlyBreakdown = unservedHoursPerMonth.map((hours, i) => ({
    month: i + 1,
    hours,
    loss: hours / 24 * dailyProductionValue * lossRate,
  }));

  const totalOutageHours = monthlyBreakdown.reduce((s, m) => s + m.hours, 0);
  const annualLossValue = monthlyBreakdown.reduce((s, m) => s + m.loss, 0);

  return {
    totalOutageHours,
    productionLoss: totalOutageHours / 24 * dailyProductionValue * lossRate,
    annualLossValue,
    monthlyBreakdown,
  };
}

/**
 * 估算绿色用电品牌溢价
 * @param annualGreenEnergy_kWh - 年绿电消纳量
 * @param premiumRate - 绿电溢价率 (默认 0.02)
 * @param projectLife - 项目年限
 * @param discountRate - 折现率
 */
export function estimateGreenPremium(
  annualGreenEnergy_kWh: number,
  premiumRate: number = 0.02,
  projectLife: number = 10,
  discountRate: number = 0.10
): GreenPremiumEstimate {
  const annualPremium = annualGreenEnergy_kWh * premiumRate;

  let total10YearPremium = 0;
  for (let y = 1; y <= projectLife; y++) {
    total10YearPremium += annualPremium / Math.pow(1 + discountRate, y);
  }

  return {
    annualGreenEnergy_kWh,
    premiumRate,
    annualPremium,
    total10YearPremium: Math.round(total10YearPremium),
  };
}
