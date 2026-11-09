---
name: publish-zhihu
description: 在知乎专栏（zhuanlan.zhihu.com）发布长文，处理 DraftJS 富文本粘贴、零宽空格按钮匹配、新闻来源门槛检测与超长发布转场轮询。当用户说「发知乎」「发知乎专栏」「publish to Zhihu」时使用。
when_to_use: 用户要把文章发布到知乎专栏（zhuanlan.zhihu.com/write）时使用。
license: MIT
---

# 发布文章到知乎专栏（zhuanlan.zhihu.com）

## 0. 确认账号环境

用 `profile_list()` 确认知乎已登录的浏览器环境，打开或复用 `zhuanlan.zhihu.com` 标签页。

---

## 1. 打开知乎专栏写文章页并写入标题与正文

导航到：
```
https://zhuanlan.zhihu.com/write
```

轮询等待 `.public-DraftEditor-content` 出现。

### 写入标题与正文（带读回核验，最多重试 3 次）
DraftJS 编辑器刚挂载时偶发吞掉粘贴事件，导致标题或正文为空、右上角「发布」按钮处于 `disabled` 状态：

1. **标题**：定位页面上的标题 `textarea`，用 `HTMLTextAreaElement.prototype.value` 原生 setter 写入标题并派发 `input` 事件。
2. **正文**：聚焦 `.public-DraftEditor-content`，构造 `DataTransfer`（`setData('text/html', html)`）派发 `ClipboardEvent('paste', {clipboardData: d, bubbles: true, cancelable: true})`（或使用 `CF_HTML` + `/api/v1/clipboard/paste`）。
3. **读回校验**：等待 1.8 秒，确认 `textarea.value.length > 3` 且 `.public-DraftEditor-content.innerText.length > 50`。

---

## 2. 封面与话题注意事项

- **警惕多个 `input[type=file]` 陷阱**：知乎写文章页存在多个隐藏的 `input[type=file]`，盲目调用 `upload()` 极易命中**知识库文件上传框**（弹出「选择文件 / 我分享的文件」浮层挡住全屏）。如果误触，立即发送 `Escape` 或点击关闭图标；知乎专栏不强制要求封面，无把握时可跳过封面上传。
- **添加话题**：滚动到文末「发布设置」区域，点击「添加话题」→ 在 `input[placeholder*="话题"]` 聚焦后使用 `document.execCommand('insertText', false, '<话题词>')` → 点击下拉列表中的匹配话题。

---

## 3. 检测「新闻类内容来源标注」门槛

知乎对涉及近期新闻动态的文章会强制置灰「发布」按钮，并提示 **「标注信息来源 / 明确标注」**。由于该来源选择器嵌套极深且面板自动收起，脚本应在点发布前先做一次检测：

```js
(function(){
  var pd = [...document.querySelectorAll('button')].some(function(b){
    return (b.textContent||'').replace(/\u200b/g,'').trim()==='发布' && b.disabled;
  });
  var news = /标注信息来源|明确标注/.test(document.body.innerText);
  return (pd && news) ? 'GATE' : 'ok';
})()
```

如果返回 `'GATE'`，**不要盲目死磕点击**——截图告知用户草稿已保存，请用户在「发布设置 → 内容来源」里手动勾选一条信息来源再点发布。

---

## 4. 截图确认与点击「发布」（警惕按钮里的零宽空格 `\u200b`！）

1. **发布前先调用 `browser_screenshot` 给用户看**，得到确认后再点发布。
2. **为什么要过滤 `\u200b`**：知乎的「发布」按钮文本里常夹杂不可见的零宽空格（`发\u200b布`），直接 `b.textContent.trim() === '发布'` 会匹配失败！必须先 `.replace(/\u200b/g, '').trim()`。
3. 定位右下角（按 `getBoundingClientRect().y` 从大到小排序）非 `disabled` 的 `发布` 按钮，调用 `click-human` 点击一次。

---

## 5. 轮询「发布中…」转场与最终落地核实

- **不要连续狂点「发布」**：知乎点一下「发布」就会进入提交流程；如果连续多点，会在「发布成功」弹窗刚弹出来那一刻误触弹窗里的「分享」按钮。
- **动态延长等待窗口**：知乎从「发布中…」到「发布成功」的转场经常长达 `30～90 秒`。只要检测到页面按钮文本包含 `发布中`，就把超时截止时间往后顺延（总上限 180 秒）。
- **三种成功判据（满足任一即可）**：
  1. `document.body.innerText.indexOf('发布成功') >= 0`
  2. `location.href` 变成 `https://zhuanlan.zhihu.com/p/<id>`（不再带 `/edit` 后缀）
  3. 兜底验证：把当前编辑页 URL 的 `/edit` 去掉，直接访问 `https://zhuanlan.zhihu.com/p/<id>`，若页面存在 `<h1>` 且不含 `404` / `页面不存在`，说明文章已正式上线。
