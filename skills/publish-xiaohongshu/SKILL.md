---
name: publish-xiaohongshu
description: 在小红书创作者服务平台（creator.xiaohongshu.com）发布图文笔记，完成「上传图文」Tab切换、多图 trusted 上传、20字标题限制与 ProseMirror 正文写入，并在发布前截图给用户确认。当用户说「发小红书」「发篇小红书笔记」「post to Xiaohongshu / RED」时使用。
when_to_use: 用户要把图文笔记发布到小红书创作者中心（creator.xiaohongshu.com）时使用。
license: MIT
---

# 发布图文笔记到小红书（creator.xiaohongshu.com）

## 0. 确认账号环境与登录态

1. 用 `profile_list()` 确认小红书登录所在的环境，绝不盲猜账号。
2. 导航到小红书创作者中心发布页：
   ```
   https://creator.xiaohongshu.com/publish/publish?source=official
   ```
3. 若 URL 重定向到含 `login` 的路径，立刻停下截图请用户扫码登录。

---

## 1. 切换到「上传图文」并上传配图（图文笔记必传图片！）

1. **切换 Tab**：小红书发布页默认可能停在「上传视频」Tab。先找到文本为 `上传图文` 的 Tab 元素并点击，等待 1 秒。
2. **上传图片（必填，1～18 张）**：
   - 小红书图文笔记必须至少上传 1 张图片（`.jpg` / `.jpeg` / `.png` / `.webp`），传完图片后标题与正文编辑框才会完整展开。
   - 定位 `input.upload-input`（或 `input[type="file"][accept*=".jpg"], input[type="file"]`），调用 `browser_upload_trusted`（或 REST `/api/v1/upload`）传入本地图片路径。
   - 等待至少 3 秒，确认缩略图预览已加载完成。

---

## 2. 填写标题（严格 ≤ 20 字）与正文（≤ 1000 字）

### 2.1 标题（≤ 20 字红线）
- 小红书标题上限为 **20 个字**，超长会被截断或无法提交。
- 定位 `input.d-text, input[placeholder*="标题"], #title-input`，用 `HTMLInputElement.prototype.value` 原生 setter 写入标题并派发 `input` / `change` 事件。

### 2.2 正文（TipTap ProseMirror 编辑器）
- 定位 `.tiptap.ProseMirror, [contenteditable="true"], .ql-editor, #post-content`。
- 聚焦后通过 `ClipboardEvent('paste')` 或 `human_type` 填入正文与 `#话题标签`，读回 `.innerText` 校验内容已落地。

---

## 3. 发布前截图确认与点击「发布」

1. **必须先调用 `browser_screenshot` 给用户看**，请用户确认配图顺序、标题、正文及账号无误。
2. 得到确认后，找到文本严格等于 `发布`（排除 `定时发布` 和 `暂存`）的 `<button>`，使用真实点击触发。
3. **成功核验**：轮询最多 10 秒，确认 `location.href` 出现 `published=true` 或页面提示「发布成功」。
