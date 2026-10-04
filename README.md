# Unzoo Skills

**让 Claude 真的能帮你把内容发出去 —— 用一个真实的浏览器，而不是脆弱的脚本。**

这里是 [Unzoo Browser](https://unzoo.ai) 的 Claude Skills 集合。装上之后，你可以直接对
Claude 说「把这篇文章发到公众号」「这条配图发一下 X」，剩下的它自己做。

> 英文 / English: Unzoo Skills are Claude Skills that let Claude publish and automate on
> real websites through [Unzoo Browser](https://unzoo.ai) — a Chromium build made for AI
> agents, with per-account isolation and a browser fingerprint that matches real Chrome.

---

## 为什么要用真实浏览器

发内容这件事，难的从来不是"点哪个按钮"，而是那些**只有真撞过才知道**的东西：

- 有的站点会校验 `change` 事件的 `isTrusted` —— 脚本塞进去的文件**看起来上传成功，实际一个字节都没传**
- 有的站点点上传按钮会弹**系统原生文件框**，得在点击**之前**把文件排好队，顺序反了就接不住
- 多个账号同时在跑，cookie 和登录态**必须互不污染**，否则平台会把它们判成同一个人
- 自动化特征被识别 → 验证码、限流、封号

这些坑我们一个个踩过，修的办法写进了技能里。你不用再踩一遍。

---

## 快速开始

### 1. 装 Unzoo Browser

从 [Releases](https://github.com/unzooai/unzooai-skills/releases) 或
[unzoo.ai](https://unzoo.ai/download) 下载安装（Windows / macOS / Linux）。

### 2. 装技能

```
/plugin marketplace add unzooai/unzooai-skills
/plugin install unzoo@unzooai-skills
```

装完会**自动帮你配好 Unzoo 的 MCP 连接**，不用手工改配置文件。

### 3. 直接说人话

```
把 draft.md 这篇发到我的公众号，封面用 cover.png
```

---

## 技能清单

> 正在建设中 —— 第一批技能随附近的版本发布。
> 想要某个平台？[开个 issue 告诉我们](https://github.com/unzooai/unzooai-skills/issues/new/choose)。

| 技能 | 做什么 | 状态 |
|---|---|---|
| `publish-wechat-mp` | 发微信公众号图文（含封面、排版、预览确认） | 建设中 |
| `publish-x` | 发 X / Twitter（含图片、视频、长文） | 建设中 |
| `publish-multi` | 一次发多个平台，一号一环境互不干扰 | 规划中 |

---

## 这些技能的原则

**1. 发布前一定先给你看。**
所有会产生对外可见后果的操作（发布、发送、提交），技能都会先截图让你确认。
Claude 不会替你按下最后那个按钮。

**2. 不替你猜。**
账号、环境、收件人认不出来时，技能会停下来问，而不是挑一个看起来对的继续 ——
"操作到了错误的账号上"比"没操作"糟糕得多。

**3. 只做你自己的事。**
这些技能是帮你发**你自己的内容**到**你自己的账号**。
请遵守各平台的服务条款；我们不提供也不鼓励用于冒充他人、刷量或规避平台处罚。

---

## 参与贡献

**最有价值的贡献是你踩过的坑。** 某个平台改版了、某个选择器失效了、某个站点有新的反
自动化校验 —— 这些信息比代码更重要。

- 🐛 [报告问题](https://github.com/unzooai/unzooai-skills/issues/new/choose)
- 💡 [提议新技能](https://github.com/unzooai/unzooai-skills/issues/new/choose)
- 🔧 [贡献技能](./CONTRIBUTING.md)
- 💬 [经验交流](https://github.com/unzooai/unzooai-skills/discussions)

---

## 相关

- [Unzoo Browser 官网](https://unzoo.ai)
- [环境寻址规则](https://github.com/unzooai/unzooai-skills/blob/main/docs/profile-addressing.md) —— 多账号隔离怎么用
- 发现安全问题？请看 [SECURITY.md](./SECURITY.md)，**不要开公开 issue**

## 许可

技能内容以 [MIT](./LICENSE) 发布，可自由使用和修改。
Unzoo Browser 本体是独立的专有软件，不在本许可范围内。
