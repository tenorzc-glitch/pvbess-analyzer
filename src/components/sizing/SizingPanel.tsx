import { useState } from 'react';
import { Card, Row, Col, InputNumber, Button, Table, Typography, Spin, Empty, Select } from 'antd';
import ReactECharts from 'echarts-for-react';
import { useParamsStore } from '../../store/useParamsStore';
import { useProfileStore } from '../../store/useProfileStore';
import { runSizingOptimization, SizingRecord, SizingResult } from '../../engine/sizing-engine';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export default function SizingPanel() {
  const { t } = useTranslation();
  const { params } = useParamsStore();
  const { profile } = useProfileStore();

  const [pvCapacity, setPvCapacity] = useState(params.pv.capacity_kWp);
  const [bessMin, setBessMin] = useState(0);
  const [bessMax, setBessMax] = useState(3000);
  const [step, setStep] = useState(200);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SizingResult | null>(null);

  const handleRun = () => {
    if (!profile) return;
    setRunning(true);

    // Use setTimeout to avoid blocking UI
    setTimeout(() => {
      try {
        const maxLoad = 300; // Could be computed from profile
        const r = runSizingOptimization(params, pvCapacity, [bessMin, bessMax], profile, maxLoad, step);
        setResult(r);
      } catch (err: any) {
        console.error('Sizing error:', err);
      }
      setRunning(false);
    }, 100);
  };

  const records = result?.records || [];

  // PBP vs Capacity chart
  const pbpOption = {
    title: { text: `${t('sizing.bestPBP')}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', name: '储能容量 (kWh)', data: records.map(r => r.bessCapacity_kWh) },
    yAxis: { type: 'value', name: '回收期 (年)' },
    series: [{
      type: 'line', data: records.map(r => r.finance.paybackStatic),
      markPoint: result?.bestPBP ? {
        data: [{ name: t('common.best'), coord: [records.indexOf(result.bestPBP), result.bestPBP.finance.paybackStatic], value: `${result.bestPBP.finance.paybackStatic.toFixed(2)}年` }],
      } : undefined,
    }],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  // NPV vs Capacity chart
  const npvOption = {
    title: { text: `${t('sizing.bestNPV')}`, left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', name: '储能容量 (kWh)', data: records.map(r => r.bessCapacity_kWh) },
    yAxis: { type: 'value', name: 'NPV' },
    series: [{
      type: 'bar', data: records.map(r => r.finance.npv),
      markPoint: result?.bestNPV ? {
        data: [{ name: t('common.best'), coord: [records.indexOf(result.bestNPV), result.bestNPV.finance.npv], value: `${(result.bestNPV.finance.npv / 1000).toFixed(0)}k` }],
      } : undefined,
    }],
    grid: { left: 60, right: 20, top: 40, bottom: 30 },
  };

  const columns = [
    { title: t('sizing.table.bess'), dataIndex: 'bessCapacity_kWh', key: 'bess', width: 100 },
    { title: t('sizing.table.pcs'), dataIndex: 'pcsPower_kW', key: 'pcs', width: 100 },
    {
      title: t('sizing.table.capex'), dataIndex: ['finance', 'capex'], key: 'capex',
      render: (v: number) => `${(v / 1000).toFixed(0)}k`,
    },
    {
      title: t('sizing.table.npv'), dataIndex: ['finance', 'npv'], key: 'npv',
      render: (v: number, _: SizingRecord, idx: number) => {
        const isBest = result?.bestNPV?.bessCapacity_kWh === _.bessCapacity_kWh;
        return <Text style={{ color: isBest ? '#52c41a' : undefined, fontWeight: isBest ? 'bold' : undefined }}>{(v / 1000).toFixed(0)}k</Text>;
      },
    },
    {
      title: t('sizing.table.payback'), dataIndex: ['finance', 'paybackStatic'], key: 'pbp',
      render: (v: number, _: SizingRecord) => {
        const isBest = result?.bestPBP?.bessCapacity_kWh === _.bessCapacity_kWh;
        return <Text style={{ color: isBest ? '#1677ff' : undefined, fontWeight: isBest ? 'bold' : undefined }}>{v.toFixed(2)}</Text>;
      },
    },
    {
      title: t('sizing.table.irr'), dataIndex: ['finance', 'irr'], key: 'irr',
      render: (v: number) => `${(v * 100).toFixed(1)}%`,
    },
  ];

  return (
    <div style={{ maxWidth: 1000 }}>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Title level={5}>{t('sizing.title')}</Title>
        <Row gutter={16} style={{ marginBottom: 12 }}>
          <Col span={6}>
            <Text>{t('sizing.pvCapacity')}</Text>
            <InputNumber value={pvCapacity} onChange={v => setPvCapacity(v || 500)} min={0} max={10000} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>储能范围-起始 (kWh)</Text>
            <InputNumber value={bessMin} onChange={v => setBessMin(v || 0)} min={0} max={10000} style={{ width: '100%' }} />
          </Col>
          <Col span={6}>
            <Text>储能范围-终止 (kWh)</Text>
            <InputNumber value={bessMax} onChange={v => setBessMax(v || 3000)} min={0} max={10000} style={{ width: '100%' }} />
          </Col>
          <Col span={4}>
            <Text>{t('sizing.step')}</Text>
            <Select value={step} onChange={setStep} options={[
              { value: 100, label: '100 kWh' },
              { value: 200, label: '200 kWh' },
              { value: 500, label: '500 kWh' },
            ]} style={{ width: '100%' }} />
          </Col>
          <Col span={2} style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button type="primary" onClick={handleRun} loading={running}>
              {t('sizing.run')}
            </Button>
          </Col>
        </Row>
      </Card>

      {running && <Spin style={{ display: 'block', margin: '40px auto' }} tip={t('sizing.running')} />}

      {result && !running && (
        <>
          {/* Best Results */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card size="small" title={t('sizing.bestPBP')}>
                {result.bestPBP && (
                  <>
                    <Text strong>{result.bestPBP.bessCapacity_kWh} kWh / {result.bestPBP.pcsPower_kW} kW</Text>
                    <br />
                    <Text>回收期: {result.bestPBP.finance.paybackStatic.toFixed(2)} 年 | NPV: {(result.bestPBP.finance.npv / 1000).toFixed(0)}k</Text>
                  </>
                )}
              </Card>
            </Col>
            <Col span={12}>
              <Card size="small" title={t('sizing.bestNPV')}>
                {result.bestNPV && (
                  <>
                    <Text strong>{result.bestNPV.bessCapacity_kWh} kWh / {result.bestNPV.pcsPower_kW} kW</Text>
                    <br />
                    <Text>NPV: {(result.bestNPV.finance.npv / 1000).toFixed(0)}k | 回收期: {result.bestNPV.finance.paybackStatic.toFixed(2)} 年</Text>
                  </>
                )}
              </Card>
            </Col>
          </Row>

          {/* PCS=3×Load 特殊档 */}
          {result.specialPCS && (
            <Card size="small" style={{ marginBottom: 16, borderColor: '#722ed1' }}>
              <Text strong style={{ color: '#722ed1' }}>{t('sizing.specialPCS')}: </Text>
              <Text>{result.specialPCS.bessCapacity_kWh} kWh / {result.specialPCS.pcsPower_kW} kW — </Text>
              <Text>NPV: {(result.specialPCS.finance.npv / 1000).toFixed(0)}k | 回收期: {result.specialPCS.finance.paybackStatic.toFixed(2)} 年</Text>
            </Card>
          )}

          {/* Charts */}
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={12}>
              <Card size="small"><ReactECharts option={pbpOption} style={{ height: 280 }} /></Card>
            </Col>
            <Col span={12}>
              <Card size="small"><ReactECharts option={npvOption} style={{ height: 280 }} /></Card>
            </Col>
          </Row>

          {/* Table */}
          <Card size="small" title={t('sizing.detail')}>
            <Table
              dataSource={records.map((r, i) => ({ ...r, key: i }))}
              columns={columns}
              pagination={false}
              size="small"
            />
          </Card>
        </>
      )}

      {!result && !running && <Empty description={t('sizing.empty')} />}
    </div>
  );
}
