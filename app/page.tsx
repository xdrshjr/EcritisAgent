'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Taskbar from '@/components/Taskbar';
import AIDocValidationContainer from '@/components/AIDocValidationContainer';
import AIChatContainer from '@/components/AIChatContainer';
import AIAutoWriterContainer from '@/components/AIAutoWriterContainer';
import SettingsContainer from '@/components/SettingsContainer';
import FloatingChatButton from '@/components/FloatingChatButton';
import { FileCheck, MessageSquare, PenSquare } from 'lucide-react';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { logger } from '@/lib/logger';
import type { Conversation } from '@/components/ConversationList';
import type { Message } from '@/components/ChatPanel';
import type { ValidationResult } from '@/components/AIDocValidationContainer';
import { loadAIChatState, saveAIChatState } from '@/lib/chatStorage';
import type { DocumentParagraph } from '@/lib/documentUtils';

export default function Home() {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);
  
  const [activeTaskId, setActiveTaskId] = useState('ai-chat');
  
  // AI Doc Validation state
  const [editorContent, setEditorContent] = useState<string>('');
  const [isExportReady, setIsExportReady] = useState(false);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [docValidationLeftPanelWidth, setDocValidationLeftPanelWidth] = useState(60);
  const [autoWriterLeftPanelWidth, setAutoWriterLeftPanelWidth] = useState(58);
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  
  // Document content getters/setters for agent
  const [getDocumentContentFn, setGetDocumentContentFn] = useState<(() => string | DocumentParagraph[]) | undefined>(undefined);
  const [updateDocumentContentFn, setUpdateDocumentContentFn] = useState<((content: string | DocumentParagraph[]) => void) | undefined>(undefined);
  
  // AI Chat state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messagesMap, setMessagesMap] = useState<Map<string, Message[]>>(new Map());
  const [isAIChatStateReady, setIsAIChatStateReady] = useState(false);

  useEffect(() => {
    logger.info('Home component mounted', { initialTask: activeTaskId, locale }, 'Home');
    
    // Load default model on mount
    const loadDefaultModel = async () => {
      try {
        logger.debug('Loading default model for document validation', undefined, 'Home');
        const { getDefaultModel } = await import('@/lib/modelConfig');
        const defaultModel = await getDefaultModel();
        
        if (defaultModel) {
          setSelectedModelId(defaultModel.id);
          logger.success('Default model loaded', { 
            modelId: defaultModel.id, 
            modelName: defaultModel.name 
          }, 'Home');
        } else {
          logger.warn('No default model configured', undefined, 'Home');
        }
      } catch (error) {
        logger.error('Failed to load default model', {
          error: error instanceof Error ? error.message : 'Unknown error',
        }, 'Home');
      }
    };
    
    const initializeAIChatState = async () => {
      try {
        logger.info('Initializing AI Chat state from persistent storage', undefined, 'Home');
        const restoredState = await loadAIChatState();

        if (!restoredState) {
          logger.info('No persisted AI Chat state found, starting with empty state', undefined, 'Home');
          return;
        }

        setConversations(restoredState.conversations);
        setActiveConversationId(restoredState.activeConversationId);
        setMessagesMap(restoredState.messagesMap);

        logger.success(
          'AI Chat state restored from persistent storage',
          {
            conversations: restoredState.conversations.length,
            hasActiveConversation: !!restoredState.activeConversationId,
            totalMessages: Array.from(restoredState.messagesMap.values()).reduce(
              (sum, msgs) => sum + msgs.length,
              0
            ),
          },
          'Home'
        );
      } catch (error) {
        logger.error(
          'Failed to initialize AI Chat state from persistent storage',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Home'
        );
      } finally {
        setIsAIChatStateReady(true);
      }
    };

    loadDefaultModel();
    initializeAIChatState();
  }, [locale]);

  useEffect(() => {
    if (!isAIChatStateReady) {
      return;
    }

    const persistState = async () => {
      try {
        logger.debug(
          'Persisting AI Chat state after state change',
          {
            conversations: conversations.length,
            hasActiveConversation: !!activeConversationId,
            messagesMapSize: messagesMap.size,
          },
          'Home'
        );

        await saveAIChatState({
          conversations,
          activeConversationId,
          messagesMap,
        });
      } catch (error) {
        logger.error(
          'Failed to persist AI Chat state',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          'Home'
        );
      }
    };

    void persistState();
  }, [conversations, activeConversationId, messagesMap, isAIChatStateReady]);

  const tasks = [
    {
      id: 'ai-chat',
      title: dict.taskbar.aiChat,
      icon: <MessageSquare className="w-4 h-4" />,
      isActive: activeTaskId === 'ai-chat',
    },
    {
      id: 'ai-auto-writer',
      title: dict.taskbar.aiAutoWriter,
      icon: <PenSquare className="w-4 h-4" />,
      isActive: activeTaskId === 'ai-auto-writer',
    },
    {
      id: 'ai-doc-validation',
      title: dict.taskbar.aiDocValidation,
      icon: <FileCheck className="w-4 h-4" />,
      isActive: activeTaskId === 'ai-doc-validation',
    },
  ];

  const handleTaskChange = (taskId: string) => {
    logger.info('Active task changed', { 
      fromTask: activeTaskId, 
      toTask: taskId,
      floatingChatButtonVisible: taskId !== 'ai-chat',
      preservedState: {
        conversations: conversations.length,
        messagesMapSize: messagesMap.size,
        hasDocument: isExportReady,
        validationResults: validationResults.length,
      }
    }, 'Home');
    setActiveTaskId(taskId);
  };

  const handleSettingsClick = () => {
    logger.info('Settings button clicked', undefined, 'Home');
    setActiveTaskId('settings');
  };

  const handleContentChange = (content: string) => {
    setEditorContent(content);
  };

  const handleExportReadyChange = (ready: boolean) => {
    setIsExportReady(ready);
  };

  const handleExport = async () => {
    logger.info('Export initiated', undefined, 'Home');
    
    try {
      const content = editorContent;
      
      if (!content || content.length === 0) {
        logger.warn('No content to export', undefined, 'Home');
        alert('No content to export. Please upload and edit a document first.');
        return;
      }

      logger.debug('Preparing document for export', { contentLength: content.length }, 'Home');

      // Use html-docx-js for client-side conversion
      const { default: htmlDocx } = await import('html-docx-js/dist/html-docx');
      
      // Create a complete HTML document
      const completeHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: 'Calibri', sans-serif; font-size: 11pt; }
              p { margin: 0 0 10pt 0; }
              h1 { font-size: 16pt; font-weight: bold; }
              h2 { font-size: 14pt; font-weight: bold; }
            </style>
          </head>
          <body>
            ${content}
          </body>
        </html>
      `;

      // Convert HTML to DOCX
      logger.debug('Converting HTML to DOCX', undefined, 'Home');
      const converted = htmlDocx.asBlob(completeHtml);

      // Create download link
      const url = URL.createObjectURL(converted);
      const a = document.createElement('a');
      a.href = url;
      a.download = `edited-document-${Date.now()}.docx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.success('Document exported successfully', { fileName: a.download }, 'Home');

    } catch (error) {
      logger.error('Failed to export document', {
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 'Home');
      alert('Failed to export document. Please try again.');
    }
  };

  // AI Chat handlers
  const handleConversationsChange = useCallback((newConversations: Conversation[]) => {
    logger.debug('Conversations updated', { count: newConversations.length }, 'Home');
    setConversations(newConversations);
  }, []);

  const handleActiveConversationChange = useCallback((conversationId: string | null) => {
    logger.debug('Active conversation changed', { conversationId }, 'Home');
    setActiveConversationId(conversationId);
  }, []);

  const handleMessagesMapChange = useCallback((newMessagesMap: Map<string, Message[]>) => {
    logger.debug('Messages map updated', { 
      conversationCount: newMessagesMap.size,
      totalMessages: Array.from(newMessagesMap.values()).reduce((sum, msgs) => sum + msgs.length, 0)
    }, 'Home');
    setMessagesMap(newMessagesMap);
  }, []);

  // AI Doc Validation handlers
  const handleValidationResultsChange = (results: ValidationResult[] | ((prev: ValidationResult[]) => ValidationResult[])) => {
    if (typeof results === 'function') {
      // Functional update
      setValidationResults((prev) => {
        const newResults = results(prev);
        logger.debug('Validation results updated (functional)', { 
          previousCount: prev.length,
          newCount: newResults.length,
          totalIssues: newResults.reduce((sum, r) => sum + r.issues.length, 0)
        }, 'Home');
        return newResults;
      });
    } else {
      // Direct update
      logger.debug('Validation results updated (direct)', { 
        resultsCount: results.length,
        totalIssues: results.reduce((sum, r) => sum + r.issues.length, 0)
      }, 'Home');
      setValidationResults(results);
    }
  };

  const handleDocValidationPanelWidthChange = (width: number) => {
    setDocValidationLeftPanelWidth(width);
  };

  const handleSelectedModelIdChange = (modelId: string) => {
    logger.info('Selected model changed', { 
      previousModelId: selectedModelId, 
      newModelId: modelId 
    }, 'Home');
    setSelectedModelId(modelId);
  };
  
  const handleDocumentFunctionsReady = useCallback((getContent: () => string | DocumentParagraph[], updateContent: (content: string | DocumentParagraph[]) => void) => {
    logger.debug('Document functions received from editor', undefined, 'Home');
    setGetDocumentContentFn(() => getContent);
    setUpdateDocumentContentFn(() => updateContent);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <Header 
        showExport={activeTaskId === 'ai-doc-validation'}
        onExport={handleExport}
        exportDisabled={!isExportReady}
        tasks={tasks}
        onTaskChange={handleTaskChange}
        onSettingsClick={handleSettingsClick}
      />
      
      <div className="flex-1 flex overflow-hidden">
        <Taskbar tasks={tasks} onTaskChange={handleTaskChange} />
        
        <main className="flex-1 bg-background overflow-hidden">
          {activeTaskId === 'ai-chat' && (
            isAIChatStateReady ? (
              <AIChatContainer 
                conversations={conversations}
                activeConversationId={activeConversationId}
                messagesMap={messagesMap}
                onConversationsChange={handleConversationsChange}
                onActiveConversationChange={handleActiveConversationChange}
                onMessagesMapChange={handleMessagesMapChange}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                <p className="text-sm">Loading chat history...</p>
              </div>
            )
          )}
          {activeTaskId === 'ai-doc-validation' && (
            <AIDocValidationContainer 
              onExportRequest={handleExport}
              onContentChange={handleContentChange}
              onExportReadyChange={handleExportReadyChange}
              validationResults={validationResults}
              onValidationResultsChange={handleValidationResultsChange}
              leftPanelWidth={docValidationLeftPanelWidth}
              onLeftPanelWidthChange={handleDocValidationPanelWidthChange}
              selectedModelId={selectedModelId}
              onSelectedModelIdChange={handleSelectedModelIdChange}
              getDocumentContent={getDocumentContentFn}
              updateDocumentContent={updateDocumentContentFn}
              onDocumentFunctionsReady={handleDocumentFunctionsReady}
            />
          )}
          {activeTaskId === 'ai-auto-writer' && (
            <AIAutoWriterContainer
              leftPanelWidth={autoWriterLeftPanelWidth}
              onLeftPanelWidthChange={setAutoWriterLeftPanelWidth}
              onDocumentFunctionsReady={handleDocumentFunctionsReady}
              onContentChange={handleContentChange}
            />
          )}
          {activeTaskId === 'settings' && (
            <SettingsContainer />
          )}
        </main>
      </div>
      
      <Footer copyright={dict.footer.copyright} />
      
      {/* Floating Chat Button - only visible when NOT in AI Chat task */}
      <FloatingChatButton 
        isVisible={activeTaskId !== 'ai-chat' && activeTaskId !== 'ai-auto-writer'} 
        getDocumentContent={getDocumentContentFn}
        updateDocumentContent={updateDocumentContentFn}
      />
    </div>
  );
}
