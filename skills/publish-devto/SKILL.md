---
name: publish-devto
description: 将英文 Markdown 技术文章发布到 Dev.to（Forem 平台），自动处理 User-Agent 防 403 拦截、Canonical URL 原文权重绑定与回读核验。当用户说「发 dev.to」「同步到 devto」「publish to Dev.to」时使用。
when_to_use: 用户要把英文技术博客或开源工具文章发布到 Dev.to（dev.to）时使用。
license: MIT
---

# 发布英文技术文章到 Dev.to（dev.to）

## 0. 为什么 Dev.to 优先走官方 Forem API

Dev.to 官方提供了完整的 REST API（`https://dev.to/api/articles`），直接接收原始 `body_markdown` 并支持绑定 `canonical_url`（将 SEO 权重指回你的个人官网/独立站），无需在浏览器里折腾富文本粘贴。

---

## 1. 准备 API Key 与检查 `canonical_url`

1. 从环境变量 `DEVTO_API_KEY` 或用户配置的密钥文件中读取 `api-key`（**绝不把密钥硬编码进仓库文件**）。
2. **`canonical_url` 的两条铁律**：
   - 只有当英文原文已经在你的独立站（如 `https://example.com/en/blog/<slug>/`）正式上线且返回 `HTTP 200` 时，才设置 `canonical_url`。
   - 如果独立站没有对应的英文页面，**不要传 `canonical_url`**——指向一个 `404` 地址比不设严重得多。

---

## 2. 发送请求（必须带自定义 `User-Agent`，否则直接 403！）

- **踩坑记录（2026-09-15 实测）**：用 Python `urllib.request` 调用 `POST https://dev.to/api/articles` 时，如果使用默认的 `Python-urllib/3.x` 请求头，Cloudflare/Forem 会**直接返回空响应体的 `HTTP 403 Forbidden`**！而同一个 `api-key` 调 `GET /api/users/me` 却完全正常，极易让人误以为是 Key 权限不够。
- **解法**：请求头必须显式带上自定义 `User-Agent` 和 `Accept: application/vnd.forem.api-v1+json`。

```python
import json, urllib.request

payload = {
    "article": {
        "title": title,
        "body_markdown": body_md,
        "published": True,   # 若需先存草稿给用户预览，设为 False
        "description": description,
        "tags": tags[:4],    # Dev.to 最多允许 4 个纯字母数字小写的 tag
    }
}
if canonical_url:
    payload["article"]["canonical_url"] = canonical_url
if main_image_url:
    payload["article"]["main_image"] = main_image_url

req = urllib.request.Request(
    "https://dev.to/api/articles",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "application/vnd.forem.api-v1+json",
        "User-Agent": "unzoo-publisher/1.0 (+https://unzoo.ai)",
    },
    method="POST",
)
```

---

## 3. 回读核验真实发布状态（别拿 `POST` 返回体里的 `published` 当判据！）

- **踩坑记录**：`POST /api/articles` 成功创建文章后返回的 JSON 里**没有 `published` 字段**！如果直接检查 `resp.get("published")` 会永远得到 `None`，把明明已经发布成功的文章误报为草稿/失败。
- **正确做法**：拿到返回的 `art_id = resp["id"]` 后，立即补发一次 `GET https://dev.to/api/articles/<art_id>`，在 `GET` 返回体里核对：
  1. `got.get("published") == True`
  2. `got.get("canonical_url") == canonical_url`（若设置了 `canonical_url`）
- 若遇到 `HTTP 429 Too Many Requests`，说明触发了 Dev.to 的发文频率限制（通常两篇之间需间隔数分钟），稍等片刻再重试。
