---
name: publish-wechat-mp
description: 把图文内容存进微信公众号后台草稿箱（含富文本排版、自动从正文选封面、声明文字原创、草稿箱落盘核验），绝不自动点群发。当用户说「发到公众号」「存公众号草稿」「发微信公众平台」「publish to WeChat MP」「save WeChat Official Account draft」时使用。
when_to_use: 用户要把文章发布或保存到微信公众号（mp.weixin.qq.com）草稿箱时使用。自动完成登录态核验、标题与富文本正文灌入、从正文头图选封面、声明原创并保存草稿，最后留给用户人工确认并点击群发。
license: MIT
---

# 发图文到微信公众号（存草稿 + 选封面 + 声明原创）

> **铁律：自动化只做到「保存草稿 + 挂好封面 + 声明原创」，绝不自动点击「群发」。**
> 微信公众号群发一旦按下去就会推送给全体订阅者，消耗当日群发配额且不可撤回，最后一下必须由用户自己按。

---

## 0. 先确定用哪个环境（Profile）—— 绝不猜账号

```
profile_list()
```

- 用户明确指定了公众号所在的环境 → 使用对应的 `profile_id` / `profile_path`。
- 没指定且存在多个环境 → 停下来把清单展示给用户确认。
- 在选定环境里查找已打开的 `mp.weixin.qq.com` 标签页，或用 `tab_create` 新开一个标签页，**全程固定操作这一个 `tab_id`**。

> ⚠️ **长文富文本发布优先走 Unzoo REST 接口（`http://127.0.0.1:9399/api/v1/*`）**：
> 整篇 HTML 正文往往数万字符，MCP 工具调用对超大请求体可能报 `502`，而本地 REST 接口无请求体大小限制。

---

## 1. 先验真登录并现取 `token`（别信「编辑器能打开」）

公众号后台的登录会话很短命（几小时就会过期）。**最隐蔽的坑是：会话过期时，图文编辑页照样能渲染出 3 个 `[contenteditable=true]`，连标题框的 native setter 都能写进去，唯独正文一个字都粘不进去！**

因此第一步必须访问公众号根域名验活：

```
POST http://127.0.0.1:9399/api/v1/navigate
{"tab_id": "<tab_id>", "url": "https://mp.weixin.qq.com/"}
```

轮询 `location.href`（最多 15 秒）：
- **已登录**：页面会自动重定向到 `/cgi-bin/home?...&token=<数字>`，用正则 `token=(\d+)` 提取最新 `token`。
- **未登录**：URL 不带 `token=`（页面通常显示扫码登录框）。**立刻停下**，截图请用户去该浏览器窗口扫码，扫完再继续。
- ⚠️ **不要访问 `/cgi-bin/home?t=home/index` 来探测 token**：新版后台在该路径下即使已登录也不会自动补全 `token` 参数，会导致误判掉线。

---

## 2. 打开新建图文编辑器并等待挂载

拿到实时 `token` 后，导航到新建图文页：

```
https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=<TOKEN>&lang=zh_CN
```

等待两个信号同时就绪（轮询最多 15 秒）：
1. `document.querySelectorAll('[contenteditable=true]').length === 3`
   - `[0]`：标题的 ProseMirror 表面层
   - `[1]`：`0×0` 隐藏的转载推荐语节点（跳过）
   - `[2]`：正文 ProseMirror 编辑器
2. `document.querySelectorAll('textarea.js_title, textarea.frm_input').length >= 1`
   - ⚠️ `[contenteditable=true]` 数到 3 **不代表 `textarea.js_title` 已挂载**！必须显式等到 `textarea.js_title` 出现再写标题。

---

## 3. 写入标题（必须同时写隐藏 `textarea.js_title` 与 `ProseMirror[0]`）

- **标题长度红线**：微信公众号标题建议严格控制在 **≤ 31 个字符**。超过 32 字时，`textarea.js_title` 会在末尾自动截断，导致后续去草稿箱按标题尾部核验时找不到草稿。
- **为什么两边都要写**：「保存为草稿」序列化读的是隐藏的 `<textarea class="js_title">`，而界面展示和脏状态检测看的是 `.ProseMirror[0]`。只写一边会导致存出「无标题草稿」。

```js
(function(title){
  var t = document.querySelector('textarea.js_title, textarea.frm_input');
  if (t) {
    var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    t.focus();
    s.call(t, title);
    t.dispatchEvent(new Event('input', {bubbles: true}));
    t.dispatchEvent(new Event('change', {bubbles: true}));
    t.dispatchEvent(new Event('blur', {bubbles: true}));
  }
  var p = document.querySelectorAll('.ProseMirror')[0] || document.querySelectorAll('[contenteditable=true]')[0];
  if (p) {
    p.focus();
    var sel = window.getSelection(), r = document.createRange();
    r.selectNodeContents(p);
    sel.removeAllRanges();
    sel.addRange(r);
    document.execCommand('delete', false, null);
    document.execCommand('insertText', false, title);
    p.dispatchEvent(new Event('input', {bubbles: true}));
  }
  return 'ok';
})("<标题>")
```

写完必须读回 `Math.min(t.value.length, p.innerText.trim().length)` 校验非空。

---

## 4. 灌入富文本正文（`CF_HTML` 系统剪贴板 + Unzoo Trusted Paste）

### 为什么不能用合成 `ClipboardEvent` 或 `execCommand('insertHTML')`？
- **合成 `ClipboardEvent('paste')`**：新版公众号编辑器校验 `event.isTrusted`，合成事件会被直接无视，正文永远停在占位符「从这里开始写正文」（8 个字）。
- **`execCommand('insertHTML')`**：虽然能塞进文字，但会把整篇文章拍平成单个 `<section><span leaf="">`，所有 `<h2>`、加粗、列表、段落结构全毁。
- **外链清洗**：公众号草稿严禁含站外 `<a href="https://...">` 超链接（会被静默丢弃或拦截），灌入前先将正文 HTML 中的 `<a>` 标签替换为纯文本，且正文首段上方插入一张线上可访问的封面头图 `<img src="https://...">`（供后续「从正文选择封面」使用）。

### 正确做法：`CF_HTML` + `/api/v1/clipboard/paste`
1. 使用随附脚本 `scripts/set_html_clipboard.ps1`（Windows PowerShell `-STA` 模式）把 UTF-8 字节流的 `CF_HTML` 写入系统剪贴板：
   ```powershell
   powershell.exe -STA -NoProfile -ExecutionPolicy Bypass -File scripts/set_html_clipboard.ps1 -HtmlFile body.html -TextFile body.txt
   ```
2. **激活当前标签页**（`POST /api/v1/tabs/activate`）——Trusted Paste 只作用于当前前台活动 tab！
3. 将焦点和选区放到 `document.querySelectorAll('[contenteditable=true]')[2]`。
4. 调用 `POST /api/v1/clipboard/paste {"tab_id": "<tab_id>"}`（底层走 Chromium `WebContents::Paste`，`isTrusted=true`）。
5. **处理「内容结构检测」模态弹窗**：
   粘贴后 10 秒内轮询页面。如果公众号弹出「内容结构检测」提示框，正文会被扣在弹窗里不落地。直接全页查找文本严格等于 `继续插入` 的可见元素并派发 `mousedown` → `mouseup` → `click`。
6. **读回校验字数与格式**：
   - 检查 `[contenteditable=true][2].innerText` 去空白后的字数 `>= 源文纯文本字数 * 0.6`。
   - 检查编辑器内的 `h1,h2,h3,h4` 与 `strong,b` 数量，确认富文本格式未丢失。

---

## 5. 正文落地后重刷标题与作者，先点第一次「保存为草稿」

- **为什么还要重刷一次标题**：Trusted Paste 之后，ProseMirror 内部状态偶发重置标题脏标记；必须再次执行第 3 步的标题写入与作者写入（`input[placeholder*="作者"], #author` 设为作者名）。
- **为什么第一次保存前不要设封面**：在新建会话里直接拖拽/操作封面，极易导致「保存为草稿」按钮点下去静默无反应。**必须先存盘生成 `appmsgid`，再重新打开草稿补封面与原创！**
- 点击 `保存为草稿` 按钮后，耐心等待 `12～24 秒`（公众号后台此时正在异步把正文里的远程 `<img>` 转存到 `mmbiz.qpic.cn`），直到 `location.href` 出现 `appmsgid=<数字>` 且页面不再显示「保存中」。

---

## 6. 去草稿箱核验真落盘，再重新打开补「封面」与「原创」

### 6.1 草稿箱列表核验
导航到草稿箱列表页：
```
https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=20&type=77&action=list_card&token=<TOKEN>&lang=zh_CN
```
读取 `window.wx.cgiData.item`，用**标题末尾 14 个字**（`title.slice(-14)`，避免系列文章前缀相同撞车）匹配目标草稿，取出它的 `app_id`。

### 6.2 重新打开该草稿
导航到：
```
https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=0&type=77&appmsgid=<app_id>&token=<TOKEN>&lang=zh_CN
```
确认 `textarea.js_title.value` 包含标题尾部关键字后，执行以下两步：

### 6.3 设封面：走「从正文选择」，不要用 `drag-drop-file` 注入文件
> **为什么要走「从正文选择」？**
> 通过 CDP `drag-drop-file` 往「拖拽或选择封面」框塞本地文件，会被微信公众号后台检测到并弹出「浏览器插件存在安全隐患」警告。而正文顶部已经放了头图，直接点选「从正文选择」全程是页内原生点击，**零插件告警、100% 干净**。

1. 滚动 `.setting-group__cover_area` 到视口中央，在 `.js_share_type_none_image` 或 `.js_cover_btn_area` 上派发 `mouseover` → `mousedown` → `mouseup` → `click`。
2. 点击弹出的 `.js_selectCoverFromContent`（「从正文选择」）。
3. 等待弹窗渲染出可见的 `.appmsg_content_img_item`，在第一张图（正文头图）上派发完整 Pointer/Mouse 序列（`pointerdown` → `mousedown` → `pointerup` → `mouseup` → `click`）。
4. 点击 `下一步` → 等待裁剪框出现 → 点击 `确认`（均派发完整 Pointer/Mouse 序列 + 坐标点击）。
5. 轮询 `.js_cover_preview_new` 的 `getComputedStyle(p).backgroundImage`，直到包含 `mmbiz` 即代表封面已挂稳。

### 6.4 声明文字原创
1. 找到可见的 `.setting-group__content`（文本以 `原创` 开头且 `height > 0`，注意避开页面里 `height === 0` 的隐藏同名节点）。
2. 点击开关打开 `.weui-desktop-dialog`（含「声明类型」文字）。
3. 在弹窗内确认选中「文字原创」、勾选协议复选框、填入作者名，在 `确定` 按钮上派发完整 Pointer/Mouse 序列。
4. 轮询原创栏文本变成 `文字原创 · 作者...`。

### 6.5 再次点击「保存为草稿」并回草稿箱复查 `cover` 字段
- 点 `保存为草稿`，等待 5 秒后回到 `list_card` 草稿箱页面。
- 检查 `window.wx.cgiData.item` 中对应草稿的 `cover || cdn_url || thumb_url` 非空。
- 截图草稿箱卡片给用户看，告知草稿已满配就绪，请用户自己在公众号后台点「发表/群发」。
