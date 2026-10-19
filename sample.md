# Sample / 示例文档
# MDMiniEditor demo / 极简 Markdown 阅读器演示

This is a **Markdown** sample with LaTeX math.  
这是一份含 LaTeX 公式的 **Markdown** 示例。

## Notation / 记号

| Symbol 符号 | Meaning 含义 |
| --- | --- |
| $N,K$ | Number of clients / clients per round; $d$ model dim. / 终端总数、每轮参与数；$d$ 模型维度 |
| $\tau,\eta$ | Local steps / learning rate. / 本地步数、学习率 |
| $F_k,F_a$ | Local objective / weighted objective $F_a=\sum_k a_k F_k$ / 本地目标、加权目标 |
| $\sigma_{(u,k)}^2,\sigma_{(d,k)}^2$ | Uplink/downlink noise variance per dim. / 上行、下行噪声每维方差 |
| $\rho_k$ | Directional asymmetry $\rho_k=\sigma_{(u,k)}^2/\sigma_{(d,k)}^2$ / 方向不对称比 |
| $\Psi$ | Directional hazard ratio. / 方向危害比 |

## Inline & display math / 行内与行间公式

Inline / 行内: $F_a=\sum_{k=1}^{K} a_k F_k$ and $\sigma_{(u,k)}^2$.

With escaped backslashes (as in many exports) / 含 `\\` 转义（常见于导出）:

且 $\\C_{\tau,k}\\|2\\le c\tau^{+}:=\max\Big\{1-\eta\lambda_{\max}\}^\tau,\; \big(1+\eta\max\{-\lambda_{\min},0\}\big)^{\tau-1}\Big\}$。

Display / 行间:

$$
\Psi=\dfrac{\text{下行噪声贡献}}{\text{上行噪声贡献}}
$$

$$
\min_{w}\; \frac{1}{N}\sum_{i=1}^{N}\ell(f(x_i;w),y_i)+\lambda\|w\|_2^2
$$

## Checklist / 功能清单

- [x] Drag & drop `.md` / 拖拽打开
- [x] GFM tables & tasks / 表格与任务列表
- [x] LaTeX math `$...$` / `$$...$$`
- [x] Dark / light theme / 深浅色主题

## Code / 代码

```python
def hello(name: str) -> str:
    return f"Hello, {name}! / 你好，{name}！"
```

## Inline SVG / 内联 SVG

A fenced ```` ```svg ```` block renders as a figure / ```` ```svg ```` 代码块会渲染成图形:

```svg
<svg viewBox="0 0 120 60" width="240"><rect x="4" y="4" width="112" height="52" rx="6" fill="#eef"/><circle cx="60" cy="30" r="16" fill="#58f"/></svg>
```

The same figure pasted as a top-level `<svg>` block renders identically / 直接粘贴顶层 `<svg>` 块效果相同:

<svg viewBox="0 0 120 60" width="240"><rect x="4" y="4" width="112" height="52" rx="6" fill="#efe"/><polygon points="60,10 100,50 20,50" fill="#3a5"/></svg>

> Tip / 提示: `$` inside code blocks is not treated as math.  
> 代码块中的 `$` 不会被当作公式。
