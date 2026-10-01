# 晒被气象指数 · 网页版（GitHub Pages）

纯前端，手机浏览器打开即可。**无需注册、无需登录**。多人用不同手机同时打开同一链接即可各自计算。

## 本地预览

在本目录起一个静态服务，例如：

```bash
cd web
python -m http.server 8080
```

浏览器打开 `http://127.0.0.1:8080/`。

## 发布到 GitHub Pages（推荐）

### 方式 A：单独仓库（最简单）

1. 在 GitHub 新建空仓库，例如 `quilt-airing-index`
2. 把本目录 `web/` 里的**全部文件**推到仓库**根目录**（不要多一层 `web` 文件夹）
3. 仓库 Settings → Pages → Source 选 `Deploy from a branch` → Branch 选 `main` / `/ (root)` → Save
4. 几分钟后访问：`https://你的用户名.github.io/quilt-airing-index/`

### 方式 B：本仓库子目录

若仓库已有其它内容，可把 `web/` 作为 Pages 根：

- Settings → Pages → 选 `main` 分支、`/web` 文件夹  
  或使用 `docs/`：把 `web` 改名为 `docs` 后选 `/docs`

## 使用说明

- 各手机扫码或点开同一 GitHub Pages 链接即可
- 「最近计算」存在**各自手机浏览器**的 localStorage，不会云端同步
- 需要联网（Open-Meteo 预报、RainViewer 雷达、Blitzortung 闪电 WebSocket）
- 雷达图可勾选「实时闪电」，并用「范围」选择：**附近 / 全球 / 全国 / 各省（市）**
- 闪击⚡符号**不参与指数**；省界为大致矩形范围，非精确行政区划边界
- 全球模式会限制图上闪击数量，减轻手机卡顿
- 雷达底图优先 Esri；国内若慢可换网络后再试

## 与桌面 EXE 的关系

算法规则与桌面版一致；网页版不依赖本机 Python 服务。
