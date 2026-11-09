---
name: publish-juejin
description: 在稀土掘金（juejin.cn）发布 Markdown 技术文章，自动完成 CodeMirror 正文写入、分类选择、搜索式标签匹配、浮层收起与发布确认。当用户说「发掘金」「发到稀土掘金」「publish to Juejin」时使用。
when_to_use: 用户要把技术文章或产品长文发布到稀土掘金（juejin.cn）时使用。
license: MIT
---

# 发布技术文章到稀土掘金（juejin.cn）

## 0. 确认账号环境

```
profile_list()
```

确认掘金登录所在的环境（Profile），用 `tab_create` 或复用已有的 `juejin.cn` 标签页，全程固定 `tab_id`。

---

## 1. 打开 Markdown 编辑器并写入标题与正文

导航到：
```
https://juejin.cn/editor/drafts/new
```

轮询等待 `document.querySelector('.CodeMirror')` 挂载就绪。

### 写入标题与正文（带读回重试，最多 3 次）
新建草稿页初始化存在异步时序，单次写入偶发被编辑器清空，必须写完等 1.2 秒读回校验：

1. **标题**：定位 `input.title-input, input[placeholder*="标题"]`，用 `HTMLInputElement.prototype.value` 原生 setter 写入并派发 `input` 事件。
2. **正文**：掘金使用 CodeMirror 编辑器，直接调用实例方法一次灌入整篇 Markdown：
   ```js
   var cm = document.querySelector('.CodeMirror');
   if (cm && cm.CodeMirror) cm.CodeMirror.setValue(markdownText);
   ```
3. **读回校验**：确认 `titleInput.value.length > 3` 且 `cm.CodeMirror.getValue().length > 50`。

---

## 2. 打开发布抽屉（必须用原生 `.click()`，别用拟人坐标点）

- **踩坑记录**：对右上角「发布」按钮使用 `click-human` 合成坐标点击时，掘金经常打开一个 DOM 存在但宽高为 `0×0` 的隐藏弹窗，导致后续标签输入框无法点击展开。
- **正确做法**：用 JS 找到顶部工具栏（`y < 90`、`width > 0`）文本严格等于 `发布` 的 `<button>`，直接调用原生 `b.click()`，然后轮询等待 `.tag-input .byte-select` 的可见宽度 `> 20px`。

---

## 3. 填写发布抽屉必填项（分类 + 摘要 + 搜索式标签）

### 3.1 选择分类（必选）
在弹窗内找到文本严格等于目标分类（如 `人工智能`、`前端`、`后端`、`阅读`）的叶子节点并调用 `.click()`。

### 3.2 填写摘要（必填，且 ≤ 100 字）
- 摘要为空时点「确定并发布」会静默失败！
- 定位 `textarea[placeholder*="摘要"], .summary textarea, .abstract textarea`，用 `HTMLTextAreaElement.prototype.value` 原生 setter 写入 80～94 字摘要并触发 `input` 事件。

### 3.3 选择标签（必选，搜索式 ByteDesign `byte-select`）
掘金的标签组件 `.tag-input` 是受控搜索下拉框，必须先展开、再输入关键词过滤、最后点击匹配项：

1. **真实点击展开**：找到 `.tag-input .byte-select__content-wrap, .tag-input .byte-select__placeholder` 中 `width > 20 && height > 10` 的可见元素，滚动到视口中心后取 `getBoundingClientRect()` 中心坐标，调用 `/api/v1/click`（`human=False`）展开下拉框。
2. **注入搜索词触发 React 过滤**：
   找到可见的 `.byte-select__input`，聚焦后用 `HTMLInputElement.prototype.value` 原生 setter 写入关键词（如 `人工智能` 或 `AI`），依次派发 `input`、`change` 和 `KeyboardEvent('keyup', {bubbles:true, key:'a'})`，等待 `2.4 秒` 让下拉选项刷新。
3. **精准点击匹配项**：
   在可见的 `.byte-select-option, [role=option]` 中找到文本等于或包含关键词的项，调用 `.click()`（⚠️ 绝不要无脑点第一个默认项 `os[0]`，否则搜索未生效时会挂上毫不相干的标签）。

---

## 4. 关掉标签下拉浮层（最关键一步！）

- **致命陷阱**：选完标签后，`.byte-select` 的下拉浮层仍然开着并盖在发布抽屉上方。此时如果直接点底部的「确定并发布」，那一下点击会被下拉浮层吞掉（只关了下拉，文章根本没发出去！）。
- **三管齐下关下拉法**：
  1. **把焦点强制移进「摘要」`textarea`**：
     ```js
     var s = document.querySelector('.publish-popup textarea[placeholder*=摘要], .publish-popup textarea');
     if (s) { s.focus(); s.click(); }
     ```
  2. 发送按键 `Escape`（`/api/v1/press`）。
  3. 点击抽屉顶部标题文字「发布文章」处使其彻底 blur。
  4. 校验已选标签胶囊数量：`document.querySelectorAll('.tag-input .byte-tag, .tag-input [class*=tag-item]').length >= 1`。

---

## 5. 截图确认并点击「确定并发布」

1. **先截图（`browser_screenshot`）给用户看**，确认分类、标签胶囊、摘要和标题无误。
2. **用原生 `.click()` 触发「确定并发布」**：
   掘金这版弹窗的「确定并发布」按钮吃原生 `b.click()`，不吃合成坐标点击：
   ```js
   var b = [...document.querySelectorAll('.publish-popup button, button')].find(function(e){
     var t = e.textContent.trim();
     return (t === '确定并发布' || t === '确认并发布') && e.getBoundingClientRect().width > 0 && !e.disabled;
   });
   if (b) b.click();
   ```
3. **验证发布成功**：等待 4 秒后检查 `location.href` 跳转到 `/published` 或 `/post/<id>`，或页面出现 `发布成功` 提示。
