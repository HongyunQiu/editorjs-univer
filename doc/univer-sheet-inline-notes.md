## Editor.js 内嵌 Univer 表格问题排查与关键改动记录

### 背景

- 目标：在 Editor.js 的 block 中**直接内嵌显示 Univer 表格**，而不是像最初版本那样弹出全屏 overlay 窗口。
- 现象：
  - 内嵌渲染后，能看到工具栏，但一开始看不到完整表格；
  - 使用 Editor.js 的 `save()` 时，`univerSheet` 块里的 `univerData` 一直是 `null`，即使已经在表格中输入了内容。

### 关键问题与解决点

#### 1. 从「全屏弹窗」改为「块内嵌渲染」

- 原实现：`render()` 中只渲染标题和状态，点击按钮/首次插入时通过 `openOverlay()` 在 `document.body` 下创建 overlay，再在 overlay 中挂载 Univer。
- 现实现要点：
  - 在 `render()` 里直接创建 `div.cdx-univer-sheet__inline-container`，并立即在其中挂载 Univer：
    - 去掉 header/title/status/hint 的 DOM 输出，只保留一个包裹容器；
    - 使用 `setTimeout(() => this.mountInlineUniver(), 0)` 避免阻塞 Editor.js 其他块的渲染。
  - 对应样式在 `index.css` 中增加 `.cdx-univer-sheet__inline-container`，并**明确指定高度**，确保 Univer 能正确计算布局、渲染表格：
    - `width: 100%`
    - `height / min-height: 360px`
    - `overflow: hidden; display: flex;`

> 关键点：如果没有固定高度，Univer 只会渲染出顶部工具栏而看不到表格网格。

#### 2. 去掉多余文案，仅保留表格

- 原实现会在 block 内显示：
  - 工具标题（例如 “Univer 表格”）
  - 状态文案（例如 “已创建空表格，尚未保存内容”）
- 现实现：
  - 在 `render()` 中不再创建 header、title、status 等元素，只保留外层 block wrapper 和内嵌容器；
  - `statusEl` 设为 `null`，`updateStatusText()` 成为无 UI 输出的空实现。

> 关键点：让 block 视觉上只呈现表格本身，更接近“内嵌小表格”的体验。

#### 3. Editor.js `save()` 始终得到 `univerData: null` 的原因

- 初始版本中，`save()` 里曾尝试 `await runtime.exportData()`，但存在两个问题：
  1. Editor.js 的 BlockTool `save()` **期望同步返回值**，异步逻辑并不会被等待，导致结果始终使用调用 `save()` 时的旧值；
  2. 我们使用了「云端快照服务」式的导出方案：
     - 尝试通过 `UniverInstanceServiceName`、`getSnapshotService()`、`snapshotService.dump(workbookId)` 拿快照；
     - 但在当前纯前端环境里，并没有注册对应的 `SnapshotService`，控制台调试输出：
       - `hasInstanceService: false`
       - `hasSnapshotService: false`
       - `hasDumpFn: false`
     - 同时 `workbookId` 实际上是一个对象而不是字符串，进一步说明该路径不适合在本地内嵌场景中使用。

> 关键点：本地内嵌模式下 **不应该依赖云端 snapshot 服务**，而应该直接使用 Workbook 模型自带的快照能力。

#### 4. 正确的快照导出方式：使用 Workbook.getSnapshot()

- 在 `mountUniver()` 内：
  - 注册完所有 Univer 插件后，**直接通过 `univer.createUnit()` 拿到 Workbook 实例**：
    - 如有历史数据 `this.univerData`：`createUnit(UniverInstanceType.UNIVER_SHEET, this.univerData)`，实现“还原”；
    - 否则：`createUnit(UniverInstanceType.UNIVER_SHEET, { name: 'Sheet1' })`，创建默认空工作簿。
  - 不再使用 `UniverInstanceService` / `getSnapshotService` / `dump` 这一路径。
- 定义 `exportData` 时，直接调用 Workbook 的快照 API：
  - `workbook.getSnapshot(): IWorkbookData`
- 初始化完成后，立刻调用一次 `exportData()`，把初始快照写进 `this.univerData`，避免刚插入块就保存时仍为 `null`。

> 关键点：Workbook 实例本身就提供 `getSnapshot()`，完全足够在无后端服务的前端场景中做序列化/反序列化。

#### 5. 确保 Editor.js `save()` 拿到的是最新数据

- BlockTool 保存行为：
  - `save()` 必须是同步，并且只能返回当前缓存中的 `this.univerData`；
  - 所以需要保证在用户点击保存前，`this.univerData` 已经被更新到最近一次编辑后的状态。
- 解决策略：
  1. 在 `mountUniver()` 完成后，初始化时立即调用 `exportData()` 一次，写入一个“空表格”的初始快照；
  2. 在 `mountInlineUniver()` 成功挂载后，启动一个简易 **自动快照定时器**：
     - 每隔 2 秒调用一次 `runtime.exportData()`；
     - 如返回非空数据，则更新 `this.univerData`。
- 最终：
  - 用户编辑表格 → 定时任务自动刷新 `this.univerData`；
  - Editor.js 调用 `editor.save()` → BlockTool 的 `save()` 同步返回当前缓存，JSON 中的 `univerData` 不再是 `null`，而是完整的工作簿快照对象。

### 小结

- **UI 层**：从全屏 overlay 改为 block 内直接嵌入表格，并通过 CSS 明确给出高度，保证网格正常渲染；
- **数据层**：放弃云端 snapshot 服务方案，改为：
  - 使用 `univer.createUnit(UniverInstanceType.UNIVER_SHEET, ...)` 直接创建/恢复 Workbook；
  - 使用 `workbook.getSnapshot()` 获取快照；
  - 通过初始化导出 + 周期性导出更新 `this.univerData`；
  - 在 Editor.js 的 `save()` 中同步返回最新的 `univerData`。

这几个点组合在一起，解决了：

1. 表格只能以弹窗方式显示的问题（改为 block 内嵌）；  
2. 内嵌时只显示工具栏、不显示网格的问题（容器高度）；  
3. Editor.js `save()` 结果中 `univerData` 始终为 `null` 的问题（改用 Workbook.getSnapshot() 并正确缓存）。


