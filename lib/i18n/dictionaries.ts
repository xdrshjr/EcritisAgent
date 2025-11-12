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

