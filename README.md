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

> 想要某个新平台？[开个 issue 告诉我们](https://github.com/unzooai/unzooai-skills/issues/new/choose)。

| 技能 | 做什么 | 状态 |
|---|---|---|
| [`publish-wechat-mp`](./skills/publish-wechat-mp/SKILL.md) | 发微信公众号图文草稿（`CF_HTML` 富文本粘贴、从正文选封面、声明文字原创、草稿箱核验，群发留给人按） | ✅ 已上线 |
| [`publish-toutiao`](./skills/publish-toutiao/SKILL.md) | 发今日头条号图文长文（旧草稿清理、封面自动抓取等待与「编辑替换」原图尺寸匹配、首发控制、`vis=40` 档位自检） | ✅ 已上线 |
| [`publish-juejin`](./skills/publish-juejin/SKILL.md) | 发稀土掘金技术文章（CodeMirror 灌入、分类/摘要必填、搜索式标签匹配与下拉浮层收起） | ✅ 已上线 |
| [`publish-zhihu`](./skills/publish-zhihu/SKILL.md) | 发知乎专栏文章（DraftJS 富文本粘贴、零宽空格按钮处理、新闻来源门槛检测与转场轮询） | ✅ 已上线 |
| [`publish-weibo`](./skills/publish-weibo/SKILL.md) | 发新浪微博图文短帖（导航落地等待、受控输入框赋值、最右侧发送键动态定位与清空核验） | ✅ 已上线 |
| [`publish-x`](./skills/publish-x/SKILL.md) | 发 X / Twitter 推文与长文 Articles（含图片、视频、头图、Cloudflare 验证预防与限流红线保护） | ✅ 已上线 |
| [`publish-linkedin`](./skills/publish-linkedin/SKILL.md) | 发 LinkedIn 动态与链接卡片（`share-offsite` 稳定入口、同源 `iframe` 粘贴与顶层 Shadow DOM 发布） | ✅ 已上线 |
| [`publish-reddit`](./skills/publish-reddit/SKILL.md) | 发 Reddit 社区帖子（穿透 `<post-composer-title>` Shadow DOM 填标题、防 AutoMod 裸链拦截） | ✅ 已上线 |
| [`publish-devto`](./skills/publish-devto/SKILL.md) | 发 Dev.to 英文技术文章（Forem API、`User-Agent` 防 403、`canonical_url` 原文权重绑定与回读核验） | ✅ 已上线 |
| [`publish-xiaohongshu`](./skills/publish-xiaohongshu/SKILL.md) | 发小红书图文笔记（创作者中心「上传图文」切换、多图 trusted 上传、20 字标题红线与 ProseMirror 正文） | ✅ 已上线 |
| [`publish-fanqie`](./skills/publish-fanqie/SKILL.md) | 发番茄小说章节与封面（章节列表重名防呆校验、`browser_upload_trusted` 封面上传与日更配额管理） | ✅ 已上线 |
| [`publish-multi`](./skills/publish-multi/SKILL.md) | 多平台矩阵协同分发（一号一环境隔离、两条内容线防假首发护栏、20 分钟错峰排期与故障降级汇总） | ✅ 已上线 |
| [`verify-install`](./skills/verify-install/SKILL.md) | 逐条验证本机 Unzoo 的环境隔离、真实指纹、真人输入与错误契约 | ✅ 已上线 |

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
