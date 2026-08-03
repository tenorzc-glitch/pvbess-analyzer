import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card, Form, InputNumber, Select, Slider, Collapse, Row, Col,
  Typography, Divider, Space, Tag, Table, Button, Tooltip, Switch, message
} from 'antd';
import { InfoCircleOutlined, UploadOutlined, DownloadOutlined } from '@ant-design/icons';
import { useParamsStore, DEFAULT_PARAMS } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ScenarioConfig } from '../../types';
import { downloadExcelTemplate, parseExcelUpload } from '../../utils/excel';

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function InputsPanel() {
  const { t } = useTranslation();
  const { params, updateParams } = useParamsStore();
  const { scenarios, setScenarios } = useSimulationStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleDownloadTemplate = () => {
    downloadExcelTemplate(params).catch((err) => {
      console.error(err);
      message.error(t('params.downloadTemplate') + ' failed');
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const parsed = await parseExcelUpload(file);
      updateParams(parsed);
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
  };

  const updateScenario = (id: number, field: keyof ScenarioConfig, value: number) => {
    const updated = scenarios.map(s =>
      s.id === id ? { ...s, [field]: value, name: `${t('params.scheme')} ${id} (${field === 'bessCapacity_kWh' ? value : s.bessCapacity_kWh}kWh)` } : s
    );
    setScenarios(updated);
  };

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
              <Form.Item label={t('params.demandCharge')} help="货币/kW·月">
                <InputNumber value={params.grid.demandCharge_perKW}
                  onChange={(v) => handleParamChange(['grid', 'demandCharge_perKW'], v)}
                  min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.excessRate')} help="货币/kW·月">
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
              <Form.Item label={t('params.offPeakPrice')} help="货币/kWh">
                <InputNumber value={params.grid.offPeakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'offPeakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label={t('params.peakPrice')} help="货币/kWh">
                <InputNumber value={params.grid.peakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'peakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
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
                  addonAfter="货币/L" />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* CAPEX */}
        <Panel header={t('params.capex')} key="capex">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.pvUnitCost')}>
                <InputNumber value={params.capex.pvCost_perkW}
                  onChange={(v) => handleParamChange(['capex', 'pvCost_perkW'], v)}
                  min={0} step={100} style={{ width: '100%' }} addonAfter="货币/kWp" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.bessUnitCost')}>
                <InputNumber value={params.capex.bessCost_perkWh}
                  onChange={(v) => handleParamChange(['capex', 'bessCost_perkWh'], v)}
                  min={0} step={50} style={{ width: '100%' }} addonAfter="货币/kWh" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.pcsUnitCost')}>
                <InputNumber value={params.capex.pcsCost_perkW}
                  onChange={(v) => handleParamChange(['capex', 'pcsCost_perkW'], v)}
                  min={0} step={50} style={{ width: '100%' }} addonAfter="货币/kW" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.installPct')}>
                <InputNumber value={params.capex.installationPct * 100}
                  onChange={(v) => handleParamChange(['capex', 'installationPct'], (v || 10) / 100)}
                  min={0} max={50} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={t('params.pvFixedCost')}>
                <InputNumber value={params.capex.pvFixedCost}
                  onChange={(v) => handleParamChange(['capex', 'pvFixedCost'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.bessFixedCost')}>
                <InputNumber value={params.capex.bessFixedCost}
                  onChange={(v) => handleParamChange(['capex', 'bessFixedCost'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label={t('params.remoteTransport')}>
                <InputNumber value={params.capex.remoteTransport}
                  onChange={(v) => handleParamChange(['capex', 'remoteTransport'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 财务假设 */}
        <Panel header={t('params.financial')} key="financial">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label={`${t('params.projectLife')} (年)`}>
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
