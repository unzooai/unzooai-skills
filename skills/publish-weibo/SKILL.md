---
name: publish-weibo
description: 在新浪微博（weibo.com）发布短帖与配图，包含导航落地等待、受控输入框赋值、最右侧橙色发送键动态定位与清空核验。当用户说「发微博」「发条微博」「post to Weibo」时使用。
when_to_use: 用户要把一段文字或图文动态发布到新浪微博（weibo.com）时使用。
license: MIT
---

# 发布图文动态到新浪微博（weibo.com）

## 0. 确认账号环境与登录态

1. 用 `profile_list()` 确认微博所在的浏览器环境。
2. 微博的 `SUB` Cookie 是 `HttpOnly`，不要用 `document.cookie` 判断登录态；改查 `window.$CONFIG && window.$CONFIG.uid` 是否存在。

---

## 1. 导航到微博首页并强制等待落地（防旧 DOM 假写入）

```
POST http://127.0.0.1:9399/api/v1/navigate
{"tab_id": "<tab_id>", "url": "https://weibo.com/"}
```

- **踩坑警告**：如果标签页原本就在 `weibo.com`，调用 `navigate` 后**必须先 `sleep(3.5s)` 再开始轮询 `textarea[placeholder]`**！
- **原因**：如果不等待导航真正开始，轮询会瞬间命中**刷新前的旧 DOM**，把文字写进旧节点里；紧接着页面完成刷新，输入框被清空，`textarea.value.length` 变成 `0`——后续校验 `left == 0` 就会误判成「已经发送成功」，实际上什么都没发出去！

---

## 2. 填入微博文案与上传配图

### 2.1 写入文案并读回校验
定位首页顶部发布框 `textarea[placeholder]`，聚焦后用 `HTMLTextAreaElement.prototype.value` 原生 setter 写入文案并派发 `input` 事件：

```js
(function(text){
  var ta = document.querySelector('textarea[placeholder]');
  if (!ta) return 'no';
  ta.focus();
  var s = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  s.call(ta, text);
  ta.dispatchEvent(new Event('input', {bubbles: true}));
  return 'ok';
})("<微博文案>")
```

写完等待 1 秒，读回 `ta.value.length >= 10` 确认文案真落进了当前 DOM。

### 2.2 上传配图（如有）
调用 `/api/v1/upload` 传入图片路径，然后轮询 `!document.querySelector('[class*=uploading]')`（最多 10 秒）再额外等待 `2.5 秒`，确保缩略图彻底上传完毕。

---

## 3. 发布前截图确认与动态定位「发送」按钮

1. **先截图（`browser_screenshot`）给用户确认**文案、外链和配图缩略图。
2. **为什么不能硬编码「发送」按钮坐标**：上传配图后发布框会被撑高，按钮坐标大幅下移；且页面上可能存在多个文本为「发送」的元素。
3. **正确点法**：先重新 `ta.focus()`，再查找页面上所有可见、非 `disabled`、文本为 `发送` 的 `button.woo-button-main, button, [role=button]`，**按 `getBoundingClientRect().x` 从大到小排序取最右侧那个**，直接调用原生 `.click()`：
   ```js
   (function(){
     var ta = document.querySelector('textarea[placeholder]');
     if (ta) ta.focus();
     var bs = [...document.querySelectorAll('button.woo-button-main, button, [role=button]')].filter(function(e){
       var t = e.textContent.trim();
       var rc = e.getBoundingClientRect();
       return t === '发送' && rc.width > 0 && rc.width < 160 && rc.height > 0 && !e.disabled;
     });
     if (!bs.length) return 'NO';
     bs.sort(function(a, b){ return b.getBoundingClientRect().x - a.getBoundingClientRect().x; });
     bs[0].click();
     return 'clicked';
   })()
   ```

---

## 4. 发送成功核验（严禁把 `-1` 当成清空！）

点击发送后，轮询发布框剩余字数：
```js
(function(){
  var ta = document.querySelector('textarea[placeholder]');
  return ta ? ta.value.length : -1;
})()
```
- **成功条件必须是 `0 <= left <= 2`**，绝不能写成 `left <= 2`（因为当页面异常或跳走导致 `ta` 为 `null` 时返回 `-1`，`-1 <= 2` 会恒为 `True` 造成假成功！）。
