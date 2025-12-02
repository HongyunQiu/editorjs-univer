## Univer 表格块 dirty 状态触发方案（基于事件 / 命令系统）

本文记录 `@editorjs/univer-sheet` 在 QNotes 集成中，如何通过 **Univer 自身的事件 / 命令系统** 精准触发表格块的“内容已修改（dirty）”状态，同时尽量避免纯 UI 行为（如滚动、选区移动）造成的误报。

---

## 背景与问题

- QNotes 使用 Editor.js 作为笔记正文编辑器，通过全局 `onChange` 回调直接调用 `markDirty()`，把编辑器文档标记为 dirty。
- `@editorjs/univer-sheet` 在块内部挂载了一个完整的 Univer Sheets 实例，该实例在以下操作中会频繁修改 DOM：
  - 鼠标移动（高亮当前单元格、行列头）
  - 选区变化、拖拽选区
  - 滚动表格视图
- Editor.js 的变更检测基于 DOM / block 结构，只要检测到这些变化，就会频繁触发 `onChange`，导致：
  - 在 **编辑模式下**，单纯移动鼠标、滚动表格视图，也会让整篇笔记被视为 “有未保存更改”。

目标：

- **只在表格“真实数据”变更时才触发表格块的 dirty 信号**；
- 尽量在 `editorjs-univer` 插件内部完成“数据变更”的判断，对宿主暴露一个简单统一的钩子；
- QNotes 层仅需做最薄的一层绑定（例如：`onDataChange -> markDirty()`），以保持插件的通用性。

---

## 总体设计

设计分为两层：

- **插件内部（UniverSheetTool）**：负责“数据是否变更”的判断，完全基于 Univer 的 **Facade API + Event API**。
- **宿主应用（如 QNotes）**：只关心“该表格块发生了数据变更”这一高层信号，用于更新自己的 dirty flag、自动保存等逻辑。

### 1）插件对外暴露的配置：`config.onDataChange`

在 `src/index.ts` 中扩展 `UniverSheetConfig`：

```126:154:PlugIns/editorjs-univer/src/index.ts
export interface UniverSheetConfig extends ToolConfig {
  /**
   * 预留配置位，暂未在内嵌模式下使用（保留类型以兼容未来扩展/外部传参）。
   */
  title?: string;
  openButtonText?: string;

  /**
   * 当工作簿“真实数据”发生变更时触发的回调。
   *
   * 判定原则：
   * - 基于 Univer 的命令系统（Mutation 类型命令）和部分事件（如 SheetValueChanged）
   * - 只在可能导致单元格数据 / 工作簿结构变更的操作后触发
   * - 不会因为纯 UI 行为（如选区移动、滚动等）触发
   *
   * 该回调由宿主应用自行决定如何使用：
   * - 例如在笔记应用中调用 markDirty()
   * - 或在其它集成中触发自动保存、同步等逻辑
   */
  onDataChange?: (payload?: { snapshot?: unknown }) => void;
}
```

约定：

- 插件只负责在**认为有真实数据变更**时调用 `config.onDataChange`；
- 宿主可选择是否使用 `snapshot`，或仅将其作为 “数据确实发生变更” 的信号。

### 2）宿主应用绑定（以 QNotes 为例）

在 `QNotes/public/app.js` 中 Editor.js 工具配置：

```1641:1655:QNotes/public/app.js
      univerSheet: {
        class: window.UniverSheet,
        inlineToolbar: false,
        config: {
          // 当 Univer 表格内部“真实数据”发生变化时，由插件调用该回调。
          // 这里仅在编辑模式下将整个笔记标记为已修改，避免鼠标移动等纯 UI 行为导致误触发。
          onDataChange: () => {
            if (isEditing) {
              markDirty();
            }
          }
        }
      },
```

另外，为避免 Editor.js 的全局 `onChange` 再次把 Univer 块当成普通块误判，QNotes 在 `onChange` 中显式过滤 `univerSheet`：

```1739:1772:QNotes/public/app.js
      onChange: (api, event) => {
        if (!isEditing) {
          return;
        }

        try {
          const detail = event && event.detail;
          const index =
            detail && typeof detail.index === 'number'
              ? detail.index
              : null;

          if (index != null && api && api.blocks && typeof api.blocks.getBlockByIndex === 'function') {
            const block = api.blocks.getBlockByIndex(index);
            if (block && block.name === 'univerSheet') {
              // 表格块的数据变更由插件内部的 onDataChange 负责通知，这里忽略。
              return;
            }
          }
        } catch (e) {
          console.warn('过滤 Editor.js onChange 事件时出错：', e);
        }

        // 其它块仍然使用全局 dirty 逻辑
        markDirty();
      }
```

---

## 插件内部：基于 Facade 事件 / 命令判断“数据变更”

### 1）引入 Facade API

插件中引入 Univer 的 Facade，并确保 Sheets 的 Facade 能力挂载到 API：

```1:15:PlugIns/editorjs-univer/src/index.ts
import {
  IPermissionService,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import '@univerjs/sheets/facade';
```

> 参考文档：[Univer General API / Events API](https://docs.univer.ai/guides/sheets/features/core/general-api)

在 `mountUniver` 中构建 Univer 实例后，使用：

```565:568:PlugIns/editorjs-univer/src/index.ts
const univerAPI: any =
  FUniver && typeof (FUniver as any).newAPI === 'function'
    ? (FUniver as any).newAPI(univer)
    : null;
```

### 2）统一的“数据变更处理函数”

`handleDataChanged` 负责：

- 调用 `exportData()` 从 Workbook 导出最新快照；
- 更新 `this.univerData`；
- 触发宿主的 `onDataChange`。

```519:561:PlugIns/editorjs-univer/src/index.ts
const exportData = async () => {
  if (!workbook || typeof workbook.getSnapshot !== 'function') {
    return this.univerData ?? null;
  }
  try {
    return workbook.getSnapshot();
  } catch (e) {
    console.warn('[UniverSheetTool] 导出表格快照失败：', e);
  }
  return this.univerData ?? null;
};

const dataChangeDisposers: Array<{ dispose: () => void }> = [];

const handleDataChanged = async () => {
  try {
    const snapshot = await exportData();
    if (snapshot != null) {
      this.univerData = snapshot;
    }
  } catch (e) {
    console.warn('[UniverSheetTool] 导出表格快照失败（监听回调）：', e);
  }

  if (this.config && typeof this.config.onDataChange === 'function') {
    try {
      this.config.onDataChange({ snapshot: this.univerData ?? null });
    } catch (e) {
      console.warn('[UnverSheetTool] onDataChange 回调执行失败：', e);
    }
  }
};
```

### 3）基于 Event API 的“白名单式”数据事件监听

为避免滚动、选区移动等纯 UI 行为触发 dirty，只监听与“表格数据/结构”强相关的事件：

```571:605:PlugIns/editorjs-univer/src/index.ts
if (univerAPI && univerAPI.Event && typeof univerAPI.addEvent === 'function') {
  /**
   * 仅监听与“真实数据变更”直接相关的事件，显式排除滚动、选区移动等纯 UI 事件。
   * 事件列表参考官方文档：https://docs.univer.ai/guides/sheets/features/core/general-api
   */
  const dataEvents: string[] = [
    'SheetValueChanged',            // 单元格值变更
    'SheetSkeletonChanged',         // 行列结构变更（插入/删除行列）
    'SheetAdded',                   // 新增工作表
    'SheetRemoved',                 // 删除工作表
    'SheetNameChanged',             // 重命名工作表
    'SheetDataValidationChanged',   // 数据验证规则变更
    'SheetDataValidatorStatusChanged',
    'CommentAdded',
    'CommentUpdated',
    'CommentDeleted',
    'SheetRangeSorted',
    'SheetRangeFiltered',
    'BeforePivotTableAdd',
    'PivotTableAdded',
  ];

  dataEvents.forEach((key) => {
    const ev = univerAPI.Event[key];
    if (!ev) {
      return;
    }
    try {
      const d = univerAPI.addEvent(ev, () => {
        void handleDataChanged();
      });
      if (d && typeof d.dispose === 'function') {
        dataChangeDisposers.push(d);
      }
    } catch (e) {
      console.warn(`[UniverSheetTool] 注册数据变更事件 ${key} 失败：`, e);
    }
  });
}
```

当前白名单覆盖的典型数据变更场景：

- 单元格编辑（输入、修改值 / 公式）
- 插入 / 删除行列
- 新增 sheet / 删除 sheet / 重命名 sheet
- 数据验证规则变更
- 筛选、排序、数据透视表等
- 评论（增删改）

显式不监听：

- `Scroll` 滚动事件
- 选区相关事件：`SelectionChanged`、`SelectionMoving` 等
- 光标 / hover 类事件：`CellHover`、`CellPointerMove` 等

这样可以保证：

- 拖动滚动条、移动选区 **不会** 把文档标记为 dirty；
- 新增 / 删除 / 重命名 sheet 等结构性操作 **会** 标记 dirty。

### 4）资源释放

所有通过 `addEvent` 注册的监听器，统一记录在 `dataChangeDisposers` 中，并在 `dispose` 时逐一释放：

```611:631:PlugIns/editorjs-univer/src/index.ts
const dispose = () => {
  try {
    // 先释放基于 Facade API 注册的监听器
    dataChangeDisposers.forEach((d) => {
      try {
        d.dispose();
      } catch (e) {
        console.warn('[UniverSheetTool] 释放数据变更监听器失败：', e);
      }
    });
    dataChangeDisposers.length = 0;

    if (typeof (univer as any).dispose === 'function') {
      (univer as any).dispose();
    }
  } catch (e) {
    console.warn('[UniverSheetTool] 释放 univer 实例时出错：', e);
  }
};
```

---

## 行为对照表

在当前实现下（以 QNotes 为例），各类操作对 dirty 状态的影响如下：

- **Univer 表格内部**
  - 修改单元格内容：✅ 触发 `SheetValueChanged` → `onDataChange` → `markDirty`
  - 插入 / 删除行列：✅ 触发 `SheetSkeletonChanged` → `onDataChange`
  - 新增 sheet：✅ 触发 `SheetAdded` → `onDataChange`
  - 删除 sheet：✅ 触发 `SheetRemoved` → `onDataChange`
  - 重命名 sheet：✅ 触发 `SheetNameChanged` → `onDataChange`
  - 滚动表格、拖动滚动条：❌ 不触发任何数据事件 → 不 dirty
  - 移动选区、点击不同单元格：❌ 不在数据事件白名单中 → 不 dirty

- **其它 Editor.js 块（header / paragraph / checklist 等）**
  - 任何内容修改：通过 Editor.js 全局 `onChange` → `markDirty`

- **标题输入框、关键词等 QNotes 自己的 UI**
  - 内部直接调用 `markDirty()`，与表格逻辑独立。

---

## 可能的后续改进

- 若未来需要更细粒度控制（例如：某些结构性操作不希望立即标记 dirty），可以在 `dataEvents` 白名单中做进一步拆分或在 `handleDataChanged` 内增加更细的判定。
- 可以根据业务需要，将 `onDataChange` 的 payload 扩展为 `{ snapshot, event, type }` 等，以便宿主更详细地知道是哪类操作触发了变更。***

## 剩余的BUG

- 增加删除Sheet无法触发dirty状态，待解决。