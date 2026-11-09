---
name: publish-x
description: 发一条 X（Twitter）推文或 X 长文（Articles），可带图片、视频或长文头图，发布前先截图给用户确认，并内置 Cloudflare 验证预防与限流红线保护。当用户说「发个推」「发到 X」「发条推特」「发 X 长文」「post this to X」「tweet this」时使用。支持多账号隔离。
when_to_use: 用户要在 X / Twitter 上发布短推文（Tweet）或长文章（X Article）时使用。也用于「把这张图发一下」「帮我发这条」这类省略了平台但上下文是 X 的请求。不要用于读取/搜索 X 的内容（那用普通的浏览工具）。
license: MIT
---

# 发推文或长文（Article）到 X

## 0. 先确定用哪个账号 —— 不要猜

X 的发布是**不可撤销的对外动作**，发到错误的账号上没法挽回。

```
profile_list()
```

- 用户**明确说了**账号/环境 → 用那个的 `profile_id`
- 用户**没说**，而 `profile_list` 里只有一个像是 X 账号的环境 → 告诉用户你打算用哪个，等他确认
- 有多个、或者认不出来 → **停下来问**，把清单给他看

拿到 `profile_id` 之后，**所有**后续调用都带上它。并在页面加载后核对左下角 `[data-testid="SideNav_AccountSwitcher_Button"]` 的 `@handle` 是否与目标账号一致。

## 1. 开一个新标签页，不要占用用户正在看的页面

```
tab_create(profile_id="<选定的>", url="https://x.com/home")
```

记住返回的 `tab_id`，**后面每一步都带着它**。

---

## 2A. 路线一：发普通图文推文（`/home` 顶部内联编辑器）

> ⚠️ **切忌直接导航到 `https://x.com/compose/post`**：该路由常在 `/home` 顶层挂一个空的 `[data-testid="mask"]` 全屏透明遮罩，拦截所有点击。**正确入口是直接访问 `https://x.com/home` 使用顶部内联编辑器**。

### 1) 展开折叠态输入框
`https://x.com/home` 顶部的内联编辑器默认处于折叠态（只显示静态文字 `"What’s happening?"`，此时 DOM 里还没有 `[data-testid="tweetTextarea_0"]`）。
先找到文本匹配 `/^What.s happening\??$/i` 的可见元素并点击展开，轮询等待 `[data-testid="tweetTextarea_0"]` 挂载。

### 2) 填入正文与读回校验
- 可用 `human_type(tab_id=<tab_id>, selector="ref=<正文框>", text="<正文>")` 或聚焦 `[data-testid="tweetTextarea_0"]` 后派发 `ClipboardEvent('paste')`（`text/plain`）。
- 填完后**必须读回文本核对**（`browser_get_text`），确认无首字符乱序或截断。

### 3) 上传图片或视频（如有）
- **路 A —— DOM 里已有 `input[type=file]`**：
  使用 `browser_upload_trusted(tab_id=<tab_id>, selector="input[type=file]", file_paths=["C:/path/to/img.png"])`（或 REST `/api/v1/upload`）。必须用 trusted 上传，确保 `change` 事件 `isTrusted=true`。
- **路 B —— 点按钮弹系统文件框**：
  先 `browser_set_input_files(file_paths=[...])` 排队，再 `browser_click` 点击上传图标。
- 传完等缩略图预览加载完毕再往下走。

### 4) 截图给用户确认 → 点击发送 → 个人主页核实
1. **必须先 `browser_screenshot(tab_id=<tab_id>)` 给用户确认**正文、配图、账号无误。
2. 点击 `[data-testid="tweetButtonInline"]` 或 `[data-testid="tweetButton"]`。
3. **验证结果**：检查输入框文本归零，并去个人主页 `https://x.com/<用户名>` 确认最新一条推文已出现。若遇到静默失败，先看个人主页确认没发出再重试，防止重复发推。

---

## 2B. 路线二：发 X 长文（`x.com/compose/articles`，需 X Premium）

如果用户要发长文章且账号开通了 X Premium：

1. **挂载长文编辑器**：
   - 导航到 `https://x.com/compose/articles`（若页面显示 `"Hmm...this page doesn’t exist"`，说明该账号未开通或已到期 X Premium，自动降级走上面的 **2A `/home` 顶部编辑器**发长推文/摘要+链接）。
   - 找到文本为 `Write` 的按钮，取 `getBoundingClientRect()` 中心坐标用**真实坐标点击**（`click-human`，JS `.click()` 点不动 `Write`）。
   - 若点击后未直接进 `/edit/<id>`，则在草稿列表中点击最上面那条 `(Needs title)` 行，轮询等待 `[data-testid="composer"]` 出现。
2. **上传长文头图（Banner）**：
   编辑器挂载后页面存在 `input[type=file]`，调用 `upload()` 传入压缩后的封面图。
   - ⚠️ **必须关掉 `Edit media` 弹层**：头图传完后 X 会弹出一个 `[role=dialog]` 的 `Edit media` 裁剪框盖在页面上。必须先找到弹窗内的 `Apply` 按钮并派发 `['mousedown','mouseup','click']` 关掉它，否则后续点工具栏 `Publish` 会被弹层吞掉！
3. **填长文标题（≤ 70 字符）与正文**：
   - 标题：定位 `textarea[placeholder*="title"], textarea[placeholder*="Title"]`，用原生 setter 写入（严格 `<= 70` 字符）。
   - 正文：X Articles 编辑器会吞掉原生 Ctrl+V，改用合成 `ClipboardEvent('paste')`，同时塞入 `text/plain` 和按 `<p>` 分段的 `text/html`，派发到 `[data-testid="composer"]`。
4. **截图给用户确认 → 两步 Publish**：
   - 先截图给用户确认。
   - 第一步：点击顶部工具栏（`y < 90`）非 disabled 的 `Publish` 按钮。
   - 第二步：等待 `[role=dialog]` 确认框弹出，点击弹窗内（`y > 90`）的蓝色 `Publish` 按钮。
   - 轮询最多 24 秒，直到 `location.href` 跳转到 `/status/<id>`。

---

## 3. 风控红线：Cloudflare 验证与 X 限流标签保护（血泪教训）

1. **防 Cloudflare 人机验证（慢下来！）**：
   X 前面挂了 Cloudflare。如果短时间内连续快速导航（`navigate` → `Write` → `navigate`），会被判为机器人并无限重定向到 `https://x.com/account/access` 刷出「请验证您是真人」。
   - **预防**：两次 `navigate` 之间强制间隔 `8～12 秒`；能在同页操作就别跳页。
   - **恢复**：一旦遇到验证页，不要依赖 `querySelector('iframe')`（Cloudflare Managed Challenge 常查不到），先截图看复选框/蓝按钮坐标，用 `click-human` 点一下，然后**耐心等 30～60 秒让它自己跳回**，处于「正在验证…」时绝不要手动刷新或 `navigate`（会重置 Ray ID 陷入死循环）。
2. **防账号被挂临时限流标签（Temporary Reach Label）**：
   - **同一账号一天最多用自动化发 1 篇 X 长文**，绝不要在同一天内中英文两篇连发（实测同日双语连发会被 X 挂上 `"We've added a temporary label to your account which may impact its reach"`）。
   - 发完一篇后当天不要再用脚本频繁刷新或删改。

## 收尾

用完把新开的标签页关掉：
```
tab_close(tab_id=<tab_id>, profile_id="<选定的>")
```
