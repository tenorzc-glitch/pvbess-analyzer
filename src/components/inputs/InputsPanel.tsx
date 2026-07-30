import { useState } from 'react';
import {
  Card, Form, InputNumber, Select, Slider, Collapse, Row, Col,
  Typography, Divider, Space, Tag, Table, Button, Tooltip
} from 'antd';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useParamsStore, DEFAULT_PARAMS } from '../../store/useParamsStore';
import { useSimulationStore } from '../../store/useSimulationStore';
import { ScenarioConfig } from '../../types';

const { Title, Text } = Typography;
const { Panel } = Collapse;

export default function InputsPanel() {
  const { params, updateParams } = useParamsStore();
  const { scenarios, setScenarios } = useSimulationStore();

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
      s.id === id ? { ...s, [field]: value, name: `方案${id} (${field === 'bessCapacity_kWh' ? value : s.bessCapacity_kWh}kWh)` } : s
    );
    setScenarios(updated);
  };

  const scenarioColumns = [
    { title: '方案', dataIndex: 'id', key: 'id', render: (v: number) => `方案 ${v}` },
    {
      title: '储能容量 (kWh)', dataIndex: 'bessCapacity_kWh', key: 'bess',
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
      title: 'PCS 功率 (kW)', dataIndex: 'pcsPower_kW', key: 'pcs',
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
        <Title level={5}>容量方案配置 <Tag color="blue">5 方案对比</Tag></Title>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={8}>
            <Form.Item label="光伏容量 (kWp)" style={{ marginBottom: 0 }}>
              <InputNumber
                value={params.pv.capacity_kWp}
                onChange={(v) => handleParamChange(['pv', 'capacity_kWp'], v)}
                min={0} max={10000} step={50} style={{ width: '100%' }}
                addonAfter="kWp"
              />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="PCS 倍率" style={{ marginBottom: 0 }}>
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
        <Panel header="电网参数" key="grid">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="合同需量" help="kW">
                <InputNumber value={params.grid.contractDemand_kW}
                  onChange={(v) => handleParamChange(['grid', 'contractDemand_kW'], v)}
                  min={0} step={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="需量费" help="货币/kW·月">
                <InputNumber value={params.grid.demandCharge_perKW}
                  onChange={(v) => handleParamChange(['grid', 'demandCharge_perKW'], v)}
                  min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="超需费率" help="货币/kW·月">
                <InputNumber value={params.grid.excessDemandRate}
                  onChange={(v) => handleParamChange(['grid', 'excessDemandRate'], v)}
                  min={0} step={5} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="电价类型">
                <Select value={params.grid.tariffType}
                  onChange={(v) => handleParamChange(['grid', 'tariffType'], v)}
                  options={[
                    { value: 'flat', label: '统一电价' },
                    { value: 'tou', label: '峰谷电价' },
                  ]}
                  style={{ width: '100%' }}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="非峰/统一电价" help="货币/kWh">
                <InputNumber value={params.grid.offPeakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'offPeakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="峰时电价" help="货币/kWh">
                <InputNumber value={params.grid.peakPrice_perkWh}
                  onChange={(v) => handleParamChange(['grid', 'peakPrice_perkWh'], v)}
                  min={0} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 储能参数 */}
        <Panel header="储能参数" key="bess">
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item label="充电效率">
                <Slider min={0.8} max={1} step={0.01} value={params.bess.efficiencyCharge}
                  onChange={(v) => handleParamChange(['bess', 'efficiencyCharge'], v)} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="放电效率">
                <Slider min={0.8} max={1} step={0.01} value={params.bess.efficiencyDischarge}
                  onChange={(v) => handleParamChange(['bess', 'efficiencyDischarge'], v)} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="SOC 上限">
                <InputNumber value={params.bess.socMax * 100}
                  onChange={(v) => handleParamChange(['bess', 'socMax'], (v || 95) / 100)}
                  min={50} max={100} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="SOC 下限">
                <InputNumber value={params.bess.socMin * 100}
                  onChange={(v) => handleParamChange(['bess', 'socMin'], (v || 5) / 100)}
                  min={0} max={30} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="初始 SOC">
                <InputNumber value={params.bess.socInitial * 100}
                  onChange={(v) => handleParamChange(['bess', 'socInitial'], (v || 60) / 100)}
                  min={0} max={100} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="柴油触发 SOC">
                <InputNumber value={params.bess.socDieselTrigger * 100}
                  onChange={(v) => handleParamChange(['bess', 'socDieselTrigger'], (v || 20) / 100)}
                  min={0} max={50} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 柴油参数 */}
        <Panel header="柴油发电机" key="diesel">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="额定功率 (kW)">
                <InputNumber value={params.diesel.ratedPower_kW}
                  onChange={(v) => handleParamChange(['diesel', 'ratedPower_kW'], v)}
                  min={0} step={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="最低稳定功率 (kW)">
                <InputNumber value={params.diesel.minStablePower_kW}
                  onChange={(v) => handleParamChange(['diesel', 'minStablePower_kW'], v)}
                  min={0} step={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="发电效率 (kWh/L)">
                <InputNumber value={params.diesel.efficiency_kWhPerL}
                  onChange={(v) => handleParamChange(['diesel', 'efficiency_kWhPerL'], v)}
                  min={1} max={5} step={0.05} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="柴油价格">
                <InputNumber value={params.diesel.fuelPrice_perL}
                  onChange={(v) => handleParamChange(['diesel', 'fuelPrice_perL'], v)}
                  min={0} step={0.5} style={{ width: '100%' }}
                  addonAfter="货币/L" />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* CAPEX */}
        <Panel header="CAPEX 投资成本" key="capex">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="光伏单价">
                <InputNumber value={params.capex.pvCost_perkW}
                  onChange={(v) => handleParamChange(['capex', 'pvCost_perkW'], v)}
                  min={0} step={100} style={{ width: '100%' }} addonAfter="货币/kWp" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="电池单价">
                <InputNumber value={params.capex.bessCost_perkWh}
                  onChange={(v) => handleParamChange(['capex', 'bessCost_perkWh'], v)}
                  min={0} step={50} style={{ width: '100%' }} addonAfter="货币/kWh" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="PCS 单价">
                <InputNumber value={params.capex.pcsCost_perkW}
                  onChange={(v) => handleParamChange(['capex', 'pcsCost_perkW'], v)}
                  min={0} step={50} style={{ width: '100%' }} addonAfter="货币/kW" />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="安装比例">
                <InputNumber value={params.capex.installationPct * 100}
                  onChange={(v) => handleParamChange(['capex', 'installationPct'], (v || 10) / 100)}
                  min={0} max={50} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="光伏固定成本">
                <InputNumber value={params.capex.pvFixedCost}
                  onChange={(v) => handleParamChange(['capex', 'pvFixedCost'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="储能固定成本">
                <InputNumber value={params.capex.bessFixedCost}
                  onChange={(v) => handleParamChange(['capex', 'bessFixedCost'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="偏远运输附加">
                <InputNumber value={params.capex.remoteTransport}
                  onChange={(v) => handleParamChange(['capex', 'remoteTransport'], v)}
                  min={0} step={10000} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>

        {/* 财务假设 */}
        <Panel header="财务假设" key="financial">
          <Row gutter={16}>
            <Col span={6}>
              <Form.Item label="项目寿命 (年)">
                <InputNumber value={params.financial.projectLife}
                  onChange={(v) => handleParamChange(['financial', 'projectLife'], v)}
                  min={1} max={30} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="折现率">
                <InputNumber value={params.financial.discountRate * 100}
                  onChange={(v) => handleParamChange(['financial', 'discountRate'], (v || 10) / 100)}
                  min={0} max={30} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="价格年增长">
                <InputNumber value={params.financial.priceGrowth * 100}
                  onChange={(v) => handleParamChange(['financial', 'priceGrowth'], (v || 4) / 100)}
                  min={0} max={20} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={6}>
              <Form.Item label="OPEX 年增长">
                <InputNumber value={params.financial.opexGrowth * 100}
                  onChange={(v) => handleParamChange(['financial', 'opexGrowth'], (v || 3) / 100)}
                  min={0} max={20} formatter={(v) => `${v}%`} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Panel>
      </Collapse>
    </div>
  );
}
