---
name: publish-linkedin
description: 在 LinkedIn（领英）发布带链接卡片的动态，采用官方 share-offsite 稳定入口，处理同源 iframe 内富文本编辑器粘贴与顶层 Shadow DOM 发布按钮点击，并在 Recent Activity 核实上线。当用户说「发 LinkedIn」「发领英动态」「post to LinkedIn」时使用。
when_to_use: 用户要把文章链接或英文动态发布到 LinkedIn（linkedin.com）时使用。
license: MIT
---

# 发布动态到 LinkedIn（linkedin.com）

## 0. 确认账号环境

用 `profile_list()` 确认 LinkedIn 所在的浏览器环境，使用 `tab_create` 或已有标签页操作。

---

## 1. 用 `share-offsite` 官方入口直接唤起作曲框（避开首页按钮失灵）

- **为什么要走 `share-offsite`**：LinkedIn 首页 Feed 顶部的「Start a post / 发动态」按钮对合成点击有强防御（点击返回 ok 但模态框不弹出），且旧的 `/feed/?shareActive=true` 直开参数已失效。
- **唯一 100% 稳定的入口**是官方给第三方分享按钮留的 URL：
  ```
  https://www.linkedin.com/sharing/share-offsite/?url=<URL编码后的文章链接>
  ```
- 这个入口会自动 302 跳回 `/feed/?shareActive=true&url=...` 并弹出作曲框，同时**自动抓取目标链接的 `og:image` 生成底部链接预览卡片**（因此正文中不需要再重复粘贴文章 URL，否则会出现双链接）。

---

## 2. 在同源 `iframe` 里找到编辑器并执行 Trusted Paste

- **踩坑记录**：`share-offsite` 弹出的作曲框渲染在一个**同源 `iframe`** 里！只在顶层 `document` 查找 `.ql-editor` 会永远返回 `null`。
- **顶层 + `iframe` 联合查找函数**：
  ```js
  function findEditor(d) {
    try { return d.querySelector('.ql-editor[contenteditable=true], [role=textbox][contenteditable=true]'); }
    catch(e) { return null; }
  }
  function getEditor() {
    var e = findEditor(document);
    if (e) return e;
    var ifs = document.querySelectorAll('iframe');
    for (var k = 0; k < ifs.length; k++) {
      try { var x = findEditor(ifs[k].contentDocument); if (x) return x; } catch(_) {}
    }
    return null;
  }
  ```
- 轮询等待 `getEditor()` 非空（最多 30 秒），然后：
  1. 调用 `activate(tab)` 将该标签页切到前台（后台标签页无法往 `iframe` 编辑器里粘贴）。
  2. 调用 `/api/v1/clipboard/write` 写入正文文本。
  3. 聚焦 `getEditor()` 并将选区折叠到末尾。
  4. 调用 `/api/v1/clipboard/paste` 粘贴正文，读回 `getEditor().innerText.length >= 100` 校验。

---

## 3. 截图确认与跨 Shadow DOM 点击「Post / 发布」

1. **发布前先调用 `browser_screenshot` 给用户确认**正文与链接预览卡片。
2. **编辑器与发布按钮不在同一个 Document！**
   正文编辑器在 `iframe.contentDocument` 里，但底部的蓝色「Post / 发布」按钮却在**顶层 `document` 的 Shadow Root（`.share-actions__primary-action`）里**！如果在 `iframe` 文档里找发布按钮会永远找到 0 个。
3. **递归穿透顶层 `document` 的 `shadowRoot` 并调用原生 `.click()`**：
   ```js
   (function(){
     var n = 0;
     function deep(root) {
       var els = root.querySelectorAll('*');
       for (var j = 0; j < els.length; j++) {
         var el = els[j];
         var t = (el.textContent || '').trim();
         if (el.tagName === 'BUTTON' && (t === '发布' || t === 'Post') && !el.disabled) {
           var r = el.getBoundingClientRect();
           if (r.width > 0 && r.width < 200) { el.click(); n++; }
         }
         if (el.shadowRoot) deep(el.shadowRoot);
       }
     }
     deep(document);
     return String(n);
   })()
   ```

---

## 4. 去 Recent Activity 页面核实真发出去了

- **不要拿「顶层 document 没有 textbox」当发布成功的判据**（因为 textbox 本来就在 iframe 里，这么判会导致没发出去也报成功）。
- 等待 5 秒后，导航到：
  ```
  https://www.linkedin.com/in/me/recent-activity/all/
  ```
  轮询 `document.body.innerText` 是否包含刚刚发送的正文前 40 个字符，命中才算真正发布成功。
