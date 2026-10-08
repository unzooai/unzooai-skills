---
name: verify-install
description: 逐条验证本机 Unzoo 宣称的每件事（环境隔离 / 真实指纹 / 真人输入 / 动作读回 / 错误不说谎），输出一份带版本号、能直接贴到论坛的结论。当用户说「验证一下 Unzoo」「它真的能过检测吗」「帮我测测装好没」「verify unzoo」「is this actually undetected」，或装完想自己确认一遍时使用。
when_to_use: 用户想自己确认 Unzoo 是否真的做到它宣称的事，或刚装完 / 刚升级想体检一遍。也用于用户怀疑某条宣传（比如「指纹真的和 Chrome 一样？」）时，拿证据回答他。不要用于排查具体某个网站的自动化失败（那是普通的调试，用 a11y 快照和日志）。
license: MIT
---

# 自己验一遍 Unzoo

不替厂商背书，**逐条验**。每一项都对应一句对外说法；跑完给用户一份能贴出去的结论。

**原则：只读 + 可逆。** 不发布任何内容、不提交表单、不碰用户已有的标签页。

## 0. 先说清楚在验哪一个版本

```
service_status()
```

记下 `version` 和 `provenance`（`git_commit_short` / `git_dirty` / `target`）。
**结论里必须带上这三个** —— 不写版本的「验证通过」没有意义，过一个版本没人知道当时验的是什么。
`git_dirty` 不是 `false`，说明这个包不是从某个确切提交编出来的。

## 1. 「每个 AI 一套独立环境」

```
profile_list()
tab_list()
```

- 你这个客户端对应的 profile 通常叫 `mcp-<工具名>`（`mcp-claude-code`、`mcp-cursor`…）。
- `tab_list()` 应当**只看到你自己 profile 里的标签页**，不含用户正在用的那些。
- `browser_evaluate(expression="document.cookie")` 在你的环境里是空的／只有你自己写过的。

**反向验证才是关键**：拿一个不属于你的 `tab_id` 去操作，必须被 `cross_profile_denied` 拒掉。
能操作 = 隔离是假的。

## 2. 「指纹与真实 Chrome 一致」

```
profile_get_fingerprint()
browser_evaluate(expression="navigator.webdriver")
browser_evaluate(expression="Notification.permission")
browser_evaluate(expression="navigator.userAgent")
```

- `navigator.webdriver` 必须是 `false` —— 它是 `true` 是自动化浏览器最经典的特征。
- `Notification.permission` 应当是 `default`，**不是 `denied`**（`denied` 是无头环境的典型签名）。
- UA 里的 Chrome 大版本号应当与同期真实 Chrome 一致。

要联网对照就再打开任意一个公开的指纹/TLS 检测站，`browser_screenshot()` 存证；
**同一台机器上用真实 Chrome 打开同一个站做对照，只有对不上的那几项才是问题**。

## 3. 「真人输入真的到了页面」

**先激活标签页**：`tab_activate(tab_id=...)`。真人输入到不了没有焦点的标签页
（判据是 `document.hasFocus()`）—— 跳过这步会得到一个**假的失败**。

造一个不依赖外站的干净输入框：

```
browser_evaluate(expression="(()=>{const i=document.createElement('input');i.id='unzooProbe';document.body.appendChild(i);i.focus();window.__t=[];i.addEventListener('input',e=>window.__t.push(e.isTrusted));return 'ok'})()")
human_type(selector="#unzooProbe", text="hello")
browser_evaluate(expression="[document.getElementById('unzooProbe').value, window.__t.every(Boolean)]")
```

- 第一项必须**等于** `hello`，不是「包含」。
- 第二项必须是 `true`：每个 input 事件都 `isTrusted`。

收尾：`browser_evaluate(expression="document.getElementById('unzooProbe').remove()")`

> 为什么强调「相等不是包含」：清空重填时如果多打了字符，用「包含」判定看不出来
> （`ZZ` 包含在 `aZZ` 里）。

## 4. 「『做成了』和『以为做成了』不一样」

故意制造失败：`human_type(selector="#不存在的东西", text="x")`。
它必须**报失败**，不能返回成功。「找不到元素却返回 ok」是这条说法最直接的反例。

## 5. 「错误不说谎」

故意漏参数：`browser_navigate()`（不给 `url`）。错误里应当有：

- 类别是**参数错**（`invalid_argument`），不是「内部错误」；
- 明确**标明不可重试** —— 参数错了重试一万次也不会成功；
- 一句可操作的提示，说清缺什么。

再试一个不存在的方法名，应当是「方法不存在」，不是「内部错误」。

这条看着小，但它决定了带重试的调用方会不会对着一个必然失败的请求刷一整天。

## 6. 不想让 AI 跑？两个给人看的入口

- **自测台**：浏览器打开 `http://127.0.0.1:9399/selftest`，每个接口和工具都能点一下看结果。
- **接口文档**：`http://127.0.0.1:9399/docs`（OpenAPI 全覆盖）。
- 还有一个**不需要 AI** 的命令行体检：`node bin/verify-unzoo.mjs`（本仓 `bin/` 下，零依赖）。

## 输出格式

```
Unzoo 验证结果
版本: <version> (<git_commit_short>, dirty=<…>, <target>)
平台: <os/arch>

1 环境隔离   通过/不通过   <证据：profile_id、tab 数、跨 profile 是否被拒>
2 真实指纹   通过/不通过   <证据：webdriver、Notification.permission、UA>
3 真人输入   通过/不通过   <证据：读回值、isTrusted>
4 动作读回   通过/不通过   <证据：失败是否真的报失败>
5 错误契约   通过/不通过   <证据：类别、是否可重试、提示>

没验到: <联网检测站／需要账号的项／本机装不了的平台>
```

**「没验到」必须单独写出来，不能混进「通过」里。** 把没测到的说成测过了比不测更糟 ——
它会让人放心。

## 坑

- 全部在**你自己的 profile** 里做，别为了「更真实」去操作用户正在用的标签页。
- 第 3 步忘了 `tab_activate` 会得到假失败。
- 浏览器上弹了系统对话框时，所有命令会卡到超时而不是报错 ——
  先 `browser_dismiss_blocking_dialog()` 再继续。
- 结论请连**版本号**一起贴；不带版本的结论过一个版本就没意义了。
