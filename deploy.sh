#!/bin/bash
# PV-BESS Analyzer 一键部署脚本
set -e

echo "🚀 PV-BESS Analyzer 部署"

# Check deps
command -v node >/dev/null 2>&1 || { echo "❌ 需要 Node.js"; exit 1; }
command -v git >/dev/null 2>&1 || { echo "❌ 需要 Git"; exit 1; }

# Install & build
npm install --silent
npm run build

# Deploy to Vercel (if logged in)
if vercel whoami >/dev/null 2>&1; then
  vercel --prod --yes
  echo "✅ 部署成功！"
else
  echo "⚠️  需要先运行: vercel login"
  echo "然后: vercel --prod"
  echo ""
  echo "或者推送到 GitHub 后连接 Vercel:"
  echo "  gh repo create pvbess-analyzer --public --source=. --push"
  echo "  然后去 vercel.com 导入仓库"
fi
