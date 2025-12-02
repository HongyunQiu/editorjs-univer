import './index.css';

import { IconQuote } from '@codexteam/icons';
import { make } from '@editorjs/dom';
import type { API, BlockAPI, BlockTool, ToolConfig, SanitizerConfig } from '@editorjs/editorjs';
import {
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core';
import DesignEnUS from '@univerjs/design/locale/en-US';
import { defaultTheme } from '@univerjs/design';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverSheetsPlugin } from '@univerjs/sheets';
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

      const dispose = () => {
        try {
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
