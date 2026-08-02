# PV·BESS Analyzer

拉美（巴西、墨西哥等）光储投资定容与收益测算 Web 应用。

## 功能特性

- 15 分钟步长的调度仿真引擎（PV 优先 → 电池 → 电网 → 柴油机）
- 10 年生命周期现金流分析（NPV/IRR/回收期/LCOE）
- 自动定容寻优（200kWh 步长扫描，PCS=3×负载特殊档）
- 多用户认证 + 管理员权限（Supabase）
- 多国货币支持（BRL/MXN/USD/EUR/CNY）
- 行业平均 vs HW 品牌对比
- 中英文双语 + 深色/浅色双主题
- 300 天有效工作日 + 雨季排程

## 本地开发

```bash
npm install
npm run dev
```

## 环境变量配置

复制 `.env.example` 为 `.env.local`，填入：

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxx
```

## 数据库 Schema

将 `supabase/migrations/001_initial_schema.sql` 中的 SQL 在 Supabase 控制台 → SQL Editor 中执行。

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 中导入项目
3. 配置环境变量：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. 部署完成

## 项目结构

```
src/
├── components/         # React UI 组件
├── engine/            # 调度仿真 + 财务计算引擎
├── hooks/             # 自定义 hooks（含 auth, i18n, simulation）
├── i18n/              # 中英文翻译
├── store/             # Zustand 状态管理
├── lib/               # Supabase 客户端
└── types/             # TypeScript 类型定义
```

## 离线模式

如果未配置 Supabase（环境变量为空），应用自动切换到离线模式：
- 任意邮箱 + 密码登录
- 管理员密码：934676
- 数据存储在 localStorage
- 所有计算功能完整可用