import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card, Form, Input, InputNumber, Select, Slider, Collapse, Row, Col,
  Typography, Divider, Space, Tag, Table, Button, Tooltip, Switch, message
} from 'antd';
import { InfoCircleOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useParamsStore, DEFAULT_PARAMS } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { useProfileStore } from '../../store/useProfileStore';
import { ScenarioConfig } from '../../types';
import { downloadExcelTemplate, parseExcelUpload } from '../../utils/excel';

const { Title, Text } = Typography;
const { Panel } = Collapse;

/** 支持的货币选项（名称经 i18n 渲染，避免英文模式残留中文） */
const CURRENCY_OPTIONS = [
  { value: 'BRL', symbol: 'R$', locale: 'pt-BR' },
  { value: 'USD', symbol: '$', locale: 'en-US' },
  { value: 'EUR', symbol: '€', locale: 'de-DE' },
  { value: 'CNY', symbol: '¥', locale: 'zh-CN' },
  { value: 'MXN', symbol: 'MX$', locale: 'es-MX' },
  { value: 'COP', symbol: 'COP$', locale: 'es-CO' },
  { value: 'CLP', symbol: 'CLP$', locale: 'es-CL' },
  { value: 'PEN', symbol: 'S/', locale: 'es-PE' },
];

const DAYS_PER_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MONTH_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];

export default function InputsPanel() {
  const { t } = useTranslation();
  const { params, updateParams } = useParamsStore();
  const { scenarios, setScenarios } = useSimulationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const MONTHS = (t('results.months', { returnObjects: true }) as string[]) || MONTH_KEYS;

  // 停电模型：折合年停电小时 = Σ 每月停电工作日 × 单次时长
  const outageCfg = params.grid.outage;
  const outageAnnualHours =
    (outageCfg?.eventDaysPerMonth?.reduce((s, d) => s + (d || 0), 0) ?? 0) *
    (outageCfg?.eventMinutes ?? 0) / 60;

  const handleDownloadTemplate = () => {
    const { profile, ambientTemp } = useProfileStore.getState();
    downloadExcelTemplate(params, scenarios, profile, ambientTemp).catch((err) => {
      console.error(err);
      message.error(t('params.downloadTemplate') + ' failed');
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { params: parsedParams, profile, ambientTemp } = await parseExcelUpload(file);
      updateParams(parsedParams);
      // 上传的曲线数据（可选）：负荷曲线直接进 profile store，气温进 ambientTemp
      if (profile) useProfileStore.getState().setProfile(profile);
      if (ambientTemp) useProfileStore.getState().setAmbientTemp(ambientTemp);
      message.success(t('params.uploadExcel') + ' OK');
    } catch (err) {
      console.error(err);
      message.error((err as Error).message || 'Parse failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleParamChange = (path: string[], value: any) => {
    const newParams = JSON.parse(JSON.stringify(params));
    let obj = newParams;
    for (let i = 0; i < path.length - 1; i++) {
      obj = obj[path[i]];
    }
    obj[path[path.length - 1]] = value;
    updateParams(newParams);
    // 联动：顶部 PV 容量变更时同步全部方案档（引擎按 scenario.pvCapacity_kWp 仿真，
    // 不同步会导致"改了 3000 但峰值仍 300kW"的口径错位）
    if (path.length === 2 && path[0] === 'pv' && path[1] === 'capacity_kWp' && typeof value === 'number') {
      setScenarios(scenarios.map(s => ({ ...s, pvCapacity_kWp: value })));
    }
  };

  const updateScenario = (id: number, field: keyof ScenarioConfig, value: number) => {
    const updated = scenarios.map(s =>
      s.id === id ? { ...s, [field]: value, name: `${t('params.scheme')} ${id} (${field === 'bessCapacity_kWh' ? value : s.bessCapacity_kWh}kWh)` } : s
    );
    setScenarios(updated);
  };

  // 实际生效工作天数 = 365 - Σ月检修 - Σ雨季停运
  const computedWorkDays = (() => {
    const wd = params.workDays;
    const maintenance = (wd.maintenanceDaysPerMonth || []).reduce((s, v) => s + (v || 0), 0);
    const rainy = (wd.rainyOutageDays || []).reduce((s, v) => s + (v || 0), 0);
    return 365 - maintenance - rainy;
  })();

  const scenarioColumns = [
    { title: t('params.scheme'), dataIndex: 'id', key: 'id', render: (v: number) => `${t('params.scheme')} ${v}` },
    {
      title: `${t('params.bessCapacity')} (kWh)`, dataIndex: 'bessCapacity_kWh', key: 'bess',
      render: (v: number, record: ScenarioConfig) => (
        <InputNumber
          size="small" min={0} max={10000} step={100}
          value={v}
          onChange={(val) => updateScenario(record.id, 'bessCapacity_kWh', val || 0)}
          style={{ width: 120 }}
        />
      )
    },
    {
      title: `${t('params.pcsPower')} (kW)`, dataIndex: 'pcsPower_kW', key: 'pcs',
      render: (v: number, record: ScenarioConfig) => (
        <InputNumber
          size="small" min={0} max={5000} step={50}
          value={v}
          onChange={(val) => updateScenario(record.id, 'pcsPower_kW', val || 0)}
          style={{ width: 120 }}
        />
      )
    },
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      {/* 方案配置 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row justify="space-between" align="middle" style={{ marginBottom: 8 }}>
          <Col>
            <Title level={5} style={{ marginBottom: 0 }}>{t('params.scenario')} <Tag color="blue">{t('params.scenarioCompare')}</Tag></Title>
          </Col>
          <Col>
            <Space>
              <Button
                size="small"
                icon={<DownloadOutlined />}
                onClick={handleDownloadTemplate}
              >
                {t('params.downloadTemplate')}
              </Button>
              <Button
                size="small"
                icon={<UploadOutlined />}
                loading={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {t('params.uploadExcel')}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                style={{ display: 'none' }}
                onChange={handleFileChange}
              />
            </Space>
          </Col>
        </Row>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Form.Item label={`${t('params.pvCapacity')} (kWp)`} style={{ marginBottom: 0 }}>
              <InputNumber
                value={params.pv.capacity_kWp}
                onChange={(v) => handleParamChange(['pv', 'capacity_kWp'], v)}
                min={0} max={10000} step={50} style={{ width: '100%' }}
                addonAfter="kWp"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label={t('params.pcsRate')} style={{ marginBottom: 0 }}>
              <InputNumber
                value={params.bess.cRate}
                onChange={(v) => handleParamChange(['bess', 'cRate'], v)}
                min={0.1} max={2} step={0.1} style={{ width: '100%' }}
                addonAfter="C"
              />
            </Form.Item>
          </Col>
        </Row>
        <Table
          dataSource={scenarios}
          columns={scenarioColumns}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>

      {/* 参数折叠面板 */}
      <Collapse defaultActiveKey={['grid', 'bess']} size="small">
        {/* 电网参数 */}
        <Panel header={t('params.grid')} key="grid">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.contractDemand')} help="kW">
                <InputNumber value={params.grid.contractDemand_kW}
                  onChange={(v) => handleParamChange(['grid', 'contractDemand_kW'], v)}
                  min={0} step={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.demandCharge')} help={`${params.currency.symbol}/kW·${t('common.perMonth')}`}>
                <InputNumber value={params.grid.demandCharge_perKW}
                  onChange={(v) => handleParamChange(['grid', 'demandCharge_perKW'], v)}
                  min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.excessRate')} help={`${params.currency.symbol}/kW·${t('common.perMonth')}`}>
                <InputNumber value={params.grid.excessDemandRate}
                  onChange={(v) => handleParamChange(['grid', 'excessDemandRate'], v)}
                  min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.tariffType')}>
                <Select value={params.grid.tariffType}
                  onChange={(v) => handleParamChange(['grid', 'tariffType'], v)}
                  options={[
                    { value: 'flat', label: t('params.flat') },
                    { value: 'tou', label: t('params.tou') },
                  ]}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.offPeakPrice')} help={`${params.currency.symbol}/kWh`}>
                <InputNumber value={params.grid.offPeakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'offPeakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.peakPrice')} help={`${params.currency.symbol}/kWh`}>
                <InputNumber value={params.grid.peakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'peakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 电网停电模型（引擎级注入：停电工作日窗口内电网不可用，储能+油机备电） */}
        <Panel header={t('params.outagePanel.title')} key="gridOutage">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.outagePanel.eventDaysPerMonth')}>
                <InputNumber value={outageCfg?.eventDaysPerMonth?.[0] ?? 0}
                  onChange={(v) => handleParamChange(['grid', 'outage', 'eventDaysPerMonth'], Array(12).fill(v ?? 0))}
                  min={0} max={31} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.outagePanel.eventMinutes')}>
                <InputNumber value={outageCfg?.eventMinutes ?? 30}
                  onChange={(v) => handleParamChange(['grid', 'outage', 'eventMinutes'], v ?? 30)}
                  min={5} max={60} step={5} style={{ width: '100%' }} addonAfter="min" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.outagePanel.windowStart')}>
                <Input value={outageCfg?.windowStart ?? '17:30'}
                  onChange={(e) => handleParamChange(['grid', 'outage', 'windowStart'], e.target.value)}
                  placeholder="HH:MM" style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.outagePanel.annualHoursHint')}>
                <Text strong>{outageAnnualHours.toFixed(1)} h</Text>
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 储能参数 */}
        <Panel header={t('params.bess')} key="bess">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.chargeEfficiency')}>
                <Slider min={0.8} max={1} step={0.01} value={params.bess.efficiencyCharge}
                  onChange={(v) => handleParamChange(['bess', 'efficiencyCharge'], v)} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.dischargeEfficiency')}>
                <Slider min={0.8} max={1} step={0.01} value={params.bess.efficiencyDischarge}
                  onChange={(v) => handleParamChange(['bess', 'efficiencyDischarge'], v)} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.socMax')}>
                <InputNumber value={params.bess.socMax * 100}
                  onChange={(v) => handleParamChange(['bess', 'socMax'], (v || 95) / 100)}
                  min={50} max={100} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.socMin')}>
                <InputNumber value={params.bess.socMin * 100}
                  onChange={(v) => handleParamChange(['bess', 'socMin'], (v || 5) / 100)}
                  min={0} max={30} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.socInitial')}>
                <InputNumber value={params.bess.socInitial * 100}
                  onChange={(v) => handleParamChange(['bess', 'socInitial'], (v || 60) / 100)}
                  min={0} max={100} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.dieselTrigger')}>
                <InputNumber value={params.bess.socDieselTrigger * 100}
                  onChange={(v) => handleParamChange(['bess', 'socDieselTrigger'], (v || 20) / 100)}
                  min={0} max={50} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 柴油参数 */}
        <Panel header={t('params.diesel')} key="diesel">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={`${t('params.ratedPower')} (kW)`}>
                <InputNumber value={params.diesel.ratedPower_kW}
                  onChange={(v) => handleParamChange(['diesel', 'ratedPower_kW'], v)}
                  min={0} step={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={`${t('params.minStablePower')} (kW)`}>
                <InputNumber value={params.diesel.minStablePower_kW}
                  onChange={(v) => handleParamChange(['diesel', 'minStablePower_kW'], v)}
                  min={0} step={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={`${t('params.efficiency')} (kWh/L)`}>
                <InputNumber value={params.diesel.efficiency_kWhPerL}
                  onChange={(v) => handleParamChange(['diesel', 'efficiency_kWhPerL'], v)}
                  min={1} max={5} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.dieselPrice')}>
                <InputNumber value={params.diesel.fuelPrice_perL}
                  onChange={(v) => handleParamChange(['diesel', 'fuelPrice_perL'], v)}
                  min={0} step={0.5} style={{ width: '100%' }}
                  addonAfter={`${params.currency.symbol}/L`} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.dieselMaintenance')}>
                <InputNumber value={params.opex.dieselMaintenancePerkWh ?? 0}
                  onChange={(v) => handleParamChange(['opex', 'dieselMaintenancePerkWh'], v)}
                  min={0} step={0.01} style={{ width: '100%' }}
                  addonAfter={`${params.currency.symbol}/kWh`} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* CAPEX（两项全包口径） */}
        <Panel
          header={
            <Space>
              {t('params.capex')}
              <Tooltip title={t('params.capexFullPackageTip')}>
                <InfoCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
          key="capex"
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.pvUnitCost')}>
                <InputNumber value={params.capex.pvCost_perkW}
                  onChange={(v) => handleParamChange(['capex', 'pvCost_perkW'], v)}
                  min={0} step={100} style={{ width: '100%' }} addonAfter={`${params.currency.symbol}/kWp`} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.bessUnitCost')}>
                <InputNumber value={params.capex.bessCost_perkWh}
                  onChange={(v) => handleParamChange(['capex', 'bessCost_perkWh'], v)}
                  min={0} step={50} style={{ width: '100%' }} addonAfter={`${params.currency.symbol}/kWh`} />
              </Form.Item>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('params.capexFullPackageTip')}</Text>
        </Panel>

        {/* 财务假设 */}
        <Panel header={t('params.financial')} key="financial">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.projectLife')}>
                <InputNumber value={params.financial.projectLife}
                  onChange={(v) => handleParamChange(['financial', 'projectLife'], v)}
                  min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.discountRate')}>
                <InputNumber value={params.financial.discountRate * 100}
                  onChange={(v) => handleParamChange(['financial', 'discountRate'], (v || 10) / 100)}
                  min={0} max={30} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.priceGrowth')}>
                <InputNumber value={params.financial.priceGrowth * 100}
                  onChange={(v) => handleParamChange(['financial', 'priceGrowth'], (v || 4) / 100)}
                  min={0} max={20} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexGrowth')}>
                <InputNumber value={params.financial.opexGrowth * 100}
                  onChange={(v) => handleParamChange(['financial', 'opexGrowth'], (v || 3) / 100)}
                  min={0} max={20} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.taxRate')}>
                <InputNumber value={(params.financial.taxRate ?? 0) * 100}
                  onChange={(v) => handleParamChange(['financial', 'taxRate'], (v || 0) / 100)}
                  min={0} max={50} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={18}>
              <Form.Item label=" ">
                <Text type="secondary" style={{ fontSize: 12 }}>{t('params.taxRateNote')}</Text>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.currency')}>
                <Select
                  value={params.currency.code}
                  onChange={(code) => {
                    const opt = CURRENCY_OPTIONS.find(o => o.value === code);
                    if (opt) handleParamChange(['currency'], { code: opt.value, symbol: opt.symbol, locale: opt.locale });
                  }}
                  options={CURRENCY_OPTIONS.map(o => ({
                    value: o.value,
                    label: `${o.value} ${o.symbol} — ${t(`params.currencies.${o.value}`)}`,
                  }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* OPEX：固定费率 + 人工上站均衡（两段制）+ 冷却液更换 */}
        <Panel header={t('params.opexPanel.title')} key="opex">
          <Divider titlePlacement="start" plain>{t('params.opexPanel.ratesGroup')}</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.pvRate')}>
                <InputNumber value={params.opex.pvFixedOpexRate * 100}
                  onChange={(v) => handleParamChange(['opex', 'pvFixedOpexRate'], (v || 0) / 100)}
                  min={0} max={10} step={0.1} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.bessRate')}>
                <InputNumber value={params.opex.bessFixedOpexRate * 100}
                  onChange={(v) => handleParamChange(['opex', 'bessFixedOpexRate'], (v || 0) / 100)}
                  min={0} max={10} step={0.1} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Divider titlePlacement="start" plain>{t('params.opexPanel.balancingGroup')}</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.visitsY1to3')}>
                <InputNumber value={params.opex.balancingVisitsY1to3}
                  onChange={(v) => handleParamChange(['opex', 'balancingVisitsY1to3'], v ?? 2)}
                  min={0} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.visitsY4plus')}>
                <InputNumber value={params.opex.balancingVisitsY4plus}
                  onChange={(v) => handleParamChange(['opex', 'balancingVisitsY4plus'], v ?? 4)}
                  min={0} max={12} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.crew')}>
                <InputNumber value={params.opex.balancingCrew}
                  onChange={(v) => handleParamChange(['opex', 'balancingCrew'], v ?? 2)}
                  min={1} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.hoursPerCabinet')}>
                <InputNumber value={params.opex.balancingHoursPerCabinet}
                  onChange={(v) => handleParamChange(['opex', 'balancingHoursPerCabinet'], v ?? 6)}
                  min={1} max={24} style={{ width: '100%' }} addonAfter="h" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.cabinetEnergyKwh')}>
                <InputNumber value={params.opex.cabinetEnergyKwh}
                  onChange={(v) => handleParamChange(['opex', 'cabinetEnergyKwh'], v ?? 261)}
                  min={50} max={500} style={{ width: '100%' }} addonAfter="kWh" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.laborRate')}>
                <InputNumber value={params.opex.laborRate}
                  onChange={(v) => handleParamChange(['opex', 'laborRate'], v ?? 150)}
                  min={0} step={10} style={{ width: '100%' }} addonAfter={`${params.currency.symbol}/h`} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.travelCost')}>
                <InputNumber value={params.opex.travelCost}
                  onChange={(v) => handleParamChange(['opex', 'travelCost'], v ?? 3000)}
                  min={0} step={500} style={{ width: '100%' }} addonAfter={params.currency.symbol} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.equipmentCost')}>
                <InputNumber value={params.opex.equipmentCost}
                  onChange={(v) => handleParamChange(['opex', 'equipmentCost'], v ?? 1000)}
                  min={0} step={100} style={{ width: '100%' }} addonAfter={params.currency.symbol} />
              </Form.Item>
            </Col>
          </Row>
          <Divider titlePlacement="start" plain>{t('params.opexPanel.coolantGroup')}</Divider>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.coolantInterval')}>
                <InputNumber value={params.opex.coolantInterval}
                  onChange={(v) => handleParamChange(['opex', 'coolantInterval'], v ?? 5)}
                  min={1} max={15} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.opexPanel.coolantCost')}>
                <InputNumber value={params.opex.coolantCost}
                  onChange={(v) => handleParamChange(['opex', 'coolantCost'], v ?? 20000)}
                  min={0} step={1000} style={{ width: '100%' }} addonAfter={params.currency.symbol} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 有效工作日与雨季 */}
        <Panel header={t('params.workDaysPanel.title')} key="workdays">
          <Row gutter={16} style={{ marginBottom: 8 }}>
            <Col span={8}>
              <Form.Item label={t('params.workDaysPanel.effectiveDays')}>
                <InputNumber value={params.workDays.effectiveDaysPerYear}
                  onChange={(v) => handleParamChange(['workDays', 'effectiveDaysPerYear'], v)}
                  min={0} max={365} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.workDaysPanel.computed')}>
                <Tag color={computedWorkDays === params.workDays.effectiveDaysPerYear ? 'green' : 'orange'} style={{ fontSize: 14, padding: '2px 12px' }}>
                  {computedWorkDays} / 365
                </Tag>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.workDaysPanel.stoppageLoadFactor')} help={t('params.workDaysPanel.stoppageLoadFactorHelp')}>
                <InputNumber value={params.workDays.stoppageLoadFactor ?? 0.1}
                  onChange={(v) => handleParamChange(['workDays', 'stoppageLoadFactor'], v ?? 0.1)}
                  min={0} max={1} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label={t('params.workDaysPanel.rainyMonths')}>
                <Select
                  mode="multiple"
                  value={params.workDays.rainyMonths}
                  onChange={(months: number[]) => {
                    const sorted = [...months].sort((a, b) => a - b);
                    const newParams = JSON.parse(JSON.stringify(params));
                    // 保留已有月份的停运天数，新月份默认 5 天
                    newParams.workDays.rainyOutageDays = sorted.map(m => {
                      const oldIdx = params.workDays.rainyMonths.indexOf(m);
                      return oldIdx >= 0 ? params.workDays.rainyOutageDays[oldIdx] : 5;
                    });
                    newParams.workDays.rainyMonths = sorted;
                    updateParams(newParams);
                  }}
                  options={MONTH_KEYS.map((_, i) => ({ value: i + 1, label: MONTHS[i] }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label={t('params.workDaysPanel.rainyOutage')}>
                <Space wrap>
                  {params.workDays.rainyMonths.map((m, idx) => (
                    <InputNumber
                      key={m}
                      size="small"
                      addonBefore={MONTHS[m - 1]}
                      value={params.workDays.rainyOutageDays[idx]}
                      onChange={(v) => {
                        const arr = [...params.workDays.rainyOutageDays];
                        arr[idx] = v || 0;
                        handleParamChange(['workDays', 'rainyOutageDays'], arr);
                      }}
                      min={0} max={DAYS_PER_MONTH[m - 1]} style={{ width: 110 }}
                    />
                  ))}
                </Space>
              </Form.Item>
            </Col>
          </Row>
          <Row>
            <Col span={24}>
              <Form.Item label={t('params.workDaysPanel.maintenance')}>
                <Space wrap>
                  {MONTH_KEYS.map((k, i) => (
                    <InputNumber
                      key={k}
                      size="small"
                      addonBefore={MONTHS[i]}
                      value={params.workDays.maintenanceDaysPerMonth[i]}
                      onChange={(v) => {
                        const arr = [...params.workDays.maintenanceDaysPerMonth];
                        arr[i] = v || 0;
                        handleParamChange(['workDays', 'maintenanceDaysPerMonth'], arr);
                      }}
                      min={0} max={DAYS_PER_MONTH[i]} style={{ width: 100 }}
                    />
                  ))}
                </Space>
              </Form.Item>
            </Col>
          </Row>
          <Text type="secondary" style={{ fontSize: 12 }}>{t('params.workDaysPanel.tip')}</Text>
        </Panel>

        {/* 断电损失 */}
        <Panel header={t('params.outageLoss.title')} key="outage">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.outageLoss.enabled')}>
                <Switch
                  checked={params.outageLoss.enabled}
                  onChange={(v) => handleParamChange(['outageLoss', 'enabled'], v)}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.outageLoss.dailyProductionValue')}>
                <InputNumber
                  value={params.outageLoss.dailyProductionValue}
                  onChange={(v) => handleParamChange(['outageLoss', 'dailyProductionValue'], v)}
                  min={0} step={500} style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.outageLoss.lossRate')}>
                <InputNumber
                  value={params.outageLoss.lossRate * 100}
                  onChange={(v) => handleParamChange(['outageLoss', 'lossRate'], (v || 0) / 100)}
                  min={0} max={100} formatter={(v) => `${v}%`} style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 绿电溢价 */}
        <Panel header={t('params.greenPremium.title')} key="green">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label={t('params.greenPremium.enabled')}>
                <Switch
                  checked={params.greenPremium.enabled}
                  onChange={(v) => handleParamChange(['greenPremium', 'enabled'], v)}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.greenPremium.premiumRate')}>
                <InputNumber
                  value={params.greenPremium.premiumRate}
                  onChange={(v) => handleParamChange(['greenPremium', 'premiumRate'], v)}
                  min={0} step={0.005} style={{ width: '100%' }}
                  addonAfter={`${params.currency.symbol}/kWh`}
                />
              </Form.Item>
            </Col>
          </Row>
        </Panel>
      </Collapse>
    </div>
  );
}
