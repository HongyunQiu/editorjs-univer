## @editorjs/univer-sheet

一个基于 **Univer.js Sheets** 的 Editor.js Block Tool，用于在 Editor.js 中**内嵌编辑电子表格**，并支持一键“页面内全屏”编辑。

> 本仓库为 QNotes 插件工程中的 `PlugIns/editorjs-univer` 子项目，对外以 npm 包 `@editorjs/univer-sheet` 的形式发布使用。

---

## 功能特性

- **内嵌表格编辑**：在 Editor.js 的块中直接渲染 Univer Sheets，小表格随文档一起排版。
- **筛选 UI**：支持 Univer Sheets 的自动筛选，可直接通过工具栏按钮与列头筛选入口进行条件筛选。
- **页面内全屏**：块右上角提供“全屏/退出全屏”按钮，切换到铺满视口的表格编辑模式（非浏览器 F11 全屏）。
- **自动快照保存**：内部定期导出 `Workbook.getSnapshot()`，自动更新 `data.univerData`，确保 `editor.save()` 时拿到的是最新表格数据。
- **数据可序列化**：表格数据通过 JSON（`univerData`）与上层系统交互，可持久化到任意存储。
- **与 Editor.js 深度集成**：遵循 BlockTool 规范，实现 `render / save / validate / sanitize` 等接口。

> 关于内嵌渲染与快照方案的技术细节，可参考 `doc/univer-sheet-inline-notes.md`。

---

## 安装

在你的 Editor.js 项目中安装依赖（需要同时安装 Univer 相关包）：

```bash
npm install @editorjs/univer-sheet \
  @univerjs/core @univerjs/design @univerjs/docs @univerjs/docs-ui \
  @univerjs/engine-formula @univerjs/engine-render \
  @univerjs/sheets @univerjs/sheets-ui \
  @univerjs/sheets-filter @univerjs/sheets-filter-ui \
  @univerjs/sheets-formula @univerjs/sheets-formula-ui \
  @univerjs/sheets-numfmt @univerjs/sheets-numfmt-ui \
  react react-dom rxjs
```

或使用 `pnpm` / `yarn` 等包管理器按需替换命令。

---

## 在 Editor.js 中使用

### 1. 通过打包工具（ESM）引入

```ts
import EditorJS from '@editorjs/editorjs';
import UniverSheetTool from '@editorjs/univer-sheet';

const editor = new EditorJS({
  holder: 'editorjs',
  tools: {
    univerSheet: {
      class: UniverSheetTool,
      inlineToolbar: false,
      config: {
        title: 'Univer 表格',
        openButtonText: '全屏',
      },
    },
  },
});
```

### 2. 通过 UMD（`dist/univer.umd.js`）在浏览器中直接使用

构建后会暴露全局变量 `window.UniverSheet`，示例（可参考 `test/editor-test-simple.html` 与 `test/editor-test.js`）：

```html
<!-- Editor.js 与其它工具通过 CDN 或本地文件引入 -->
<script src="https://cdn.jsdelivr.net/npm/@editorjs/editorjs@latest"></script>
<!-- ...其它 Editor.js 工具... -->

<!-- 引入本插件构建后的 UMD 包 -->
<script src="./dist/univer.umd.js"></script>

<script>
  const editor = new EditorJS({
    holder: 'editorjs',
    tools: {
      // Univer 表格 BlockTool
      univerSheet: {
        class: window.UniverSheet,
        inlineToolbar: false,
        config: {
          title: 'Univer 表格',
          openButtonText: '全屏',
        },
      },
    },
  });
</script>
```

---

## 在 QNotes 中的集成方式（本仓库约定）

QNotes 的运行时插件目录是 `QNotes/public/vendor/`，本插件在 QNotes 中以 **UMD** 方式加载：

- **运行时文件**：`QNotes/public/vendor/editorjs-univer/univer.umd.js`
- **页面加载位置**：`QNotes/public/index.html`（以 `<script src="vendor/editorjs-univer/univer.umd.js"></script>` 方式加载）
- **全局变量**：`window.UniverSheet`
- **工具 key**：`univerSheet`（即 Editor.js 保存数据里的块类型 `type: "univerSheet"`）

### 构建并同步到 QNotes

在 `PlugIns/editorjs-univer` 下执行（Windows）：

- `build_dist_copy.bat`：会先 `vite build`，再把 `dist/univer.umd.js` 复制到 `QNotes/public/vendor/editorjs-univer/univer.umd.js`

### 只读/编辑状态同步（QNotes 侧的契约）

为支持 QNotes 的“只读/编辑”切换，本插件会把实例注册到全局集合：

- `window.__QNotesUniverSheets: Set<UniverSheetTool>`

QNotes 在切换 Editor.js 的只读状态时，会遍历该集合并调用 `tool.applyReadOnly(readOnly)`，将只读状态同步到每个 Univer 表格块内部的 Workbook 权限。

---

## Block Tool 数据结构

在 Editor.js 的 `save()` 结果中，本工具对应块的数据结构大致为：

```json
{
  "type": "univerSheet",
  "data": {
    "title": "可选标题",
    "univerData": { "/* Univer Workbook 快照（IWorkbookData） */": "..." }
  }
}
```

- **`title`**：预留标题字段，当前未在 UI 中直接展示，可由上层系统按需使用。
- **`univerData`**：Univer Workbook 的完整序列化数据，来源于 `Workbook.getSnapshot()`。

> 注意：`sanitize` 配置为“原样透传”，Editor.js 不会对 `univerData` 做 HTML 级别过滤，请自行控制持久化与安全策略。

---

## 本地开发与构建

在 `PlugIns/editorjs-univer` 目录下：

```bash
npm install
npm run dev           # 启动 Vite 开发环境（可选）
npx --yes vite build  # 构建 UMD + ESM 产物到 dist/
```

构建产物：

- **UMD**：`dist/univer.umd.js`（全局变量 `window.UniverSheet`）。
- **ESM**：`dist/univer.mjs`（供打包工具按模块方式使用）。
- **类型声明**：`dist/index.d.ts`。

---

## 测试 Demo

项目自带一个简单的 Editor.js 测试页，位于 `test/` 目录：

- `editor-test-simple.html`：基于 CDN 的 Editor.js + 本插件 UMD 的集成示例。
- `editor-test.js`：初始化 Editor.js、注册 `univerSheet` 工具、演示保存/加载 JSON 的脚本。
- `editor-test.css`：测试页面样式。

使用方式（确保已构建）：

```bash
cd PlugIns/editorjs-univer
npm install
npx --yes vite build
```

然后用浏览器直接打开 `test/editor-test-simple.html` 即可进行本地功能验证。

---

## 许可证

本项目使用 **MIT License**，详见 `package.json` 中的 `license` 字段。
