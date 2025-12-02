import './index.css';

import { IconQuote } from '@codexteam/icons';
import { make } from '@editorjs/dom';
import type { API, BlockAPI, BlockTool, ToolConfig, SanitizerConfig } from '@editorjs/editorjs';
import {
  IPermissionService,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import '@univerjs/sheets/facade';
import DesignEnUS from '@univerjs/design/locale/en-US';
import { defaultTheme } from '@univerjs/design';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverSheetsPlugin, WorkbookEditablePermission } from '@univerjs/sheets';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui';
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US';
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt';
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui';
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US';
import { UniverUIPlugin } from '@univerjs/ui';
import UIEnUS from '@univerjs/ui/locale/en-US';

import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/sheets-formula-ui/lib/index.css';
import '@univerjs/sheets-numfmt-ui/lib/index.css';

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
   * - 不会因为纯 UI 行为（如选区移动、鼠标悬停、滚动等）触发
   *
   * 该回调由宿主应用自行决定如何使用：
   * - 例如在笔记应用中调用 markDirty()
   * - 或在其它集成中触发自动保存、同步等逻辑
   */
  onDataChange?: (payload?: { snapshot?: unknown }) => void;
}

export interface UniverSheetData {
  /**
   * 预留标题字段（当前未在 UI 中暴露，可未来扩展）
   */
  title?: string;

  /**
   * univer.js 工作簿序列化数据
   *
   * 这里不限定具体结构，完全交给 univer.js 序列化 / 反序列化逻辑处理。
   */
  univerData?: unknown;
}

interface UniverSheetParams {
  data: UniverSheetData;
  config?: UniverSheetConfig;
  api: API;
  readOnly: boolean;
  block: BlockAPI;
}

interface UniverSheetCSS {
  baseClass: string;
  wrapper: string;
  canvasWrapper: string;
}

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

/**
 * Editor.js Univer Sheets BlockTool（极简版本）
 */
export default class UniverSheetTool implements BlockTool {
  private api: API;
  private readOnly: boolean;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private block: BlockAPI;

  private data: UniverSheetData;
  private css: UniverSheetCSS;

  private univerData: unknown | null;

  private inlineContainerEl: HTMLDivElement | null = null;
  private inlineRuntime: UniverRuntime | null = null;
  private inlineAutoSaveTimer: number | null = null;

  private canvasWrapperEl: HTMLDivElement | null = null;
  private canvasWrapperParentEl: HTMLElement | null = null;
  private fullscreenOverlayEl: HTMLDivElement | null = null;
  private fullscreenToggleButtonEl: HTMLButtonElement | null = null;
  private isFullscreen = false;

  private config: UniverSheetConfig;

  constructor({ data, config, api, readOnly, block }: UniverSheetParams) {
    this.api = api;
    this.readOnly = readOnly;
    this.block = block;

    this.config = {
      ...config,
    };

    this.data = {
      title: data?.title ?? '',
      univerData: data?.univerData,
    };

    this.univerData = this.data.univerData ?? null;

    this.css = {
      baseClass: this.api.styles.block,
      wrapper: 'cdx-univer-sheet',
      canvasWrapper: 'cdx-univer-sheet__canvas-wrapper',
    };

    // 将实例注册到全局集合，便于宿主应用（如 QNotes）在切换 Editor.js 只读状态时同步到所有 Univer 表格块
    if (typeof window !== 'undefined') {
      const w = window as unknown as { __QNotesUniverSheets?: Set<UniverSheetTool> };
      if (!w.__QNotesUniverSheets) {
        w.__QNotesUniverSheets = new Set<UniverSheetTool>();
      }
      w.__QNotesUniverSheets.add(this);
    }
  }

  public static get isReadOnlySupported(): boolean {
    return true;
  }

  public static get toolbox(): { icon: string; title: 'Univer 表格' } {
    return {
      icon: IconQuote,
      title: 'Univer 表格',
    };
  }

  public static get contentless(): boolean {
    return true;
  }

  public static get enableLineBreaks(): boolean {
    return true;
  }

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

  public render(): HTMLElement {
    const wrapper = make('div', [this.css.baseClass, this.css.wrapper]) as HTMLDivElement;

    // 用一个额外的 canvasWrapper 包一层，方便在“页面内全屏”时把整个区域挂到 body 下
    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = this.css.canvasWrapper;
    wrapper.appendChild(canvasWrapper);

    this.canvasWrapperEl = canvasWrapper;
    this.canvasWrapperParentEl = wrapper;

    // 右上角全屏按钮（页面内全屏，而非浏览器原生 F11）
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.type = 'button';
    fullscreenBtn.className = 'cdx-univer-sheet__fullscreen-toggle';
    fullscreenBtn.textContent = '全屏';
    fullscreenBtn.addEventListener('click', () => {
      this.toggleFullscreen();
    });
    canvasWrapper.appendChild(fullscreenBtn);
    this.fullscreenToggleButtonEl = fullscreenBtn;

    // 在块内部直接渲染一个嵌入式的 Univer 表格，而不是打开弹窗
    const inlineContainer = document.createElement('div');
    inlineContainer.className = 'cdx-univer-sheet__inline-container';
    canvasWrapper.appendChild(inlineContainer);
    this.inlineContainerEl = inlineContainer;

    // 放到下一个事件循环，避免阻塞 Editor.js 其它块的渲染
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        void this.mountInlineUniver();
      }, 0);
    }

    return wrapper;
  }

  public save(): UniverSheetData {
    // Editor.js 的 save 期望是同步返回；这里直接返回当前缓存的 univerData
    // univerData 理论上会通过 mountUniver / 定时导出自动保持最新
    return {
      title: this.data.title ?? '',
      univerData: this.univerData ?? null,
    };
  }

  public static get sanitize(): SanitizerConfig {
    // 让 Editor.js 不对 data.univerData 做 HTML 级别的处理，保持原样透传
    return {} as unknown as SanitizerConfig;
  }

  public validate(_data: UniverSheetData): boolean {
    // 极简版本：总是允许保存
    return true;
  }

  /**
   * 在块内部容器中挂载一个嵌入式 univer.js 表格
   */
  private async mountInlineUniver(): Promise<void> {
    if (!this.inlineContainerEl) {
      return;
    }

    // 如已存在旧实例，先释放（包含定时器）
    if (this.inlineRuntime) {
      try {
        this.inlineRuntime.dispose();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[UniverSheetTool] 释放旧的嵌入式 univer 实例失败：', e);
      }
      this.inlineRuntime = null;
    }
    if (this.inlineAutoSaveTimer != null) {
      window.clearInterval(this.inlineAutoSaveTimer);
      this.inlineAutoSaveTimer = null;
    }

    try {
      const runtime = await this.mountUniver(this.inlineContainerEl);
      this.inlineRuntime = runtime;

      // 初始根据 Editor.js 传入的 readOnly 状态设置一次工作簿权限
      if (typeof this.inlineRuntime.setReadOnly === 'function') {
        try {
          await this.inlineRuntime.setReadOnly(this.readOnly);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[UniverSheetTool] 初始化只读状态失败：', e);
        }
      }

      // 简单策略：每隔 2 秒自动导出一次快照，更新 this.univerData，保证 Editor.js 保存时有最新数据
      if (typeof window !== 'undefined') {
        this.inlineAutoSaveTimer = window.setInterval(async () => {
          if (!this.inlineRuntime) {
            return;
          }
          try {
            const data = await this.inlineRuntime.exportData();
            if (data != null) {
              this.univerData = data;
            }
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[UniverSheetTool] 自动导出表格快照失败：', e);
          }
        }, 2000);
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[UniverSheetTool] 挂载嵌入式 univer 失败：', e);
      this.inlineContainerEl.innerHTML =
        '<div class="cdx-univer-sheet__error">无法初始化 Univer 表格，请检查浏览器控制台日志和依赖安装情况。</div>';
    }
  }

  /**
   * Editor.js 在销毁 / 删除块时会调用 destroy，负责清理内部资源。
   */
  public destroy(): void {
    if (this.inlineRuntime) {
      try {
        this.inlineRuntime.dispose();
      } catch (e) {
        // eslint-disable-next-line no-console
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

  /**
   * 切换页面内全屏（参考 editorjs-Excalidraw 的实现思路）：
   * - 非浏览器原生全屏，只是在当前页面内用一个 fixed 覆盖层铺满视口。
   * - 将内部的 canvasWrapper（包含表格与按钮）移动到覆盖层中。
   */
  private toggleFullscreen(): void {
    if (this.isFullscreen) {
      this.exitFullscreen();
    } else {
      this.enterFullscreen();
    }
  }

  private enterFullscreen(): void {
    if (this.isFullscreen) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }
    if (!this.canvasWrapperEl) {
      return;
    }

    // 记录原始父节点，方便退出全屏时还原
    if (!this.canvasWrapperParentEl) {
      this.canvasWrapperParentEl = this.canvasWrapperEl.parentElement;
    }

    const overlay = document.createElement('div');
    overlay.className = 'cdx-univer-sheet__fullscreen-overlay';

    // 将整个画布区域移动到覆盖层下
    overlay.appendChild(this.canvasWrapperEl);
    document.body.appendChild(overlay);

    this.canvasWrapperEl.classList.add('cdx-univer-sheet__canvas-wrapper--fullscreen');

    if (this.fullscreenToggleButtonEl) {
      this.fullscreenToggleButtonEl.textContent = '退出全屏';
    }

    this.fullscreenOverlayEl = overlay;
    this.isFullscreen = true;
  }

  private exitFullscreen(): void {
    if (!this.isFullscreen) {
      return;
    }
    if (typeof document === 'undefined') {
      return;
    }

    // 将画布区域移回原始块内
    if (this.canvasWrapperEl && this.canvasWrapperParentEl) {
      this.canvasWrapperParentEl.appendChild(this.canvasWrapperEl);
      this.canvasWrapperEl.classList.remove('cdx-univer-sheet__canvas-wrapper--fullscreen');
    }

    if (this.fullscreenOverlayEl && this.fullscreenOverlayEl.parentNode) {
      this.fullscreenOverlayEl.parentNode.removeChild(this.fullscreenOverlayEl);
    }
    this.fullscreenOverlayEl = null;

    if (this.fullscreenToggleButtonEl) {
      this.fullscreenToggleButtonEl.textContent = '全屏';
    }

    this.isFullscreen = false;
  }

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

      // 按官方文档（插件模式）组合最小 Sheets 应用
      const univer = new Univer({
        theme: defaultTheme,
        locale: LocaleType.EN_US,
        locales: {
          [LocaleType.EN_US]: enLocale,
        },
      });

      // 引擎层
      univer.registerPlugin(UniverRenderEnginePlugin);
      univer.registerPlugin(UniverFormulaEnginePlugin);

      // UI 容器（指定我们传入的 DOM 容器）
      univer.registerPlugin(UniverUIPlugin, {
        container,
      });

      // Docs 相关（提供编辑器服务等核心依赖）
      univer.registerPlugin(UniverDocsPlugin);
      univer.registerPlugin(UniverDocsUIPlugin);

      // Sheets 相关
      univer.registerPlugin(UniverSheetsPlugin);
      univer.registerPlugin(UniverSheetsUIPlugin);
      univer.registerPlugin(UniverSheetsFormulaPlugin);
      univer.registerPlugin(UniverSheetsFormulaUIPlugin);
      univer.registerPlugin(UniverSheetsNumfmtPlugin);
      univer.registerPlugin(UniverSheetsNumfmtUIPlugin);

      // 通过 createUnit 创建或还原一个 Workbook 实例，并直接持有该实例，用其 getSnapshot() 导出数据
      let workbook: any | null = null;

      /**
       * 根据只读标志更新整个 Workbook 的“可编辑”权限。
       *
       * 这里使用了 Univer 文档中推荐的权限服务方式：
       * https://docs.univer.ai/guides/sheets/features/core/permission
       */
      const applyWorkbookEditable = async (editable: boolean) => {
        if (!workbook) {
          return;
        }

        try {
          // 尽量从 Workbook 实例上获取 unitId，不同版本可能方法名略有差异，逐个兜底。
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

      try {
        if (this.univerData) {
          // 如果有历史数据，则作为快照传入，恢复工作簿
          workbook = (univer as any).createUnit?.(UniverInstanceType.UNIVER_SHEET, this.univerData);
        } else {
          // 否则创建一个默认空工作簿
          workbook = (univer as any).createUnit?.(UniverInstanceType.UNIVER_SHEET, {
            name: 'Sheet1',
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[UniverSheetTool] 创建或恢复工作簿失败：', e);
      }

      const exportData = async () => {
        if (!workbook || typeof workbook.getSnapshot !== 'function') {
          return this.univerData ?? null;
        }
        try {
          // Workbook.getSnapshot() 返回当前的 IWorkbookData 快照
          return workbook.getSnapshot();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[UniverSheetTool] 导出表格快照失败：', e);
        }
        return this.univerData ?? null;
      };

      /**
       * 监听工作簿真实数据的变更（基于 Univer Facade API）。
       *
       * 目标：只在“有可能影响序列化结果”的操作后触发宿主回调，避免选区移动等纯 UI 操作。
       * 参考官方文档：
       * https://docs.univer.ai/guides/sheets/features/core/general-api
       */
      const dataChangeDisposers: Array<{ dispose: () => void }> = [];

      const handleDataChanged = async () => {
        try {
          const snapshot = await exportData();
          if (snapshot != null) {
            this.univerData = snapshot;
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[UniverSheetTool] 导出表格快照失败（监听回调）：', e);
        }

        // 通知宿主：该表格块的“业务数据”已发生变化
        if (this.config && typeof this.config.onDataChange === 'function') {
          try {
            this.config.onDataChange({ snapshot: this.univerData ?? null });
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('[UnverSheetTool] onDataChange 回调执行失败：', e);
          }
        }
      };

      try {
        const univerAPI: any =
          FUniver && typeof (FUniver as any).newAPI === 'function'
            ? (FUniver as any).newAPI(univer)
            : null;

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
              // 单个事件注册失败不应影响其它事件
              // eslint-disable-next-line no-console
              console.warn(`[UniverSheetTool] 注册数据变更事件 ${key} 失败：`, e);
            }
          });
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[UniverSheetTool] 注册数据变更监听失败：', e);
      }

      const dispose = () => {
        try {
          // 先释放基于 Facade API 注册的监听器
          dataChangeDisposers.forEach((d) => {
            try {
              d.dispose();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[UniverSheetTool] 释放数据变更监听器失败：', e);
            }
          });
          dataChangeDisposers.length = 0;

          if (typeof (univer as any).dispose === 'function') {
            (univer as any).dispose();
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[UniverSheetTool] 释放 univer 实例时出错：', e);
        }
      };

      // 初始化时立即导出一次快照，确保 this.univerData 不为 null
      try {
        // 根据当前块的只读状态，先设置一次 Workbook 的编辑权限
        await applyWorkbookEditable(!this.readOnly);

        const initialData = await exportData();
        if (initialData != null) {
          this.univerData = initialData;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[UniverSheetTool] 初始化导出表格快照失败：', e);
      }

      return {
        exportData,
        dispose,
        setReadOnly: async (readOnly: boolean) => {
          await applyWorkbookEditable(!readOnly);
        },
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[UniverSheetTool] 加载 univer.js 失败：', err);
      container.innerHTML =
        '<div class="cdx-univer-sheet__error">无法加载 univer.js，请确认已在插件目录安装 @univerjs/* 依赖。</div>';

      return {
        exportData: () => this.univerData ?? null,
        dispose: () => {
          // no-op
        },
      };
    }
  }

}
