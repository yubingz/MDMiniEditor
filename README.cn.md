# MDMiniEditor

Windows 平台极简离线 Markdown 阅读器**兼编辑器** —— 一个 HTML 文件加少量启动脚本。无构建步骤、无运行时依赖：打开即用，联网与否都能跑。

[English README](./README.md)

---

## 功能

- 打开 / 拖拽 `.md` 文件
- GFM：标题、列表、任务列表、表格、代码块、引用
- 图片：`![alt](fig/图.png)` 正常渲染，路径相对文档解析
- 内联 SVG 图形：```svg 代码块或直接粘贴的 `<svg>…</svg>` 会渲染成图形，按固定元素/属性白名单清洗
- LaTeX 公式（`$行内$` / `$$行间$$`），优先 KaTeX，离线自动回退
- 编辑窗 + 实时预览，`预览 / 编辑 / 分栏` 三态切换
- 分栏视图：左右或上下并排，中间分隔条可拖动
- 分栏双向同步：编辑器与预览滚动互随；选中源码高亮对应块；点击预览块定位编辑器
- 保存：`Ctrl+S` 覆盖写入当前打开的文件——即使是通过双击打开（启动器会启一个仅本机回环、带令牌的写入服务）；`Ctrl+Shift+S` 另存为，弹出带文件名的保存对话框
- 侧边目录
- 深色 / 浅色主题
- 字号调节
- 打印 / 导出 PDF
- 本地读取，不上传内容

### 公式说明

- 联网时使用 [KaTeX](https://katex.org/)
- 离线时使用内置回退（希腊字母、上下标、求和、分式等）
- 公式在 Markdown 解析前抽取，不会被 `_斜体_` 规则拆散
- 源码中的 `\\le` 等双反斜杠会自动归一为 `\le`

---

## 快速开始（Windows）

1. 下载并解压本目录
2. 双击 **`Open-Editor.bat`**：弹出文件选择框，选中 `.md` 即在阅读器中打开（有 Edge/Chrome 时为应用模式）；取消选择则打开空阅读器
3. 把 `.md` 文件拖进窗口，或点击「打开」，可切换文档

打开指定文件：

```bat
Open-MD-File.bat "C:\path\to\your.md"
```

或将 `your.md` 拖到 **`Open-MD-File.bat`** 上。

### 浏览器直接打开

双击 `md-editor.html`，或使用 `file://` 地址打开。

---

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存（覆盖当前打开的文件） |
| `Ctrl+Shift+S` | 另存为（打开保存对话框） |
| `Ctrl+Shift+L` | 切换主题 |
| `Ctrl+=` / `Ctrl+-` | 字号增大 / 减小 |
| `Ctrl+0` | 恢复默认字号 |

---

## Markdown 与公式语法

```markdown
# 标题

**加粗**、*斜体*、`代码`、~~删除线~~

- [x] 已完成
- [ ] 待办

| 列 | 值 |
| --- | ---: |
| A | 1 |

> 引用

行内公式：$N,K$、$\sigma_{(u,k)}^2$

行间公式：

$$
F_a=\sum_{k=1}^{K} a_k F_k
$$

内联 SVG（```svg 代码块，或直接粘贴 `<svg>` 块）：

```svg
<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>
```
```

---

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `md-editor.html` | 主阅读器 |
| `Open-Editor.bat` | 启动阅读器；双击时弹出文件选择框 |
| `Open-MD-File.bat` | 通过拖拽、命令行或文件关联打开 `.md` |
| `open-md.ps1` | 生成阅读页面并调用浏览器，两个启动器共用 |
| `katex/` | 随包分发的 KaTeX 0.16.11（JS、CSS、字体），启动器把它内联进页面，公式离线也能排版。MIT 许可，改阅读器时用不到 |
| `.gitattributes` | 保证 `*.html` 与启动脚本为 CRLF，其余文件正常归一化 |
| `.gitignore` | 把本地构建、日志与编辑器临时文件挡在仓库外 |
| `sample.md` | 示例文档 |
| `README.md` | 英文说明 |
| `README.cn.md` | 本文（中文说明） |
| `LICENSE` | MIT 许可证 |
| `CHANGELOG.md` | 更新日志 |

---

## 可选：双击打开 `.md`

Windows 10/11：

1. 右键 `.md` 文件 →「打开方式」→「选择其他应用」
2. 勾选「始终使用此应用」，浏览并选择 `Open-MD-File.bat`（或其快捷方式）
3. 若当前系统无法直接选择 `.bat`，可继续用拖到 `Open-MD-File.bat` 的方式

> 能否关联 `.bat` 与 Windows 版本有关；拖拽方式始终可用。

---

## 运行环境

- 推荐 Windows 10/11
- 可选 Microsoft Edge / Google Chrome（应用模式）
- 日常使用无需安装 Node.js / Python / 安装包
- 网络可选：启动器会把随包的 KaTeX 内联进每个阅读页面，公式离线也能正常排版。直接打开 `md-editor.html` 时，则优先用同目录的 `katex/`，其次才是 jsDelivr
- 内联会让每个生成的页面大约多 292 KB。启动前设 `MDR_NO_INLINE_KATEX=1` 可关闭内联，页面保持小体积，此时阅读器从自己的目录加载 `katex/`

---

## 隐私

- 仅在本地读取文件
- 无遥测、无上传
- 通过启动器打开文档时，公式由随包的 `katex/` 排版，不产生任何外部请求
- 不经启动器、直接打开 `md-editor.html`，且随包副本不可用时，才会回退到 jsDelivr CDN

---

## 开发

```bash
node --test        # 解析器与启动器打包测试（test/*.test.mjs，无依赖）
```

手动检查：

```bat
Open-Editor.bat
```

然后选择或拖入 `sample.md`。

启动脚本必须保持 CRLF 换行。cmd.exe 会把 LF 换行的批处理按错误的边界拆行，导致每一行都报 `'xxx' 不是内部或外部命令`。`.gitattributes` 在检出时保证这一点，`node --test` 会在它失效时直接报错。

---

## 版权

MIT 许可证，详见 [LICENSE](./LICENSE)。

Copyright (c) 2026 MDMiniEditor Contributors.

---

## 致谢

- Markdown：自研轻量解析
- 公式：[KaTeX](https://katex.org/) 0.16.11，随包分发于 `katex/`（MIT）+ 离线回退
