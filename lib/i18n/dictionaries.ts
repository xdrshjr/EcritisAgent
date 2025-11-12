/**
 * Dictionary loader for i18n translations
 */

import { Locale } from './config';

// English translations
const en = {
  common: {
    appName: 'DocAIMaster',
    appDescription: 'AI-powered document editing, modification, and validation tool',
  },
  header: {
    title: 'DocAIMaster',
    export: 'Export',
  },
  taskbar: {
    aiDocValidation: 'AI Document Validation',
  },
  footer: {
    copyright: '© 2025 DocAIMaster. All rights reserved.',
  },
  container: {
    welcomeTitle: 'Welcome to DocAIMaster',
    welcomeDescription: 'Your AI-powered document assistant',
  },
  docValidation: {
    uploadDocument: 'Upload Document',
    uploadHint: 'Click to upload or drag and drop',
    uploadHintDetail: 'Word documents (.doc, .docx) up to 10MB',
    validationResults: 'Validation Results',
    validationPlaceholder: 'Validation results will appear here after document analysis',
    aiCheck: 'AI Check',
    validating: 'Validating...',
    validationComplete: 'Validation Complete',
    validationError: 'Validation failed. Please try again.',
    noIssuesFound: 'No issues found',
    chunkProgress: 'Analyzing chunk {{current}} of {{total}}...',
    uploadDocumentFirst: 'Please upload a document first',
    editorPlaceholder: {
      title: 'Welcome to AI Document Editor',
      subtitle: 'Your Intelligent Document Editing Assistant',
      section1Title: 'Getting Started',
      section1Content: 'Welcome! You can start editing immediately in this powerful rich-text editor. No document upload required - just begin typing and let your creativity flow. This editor provides you with all the tools you need to create professional documents.',
      section2Title: 'Two Ways to Work',
      section2Item1: 'Create New: Start writing directly in this editor using the formatting toolbar above',
      section2Item2: 'Upload Existing: Click the "Upload Document" button or drag and drop a Word file (.doc, .docx) onto this area',
      section3Title: 'Powerful Features',
      section3Content: 'The toolbar provides comprehensive formatting options including bold, italic, underline, headings, lists, text alignment, and more. All changes are saved automatically as you type, so you never lose your work.',
      section4Title: 'Export Your Work',
      section4Content: 'When you\'re finished, simply click the "Export" button in the top-right corner to download your document as a professional Word file (.docx). Your formatting will be preserved perfectly.',
      section5Title: 'Tips for Best Results',
      section5Tip1: 'Use headings to structure your document and make it easier to navigate',
      section5Tip2: 'Take advantage of the alignment tools to create professional-looking layouts',
      section5Tip3: 'Save your work regularly by exporting - it only takes one click!',
      footer: 'Ready to begin? Clear this text and start typing, or upload your document to get started!',
    },
    editorToolbar: {
      bold: 'Bold',
      italic: 'Italic',
      underline: 'Underline',
      strike: 'Strike',
      heading1: 'Heading 1',
      heading2: 'Heading 2',
      bulletList: 'Bullet List',
      orderedList: 'Numbered List',
      alignLeft: 'Align Left',
      alignCenter: 'Align Center',
      alignRight: 'Align Right',
      undo: 'Undo',
      redo: 'Redo',
    },
    uploading: 'Uploading...',
    uploadSuccess: 'Document uploaded successfully',
    uploadError: 'Failed to upload document',
    exportError: 'Failed to export document',
  },
  chat: {
    title: 'AI Assistant',
    welcomeMessage: 'Hello! I\'m your AI assistant. How can I help you today?',
    inputPlaceholder: 'Type your message...',
    sendButton: 'Send',
    closeButton: 'Close chat',
    openButton: 'Open chat',
    thinking: 'Thinking...',
    errorMessage: 'Sorry, I encountered an error. Please try again.',
    configError: 'Chat is not configured. Please check your settings.',
  },
};

// Chinese translations
const zh = {
  common: {
    appName: 'DocAIMaster',
    appDescription: 'AI驱动的文档编辑、修改和验证工具',
  },
  header: {
    title: 'DocAIMaster',
    export: '导出',
  },
  taskbar: {
    aiDocValidation: 'AI文档校验',
  },
  footer: {
    copyright: '© 2025 DocAIMaster. 保留所有权利。',
  },
  container: {
    welcomeTitle: '欢迎使用 DocAIMaster',
    welcomeDescription: '您的AI文档助手',
  },
  docValidation: {
    uploadDocument: '上传文档',
    uploadHint: '点击上传或拖放文件',
    uploadHintDetail: 'Word文档 (.doc, .docx) 最大10MB',
    validationResults: '校验结果',
    validationPlaceholder: '文档分析后，校验结果将显示在这里',
    aiCheck: 'AI检查',
    validating: '校验中...',
    validationComplete: '校验完成',
    validationError: '校验失败，请重试。',
    noIssuesFound: '未发现问题',
    chunkProgress: '正在分析第 {{current}} / {{total}} 段...',
    uploadDocumentFirst: '请先上传文档',
    editorPlaceholder: {
      title: '欢迎使用AI文档编辑器',
      subtitle: '您的智能文档编辑助手',
      section1Title: '快速入门',
      section1Content: '欢迎！您可以立即在这个强大的富文本编辑器中开始编辑。无需上传文档 - 只需开始输入，让您的创意自由流动。此编辑器为您提供创建专业文档所需的所有工具。',
      section2Title: '两种工作方式',
      section2Item1: '创建新文档：直接在此编辑器中使用上方的格式工具栏开始写作',
      section2Item2: '上传现有文档：点击"上传文档"按钮或将Word文件（.doc, .docx）拖放到此区域',
      section3Title: '强大功能',
      section3Content: '工具栏提供全面的格式选项，包括粗体、斜体、下划线、标题、列表、文本对齐等。所有更改都会在您输入时自动保存，因此您永远不会丢失工作。',
      section4Title: '导出您的作品',
      section4Content: '完成后，只需点击右上角的"导出"按钮，即可将文档下载为专业的Word文件（.docx）。您的格式将被完美保留。',
      section5Title: '最佳实践建议',
      section5Tip1: '使用标题来构建文档结构，使其更易于导航',
      section5Tip2: '利用对齐工具创建专业外观的布局',
      section5Tip3: '定期导出保存您的工作 - 只需一键即可完成！',
      footer: '准备开始了吗？清除此文本并开始输入，或上传您的文档即可开始！',
    },
    editorToolbar: {
      bold: '粗体',
      italic: '斜体',
      underline: '下划线',
      strike: '删除线',
      heading1: '标题1',
      heading2: '标题2',
      bulletList: '项目符号',
      orderedList: '编号列表',
      alignLeft: '左对齐',
      alignCenter: '居中对齐',
      alignRight: '右对齐',
      undo: '撤销',
      redo: '重做',
    },
    uploading: '上传中...',
    uploadSuccess: '文档上传成功',
    uploadError: '文档上传失败',
    exportError: '文档导出失败',
  },
  chat: {
    title: 'AI助手',
    welcomeMessage: '您好！我是您的AI助手。有什么可以帮您的吗？',
    inputPlaceholder: '输入您的消息...',
    sendButton: '发送',
    closeButton: '关闭对话',
    openButton: '打开对话',
    thinking: '思考中...',
    errorMessage: '抱歉，遇到了错误。请重试。',
    configError: '聊天未配置。请检查您的设置。',
  },
};

const dictionaries = {
  en,
  zh,
};

export const getDictionary = (locale: Locale) => {
  return dictionaries[locale] || dictionaries.en;
};

export type Dictionary = typeof en;

