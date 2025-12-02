# Univer Sheet Editor.js Tool 测试页

本目录下的测试文件基于 `/QNotes/test` 中的 Editor.js 功能测试页面简化/移植，并用于验证 **Univer 表格 BlockTool（@editorjs/univer-sheet）**。

## 文件说明

- `editor-test-simple.html` - 使用 CDN 加载 Editor.js + 常用工具，并通过本地构建的 `univer.umd.js` 测试 Univer 表格工具
- `editor-test.js` - 简化版测试脚本，初始化 Editor.js、注册 `UniverSheet` 工具，并支持保存/加载内容
- `editor-test.css` - 测试页面样式（复用 QNotes 测试页的布局与样式）

## 使用方法

1. 在 `PlugIns/editorjs-univer` 目录下安装依赖并构建：

   ```bash
   npm install
   npx --yes vite build
   ```

2. 用浏览器直接打开 `test/editor-test-simple.html`（本地文件即可）。
3. 点击“初始化编辑器”，确认：
   - Editor.js 能正常初始化；
   - 工具栏菜单中可以插入 “Univer 表格” 类型的块；
   - 初次插入该块时，会自动创建一个空表格并自动弹出全屏编辑 overlay；
   - 在全屏表格中编辑后点击“保存并关闭”，再次点击 “保存内容” 可以在右侧看到包含 `univerSheet` 块及其 `univerData` 数据的 JSON 输出。

## 注意事项

- `editor-test-simple.html` 通过 `<script src="../dist/univer.umd.js"></script>` 引入本地构建产物，请先执行构建命令。
- 如果网络环境无法访问 jsDelivr/CDN，可将 Editor.js 及其工具的脚本改为本地路径再测试。


