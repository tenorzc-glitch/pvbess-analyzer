/**
 * promoteAdmin 云函数
 * 功能：校验激活码后将当前登录用户提升为管理员
 * 部署：CloudBase 控制台 → 云函数 → 新建 → 选择此目录（Node.js 18+）
 */
const cloudbase = require('@cloudbase/node-sdk')

const app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV })
const db = app.database()

exports.main = async (event) => {
  const { uid } = app.auth().getUserInfo()
  if (!uid) {
    return { ok: false, message: '未登录' }
  }
  if (event.code !== '934676') {
    return { ok: false, message: '激活码错误' }
  }
  await db.collection('users').doc(uid).update({
    role: 'admin',
    updatedAt: new Date().toISOString(),
  })
  return { ok: true }
}
