---
name: publish-fanqie
description: 在番茄小说作家后台（fanqienovel.com）上传小说封面或发布新章节，内置章节重名防呆核验、isTrusted 封面上传与发布前截图确认。当用户说「发番茄小说」「更新番茄章节」「上传番茄小说」「publish to Fanqie Novel」时使用。
when_to_use: 用户要在番茄小说作家专区（fanqienovel.com/main/writer）管理作品、上传封面或发布新章节时使用。
license: MIT
---

# 发布小说章节到番茄小说作家后台（fanqienovel.com）

## 0. 确认作家账号环境

用 `profile_list()` 确认番茄小说作家号所在的环境，打开或复用 `https://fanqienovel.com/main/writer/book-manage` 标签页。

---

## 1. 章节重名防呆校验（发布前必查！）

在网文连载场景中，重复发布同一章会严重打乱读者阅读顺序并触发后台审核异常。
进入目标作品的章节管理列表后，在新建章节前**必须先抓取页面已有的章节名列表做去重比对**：

```js
Array.from(document.querySelectorAll('.chapter-name-text')).map(el => el.innerText.trim())
```

如果待发布的章节标题已存在于列表中，**立即报错停手**，向用户确认是否章节号排重或已发过，绝不重复提交。

---

## 2. 封面上传：必须走 `browser_upload_trusted`

如果需要创建新书或更换作品封面：
- **踩坑记录**：番茄小说后台上传组件严格校验 `change` 事件的 `event.isTrusted` 属性。普通脚本注入文件**表面上没有报错，实际一个字节都没传上去**。
- **正确做法**：必须调用 `browser_upload_trusted(tab_id=<tab_id>, selector="input[type=file]", file_paths=["..."])`（底层走 Blink `SetFilesFromPaths`，`isTrusted=true`）。

---

## 3. 填写章节标题与正文

1. **章节标题**：定位章节标题输入框，填入章节号与标题，读回 `.value` 确认无误。
2. **章节正文**：定位正文编辑区，使用 `/api/v1/clipboard/paste`（或 `/api/v1/type`）灌入章节正文，并读回编辑器字数统计确认与源文字数一致。

---

## 4. 发布前截图确认与日更配额管理

1. **必须先调用 `browser_screenshot` 给用户确认**章节号、标题、字数与定时/立即发布设置。
2. 用户确认后点击发布按钮，并在章节管理列表中核实新章节已进入「已发布」或「审核中」状态。
