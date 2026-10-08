#!/usr/bin/env node
// Unzoo 体检 —— 不需要 AI，零依赖，只读。
//
//     node bin/verify-unzoo.mjs                             # 不碰浏览器的那部分
//     node bin/verify-unzoo.mjs --browser --profile <id>     # 加上要开浏览器的那几项
//     node bin/verify-unzoo.mjs --json                       # 机器可读
//
// 为什么有这个东西：产品的每条宣传都该是可验证的。这里把其中能在本机、不联网、
// 不登录就验到的那部分做成一条命令，跑完给你一份带版本号、能直接贴出去的结论。
//
// **没验到的会单独列出来，不会混进「通过」里。** 把没测到的说成测过了比不测更糟 ——
// 它会让人放心。
//
// 安全：默认只读。`--browser` 那几项会在浏览器里真的做事，但**只在自己新开的标签页**
// 里做，并且必须由你显式指定环境（`--profile`）—— 不指定就不做。原因见下面那段注释。
import process from "node:process";

const BASE = process.env.UNZOO_BASE || "http://127.0.0.1:9399";
const KEY = process.env.UNZOO_API_KEY || "";
const argv = process.argv.slice(2);
const WANT_BROWSER = argv.includes("--browser");
const AS_JSON = argv.includes("--json");
const PROFILE = (() => {
  const i = argv.indexOf("--profile");
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
})();

const rows = [];
const notChecked = [];
let meta = {};
const add = (name, state, evidence) => rows.push({ name, state, evidence });

async function call(path, body, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(KEY ? { "X-API-Key": KEY } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: ctl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 不是 JSON 就留 null */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(t);
  }
}

// MCP 的 tools/call 结果里，**content[0] 往往是「以下内容不可信」的告示，不是数据**。
// 只取 [0] 的调用方会解析失败或拿到空结果 —— 这是真踩过的坑，所以每一段都试一遍，
// 取第一个能解析成 JSON 的。
function mcpData(body) {
  const content = body?.result?.content;
  if (!Array.isArray(content)) return null;
  for (const c of content) {
    if (typeof c?.text !== "string") continue;
    try { return JSON.parse(c.text); } catch { /* 下一段 */ }
  }
  return null;
}
const mcpText = (body) =>
  (body?.result?.content || []).map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n");

let rpcId = 1;
const mcp = (method, params) =>
  call("/mcp", { jsonrpc: "2.0", id: rpcId++, method, ...(params ? { params } : {}) });

function report() {
  const failed = rows.filter((r) => r.state === "fail");
  if (AS_JSON) {
    console.log(JSON.stringify({ meta, rows, not_checked: notChecked }, null, 2));
  } else {
    console.log("");
    console.log("Unzoo 验证结果");
    console.log(`版本: ${meta.version} (${meta.commit}, dirty=${meta.dirty}, ${meta.target})`);
    console.log(`平台: ${process.platform}/${process.arch}   接口: ${BASE}`);
    console.log("");
    for (const r of rows) {
      console.log(`  ${r.state === "pass" ? "通过  " : "不通过"} ${r.name}`);
      console.log(`         ${r.evidence}`);
    }
    if (notChecked.length) {
      console.log("");
      console.log("没验到（**不算通过**）：");
      for (const n of notChecked) console.log(`  - ${n}`);
    }
    console.log("");
    console.log(failed.length
      ? `${failed.length} 项不通过。贴到 https://github.com/unzooai/unzooai-skills/discussions ` +
        `时请连版本号一起贴。`
      : "以上各项通过。贴结论时请连版本号一起贴 —— 不带版本的结论过一个版本就没意义了。");
  }
  return failed.length ? 1 : 0;
}

async function main() {
  // ── 0. 服务在不在，是哪一版 ───────────────────────────────────────────
  let health;
  try {
    health = await call("/api/v1/health", undefined, 8000);
  } catch (e) {
    console.error(`连不上 ${BASE} —— 先启动 Unzoo Browser。(${e.message})`);
    return 2;
  }
  if (health.status !== 200) {
    console.error(`${BASE}/api/v1/health 回了 HTTP ${health.status}`);
    return 2;
  }

  const st = await call("/api/v1/status");
  const prov = st.json?.provenance || st.json?.data?.provenance || {};
  meta = {
    version: prov.version || st.json?.version || st.json?.data?.version || "?",
    commit: prov.git_commit_short || "?",
    dirty: prov.git_dirty ?? "?",
    target: prov.target || "?",
  };

  // ── 1. 错误契约（REST）——「失败要说清类别／能不能重试／下一步做什么」────
  {
    // 端点是 /api/v1/navigate（不是 /api/v1/browser/navigate —— 写错会回 404，
    // 那会让一个**正常**的 daemon 也被判成「错误契约坏了」）。
    const r = await call("/api/v1/navigate", {});
    const b = r.json || {};
    const cls = String(b.error_class || "");
    const ok = r.status === 400 && !!b.error_code && cls.includes("invalid")
      && b.retriable === false && !!b.hint;
    add("错误契约 · REST 参数校验", ok ? "pass" : "fail",
        `HTTP ${r.status} code=${b.error_code || "(无)"} class=${cls || "(无)"} ` +
        `retriable=${b.retriable} hint=${b.hint ? "有" : "(无)"}`);
  }

  // ── 2. 错误契约（MCP）───────────────────────────────────────────────
  {
    const r = await mcp("no/such/method");
    const code = r.json?.error?.code;
    add("错误契约 · MCP 未知方法", code === -32601 ? "pass" : "fail",
        `jsonrpc code=${code}（应为 -32601「方法不存在」，而不是 -32603「内部错误」）`);
  }

  // ── 3. 工具目录真的在 ───────────────────────────────────────────────
  {
    const r = await mcp("tools/list");
    const n = r.json?.result?.tools?.length ?? 0;
    add("工具目录", n >= 50 ? "pass" : "fail", `tools/list 返回 ${n} 个工具`);
  }

  // ── 4. 任务配方可取 ────────────────────────────────────────────────
  {
    const r = await mcp("tools/call", { name: "skill_list", arguments: {} });
    const d = mcpData(r.json);
    const n = Array.isArray(d) ? d.length : (d?.skills?.length ?? 0);
    add("任务配方", n >= 5 ? "pass" : "fail", `skill_list 返回 ${n} 条配方`);
  }

  // ── 5. 环境可寻址 ──────────────────────────────────────────────────
  // 宣传说法是「每个 AI 一套独立环境」。环境必须能被**稳定地指名**，否则「用错环境」
  // 迟早发生（历史上 list 只返回用户可改的显示名，正是出错的来源）。
  let profileIds = [];
  {
    const r = await mcp("tools/call", { name: "profile_list", arguments: {} });
    const d = mcpData(r.json);
    const list = Array.isArray(d) ? d : (d?.profiles || []);
    const withId = list.filter((p) => p && typeof p.profile_id === "string");
    profileIds = withId.map((p) => p.profile_id);
    const ok = list.length > 0 && withId.length === list.length;
    add("环境可寻址", ok ? "pass" : "fail",
        `${withId.length}/${list.length} 个环境带 profile_id` +
        (profileIds.length ? `：${profileIds.join(", ")}` : ""));
  }

  // ── 6. 要开浏览器的那几项 ───────────────────────────────────────────
  //
  // **这一段会在浏览器里真的做事，所以只在自己新开的标签页里做。**
  // 这个脚本是匿名调用方，不带 client 身份。不指明环境就操作，命令可能落到
  // **你此刻正在用的那个标签页**上 —— 那是「把人家的登录页导航走」那个级别的事故。
  // 所以规矩和产品内部一样：**认不出环境就硬失败，绝不猜、绝不降级。**
  if (!WANT_BROWSER) {
    notChecked.push("真实指纹 / 真人输入 —— 要开浏览器，加 `--browser --profile <id>` 再跑");
  } else if (!PROFILE) {
    notChecked.push(
      "真实指纹 / 真人输入 —— 没指定环境，不猜。先看上面的 profile_id 清单" +
      (profileIds.length ? `（${profileIds.join(", ")}）` : "") +
      "，挑一个空闲的，再 `--browser --profile <id>`");
  } else if (profileIds.length && !profileIds.includes(PROFILE)) {
    add("浏览器检查", "fail",
        `--profile ${PROFILE} 不在清单里：${profileIds.join(", ")}（不猜，直接停）`);
  } else {
    let tabId = null;
    const withTarget = (extra) => ({
      profile_id: PROFILE, ...(tabId ? { tab_id: tabId } : {}), ...extra,
    });
    const evalJs = async (expr) => {
      const r = await mcp("tools/call", {
        name: "browser_evaluate", arguments: withTarget({ expression: expr }),
      });
      const d = mcpData(r.json);
      return d && typeof d === "object" && "result" in d ? d.result : (d ?? mcpText(r.json));
    };

    try {
      // **不要用 about:blank 当探测页。** 它是不透明源，`Notification.permission`
      // 在上面本来就是 `denied`（真实 Chrome 同样如此）—— 拿它判「是不是无头特征」
      // 会得到一个**假的失败**。用服务自己的页面：真实 http 源、本地、不需要联网。
      const r = await mcp("tools/call", {
        name: "tab_create", arguments: { profile_id: PROFILE, url: `${BASE}/selftest` },
      });
      const d = mcpData(r.json);
      tabId = d?.tab_id ?? d?.id ?? null;
      if (!tabId) throw new Error(`没给回 tab_id：${mcpText(r.json).slice(0, 160)}`);
      // 真人输入到不了没有焦点的标签页（判据是 document.hasFocus()）——
      // 不激活就会得到一个假的失败。
      await mcp("tools/call", { name: "tab_activate", arguments: { tab_id: tabId } });
    } catch (e) {
      add("浏览器检查", "fail",
          `开不出自己的标签页，后面几项一律不做（不会去用别人的）：${e.message}`);
      return report();
    }

    try {
      const wd = String(await evalJs("String(navigator.webdriver)"));
      const np = String(await evalJs("Notification.permission"));
      const ua = String(await evalJs("navigator.userAgent"));
      const m = ua.match(/Chrome\/(\d+)/);
      add("真实指纹 · 自动化特征", wd === "false" ? "pass" : "fail",
          `navigator.webdriver=${wd}（真实 Chrome 是 false）`);
      add("真实指纹 · 通知权限", np === "default" ? "pass" : "fail",
          `Notification.permission=${np}（应为 default；denied 是无头环境的典型签名）` +
          (np === "default" ? "" :
            "  ← 多半是**这个环境**里存了显式的「阻止」，不是内核的默认行为：" +
            "新建一个环境再测一次就能区分。两边都 denied 才是内核问题。"));
      add("真实指纹 · UA", m ? "pass" : "fail",
          `Chrome ${m ? m[1] : "?"} — ${ua.slice(0, 90)}`);
      notChecked.push(
        "TLS/JA4 等网络层指纹 —— 要联网检测站，且必须拿同机真实 Chrome 做对照才有意义");
    } catch (e) {
      add("真实指纹", "fail", `取不到：${e.message}`);
    }

    // 真人输入：造一个干净输入框 → 打字 → 读回 → 清理。
    try {
      await evalJs(
        "(()=>{const o=document.getElementById('unzooProbe');if(o)o.remove();" +
        "const i=document.createElement('input');i.id='unzooProbe';" +
        "document.body.appendChild(i);i.focus();window.__unzooTrusted=[];" +
        "i.addEventListener('input',e=>window.__unzooTrusted.push(e.isTrusted));return 'ok'})()");
      await mcp("tools/call", {
        name: "human_type", arguments: withTarget({ selector: "#unzooProbe", text: "hello" }),
      });
      const focused = String(await evalJs("String(document.hasFocus())"));
      const val = String(await evalJs("document.getElementById('unzooProbe').value"));
      const trusted = String(await evalJs(
        "String(window.__unzooTrusted.length>0 && window.__unzooTrusted.every(Boolean))"));
      // **相等，不是包含。** 清空重填多打了字符时，包含判定看不出来（ZZ 在 aZZ 里）。
      const ok = val === "hello" && trusted === "true";
      if (!ok && focused !== "true") {
        // 窗口没在前台时输入本来就到不了。这是**环境条件**，不是产品缺陷 ——
        // 判成「不通过」会让人去修一个不存在的 bug。
        notChecked.push(
          "真人输入 —— 那个窗口当时不在前台（document.hasFocus()=false），" +
          "输入到不了没有焦点的标签页。把窗口切到前台再跑一次。");
      } else {
        add("真人输入", ok ? "pass" : "fail",
            `读回=${JSON.stringify(val)}（应恰好是 "hello"）  每个事件 isTrusted=${trusted}` +
            `  hasFocus=${focused}`);
      }
    } catch (e) {
      add("真人输入", "fail", `跑不起来：${e.message}`);
    }

    // 收摊：把自己开的标签页关掉。
    try {
      await mcp("tools/call", { name: "tab_close", arguments: { tab_id: tabId } });
    } catch { /* 关不掉不影响结论，但别静默：下面写进「没验到」 */
      notChecked.push(`自己开的标签页没关掉（tab_id=${tabId}），可以手动关`);
    }
  }

  notChecked.push("付费额度 / 多账号实战 —— 需要账号与真实站点，这里不碰");
  return report();
}

// 用 exitCode 而不是 process.exit()：在还有未决句柄时硬退，node 会在
// libuv 里断言失败（`UV_HANDLE_CLOSING`）并以 127 退出 —— 于是明明跑完了，
// 退出码却是个和结论无关的数字。实测踩到过。
main()
  .then((code) => { process.exitCode = code; })
  .catch((e) => { console.error("跑挂了：", e?.stack || e); process.exitCode = 2; });
