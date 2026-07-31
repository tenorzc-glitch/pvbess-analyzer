# 腾讯云开发 CloudBase 开通与配置手册

> 用途：为 PV·BESS Analyzer 提供多用户登录、项目云端保存能力
> 预计耗时：30-60 分钟（含实名认证等待时间）

---

## 0. 前置条件

- 一个邮箱（建议 QQ 邮箱或企业邮箱，用于接收注册激活邮件 + 作为发件邮箱）
- 手机号（腾讯云注册需要）
- 身份证（实名认证需要）

---

## 1. 注册腾讯云账号 + 实名认证

1. 打开 https://cloud.tencent.com → 右上角「注册」
2. 完成注册后，进入「账号中心」→「实名认证」
3. 选择**个人实名认证**，按提示填写身份证信息（通常几分钟内通过）
4. ⚠️ **不实名无法创建 CloudBase 环境**，这是硬性前置

## 2. 开通 CloudBase 环境

1. 打开 https://console.cloud.tencent.com/tcb
2. 点击「新建环境」
3. 环境名称随意（如 `pvbess`），选择**按量付费**或**基础版**
   - 基础版有免费额度，个人测试够用
4. 创建成功后，在「环境概览」页面记录 **环境 ID（envId）**
   - 形如：`pvbess-1a2b3c4d5e`（⚠️ 稍后需要提供给我配置到 Vercel）

## 3. 开启邮箱登录

1. 控制台左侧「身份认证」→「登录方式」
2. 找到**邮箱登录**，点击「开启」
3. 配置发件人（重要，否则发不出激活邮件）：
   - 推荐用 **QQ 邮箱**：
     - 登录 QQ 邮箱 → 设置 → 账户 → 开启「IMAP/SMTP 服务」
     - 按提示发短信获取**授权码**（16位，如 `abcdefghijklmnop`）
   - 回到 CloudBase，选「QQ 邮箱」，填入：
     - 发件人地址：`你的QQ号@qq.com`
     - SMTP 账号：`你的QQ号@qq.com`
     - SMTP 密码：**授权码**（不是QQ密码！）
4. 应用配置：设置「应用名称」为 `PV-BESS Analyzer`，「自动跳转链接」填你的 Vercel 域名（可后补）

## 4. 配置 WEB 安全域名

1. 控制台「安全配置」→「WEB 安全域名」
2. 添加：
   - `http://localhost:5173`（本地开发）
   - `http://localhost:4173`（本地预览）
   - `https://pvbess-analyzer.vercel.app`（Vercel 正式域名，⚠️ 换成你实际的）
3. ⚠️ 以后换域名必须回来同步更新，否则网页端登录/读写全部失败

## 5. 创建数据库集合

1. 控制台「数据库」→「新建集合」
2. 创建 **两个**集合：`users` 和 `projects`（名称必须完全一致）
3. 权限默认「仅创建者可读写」即可，我们稍后用安全规则覆盖

## 6. 配置安全规则（核心！）

每个集合点「权限设置」→「自定义安全规则」，粘贴以下 JSON：

### users 集合

```json
{
  "read": "doc._id == auth.uid || get(`database.users.${auth.uid}`).role == 'admin'",
  "create": "doc._id == auth.uid && request.data.role == undefined",
  "update": "(doc._id == auth.uid && request.data.role == undefined) || get(`database.users.${auth.uid}`).role == 'admin'",
  "delete": false
}
```

### projects 集合

```json
{
  "read": "doc._openid == auth.uid || get(`database.users.${auth.uid}`).role == 'admin'",
  "write": "doc._openid == auth.uid || get(`database.users.${auth.uid}`).role == 'admin'"
}
```

> 效果：普通用户只能读写自己的项目；管理员（role='admin'）可读全部。
> ⚠️ 规则语法中 `get(...)` 需要目标集合存在，先建集合再配规则。

## 7. 部署 promoteAdmin 云函数

仓库中已提供代码：`cloudbase/functions/promoteAdmin/`

1. 控制台左侧「云函数」→「新建云函数」
2. 函数名称：`promoteAdmin`（必须与代码调用名一致）
3. 运行环境：**Node.js 18+**
4. 创建方式：选择「本地代码上传」，上传 `cloudbase/functions/promoteAdmin/` 目录
   - 或：在线编辑器，直接粘贴 `index.js` 内容，并安装依赖 `@cloudbase/node-sdk`
5. 创建后无需配置触发器（由前端调用）

> 该函数作用：用户在前端输入管理员激活码 `934676` 时，将当前登录用户提升为管理员。

## 8. 提供环境 ID 给我

配置完成后，把 **envId** 发给我（或自己填入 Vercel）：

- Vercel 项目 → Settings → Environment Variables
- 添加：`VITE_CLOUDBASE_ENV_ID` = `<你的envId>`
- Production 环境 → Redeploy

---

## 验证清单

| 检查项 | 方法 |
|--------|------|
| 注册流程 | 打开网页 → 注册 Tab → 填邮箱密码 → 收激活邮件 → 点击激活 |
| 登录 | 激活后邮箱+密码登录 |
| 数据隔离 | 用 A/B 两个邮箱注册，A 的项目 B 看不到 |
| 管理员 | 登录后任意位置输入激活码 934676 → 刷新 → 侧边栏出现「管理面板」 |
| 管理面板 | 能看到所有用户及其项目数 |
| 离线降级 | 断网/未配置 envId 时，应用仍可本地使用，顶部显示离线提示 |

## 常见问题

- **激活邮件收不到**：检查垃圾箱；确认 SMTP 配置正确（授权码不是QQ密码）
- **读写数据报错**：检查安全规则是否粘贴成功、WEB 安全域名是否包含当前访问域名
- **登录报 404/无权限**：云函数名必须是 `promoteAdmin`；确认已登录后调用
- **沙箱环境无法访问**：代码在沙箱内无法联调 CloudBase（网络受限），本地/线上验证即可
