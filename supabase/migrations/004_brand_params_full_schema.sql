-- 004: brand_params 参数升级为新口径全字段（模块B扩展8字段）
-- 背景：loadBrandParams 修复读 name 列 + params JSONB 后，库里的旧口径数据
-- （仅 efficiencyCharge/efficiencyDischarge 等 6 字段）会被真正消费，
-- 缺失字段全部 fallback——会导致 rte 被 effC×effD=0.9216 覆盖、与 FALLBACK 0.85/0.91 不一致。
-- 本迁移把两行参数完整更新为新口径，与 FALLBACK_BRANDS 对齐。

UPDATE brand_params SET params = '{
  "rte": 0.85,
  "sohCurve": [1, 0.965, 0.935, 0.905, 0.875, 0.845, 0.815, 0.785, 0.755, 0.72, 0.708, 0.696, 0.684, 0.67, 0.65],
  "costPerKWh": 2000,
  "opexRate": 0.015,
  "dod": 0.9,
  "operatingDaysPerYear": 300,
  "socMinOffgrid": 0.15,
  "socMaxOffgrid": 0.95,
  "needsIsolationTransformer": true,
  "transformerEfficiencyLoss": 0.02,
  "needsManualBalancing": true,
  "needsCoolantReplacement": true,
  "coolantIntervalYears": 5,
  "coolantCostPerEvent": 20000,
  "autoCalibration": false,
  "calibrationVisitCost": 3000,
  "calibrationIntervalMonths": 6
}'::jsonb, updated_at = now()
WHERE name = 'industry_avg';

UPDATE brand_params SET params = '{
  "rte": 0.91,
  "sohCurve": [1, 0.975, 0.955, 0.935, 0.915, 0.895, 0.875, 0.855, 0.83, 0.8, 0.788, 0.776, 0.764, 0.745, 0.72],
  "costPerKWh": 2400,
  "opexRate": 0.012,
  "dod": 1.0,
  "operatingDaysPerYear": 315,
  "socMinOffgrid": 0.10,
  "socMaxOffgrid": 0.95,
  "needsIsolationTransformer": false,
  "transformerEfficiencyLoss": 0,
  "needsManualBalancing": false,
  "needsCoolantReplacement": true,
  "coolantIntervalYears": 5,
  "coolantCostPerEvent": 20000,
  "autoCalibration": true,
  "calibrationVisitCost": 3000,
  "calibrationIntervalMonths": 6
}'::jsonb, updated_at = now()
WHERE name = 'HW';
