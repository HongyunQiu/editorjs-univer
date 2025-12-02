// Editor.js + Univer Sheet Tool 测试脚本
class SimpleEditorTest {
    constructor() {
        this.editor = null;
        this.savedData = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkEditorJS();
    }

    checkEditorJS() {
        window.addEventListener('load', () => {
            console.log('=== 插件加载检查 ===');
            console.log('EditorJS:', typeof window.EditorJS);
            console.log('Header:', typeof window.Header);
            console.log('Paragraph:', typeof window.Paragraph);
            console.log('Checklist:', typeof window.Checklist);
            console.log('Quote:', typeof window.Quote);
            console.log('Delimiter:', typeof window.Delimiter);
            console.log('UniverSheet:', typeof window.UniverSheet);

            if (typeof window.EditorJS === 'undefined' ||
                typeof window.Header === 'undefined' ||
                typeof window.Paragraph === 'undefined' ||
                typeof window.Checklist === 'undefined' ||
                typeof window.Quote === 'undefined' ||
                typeof window.Delimiter === 'undefined' ||
                typeof window.UniverSheet === 'undefined') {
                this.showMessage('部分插件加载失败（请先在本目录执行 npx vite build 构建 Univer 表格工具）', 'error');
            } else {
                this.showMessage('所有插件加载成功（含 UniverSheet）', 'success');
            }
        });
    }

    bindEvents() {
        document.getElementById('init-editor').addEventListener('click', () => this.initEditor());
        document.getElementById('save-content').addEventListener('click', () => this.saveContent());
        document.getElementById('load-content').addEventListener('click', () => this.loadContent());
        document.getElementById('clear-editor').addEventListener('click', () => this.clearEditor());
    }

    initEditor() {
        try {
            if (this.editor) {
                this.editor.destroy();
            }

            const editorConfig = {
                holder: 'editorjs',
                tools: {
                    header: {
                        class: window.Header,
                        config: {
                            placeholder: '输入标题',
                            levels: [1, 2, 3, 4, 5, 6],
                            defaultLevel: 2
                        }
                    },
                    paragraph: {
                        class: window.Paragraph,
                        inlineToolbar: true,
                        config: {
                            placeholder: '输入段落内容...'
                        }
                    },
                    checklist: {
                        class: window.Checklist,
                        inlineToolbar: true,
                        config: {
                            placeholder: '输入待办事项...'
                        }
                    },
                    quote: {
                        class: window.Quote,
                        inlineToolbar: true,
                        config: {
                            quotePlaceholder: '输入引用内容',
                            captionPlaceholder: '引用作者'
                        }
                    },
                    delimiter: {
                        class: window.Delimiter
                    },
                    // Univer 表格 BlockTool（UMD 暴露为 window.UniverSheet）
                    univerSheet: {
                        class: window.UniverSheet,
                        inlineToolbar: false,
                        config: {
                            // 可自定义标题与按钮文案，均支持 Editor.js i18n
                            title: 'Univer 表格',
                            openButtonText: '全屏编辑'
                        }
                    }
                },
                data: {
                    time: Date.now(),
                    blocks: [
                        {
                            type: "header",
                            data: {
                                text: "Editor.js + Univer 表格工具测试",
                                level: 1
                            }
                        },
                        {
                            type: "paragraph",
                            data: {
                                text: "这是一个包含 UniverSheet BlockTool 的 Editor.js 测试页面。插入该块后，会自动创建一个空表格，并支持全屏编辑。"
                            }
                        },
                        {
                            type: "univerSheet",
                            data: {
                                title: "示例工作簿",
                                univerData: null
                            }
                        }
                    ]
                }
            };

            this.editor = new window.EditorJS(editorConfig);
            this.showMessage('编辑器初始化成功（已注册 Univer 表格工具）', 'success');

        } catch (error) {
            console.error('编辑器初始化失败:', error);
            this.showMessage('编辑器初始化失败: ' + error.message, 'error');
        }
    }

    async saveContent() {
        if (!this.editor) {
            this.showMessage('请先初始化编辑器', 'warning');
            return;
        }

        try {
            const outputData = await this.editor.save();
            this.savedData = outputData;

            const outputElement = document.getElementById('output');
            outputElement.innerHTML = `
                <h4>保存的数据 (JSON格式):</h4>
                <pre>${JSON.stringify(outputData, null, 2)}</pre>
            `;

            this.showMessage('内容保存成功', 'success');

        } catch (error) {
            console.error('保存内容失败:', error);
            this.showMessage('保存内容失败: ' + error.message, 'error');
        }
    }

    async loadContent() {
        if (!this.savedData) {
            this.showMessage('没有可加载的内容', 'warning');
            return;
        }

        if (!this.editor) {
            this.showMessage('请先初始化编辑器', 'warning');
            return;
        }

        try {
            await this.editor.render(this.savedData);
            this.showMessage('内容加载成功', 'success');

        } catch (error) {
            console.error('加载内容失败:', error);
            this.showMessage('加载内容失败: ' + error.message, 'error');
        }
    }

    clearEditor() {
        if (!this.editor) {
            this.showMessage('请先初始化编辑器', 'warning');
            return;
        }

        try {
            this.editor.clear();
            document.getElementById('output').innerHTML = '';
            this.savedData = null;
            this.showMessage('编辑器已清空', 'success');

        } catch (error) {
            console.error('清空编辑器失败:', error);
            this.showMessage('清空编辑器失败: ' + error.message, 'error');
        }
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message message-${type}`;
        messageDiv.textContent = message;

        document.body.insertBefore(messageDiv, document.body.firstChild);

        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SimpleEditorTest();
});


