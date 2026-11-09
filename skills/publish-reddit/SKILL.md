---
name: publish-reddit
description: 在 Reddit 指定 Subreddit 发布帖子，穿透 Web Component（post-composer-title）的 Shadow DOM 填写标题，规避敏感字符拦截并在发布前截图确认。当用户说「发 Reddit」「发到 r/SideProject」「post to Reddit」时使用。
when_to_use: 用户要在 Reddit 社区（如 r/SideProject 等）发布文字帖或项目分享帖时使用。
license: MIT
---

# 发布帖子到 Reddit（reddit.com）

## 0. 确认账号环境与目标 Subreddit

1. 用 `profile_list()` 确认 Reddit 登录所在的环境，不猜账号。
2. 确认要发往哪个 Subreddit（如 `r/SideProject`），并注意部分 Subreddit 强制要求选择 Flair（标签），优先选择用户明确指定的板块。

---

## 1. 打开提交页并清理残留旧草稿

导航到：
```
https://www.reddit.com/r/<Subreddit>/submit/?type=TEXT
```

> ⚠️ Reddit 提交页经常自动恢复上一次未发出的旧草稿，写入前务必完整覆盖标题和正文。

---

## 2. 穿透 Shadow DOM 写入标题（`<post-composer-title>`）

新版 Reddit 界面基于 Lit / Web Components 构建，标题输入框被封装在自定义元素 `<post-composer-title>` 的 `shadowRoot` 内部，外层 `document.querySelector('textarea')` 根本找不到它！

### 正确写法（穿透 `shadowRoot` + `composed: true` 事件）：
```js
(function(title){
  var host = document.querySelector('post-composer-title');
  if (!host || !host.shadowRoot) return 'no-host';
  var ta = host.shadowRoot.querySelector('textarea');
  if (!ta) return 'no-ta';
  ta.focus();
  var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  s.call(ta, title);
  ta.dispatchEvent(new Event('input', {bubbles: true, composed: true}));
  ta.dispatchEvent(new Event('change', {bubbles: true, composed: true}));
  return 'ok:' + ta.value.length;
})("<英文标题>")
```

- **标题字符避坑**：避免在标题里使用反引号 `` ` ``、特殊引号或 `$` 金额符号，部分 Subreddit 的 AutoModerator 会静默拦截含此类符号的帖子。

---

## 3. 写入正文（避免裸链被 AutoMod 秒删）

定位正文编辑区 `[contenteditable=true][aria-label*="body"]`，聚焦后通过 `ClipboardEvent('paste')`（`text/plain`）或 `/api/v1/clipboard/paste` 灌入正文。
- **防删帖建议**：Reddit 社区反感只扔一个外部链接的裸链帖（极易被系统判为 Spam 自动移除）。正文应包含实质性的背景/痛点摘要 + 项目链接 + 结尾向社区抛出一句真诚的讨论问题。

---

## 4. 发布前截图确认与点击 Post

1. **必须先调用 `browser_screenshot` 给用户看**，请用户确认 Subreddit、标题、正文及账号无误。
2. 用户确认后点击右下角 `Post` 按钮。
3. **核验成功**：URL 跳转到带 `?created=t3_<id>` 的新帖详情页，或回到 `/r/<Subreddit>/new/` 看到该帖出现在顶部。
