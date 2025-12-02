## Univer 表格只读模式（基于权限系统）的接入记录

### 背景与目标

- 目标：让 Editor.js 内嵌的 Univer 表格在 QNotes 中**严格跟随笔记的只读/编辑状态**，而不是仅依赖 Editor.js 自身的 `readOnly` 标志。  
- 方案参考：Univer 官方权限文档中对工作簿级权限的说明，特别是将整个 Workbook 设置为不可编辑的示例（参见官方文档中的 Workbook 权限示例：`https://docs.univer.ai/guides/sheets/features/core/permission`）。

Univer 本身提供了基于权限点的控制能力，例如：

```ts
const fWorkbook = univerAPI.getActiveWorkbook();
const permission = fWorkbook.getWorkbookPermission();

// 设置工作簿不可编辑
await permission.setPoint(univerAPI.Enum.WorkbookPermissionPoint.Edit, false);
```

在本插件中，我们没有直接使用 `univerAPI` 单例，而是通过权限服务 `IPermissionService` 和 `WorkbookEditablePermission` 来实现同等效果。

---

### 1. 在插件内部接入 Workbook 只读控制

#### 1.1 引入权限相关类型

在 `src/index.ts` 顶部增加：

```ts
import {
  IPermissionService,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core';

import { UniverSheetsPlugin, WorkbookEditablePermission } from '@univerjs/sheets';
```

#### 1.2 扩展运行时接口以暴露 `setReadOnly`

```ts
interface UniverRuntime {
  dispose: () => void;
  exportData: () => Promise<unknown> | unknown;
  /**
   * 根据 readOnly 切换内部 univer 工作簿的编辑权限。
   *
   * - readOnly = true  -> 整个 Workbook 只读（不可编辑）
   * - readOnly = false -> 允许编辑
   */
  setReadOnly?: (readOnly: boolean) => Promise<void> | void;
}
```

#### 1.3 在 `mountUniver` 中实现权限切换逻辑

在 `mountUniver(container)` 内部，创建完 `workbook` 之后，增加一个私有方法 `applyWorkbookEditable(editable: boolean)`：

```ts
// 通过 createUnit 创建或还原一个 Workbook 实例
let workbook: any | null = null;

/**
 * 根据只读标志更新整个 Workbook 的“可编辑”权限。
 * 参考官方权限文档：https://docs.univer.ai/guides/sheets/features/core/permission
 */
const applyWorkbookEditable = async (editable: boolean) => {
  if (!workbook) {
    return;
  }

  try {
    // 从 Workbook 实例上获取 unitId（不同版本方法名可能略有差异，做多重兜底）
    const unitId =
      (typeof (workbook as any).getUnitId === 'function'
        ? (workbook as any).getUnitId()
        : (typeof (workbook as any).getId === 'function'
          ? (workbook as any).getId()
          : (workbook as any).unitId ?? (workbook as any).id));

    if (!unitId) {
      return;
    }

    const injector = (univer as any).__getInjector?.();
    const permissionService: IPermissionService | null =
      injector && typeof injector.get === 'function'
        ? (injector.get(IPermissionService) as IPermissionService)
        : null;

    if (!permissionService || typeof (permissionService as any).updatePermissionPoint !== 'function') {
      return;
    }

    // WorkbookEditablePermission 对应“整个工作簿是否可编辑”的权限点
    const editablePoint = new WorkbookEditablePermission(String(unitId));
    (permissionService as any).updatePermissionPoint(editablePoint.id, editable);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[UniverSheetTool] 更新 Workbook 编辑权限失败：', e);
  }
};
```

随后在返回的运行时对象中挂出 `setReadOnly`，并在初始化时根据当前块的 `readOnly` 先调用一次：

```ts
// 初始化时：先根据块的只读状态设置一次 Workbook 可编辑性
await applyWorkbookEditable(!this.readOnly);
const initialData = await exportData();

return {
  exportData,
  dispose,
  setReadOnly: async (readOnly: boolean) => {
    await applyWorkbookEditable(!readOnly);
  },
};
```

> 对应关系：  
> - `readOnly = true`  → `applyWorkbookEditable(false)` → 禁止整个工作簿编辑；  
> - `readOnly = false` → `applyWorkbookEditable(true)`  → 允许编辑。

---

### 2. 为 BlockTool 提供对外的只读控制入口

#### 2.1 在 `UniverSheetTool` 中新增 `applyReadOnly`

```ts
export default class UniverSheetTool implements BlockTool {
  private readOnly: boolean;
  private inlineRuntime: UniverRuntime | null = null;

  /**
   * 供宿主应用在运行时切换只读状态（例如 QNotes 中的“开始编辑 / 只读查看”）时调用。
   */
  public async applyReadOnly(readOnly: boolean): Promise<void> {
    this.readOnly = readOnly;

    // 已经挂载了嵌入式实例时，尝试同步工作簿权限
    if (this.inlineRuntime && typeof this.inlineRuntime.setReadOnly === 'function') {
      try {
        await this.inlineRuntime.setReadOnly(readOnly);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[UniverSheetTool] 同步只读状态到工作簿失败：', e);
      }
    }
  }
}
```

#### 2.2 在内嵌挂载完成后应用初始只读状态

`mountInlineUniver()` 中挂载完 `runtime` 后：

```ts
const runtime = await this.mountUniver(this.inlineContainerEl);
this.inlineRuntime = runtime;

// 初始根据 Editor.js 传入的 readOnly 状态设置一次工作簿权限
if (typeof this.inlineRuntime.setReadOnly === 'function') {
  try {
    await this.inlineRuntime.setReadOnly(this.readOnly);
  } catch (e) {
    console.warn('[UniverSheetTool] 初始化只读状态失败：', e);
  }
}

// 后续继续启动自动快照导出定时器……
```

---

### 3. 通过全局注册表将所有表格块暴露给宿主应用

#### 3.1 构造函数中注册到全局集合

在 `UniverSheetTool` 构造函数中：

```ts
constructor({ data, config, api, readOnly, block }: UniverSheetParams) {
  this.api = api;
  this.readOnly = readOnly;
  this.block = block;
  // ...

  // 将实例注册到全局集合，便于宿主应用在切换只读状态时同步到所有表格块
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __QNotesUniverSheets?: Set<UniverSheetTool> };
    if (!w.__QNotesUniverSheets) {
      w.__QNotesUniverSheets = new Set<UniverSheetTool>();
    }
    w.__QNotesUniverSheets.add(this);
  }
}
```

#### 3.2 在 `destroy()` 中清理实例

为兼容 Editor.js 的块生命周期，新增 `destroy()`：

```ts
public destroy(): void {
  if (this.inlineRuntime) {
    try {
      this.inlineRuntime.dispose();
    } catch (e) {
      console.warn('[UniverSheetTool] 销毁时释放 univer 实例失败：', e);
    }
    this.inlineRuntime = null;
  }

  if (this.inlineAutoSaveTimer != null) {
    window.clearInterval(this.inlineAutoSaveTimer);
    this.inlineAutoSaveTimer = null;
  }

  // 从全局注册表中移除当前实例
  if (typeof window !== 'undefined') {
    const w = window as unknown as { __QNotesUniverSheets?: Set<UniverSheetTool> };
    const set = w.__QNotesUniverSheets;
    if (set && typeof set.delete === 'function') {
      set.delete(this);
    }
  }
}
```

这样可以在块被删除时正确回收 Univer 实例并解除全局引用，避免内存泄漏。

---

### 4. QNotes 中将 Editor.js readOnly 同步到所有 Univer 表格

在 QNotes 前端主逻辑 `QNotes/public/app.js` 中，`setReadOnly(readOnly)` 本来只控制 Editor.js 自身的只读状态。现在在这个函数里增加对 `editorjs-univer` 的同步：

```js
async function setReadOnly(readOnly) {
  try {
    if (!editorInstance) {
      console.warn('编辑器实例不存在');
      return;
    }

    await editorInstance.isReady;

    const currentState = await editorInstance.readOnly.isEnabled;
    if (currentState !== readOnly) {
      await editorInstance.readOnly.toggle();
      console.log('编辑器只读状态已切换到:', readOnly);
    } else {
      console.log('编辑器只读状态已为:', readOnly);
    }

    // 将只读状态同步到所有 Univer 表格块
    try {
      const w = window;
      const univerSheets = w && w.__QNotesUniverSheets;
      if (univerSheets && typeof univerSheets.forEach === 'function') {
        univerSheets.forEach((tool) => {
          if (tool && typeof tool.applyReadOnly === 'function') {
            tool.applyReadOnly(readOnly);
          }
        });
      }
    } catch (e) {
      console.warn('同步 Univer 表格只读状态失败:', e);
    }

    updateReadOnlySwitch();
  } catch (err) {
    console.error('设置只读状态失败:', err);
  }
}
```

> 结果：当 QNotes 切换“只读查看 / 开始编辑”时，Editor.js 与所有内嵌 `UniverSheet` 块会同时切到对应模式，表格内部的单元格真正实现了**不可编辑**。

---

### 5. 小结

- 使用 Univer 官方文档中推荐的**权限点机制**（`WorkbookEditablePermission` + `IPermissionService.updatePermissionPoint`）实现了工作簿级别的只读控制，而不是仅依赖 UI 层禁用。  
- 为 `UniverSheetTool` 增加了统一的 `applyReadOnly` 接口，并在 QNotes 中通过全局集合 `window.__QNotesUniverSheets` 一次性同步所有块的只读状态。  
- 这样，QNotes 的编辑模式切换可以无缝控制所有内嵌 Univer 表格的实际编辑能力，行为与整篇笔记的只读逻辑保持一致。


