## Univer Sheet 语言与国际化配置说明（QNotes 集成）

### 1. 目标与整体思路

- **目标**：在 QNotes 中使用 `editorjs-univer` 时，支持：
  - 默认使用 **简体中文界面**；
  - 未来 QNotes 做全局国际化时，可以通过一个统一的“当前语言”配置来控制表格语言，而不需要改插件内部代码。
- **核心思路**：
  - 在插件内部内置 `en-US` 和 `zh-CN` 两套语言包；
  - 增加可配置项 `locale` / `locales`；
  - 在 QNotes 侧暴露一个全局变量 `window.QNOTES_EDITOR_LOCALE`，由宿主决定当前语言。

---

### 2. 插件侧改动概览（`src/index.ts`）

#### 2.1 新增配置项 `UniverSheetConfig`

```startLine:endLine:PlugIns/editorjs-univer/src/index.ts
export interface UniverSheetConfig extends ToolConfig {
  /**
   * 当工作簿“真实数据”发生变更时触发的回调。
   */
  onDataChange?: (payload?: { snapshot?: unknown }) => void;

  /**
   * Univer 内部使用的语言（Locale）。
   *
   * - 不传时默认使用简体中文（LocaleType.ZH_CN），方便 QNotes 直接使用中文界面
   * - 未来 QNotes 做整体国际化时，可以在外层根据用户语言传入对应 LocaleType
   */
  locale?: LocaleType;

  /**
   * 允许宿主应用注入自定义 locales 配置（例如自行组合/扩展语言包）。
   *
   * - key 通常为 LocaleType（如 LocaleType.EN_US / LocaleType.ZH_CN）或其字符串形式
   * - value 为对应 locale 合并后的文案对象
   *
   * 说明：
   * - 如果不传，则使用插件内置的默认 locales 配置
   * - 传入时会与内置 locales 做浅层合并（同 key 会被覆盖）
   */
  locales?: Record<string, any>;
}
```

#### 2.2 内置中英文语言包

```startLine:endLine:PlugIns/editorjs-univer/src/index.ts
import DesignEnUS from '@univerjs/design/locale/en-US';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US';
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US';
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US';
import UIEnUS from '@univerjs/ui/locale/en-US';

// 简体中文语言包
import DesignZhCN from '@univerjs/design/locale/zh-CN';
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN';
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN';
import SheetsUIZhCN from '@univerjs/sheets-ui/locale/zh-CN';
import SheetsFormulaUIZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN';
import SheetsNumfmtUIZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN';
import UIZhCN from '@univerjs/ui/locale/zh-CN';
```

#### 2.3 语言解析与 `Univer` 初始化逻辑

```startLine:endLine:PlugIns/editorjs-univer/src/index.ts
private async mountUniver(container: HTMLElement): Promise<UniverRuntime> {
  try {
    const enLocale = {
      ...(DesignEnUS as any),
      ...(UIEnUS as any),
      ...(DocsUIEnUS as any),
      ...(SheetsEnUS as any),
      ...(SheetsUIEnUS as any),
      ...(SheetsFormulaUIEnUS as any),
      ...(SheetsNumfmtUIEnUS as any),
    };

    const zhLocale = {
      ...(DesignZhCN as any),
      ...(UIZhCN as any),
      ...(DocsUIZhCN as any),
      ...(SheetsZhCN as any),
      ...(SheetsUIZhCN as any),
      ...(SheetsFormulaUIZhCN as any),
      ...(SheetsNumfmtUIZhCN as any),
    };

    /**
     * 解析最终使用的语言：
     * - 优先使用宿主通过 config.locale 传入的 LocaleType
     * - 其次尝试从全局 window.QNOTES_EDITOR_LOCALE 推断（'zh-CN' / 'en-US' 等）
     * - 最后默认使用简体中文（LocaleType.ZH_CN），方便 QNotes 直接使用中文界面
     */
    let locale = this.config.locale;

    if (!locale && typeof window !== 'undefined') {
      const w = window as unknown as { QNOTES_EDITOR_LOCALE?: string };
      const hinted = w.QNOTES_EDITOR_LOCALE;
      if (hinted === 'zh-CN') {
        locale = LocaleType.ZH_CN;
      } else if (hinted === 'en-US') {
        locale = LocaleType.EN_US;
      }
    }

    if (!locale) {
      locale = LocaleType.ZH_CN;
    }

    // 内置一份基础 locales 映射
    const builtinLocales: Record<string, any> = {
      [LocaleType.EN_US]: enLocale,
      [LocaleType.ZH_CN]: zhLocale,
    };

    // 允许宿主应用通过 config.locales 扩展/覆盖内置语言配置
    const mergedLocales: Record<string, any> = {
      ...builtinLocales,
      ...(this.config.locales ?? {}),
    };

    const univer = new Univer({
      theme: defaultTheme,
      locale,
      locales: mergedLocales as any,
    });
    // ...
  } catch (e) {
    // ...
  }
}
```

**总结：**

- **优先级**：`config.locale` > `window.QNOTES_EDITOR_LOCALE` > 默认 `LocaleType.ZH_CN`。
- **默认行为（QNotes 当前场景）**：不传 `config.locale` 时，如果全局变量是 `'zh-CN'`（默认即如此），则使用简体中文界面。

---

### 3. QNotes 侧改动概览（`QNotes/src/frontend/editor-tools-entry.js`）

为了给所有 Editor.js 工具（包括 `UniverSheet`）提供一个统一的“当前语言”来源，在打包入口中增加了一个全局变量：

```startLine:endLine:QNotes/src/frontend/editor-tools-entry.js
// 仅在浏览器环境下挂载到全局
if (typeof window !== 'undefined') {
  // 编辑器当前语言（后续可以由全局设置 / 用户偏好覆盖）
  // 这里先默认使用简体中文，后续若 window.QNOTES_EDITOR_LOCALE 已存在则不覆盖
  window.QNOTES_EDITOR_LOCALE = window.QNOTES_EDITOR_LOCALE || 'zh-CN';

  window.EditorJS = EditorJS;
  window.Header = Header;
  window.Paragraph = Paragraph;
  // ...
}
```

**要点：**

- 当前版本中，`QNOTES_EDITOR_LOCALE` 默认值为 `'zh-CN'`，因此 **不需要额外配置即可获得中文界面**。
- 未来如果 QNotes 做了全局国际化，可以在更高层（例如用户设置加载完成后）设置：
  - `window.QNOTES_EDITOR_LOCALE = 'en-US';`
  - 或其他映射到 `LocaleType` 的字符串，然后重新初始化编辑器。

---

### 4. 宿主应用（QNotes）如何使用 `locale` / `locales`

#### 4.1 简单用法：只控制当前语言

如果将来在 Editor.js 初始化中希望显式传入语言（而不是仅依赖全局变量），可以在工具配置中这样写：

```js
tools: {
  univerSheet: {
    class: window.UniverSheet,
    config: {
      // 直接使用 Univer 的 LocaleType（推荐在打包入口或全局导出）
      locale: window.QNOTES_EDITOR_LOCALE === 'en-US' ? LocaleType.EN_US : LocaleType.ZH_CN,
    },
  },
}
```

在当前实现里，如不显式传入 `config.locale`，也会通过 `QNOTES_EDITOR_LOCALE` 推断语言，因此这一步不是必须，只是为未来扩展预留。

#### 4.2 进阶用法：自定义 locales 文案

如果 QNotes 未来希望在前端自行合并/扩展 Univer 的语言包（例如增加自定义菜单文案），可以通过 `config.locales` 注入：

```js
const univerLocales = {
  [LocaleType.ZH_CN]: {
    // 自定义或扩展 zh-CN 文案
  },
  [LocaleType.EN_US]: {
    // 自定义或扩展 en-US 文案
  },
};

tools: {
  univerSheet: {
    class: window.UniverSheet,
    config: {
      locale: LocaleType.ZH_CN,
      locales: univerLocales,
    },
  },
}
```

插件内部会将 `config.locales` 与内置 `builtinLocales` 按 key 做浅合并，同 key 会被宿主的配置覆盖。

---

### 5. 构建与更新步骤（供维护参考）

每次修改语言或配置相关代码后，需要：

1. **在 QNotes 根目录重新打包 Editor.js 工具：**

   ```bash
   cd QNotes
   npm run build:editor
   ```

   这会更新 `public/editorjs-tools.bundle.js`，从而让 `window.QNOTES_EDITOR_LOCALE` 等改动生效。

2. **在插件目录重新打包 `editorjs-univer` 并复制 UMD：**

   - 进入 `PlugIns/editorjs-univer` 目录；
   - 运行现有打包脚本（例如 `build_dist_copy.bat` 或对应的 npm script），将新的构建产物复制到：
     - `QNotes/public/vendor/editorjs-univer/univer.umd.js`

3. **重启/刷新 QNotes 前端页面，验证：**

   - 控制台应能看到 `UniverSheet` 已加载；
   - 新建或打开含有表格块的笔记，界面语言应与 `QNOTES_EDITOR_LOCALE` / `config.locale` 对应。

---

### 6. 行为总结

- **当前默认行为（QNotes）**：
  - `window.QNOTES_EDITOR_LOCALE` 默认 `'zh-CN'`；
  - 插件未显式传入 `config.locale`；
  - → Univer 表格界面默认使用 **简体中文**。

- **未来国际化演进路径**：
  - 全局引入统一的 `currentLocale`；
  - 初始化编辑器前：`window.QNOTES_EDITOR_LOCALE = currentLocaleString;`
  - 如有需要，在工具配置中显式写入 `config.locale` 和 `config.locales`；
  - 其他 UI 文案与 Editor.js 工具共用同一个语言源，实现真正“一处切语言，处处生效”。


