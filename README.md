# MD 阅读器 · Markdown Reader

[English](#english) | [中文](#chinese)

---

<h2 id="english">English</h2>

A lightweight, multi-tab Markdown editor built with Electron. Supports WYSIWYG editing, real-time preview, syntax highlighting, and cross-platform packaging.

### Features

- **Multi-tab editing** — Open multiple `.md` files simultaneously, each in its own tab
- **Edit / Preview toggle** — Switch between plain-text editing with syntax highlighting and rendered preview
- **Editable preview** — Click directly into the preview view to edit rendered content
- **Syntax highlighting** — Headings, bold, italic, code blocks, links, lists with Markdown-aware coloring
- **Keyboard shortcuts** — `Ctrl/Cmd+B` bold, `Ctrl/Cmd+I` italic, `Ctrl/Cmd+K` link, `Ctrl/Cmd+L` list
- **File operations** — New, Open, Save, Save As via menu; drag & drop `.md` files to open
- **Tab context menu** — Right-click tabs to Close, Save, or Show in Finder/Explorer
- **Zoom control** — Zoom in/out 50%–200% for comfortable reading
- **White theme** — Clean light background design
- **Cross-platform** — macOS `.dmg` + Windows `.exe` (NSIS installer)

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop framework | Electron |
| Text editor | CodeMirror 6 |
| Markdown rendering | markdown-it |
| HTML → Markdown | Turndown |
| Packaging | electron-builder |

### Quick Start

```bash
npm install
npm start
```

### Build

Automatically built via GitHub Actions on push:

- **macOS**: `MD阅读器-x.x.x-arm64.dmg`
- **Windows**: `MD阅读器 Setup x.x.x.exe`

Or build locally:

```bash
npm run build
```

### Project Structure

```
ai_md/
├── main.js              # Electron main process
├── preload.js           # Preload script
├── renderer/
│   ├── index.html       # UI layout
│   ├── style.css        # Stylesheet
│   └── editor.js        # Editor logic + tab management
├── build/
│   └── icon.png         # App icon
├── .github/workflows/   # CI/CD
└── package.json
```

---

<h2 id="chinese">中文</h2>

一款基于 Electron 构建的轻量级多标签 Markdown 编辑器，支持 WYSIWYG 编辑、实时预览、语法高亮和跨平台打包。

### 功能特性

- **多标签编辑** — 同时打开多个 `.md` 文件，每个文件独立标签页
- **编辑 / 预览切换** — 在纯文本编辑（语法高亮）和渲染预览之间自由切换
- **可编辑预览** — 在预览视图中直接点击编辑渲染后的内容
- **语法高亮** — 标题、粗体、斜体、代码块、链接、列表等 Markdown 语法着色
- **快捷键** — `Ctrl/Cmd+B` 加粗、`Ctrl/Cmd+I` 斜体、`Ctrl/Cmd+K` 链接、`Ctrl/Cmd+L` 列表
- **文件操作** — 菜单新建/打开/保存/另存为；支持拖拽 `.md` 文件打开
- **标签右键菜单** — 右键标签可关闭、保存、在 Finder/资源管理器中显示
- **缩放控制** — 50%–200% 缩放，适配不同阅读需求
- **白色主题** — 简洁明亮的界面设计
- **跨平台** — macOS `.dmg` + Windows `.exe`（NSIS 安装包）

### 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron |
| 文本编辑器 | CodeMirror 6 |
| Markdown 渲染 | markdown-it |
| HTML → Markdown | Turndown |
| 打包工具 | electron-builder |

### 快速开始

```bash
npm install
npm start
```

### 构建

通过 GitHub Actions 自动构建：

- **macOS**：`MD阅读器-x.x.x-arm64.dmg`
- **Windows**：`MD阅读器 Setup x.x.x.exe`

或本地构建：

```bash
npm run build
```

### 项目结构

```
ai_md/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── renderer/
│   ├── index.html       # 界面布局
│   ├── style.css        # 样式表
│   └── editor.js        # 编辑器逻辑 + 标签管理
├── build/
│   └── icon.png         # 应用图标
├── .github/workflows/   # CI/CD
└── package.json
```
