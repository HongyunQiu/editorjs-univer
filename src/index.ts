import './index.css';

import { IconQuote } from '@codexteam/icons';
import { make } from '@editorjs/dom';
import type { API, BlockAPI, BlockTool, ToolConfig, SanitizerConfig } from '@editorjs/editorjs';
import {
  CommandType,
  ICommand,
  ICommandService,
  IPermissionService,
  IUniverInstanceService,
  LocaleType,
  Univer,
  UniverInstanceType,
} from '@univerjs/core';
import { FUniver } from '@univerjs/core/facade';
import '@univerjs/sheets/facade';
// 必须加载：为 FRange 混入 insertCellImageAsync（见 @univerjs/sheets-drawing-ui facade 模块增强）
import '@univerjs/sheets-drawing-ui/facade';
import DesignEnUS from '@univerjs/design/locale/en-US';
import { defaultTheme } from '@univerjs/design';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import DocsUIEnUS from '@univerjs/docs-ui/locale/en-US';
import { UniverDocsDrawingPlugin } from '@univerjs/docs-drawing';
import { UniverFormulaEnginePlugin } from '@univerjs/engine-formula';
import { getCurrentTypeOfRenderer, IRenderManagerService, UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverDrawingPlugin } from '@univerjs/drawing';
import { UniverDrawingUIPlugin } from '@univerjs/drawing-ui';
import DrawingUIEnUS from '@univerjs/drawing-ui/locale/en-US';
import { UniverSheetsPlugin, WorkbookEditablePermission } from '@univerjs/sheets';
import SheetsEnUS from '@univerjs/sheets/locale/en-US';
import { UniverSheetsDrawingPlugin } from '@univerjs/sheets-drawing';
import { UniverSheetsDrawingUIPlugin } from '@univerjs/sheets-drawing-ui';
import SheetsDrawingUIEnUS from '@univerjs/sheets-drawing-ui/locale/en-US';
import { UniverSheetsFormulaPlugin } from '@univerjs/sheets-formula';
import { UniverSheetsFormulaUIPlugin } from '@univerjs/sheets-formula-ui';
import SheetsFormulaUIEnUS from '@univerjs/sheets-formula-ui/locale/en-US';
import { UniverSheetsNumfmtPlugin } from '@univerjs/sheets-numfmt';
import { UniverSheetsNumfmtUIPlugin } from '@univerjs/sheets-numfmt-ui';
import SheetsNumfmtUIEnUS from '@univerjs/sheets-numfmt-ui/locale/en-US';
import { UniverSheetsUIPlugin } from '@univerjs/sheets-ui';
import { ISheetClipboardService, type ISheetClipboardHook } from '@univerjs/sheets-ui';
import SheetsUIEnUS from '@univerjs/sheets-ui/locale/en-US';
import { SheetDrawingUpdateController } from '@univerjs/sheets-drawing-ui';
import { UniverUIPlugin } from '@univerjs/ui';
import UIEnUS from '@univerjs/ui/locale/en-US';

// 简体中文语言包（供 QNotes 默认使用中文界面，且未来支持根据外部 locale 切换）
import DesignZhCN from '@univerjs/design/locale/zh-CN';
import DocsUIZhCN from '@univerjs/docs-ui/locale/zh-CN';
import DrawingUIZhCN from '@univerjs/drawing-ui/locale/zh-CN';
import SheetsZhCN from '@univerjs/sheets/locale/zh-CN';
import SheetsDrawingUIZhCN from '@univerjs/sheets-drawing-ui/locale/zh-CN';
import SheetsUIZhCN from '@univerjs/sheets-ui/locale/zh-CN';
import SheetsFormulaUIZhCN from '@univerjs/sheets-formula-ui/locale/zh-CN';
import SheetsNumfmtUIZhCN from '@univerjs/sheets-numfmt-ui/locale/zh-CN';
import UIZhCN from '@univerjs/ui/locale/zh-CN';

import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';
import '@univerjs/drawing-ui/lib/index.css';
import '@univerjs/sheets-ui/lib/index.css';
import '@univerjs/sheets-drawing-ui/lib/index.css';
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

  /**
   * Optional image source resolvers used when rich HTML paste contains image references
   * that the browser cannot access directly, such as `file:///.../ksohtml/clip_image*.png`.
   *
   * This mirrors the strategy already used by `editorjs-table`.
   */
  uploader?: {
    uploadByFile?: (file: File) => Promise<any>;
    uploadByUrl?: (url: string) => Promise<any>;
    importLocalSrc?: (src: string) => Promise<any>;
  };

  /**
   * Univer 内部使用的语言（Locale）。
   *
   * - 不传时默认使用英文（LocaleType.EN_US），与当前实现保持兼容
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

interface CellImagePasteLocation {
  unitId: string;
  subUnitId: string;
  row: number;
  col: number;
}

interface PastedTableCellData {
  text: string;
  imageSrcs: string[];
}

interface ClipboardImageState {
  imageFiles: Array<{ file: File; used: boolean }>;
}

interface PasteCellImageFilesCommandParams {
  files?: File[];
  location?: CellImagePasteLocation;
}

const PASTE_CELL_IMAGE_FILES_COMMAND: ICommand<PasteCellImageFilesCommandParams> = {
  id: 'qnotes.command.paste-cell-image-files',
  type: CommandType.COMMAND,
  handler: async (accessor, params) => {
    const renderManagerService = accessor.get(IRenderManagerService);
    const instanceService = accessor.get(IUniverInstanceService);
    const renderer = getCurrentTypeOfRenderer(
      UniverInstanceType.UNIVER_SHEET,
      instanceService,
      renderManagerService,
    );
    const controller = renderer?.with(SheetDrawingUpdateController);
    const files = (params?.files ?? []).filter(isImageFile);

    if (!controller || files.length === 0) {
      return false;
    }

    const startRow = params?.location?.row ?? 0;
    const startCol = params?.location?.col ?? 0;
    const unitId = params?.location?.unitId;
    const subUnitId = params?.location?.subUnitId;

    const results = await Promise.all(files.map((file, index) => {
      if (unitId && subUnitId) {
        return controller.insertCellImageByFile(file, {
          unitId,
          subUnitId,
          row: startRow + index,
          col: startCol,
        });
      }

      return controller.insertCellImageByFile(file);
    }));

    return results.every(Boolean);
  },
};

function normalizeClipboardFiles(files?: FileList | File[] | null): File[] {
  if (!files) {
    return [];
  }

  if (Array.isArray(files)) {
    return files.filter(Boolean);
  }

  return Array.from(files).filter(Boolean);
}

function extractImageFilesFromDataTransfer(dataTransfer?: DataTransfer | null): File[] {
  if (!dataTransfer) {
    return [];
  }

  const out: File[] = [];
  const seen = new Set<string>();

  const pushFile = (file: File | null | undefined) => {
    if (!isImageFile(file)) {
      return;
    }

    const key = [String(file.name || ''), String(file.type || ''), Number(file.size || 0)].join('::');

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    out.push(file);
  };

  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];

  items.forEach((item) => {
    if (!item || item.kind !== 'file' || !/^image\//i.test(String(item.type || ''))) {
      return;
    }

    pushFile(typeof item.getAsFile === 'function' ? item.getAsFile() : null);
  });

  normalizeClipboardFiles(dataTransfer.files).forEach((file) => {
    pushFile(file);
  });

  return out;
}

function isImageFile(file: File | null | undefined): file is File {
  return !!file && /^image\//i.test(String(file.type || ''));
}

const MASKED_CLIPBOARD_IMAGE_SRC = 'data:,';
const ORIGINAL_CLIPBOARD_SRC_ATTRIBUTE = 'data-qnotes-original-src';

function isLocalClipboardTempImageUrl(url: string): boolean {
  const value = String(url || '').trim();

  if (!value) {
    return false;
  }

  return /^file:\/\/\/[a-z]:\/users\/[^/]+\/appdata\/local\/temp\/(?:ksohtml|wps|excel)[^/]*\/clip_image\d+\.(png|jpg|jpeg|gif|bmp|webp|svg)$/i.test(
    value.replace(/\\/g, '/'),
  );
}

function isTemporaryClipboardImageSrc(src: string): boolean {
  return /^(file:|cid:|ms-appx:|about:blank$)/i.test(String(src || '').trim());
}

function escapeHtmlAttribute(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function sanitizeClipboardHtmlForDom(html: string): string {
  return String(html || '').replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match, prefix, doubleQuoted, singleQuoted, bare) => {
      const src = doubleQuoted || singleQuoted || bare || '';

      if (!isLocalClipboardTempImageUrl(src)) {
        return match;
      }

      return `${prefix}"${MASKED_CLIPBOARD_IMAGE_SRC}" ${ORIGINAL_CLIPBOARD_SRC_ATTRIBUTE}="${escapeHtmlAttribute(src)}"`;
    },
  );
}

function getPreferredClipboardImageElementSrc(image: HTMLImageElement): string {
  if (!image || typeof image.getAttribute !== 'function') {
    return '';
  }

  return String(
    image.getAttribute(ORIGINAL_CLIPBOARD_SRC_ATTRIBUTE)
    || image.getAttribute('src')
    || '',
  ).trim();
}

function normalizeFileName(name: string): string {
  return String(name || '').trim().toLowerCase();
}

function getClipboardFileNameFromSrc(src: string): string {
  const normalized = String(src || '').trim();

  if (!normalized) {
    return '';
  }

  const withoutQuery = normalized.split('#')[0].split('?')[0];
  const segments = withoutQuery.split(/[\\/]/);
  const last = segments[segments.length - 1] || withoutQuery;

  if (/^cid:/i.test(last)) {
    return normalizeFileName(last.replace(/^cid:/i, ''));
  }

  return normalizeFileName(last.replace(/^file:/i, ''));
}

function createClipboardImageState(files?: FileList | File[] | null) {
  return {
    imageFiles: normalizeClipboardFiles(files)
      .filter((file) => isImageFile(file))
      .map((file) => ({ file, used: false })),
  };
}

function consumeClipboardImageFile(
  src: string,
  clipboardState: { imageFiles: Array<{ file: File; used: boolean }> },
): File | null {
  const unusedFiles = Array.isArray(clipboardState.imageFiles) ? clipboardState.imageFiles : [];
  const targetName = getClipboardFileNameFromSrc(src);

  if (targetName) {
    const matched = unusedFiles.find(
      (entry) => entry && !entry.used && normalizeFileName(entry.file?.name) === targetName,
    );

    if (matched) {
      matched.used = true;
      return matched.file;
    }
  }

  const fallback = unusedFiles.find((entry) => entry && !entry.used);

  if (!fallback) {
    return null;
  }

  fallback.used = true;
  return fallback.file;
}

function dataUrlToFile(dataUrl: string, name = 'pasted-image.png'): File | null {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);

  if (!match) {
    return null;
  }

  const mime = match[1] || 'application/octet-stream';
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], name, { type: mime });
}

function getUploadedUrl(result: any): string {
  if (!result || typeof result !== 'object') {
    return '';
  }

  if (result.file && typeof result.file.url === 'string' && result.file.url) {
    return result.file.url;
  }

  if (typeof result.url === 'string' && result.url) {
    return result.url;
  }

  return '';
}

function escapeHtmlContent(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeClipboardExportImageSrc(src: string): string {
  const normalizedSrc = String(src || '').trim();

  if (!normalizedSrc) {
    return '';
  }

  if (/^(data:image\/|https?:\/\/|blob:)/i.test(normalizedSrc)) {
    return normalizedSrc;
  }

  if (/^(\/|\.\/|\.\.\/)/.test(normalizedSrc)) {
    try {
      if (typeof window !== 'undefined' && window.location?.href) {
        return new URL(normalizedSrc, window.location.href).toString();
      }
    } catch (_) {
      // fall through
    }
  }

  return normalizedSrc;
}

function getCellDrawingImageSrcs(cell: any): string[] {
  const snapshot = cell?.p;
  const drawingsOrder = Array.isArray(snapshot?.drawingsOrder) ? snapshot.drawingsOrder : [];
  const drawings = snapshot?.drawings && typeof snapshot.drawings === 'object' ? snapshot.drawings : null;

  if (!drawings || drawingsOrder.length === 0) {
    return [];
  }

  return drawingsOrder
    .map((drawingId: string) => drawings?.[drawingId])
    .filter(Boolean)
    .map((drawing: any) => normalizeClipboardExportImageSrc(drawing?.source))
    .filter(Boolean);
}

function buildCellImageCopyHtml(cell: any): string {
  const imageSrcs = getCellDrawingImageSrcs(cell);

  if (imageSrcs.length === 0) {
    return '';
  }

  const imageHtml = imageSrcs
    .map((src) => `<img src="${escapeHtmlAttribute(src)}" />`)
    .join('');

  return imageHtml;
}

function getCellPlainTextForCopy(cell: any): string {
  if (!cell) {
    return '';
  }

  if (cell?.p?.body && typeof cell.p.body.dataStream === 'string') {
    return String(cell.p.body.dataStream)
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\uFFF9-\uFFFC]/g, '')
      .trim();
  }

  if (cell?.v == null) {
    return '';
  }

  return String(cell.v)
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF\uFFF9-\uFFFC]/g, '')
    .trim();
}

function parseDimension(value: string | null | undefined): number {
  if (value == null || value === '') {
    return 0;
  }

  const match = String(value).match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function getWrapperForImage(image: HTMLImageElement): HTMLElement | null {
  const wrapper = image?.parentElement;

  if (!wrapper) {
    return null;
  }

  if (!['SPAN', 'DIV'].includes(wrapper.tagName)) {
    return null;
  }

  if (wrapper.childElementCount !== 1 || wrapper.textContent?.trim() !== '') {
    return null;
  }

  return wrapper;
}

function isExcelWrappedImage(image: HTMLImageElement): boolean {
  const wrapper = getWrapperForImage(image);

  if (!wrapper || !wrapper.style) {
    return false;
  }

  return wrapper.style.position === 'absolute' || /vglayout/i.test(wrapper.getAttribute('style') || '');
}

function getImageBoxMetrics(image: HTMLImageElement): { width: number; height: number } {
  const wrapper = getWrapperForImage(image);

  const width = Math.max(
    parseDimension(image.getAttribute('width')),
    parseDimension(wrapper?.style?.width),
  );
  const height = Math.max(
    parseDimension(image.getAttribute('height')),
    parseDimension(wrapper?.style?.height),
  );

  return { width, height };
}

function isMeaningfulExcelImage(image: HTMLImageElement): boolean {
  if (!isExcelWrappedImage(image)) {
    return true;
  }

  const { width, height } = getImageBoxMetrics(image);
  return width > 4 && height > 4;
}

function cleanupExcelImageMarkup(root: HTMLElement): void {
  const images = Array.from(root.querySelectorAll('img[src]')) as HTMLImageElement[];
  const excelWrappedImages = images.filter((image) => isExcelWrappedImage(image));

  if (excelWrappedImages.length === 0) {
    return;
  }

  let keptMeaningfulImage = false;

  for (const image of excelWrappedImages) {
    const wrapper = getWrapperForImage(image);

    if (!isMeaningfulExcelImage(image) || keptMeaningfulImage) {
      if (wrapper) {
        wrapper.remove();
      } else {
        image.remove();
      }
      continue;
    }

    const cleanImage = image.cloneNode(true) as HTMLImageElement;
    cleanImage.removeAttribute('width');
    cleanImage.removeAttribute('height');
    cleanImage.removeAttribute('style');

    if (wrapper) {
      wrapper.replaceWith(cleanImage);
    } else {
      image.replaceWith(cleanImage);
    }

    keptMeaningfulImage = true;
  }

  for (const node of Array.from(root.querySelectorAll('span,div'))) {
    const element = node as HTMLElement;

    if (!element.textContent?.trim() && element.querySelector('img') === null) {
      element.remove();
    }
  }

  root.innerHTML = root.innerHTML.trim();
}


function parsePastedHtmlTable(html: string): PastedTableCellData[][] | null {
  if (!html || typeof document === 'undefined') {
    return null;
  }

  const container = document.createElement('div');
  container.innerHTML = sanitizeClipboardHtmlForDom(html);

  const table = container.querySelector('table');

  if (!table) {
    return null;
  }

  const rows = Array.from(table.querySelectorAll('tr'));

  if (rows.length === 0) {
    return null;
  }

  return rows.map((row) => {
    const cells = Array.from(row.querySelectorAll('th,td'));

    return cells.map((cell) => {
      cleanupExcelImageMarkup(cell as HTMLElement);

      const imageSrcs = Array.from(cell.querySelectorAll('img[src]'))
        .map((image) => getPreferredClipboardImageElementSrc(image as HTMLImageElement))
        .filter(Boolean);

      const text = (cell.textContent || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();

      return {
        text,
        imageSrcs,
      };
    });
  });
}

async function resolveCellImageSource(
  src: string,
  clipboardState: ClipboardImageState,
  uploader?: UniverSheetConfig['uploader'],
): Promise<File | string | null> {
  const normalizedSrc = String(src || '').trim();

  if (!normalizedSrc) {
    return null;
  }

  if (/^data:image\//i.test(normalizedSrc)) {
    const file = dataUrlToFile(normalizedSrc);

    if (file && typeof uploader?.uploadByFile === 'function') {
      return getUploadedUrl(await uploader.uploadByFile(file)) || file;
    }

    return file;
  }

  if (/^https?:\/\//i.test(normalizedSrc)) {
    if (typeof uploader?.uploadByUrl === 'function') {
      return getUploadedUrl(await uploader.uploadByUrl(normalizedSrc)) || normalizedSrc;
    }

    return normalizedSrc;
  }

  // Accept site-local uploaded image URLs like "/uploads/xxx.png" or "./uploads/xxx.png".
  if (/^(\/|\.\/|\.\.\/)/.test(normalizedSrc) || (/^[^:/?#]+(?:\/[^?#]*)?$/.test(normalizedSrc) && !isTemporaryClipboardImageSrc(normalizedSrc))) {
    try {
      if (typeof window !== 'undefined' && window.location?.href) {
        return new URL(normalizedSrc, window.location.href).toString();
      }
    } catch (_) {
      // fall through and return the original relative URL
    }

    return normalizedSrc;
  }

  if (/^blob:/i.test(normalizedSrc)) {
    return normalizedSrc;
  }

  if (isTemporaryClipboardImageSrc(normalizedSrc)) {
    const clipboardFile = consumeClipboardImageFile(normalizedSrc, clipboardState);

    if (clipboardFile && typeof uploader?.uploadByFile === 'function') {
      return getUploadedUrl(await uploader.uploadByFile(clipboardFile)) || clipboardFile;
    }

    if (clipboardFile) {
      return clipboardFile;
    }

    if (typeof uploader?.importLocalSrc === 'function') {
      return getUploadedUrl(await uploader.importLocalSrc(normalizedSrc)) || normalizedSrc;
    }
  }

  return null;
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
  private facadeAPI: any | null = null;
  private sheetClipboardService: ISheetClipboardService | null = null;
  private workbookRef: any | null = null;

  private canvasWrapperEl: HTMLDivElement | null = null;
  private canvasWrapperParentEl: HTMLElement | null = null;
  private fullscreenOverlayEl: HTMLDivElement | null = null;
  private fullscreenToggleButtonEl: HTMLButtonElement | null = null;
  private isFullscreen = false;
  private hasInteractionFocus = false;

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
      const w = window as unknown as {
        __QNotesUniverSheets?: Set<UniverSheetTool>;
        __QNotesActiveUniverSheet?: UniverSheetTool | null;
      };
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

  private markAsActivePasteContext(): void {
    if (typeof window === 'undefined') {
      return;
    }

    (window as any).__QNotesActiveUniverSheet = this;
  }

  /**
   * 供宿主应用在运行时切换只读状态（例如 QNotes 中的“开始编辑 / 只读查看”）时调用。
   */
  public containsEventTarget(target: EventTarget | null | undefined): boolean {
    if (!(target instanceof Node)) {
      return false;
    }

    return !!(
      (this.inlineContainerEl && this.inlineContainerEl.contains(target))
      || (this.canvasWrapperEl && this.canvasWrapperEl.contains(target))
    );
  }

  public isRenderedInsideHolder(holder: Element | null | undefined): boolean {
    if (!(holder instanceof Element)) {
      return false;
    }

    return !!(
      (this.canvasWrapperParentEl && holder.contains(this.canvasWrapperParentEl))
      || (this.canvasWrapperEl && holder.contains(this.canvasWrapperEl))
      || (this.inlineContainerEl && holder.contains(this.inlineContainerEl))
    );
  }

  public isPasteContextActive(
    target: EventTarget | null | undefined,
    activeElement?: Element | null,
  ): boolean {
    const focusedElement = activeElement ?? (typeof document !== 'undefined' ? document.activeElement : null);

    if (this.containsEventTarget(target) || this.containsEventTarget(focusedElement)) {
      return true;
    }

    if (this.hasInteractionFocus) {
      return true;
    }

    if (typeof window !== 'undefined') {
      const w = window as unknown as { __QNotesActiveUniverSheet?: UniverSheetTool | null };
      return w.__QNotesActiveUniverSheet === this;
    }

    return false;
  }

  public async handleExternalHtmlTablePaste(payload: {
    html?: string;
    clipboardData?: DataTransfer | null;
    univerAPI?: any;
  }): Promise<boolean> {
    if (this.readOnly || !this.inlineRuntime) {
      return false;
    }

    const html = String(payload?.html || '');
    const parsedTable = parsePastedHtmlTable(html);

    if (!parsedTable || !parsedTable.some((row) => row.some((cell) => cell.imageSrcs.length > 0))) {
      return false;
    }

    const univerAPI = payload?.univerAPI || this.facadeAPI;
    const activeWorkbook =
      univerAPI?.getActiveWorkbook?.()
      || univerAPI?.getWorkbook?.()
      || null;
    const activeSheet = activeWorkbook?.getActiveSheet?.() || null;
    const activeRange =
      activeSheet?.getActiveRange?.()
      || activeWorkbook?.getActiveRange?.()
      || null;

    if (!activeSheet || !activeRange) {
      return false;
    }

    const startRow = activeRange.getRow();
    const startCol = activeRange.getColumn();
    const rowCount = parsedTable.length;
    const colCount = parsedTable.reduce((max, row) => Math.max(max, row.length), 0);
    const textMatrix = parsedTable.map((row) => {
      const nextRow = new Array<string>(colCount).fill('');

      row.forEach((cell, columnIndex) => {
        nextRow[columnIndex] = cell.imageSrcs.length > 0 ? '' : cell.text;
      });

      return nextRow;
    });
    const clipboardImageState = createClipboardImageState(
      extractImageFilesFromDataTransfer(payload?.clipboardData || null),
    );

    activeSheet.getRange(startRow, startCol, rowCount, colCount).setValues(textMatrix);

    for (let rowOffset = 0; rowOffset < parsedTable.length; rowOffset++) {
      const row = parsedTable[rowOffset];

      for (let colOffset = 0; colOffset < row.length; colOffset++) {
        const cell = row[colOffset];

        if (cell.imageSrcs.length === 0) {
          continue;
        }

        const source = await resolveCellImageSource(
          cell.imageSrcs[0],
          clipboardImageState,
          this.config.uploader,
        );

        if (!source) {
          continue;
        }

        await activeSheet.getRange(startRow + rowOffset, startCol + colOffset).insertCellImageAsync(source);
      }
    }

    const exported = await this.inlineRuntime.exportData?.();
    if (exported != null) {
      this.univerData = exported;
    }

    if (this.config && typeof this.config.onDataChange === 'function') {
      this.config.onDataChange({ snapshot: this.univerData ?? null });
    }

    return true;
  }

  public async getClipboardCopyPayload(): Promise<{ html: string; plain: string } | null> {
    if (!this.inlineRuntime || !this.sheetClipboardService) {
      return null;
    }

    const univerAPI = this.facadeAPI;
    const activeWorkbook =
      univerAPI?.getActiveWorkbook?.()
      || univerAPI?.getWorkbook?.()
      || this.workbookRef
      || null;
    const activeSheet = activeWorkbook?.getActiveSheet?.() || null;
    const activeRange =
      activeSheet?.getActiveRange?.()
      || activeWorkbook?.getActiveRange?.()
      || null;
    const unitId = activeWorkbook?.getUnitId?.() || activeWorkbook?.getId?.() || this.workbookRef?.getUnitId?.();
    const subUnitId = activeSheet?.getSheetId?.() || activeSheet?.getId?.();

    if (!activeRange || !unitId || !subUnitId) {
      return null;
    }

    const discreteRange = {
      startRow: activeRange.getRow(),
      endRow: activeRange.getRow() + activeRange.getHeight() - 1,
      startColumn: activeRange.getColumn(),
      endColumn: activeRange.getColumn() + activeRange.getWidth() - 1,
    };

    const content = this.sheetClipboardService.generateCopyContent(unitId, subUnitId, discreteRange as any);

    if (!content || (!content.html && !content.plain)) {
      return null;
    }

    return {
      html: String(content.html || ''),
      plain: String(content.plain || ''),
    };
  }

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
    canvasWrapper.addEventListener('mousedown', () => {
      this.markAsActivePasteContext();
    }, true);
    canvasWrapper.addEventListener('focusin', () => {
      this.markAsActivePasteContext();
    }, true);

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
      const w = window as unknown as {
        __QNotesUniverSheets?: Set<UniverSheetTool>;
        __QNotesActiveUniverSheet?: UniverSheetTool | null;
      };
      const set = w.__QNotesUniverSheets;
      if (set && typeof set.delete === 'function') {
        set.delete(this);
      }
      if (w.__QNotesActiveUniverSheet === this) {
        w.__QNotesActiveUniverSheet = null;
      }
    }
  }

  private markInteractionActive(): void {
    this.hasInteractionFocus = true;

    if (typeof window !== 'undefined') {
      const w = window as unknown as { __QNotesActiveUniverSheet?: UniverSheetTool | null };
      w.__QNotesActiveUniverSheet = this;
    }
  }

  private clearInteractionActive(): void {
    this.hasInteractionFocus = false;

    if (typeof window !== 'undefined') {
      const w = window as unknown as { __QNotesActiveUniverSheet?: UniverSheetTool | null };
      if (w.__QNotesActiveUniverSheet === this) {
        w.__QNotesActiveUniverSheet = null;
      }
    }
  }

  private handleWheelWithinContainer = (event: WheelEvent): void => {
    if (!this.containsEventTarget(event.target)) {
      return;
    }

    this.markInteractionActive();

    // Keep wheel scrolling scoped to Univer while the pointer remains inside the sheet area.
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    event.preventDefault();
  };

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
        ...(DrawingUIEnUS as any),
        ...(SheetsEnUS as any),
        ...(SheetsDrawingUIEnUS as any),
        ...(SheetsUIEnUS as any),
        ...(SheetsFormulaUIEnUS as any),
        ...(SheetsNumfmtUIEnUS as any),
      };

      const zhLocale = {
        ...(DesignZhCN as any),
        ...(UIZhCN as any),
        ...(DocsUIZhCN as any),
        ...(DrawingUIZhCN as any),
        ...(SheetsZhCN as any),
        ...(SheetsDrawingUIZhCN as any),
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

      // 内置一份基础 locales 映射，确保即便宿主不传 locales 也能正常工作
      const builtinLocales: Record<string, any> = {
        [LocaleType.EN_US]: enLocale,
        [LocaleType.ZH_CN]: zhLocale,
      };

      // 允许宿主应用通过 config.locales 扩展/覆盖内置语言配置
      const mergedLocales: Record<string, any> = {
        ...builtinLocales,
        ...(this.config.locales ?? {}),
      };

      // 按官方文档（插件模式）组合最小 Sheets 应用
      const univer = new Univer({
        theme: defaultTheme,
        locale,
        locales: mergedLocales as any,
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
      univer.registerPlugin(UniverDocsDrawingPlugin);

      // Drawing / Images 相关
      univer.registerPlugin(UniverDrawingPlugin);
      univer.registerPlugin(UniverDrawingUIPlugin);

      // Sheets 相关
      univer.registerPlugin(UniverSheetsPlugin);
      univer.registerPlugin(UniverSheetsUIPlugin);
      univer.registerPlugin(UniverSheetsDrawingPlugin);
      univer.registerPlugin(UniverSheetsDrawingUIPlugin);
      univer.registerPlugin(UniverSheetsFormulaPlugin);
      univer.registerPlugin(UniverSheetsFormulaUIPlugin);
      univer.registerPlugin(UniverSheetsNumfmtPlugin);
      univer.registerPlugin(UniverSheetsNumfmtUIPlugin);

      // 通过 createUnit 创建或还原一个 Workbook 实例，并直接持有该实例，用其 getSnapshot() 导出数据
      let workbook: any | null = null;
      this.workbookRef = null;

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
        this.workbookRef = workbook;
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
      const domCleanupCallbacks: Array<() => void> = [];
      let restoreDefaultImagePasteHook: (() => void) | null = null;

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
        this.facadeAPI = univerAPI;

        const injector = (univer as any).__getInjector?.();

        if (injector && typeof injector.get === 'function') {
          const commandService = injector.get(ICommandService) as ICommandService;
          const clipboardService = injector.get(ISheetClipboardService) as ISheetClipboardService;
          this.sheetClipboardService = clipboardService ?? null;

          if (commandService && typeof commandService.registerCommand === 'function') {
            dataChangeDisposers.push(commandService.registerCommand(PASTE_CELL_IMAGE_FILES_COMMAND));
          }

          if (clipboardService) {
            const buildPasteCellImageFilesRedo = (
              pasteTo: { unitId: string; subUnitId: string; range: { rows: number[]; cols: number[] } },
              files: File[],
            ) => {
              const imageFiles = files.filter(isImageFile);

              if (this.readOnly || imageFiles.length === 0) {
                return { undos: [], redos: [] };
              }

              return {
                undos: [],
                redos: [
                  {
                    id: PASTE_CELL_IMAGE_FILES_COMMAND.id,
                    params: {
                      files: imageFiles,
                      location: {
                        unitId: pasteTo.unitId,
                        subUnitId: pasteTo.subUnitId,
                        row: pasteTo.range.rows[0] ?? 0,
                        col: pasteTo.range.cols[0] ?? 0,
                      },
                    },
                  },
                ],
              };
            };

            const existingImageHook =
              typeof clipboardService.getClipboardHooks === 'function'
                ? clipboardService.getClipboardHooks().find((hook) => hook.id === 'SHEET_IMAGE_UI_PLUGIN')
                : null;

            if (existingImageHook) {
              const originalOnPasteFiles = existingImageHook.onPasteFiles?.bind(existingImageHook);

              existingImageHook.onPasteFiles = (pasteTo, files, options) => {
                const imageFiles = files.filter(isImageFile);

                if (imageFiles.length > 0 && !this.readOnly) {
                  return buildPasteCellImageFilesRedo(pasteTo, imageFiles);
                }

                return originalOnPasteFiles?.(pasteTo, files, options) ?? { undos: [], redos: [] };
              };

              restoreDefaultImagePasteHook = () => {
                existingImageHook.onPasteFiles = originalOnPasteFiles;
              };
            } else if (typeof clipboardService.addClipboardHook === 'function') {
              const pasteImageFilesHook: ISheetClipboardHook = {
                id: 'QNOTES_PASTE_CELL_IMAGE_FILES',
                priority: -1,
                onPasteFiles: (pasteTo, files) => buildPasteCellImageFilesRedo(pasteTo, files),
              };

              dataChangeDisposers.push(clipboardService.addClipboardHook(pasteImageFilesHook));
            }

            if (typeof clipboardService.addClipboardHook === 'function') {
              let copiedWorksheet: any | null = null;

              const copyCellImagesHook: ISheetClipboardHook = {
                id: 'QNOTES_COPY_CELL_IMAGES',
                priority: -1,
                onBeforeCopy: (unitId, subUnitId, range, copyType) => {
                  copiedWorksheet = unitId === workbook?.getUnitId?.()
                    ? workbook?.getSheetBySheetId?.(subUnitId) ?? null
                    : null;

                  // eslint-disable-next-line no-console
                },
                onCopyCellContent: (row, col) => {
                  const cell = copiedWorksheet?.getCell?.(row, col);
                  const imageContent = buildCellImageCopyHtml(cell);

                  // eslint-disable-next-line no-console

                  if (!imageContent) {
                    return '';
                  }

                  const text = getCellPlainTextForCopy(cell);
                  const textHtml = text ? `<span>${escapeHtmlContent(text)}</span>` : '';

                  return `${textHtml}${imageContent}`;
                },
                onAfterCopy: () => {
                  copiedWorksheet = null;
                },
              };

              dataChangeDisposers.push(clipboardService.addClipboardHook(copyCellImagesHook));
            }
          }
        }

        if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
          const markInteractionActive = () => {
            this.markInteractionActive();
          };
          const syncInteractionContext = (event: Event) => {
            const target = event.target;
            const activeElement = document.activeElement;
            const targetInsideContainer = this.containsEventTarget(target);
            const activeInsideContainer = this.containsEventTarget(activeElement);

            if (targetInsideContainer) {
              this.markInteractionActive();
              return;
            }

            // Univer may move the real keyboard/clipboard focus to an off-container host element.
            // Keep this tool active across external focus hops, and only clear when the user clicks away.
            if (event.type === 'pointerdown' && this.isPasteContextActive(null)) {
              this.clearInteractionActive();
              return;
            }
          };

          container.addEventListener('pointerdown', markInteractionActive, true);
          container.addEventListener('focusin', markInteractionActive, true);
          container.addEventListener('keydown', markInteractionActive, true);
          container.addEventListener('wheel', this.handleWheelWithinContainer, { capture: true, passive: false });
          document.addEventListener('pointerdown', syncInteractionContext, true);
          document.addEventListener('focusin', syncInteractionContext, true);
          domCleanupCallbacks.push(() => {
            container.removeEventListener('pointerdown', markInteractionActive, true);
            container.removeEventListener('focusin', markInteractionActive, true);
            container.removeEventListener('keydown', markInteractionActive, true);
            container.removeEventListener('wheel', this.handleWheelWithinContainer, true);
            document.removeEventListener('pointerdown', syncInteractionContext, true);
            document.removeEventListener('focusin', syncInteractionContext, true);
            this.clearInteractionActive();
          });

          const handleHtmlTableImagePaste = (event: ClipboardEvent) => {
            if (this.readOnly) {
              return;
            }

            const target = event.target;
            const activeElement = document.activeElement;
            const pasteContextActive = this.isPasteContextActive(target, activeElement);

            if (!pasteContextActive) {
              return;
            }

            const clipboardData = event.clipboardData;
            const html = clipboardData?.getData('text/html') || '';
            const parsedTable = parsePastedHtmlTable(html);

            if (!parsedTable || !parsedTable.some((row) => row.some((cell) => cell.imageSrcs.length > 0))) {
              return;
            }

            const activeWorkbook = univerAPI?.getActiveWorkbook?.();
            const activeSheet = activeWorkbook?.getActiveSheet?.();
            const activeRange = activeSheet?.getActiveRange?.() || activeWorkbook?.getActiveRange?.();

            if (!activeSheet || !activeRange) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation?.();

            void (async () => {
              try {
                const startRow = activeRange.getRow();
                const startCol = activeRange.getColumn();
                const rowCount = parsedTable.length;
                const colCount = parsedTable.reduce((max, row) => Math.max(max, row.length), 0);
                const textMatrix = parsedTable.map((row) => {
                  const nextRow = new Array<string>(colCount).fill('');

                  row.forEach((cell, columnIndex) => {
                    // When a cell contains an image, we let the cell-image payload win to avoid overwrite prompts.
                    nextRow[columnIndex] = cell.imageSrcs.length > 0 ? '' : cell.text;
                  });

                  return nextRow;
                });
                const clipboardImageState = createClipboardImageState(
                  extractImageFilesFromDataTransfer(clipboardData),
                );
                const targetRange = activeSheet.getRange(startRow, startCol, rowCount, colCount);

                targetRange.setValues(textMatrix);

                for (let rowOffset = 0; rowOffset < parsedTable.length; rowOffset++) {
                  const row = parsedTable[rowOffset];

                  for (let colOffset = 0; colOffset < row.length; colOffset++) {
                    const cell = row[colOffset];

                    if (cell.imageSrcs.length === 0) {
                      continue;
                    }

                    const source = await resolveCellImageSource(
                      cell.imageSrcs[0],
                      clipboardImageState,
                      this.config.uploader,
                    );

                    if (!source) {
                      continue;
                    }

                    await activeSheet.getRange(startRow + rowOffset, startCol + colOffset).insertCellImageAsync(source);
                  }
                }

                await handleDataChanged();
              } catch (e) {
                // eslint-disable-next-line no-console
                console.warn('[UniverSheetTool] 处理带图片 HTML 表格粘贴失败：', e);
              }
            })();
          };

          document.addEventListener('paste', handleHtmlTableImagePaste, true);
          domCleanupCallbacks.push(() => {
            document.removeEventListener('paste', handleHtmlTableImagePaste, true);
          });
        }

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
            'OverGridImageInserted',
            'OverGridImageChanged',
            'OverGridImageRemoved',
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
          this.facadeAPI = null;
          this.sheetClipboardService = null;
          this.workbookRef = null;
          domCleanupCallbacks.forEach((cleanup) => {
            try {
              cleanup();
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[UniverSheetTool] 清理 DOM 监听失败：', e);
            }
          });
          domCleanupCallbacks.length = 0;
          restoreDefaultImagePasteHook?.();
          restoreDefaultImagePasteHook = null;
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
