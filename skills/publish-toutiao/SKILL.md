---
name: publish-toutiao
description: 在今日头条号（mp.toutiao.com）发布图文长文，自动处理旧草稿清理、富文本粘贴与小标题分隔线优化、封面自动抓取等待与「编辑替换」原图尺寸匹配、头条首发勾选控制，以及发布后可见性档位（vis=40）自检。当用户说「发今日头条」「发头条号」「publish to Toutiao」时使用。
when_to_use: 用户要把文章发布到今日头条创作平台（mp.toutiao.com）时使用。支持「头条首发线」（勾选头条首发、仅发头条）与「全平台线」（不勾头条首发、防假首发扣信用分）两种模式。
license: MIT
---

# 发布图文长文到今日头条（mp.toutiao.com）

## 0. 确认账号环境与两条内容线（绝对不能混）

1. 先用 `profile_list()` 确认今日头条已登录的浏览器环境，绝不盲猜账号。
2. **发布前必须明确本篇属于哪条线**：
   - **头条首发线（`toutiao-first`）**：只在今日头条发布，永不外发其他平台 → **勾选「头条首发」**。
   - **全平台分发线（`all`）**：同时或稍后要发公众号、知乎、掘金、官网等 → **绝对禁止勾选「头条首发」**！一旦外网有同文却勾了首发，会被头条机器判「假首发」直接扣 5 分信用分。
   - **先后顺序铁律**：全平台线的文章如果需要发头条，**必须先在头条发出、等 5～10 分钟过审拿到 `vis=40` 正常推荐档位后，再分发到其他外部平台**；否则头条爬虫先在站外抓到同文，会直接把头条这篇打进 `vis=15` 压流冷宫。
3. **多篇发布的节奏铁律**：同一账号在今日头条发多篇时，**每两篇之间必须间隔至少 20～30 分钟（≥ 1200 秒）**，严禁几分钟内连续密集点发布。

---

## 1. 打开图文发布页并清理残留旧草稿

导航到：
```
https://mp.toutiao.com/profile_v4/graphic/publish
```

等待 `.ProseMirror[contenteditable=true]` 和 `textarea[placeholder*="标题"]` 全部挂载后，**第一步必须检查并丢弃未完成的旧草稿提示**：

- **为什么**：如果上一次发布留下了未完成草稿，页面顶部会弹出提示框。如果不清除，很容易把上一篇的残留内容或错封面发出去。
- **注意按钮文案**：新版头条按钮写的是 **「清除草稿」**（容器 `.draft-btns` 或 `.publish-draft-tip-content`），不是「放弃」。找到文本为 `清除草稿` / `放弃` / `取消` 的按钮，派发 `mousedown` → `mouseup` → `click` 丢弃旧草稿。

---

## 2. 灌入正文（自动补 `<hr/>` + `CF_HTML` Trusted Paste + 格式核验）

### 2.1 小标题视觉层次增强（`<hr/>` 注入）
今日头条会把正文里的 `<h2>` 转成 `h1.pgc-h-forward-slash`（字号 `19px`，而正文是 `18px`，只大 1 个像素，读者扫过去完全看不出章节层次），且 `<blockquote>` 在头条上无边框无底色。
**实测唯一能拉开视觉层次的是 `<hr/>`（1px 灰线 + 20px 上下留白）**：
在灌入 HTML 前，用正则给除第一个以外的所有 `<h2` 前面自动补一条 `<hr/>`：
```python
html = re.sub(r"(?<!\A)<h2\b", "<hr/><h2", html)
```

### 2.2 粘贴正文与双守卫核验
1. 等 `textarea[placeholder*="标题"]` 渲染出来后再等 2 秒（此时整页才真正初始化完毕，太早粘贴会被 ProseMirror 吞掉只剩几个字）。
2. 用 `CF_HTML` 写入系统剪贴板 + `activate(tab)` + 聚焦 `.ProseMirror[contenteditable=true]` + 调用 `/api/v1/clipboard/paste`（若失败再退回 `DataTransfer('text/html')` 合成 `paste` 事件）。
3. **双守卫核验（缺一不可）**：
   - **字数守卫**：读回 `.ProseMirror.innerText` 去空白后的纯文本长度，必须 `>= 200` 且 `>= 源文纯文本长度 * 0.6`（⚠️基准必须用去标签后的纯文本算，别拿含 HTML 标签的源码长度比）。
   - **格式守卫**：统计编辑器内的 `querySelectorAll('h1,h2,h3,h4').length` 和 `querySelectorAll('strong,b').length`。如果源文有小标题和加粗，而编辑器里变成 `0`，说明剪贴板退化成了纯文本——**立刻判失败中止，绝不发没有格式的裸文**。

---

## 3. 写入标题（必须排在正文之后，且严格 ≤ 30 字）

- **为什么排在正文之后**：页面刚加载时，标题框的 React 状态往往比正文晚一拍就绪；先填正文再填标题，成功率 100%。
- **选择器要精确**：只选 `textarea[placeholder*="标题"]`，**不要用宽泛的 `textarea` 兜底**（右侧「头条创作助手」里也有 `textarea` 且在 DOM 更靠前，宽泛选择器会写错地方）。
- **长度红线**：今日头条标题严格 **≤ 30 个字**（推荐 22～29 字），超长会导致发布按钮静默失效且不报错。
- 使用 `HTMLTextAreaElement.prototype.value` 原生 setter 写入并触发 `input` / `change` 事件，随后读回 `.value` 校验与目标标题完全一致。

---

## 4. 挂载展示封面（最容易踩坑的一步，按此黄金流程走）

### 4.1 封面预处理与本地路径要求
- 如果封面图片 `> 400KB`，先用 Pillow 压缩成 `width <= 1600, quality=85` 的 JPEG（大图在头条 CDN 上传极易出现红色「上传失败」条）。

### 4.2 先等头条抓完正文插图，再走「编辑替换」
- **致命陷阱**：当正文包含内文插图时，头条后台会异步抓取正文图片并自动塞满底部的封面槽。如果你在它抓取完成前急着从 `.article-cover-add`（空槽入口）上传封面，等你刚传完，头条的正文抓取恰好结束，**会反手用正文插图把你刚传的封面覆盖掉！**
- **正确做法**：
  1. 若正文有图，先轮询 `.article-cover` 里的 `img`（`src` 含 `image-tt|byteimg|pstatp`），最多等 ~24 秒让自动填充先落定。
  2. 打开封面抽屉 `.byte-drawer`：
     - 若封面槽为空，点击 `.article-cover-add`（`add` 入口）；
     - 若已被正文图填满，在 `.article-cover` 内找到文本为 `编辑替换` / `替换` / `更换封面` 的元素并派发 `mousedown` → `mouseup` → `click`（`replace` 入口）。
  3. **硬校验 `.byte-drawer` 已打开**（未打开绝不往下走，否则后续选缩略图会误点正文插图）。

### 4.3 切到「上传图片」Tab → 上传 → 按原图像素尺寸精确认领
1. **先切换 Tab 再上传**：「编辑替换」打开的抽屉默认停在「本地图片」Tab，直接调 `upload` 石沉大海。必须先在 `.byte-drawer` 里找到 `[class*=tabs-header-title]` 文本为 `上传图片` 的表头，派发 `mousedown` → `mouseup` → `click` 切过去。
2. 调用 `/api/v1/upload` 传入封面文件，轮询抽屉内可见且无 `.error` 报错条的缩略图数量 `>= 1`（若存在带 `.error` 的失败项，先点 `.image-item-remove` 删掉再重传）。
3. **按原图尺寸或 `from=image_upload` 认领缩略图**：
   「上传图片」Tab 里可能混有正文转存图，刚上传的封面不一定排第一（`ims[0]` 启发式不成立）。读取本地封面文件的 `naturalWidth × naturalHeight`，在 `.byte-drawer` 内匹配尺寸一致或 `src` 含 `from=image_upload` 的缩略图，在其 `.img-wrap` 上派发合成点击选中它。
4. 在 `.byte-drawer` 内找到文本为 `确定` 的按钮并派发合成点击（⚠️ 不要加 `x < window.innerWidth` 的视口过滤，抽屉是横向滚动容器，`确定` 的 `x` 坐标常落在 `2700+`）。
5. **切回「单图」模式并核验 `image-tt-private`**：
   抽屉关闭后，在 `.article-cover` 点击 `单图`，并校验 `.article-cover img[0]` 的 `src` 包含 `image-tt-private`（用户主动上传的私有域，而非正文自动抓取域）且 `naturalHeight` 与本地封面高度一致。

---

## 5. 精确控制「头条首发」复选框

头条首发的控件结构是 ByteDesign 的 `label.byte-checkbox`（内含隐藏 `input` + 视觉方块 `.byte-checkbox-mask` + 文本 `头条首发`）：
- **读取状态**：检查 `label.byte-checkbox` 是否包含 `byte-checkbox-checked` 类名（或内部 `input.checked`）。
- **切换状态**：在 `label.querySelector('input') || label` 上派发 `mousedown` → `mouseup` → `click`，**等待 1.2 秒让 React 重渲染后再读回**（若合成事件点不动，用 `/api/v1/input/click` OS 级点击，但点前必须用 `document.elementFromPoint(x, y)` 确认坐标下确实是该 `label`）。
- **硬性拦截**：如果本篇是全平台线（`want_first = False`），但读回状态仍然是 `checked`（注意用 `state == 'checked'` 精确判断，别用 `.endswith('checked')` 因为 `'unchecked'` 也以 `'checked'` 结尾！），**必须立刻中止发布**，绝不带着假首发上线。

---

## 6. 发布前截图确认与两步提交（「预览并发布」→「确认发布」）

1. **发布前先调用 `browser_screenshot` / `/api/v1/screenshot` 给用户确认**（核对标题、封面、首发勾选状态）。
2. 今日头条底部的 `预览并发布` 与弹窗里的 `确认发布` 都是 React 受控按钮，合成坐标点击偶发失灵，统一在匹配按钮上直接派发 `['mousedown','mouseup','click']` + `.click()`。
3. 点击 `确认发布` 后，轮询最多 60 秒：当 `location.href` 跳转到 `/profile_v4/graphic/articles` 或页面出现 `审核中` / `已发布` / `发布成功` 即代表发布成功。

---

## 7. 发布后作品可见性档位（`visibilityLevel` / `vis`）体检

今日头条后台接口 `/api/feed/mp_provider/v1/` 返回的每篇作品都带有一个隐藏字段 `articleBase.visibilityLevel`（简称 `vis`）：
- **`vis = 0`**：刚发出几分钟内还在审核定档，属正常现象，过 5～15 分钟再复核。
- **`vis = 40`**：**正常推荐档**（真正进入公域冷启动推荐池，所有爆款均出自 `vis=40`）。
- **`vis = 15`**：**低可见度/压流档**（展现极低，通常因站外同文先发、高频连发、或敏感词触发机器风控）。一旦发现连续出现非 `40` 档位，应立即暂停日更排查原因，切勿盲目硬发。
