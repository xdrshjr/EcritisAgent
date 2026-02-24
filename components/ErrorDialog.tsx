/**
 * ErrorDialog Component
 * Displays error messages in an elegant modal dialog
 * Provides user-friendly error information with helpful suggestions
 */

'use client';

import { X, AlertCircle, WifiOff, Lock, Clock, Server, AlertTriangle, XCircle, Copy } from 'lucide-react';
import { logger } from '@/lib/logger';
import { useEffect, useState } from 'react';

export interface ErrorDialogData {
  errorCode: string;
  statusCode?: number;
  message: string;
  details?: string;
  userMessage: string;
  errorData?: any;
}

interface ErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  error: ErrorDialogData | null;
}

/**
 * Get icon and color scheme based on error code
 */
const getErrorStyle = (errorCode: string, statusCode?: number) => {
  switch (errorCode) {
    case 'AUTHENTICATION_ERROR':
      return {
        icon: Lock,
        bgColor: 'bg-amber-50 dark:bg-amber-950/30',
        borderColor: 'border-amber-300 dark:border-amber-700',
        iconColor: 'text-amber-600 dark:text-amber-400',
        titleColor: 'text-amber-900 dark:text-amber-100',
        textColor: 'text-amber-800 dark:text-amber-200',
        headerBg: 'bg-amber-100 dark:bg-amber-900/40',
        title: 'Authentication Error',
      };
    
    case 'PERMISSION_ERROR':
      return {
        icon: Lock,
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        borderColor: 'border-red-300 dark:border-red-700',
        iconColor: 'text-red-600 dark:text-red-400',
        titleColor: 'text-red-900 dark:text-red-100',
        textColor: 'text-red-800 dark:text-red-200',
        headerBg: 'bg-red-100 dark:bg-red-900/40',
        title: 'Permission Denied',
      };
    
    case 'RATE_LIMIT_ERROR':
      return {
        icon: Clock,
        bgColor: 'bg-orange-50 dark:bg-orange-950/30',
        borderColor: 'border-orange-300 dark:border-orange-700',
        iconColor: 'text-orange-600 dark:text-orange-400',
        titleColor: 'text-orange-900 dark:text-orange-100',
        textColor: 'text-orange-800 dark:text-orange-200',
        headerBg: 'bg-orange-100 dark:bg-orange-900/40',
        title: 'Rate Limit Exceeded',
      };
    
    case 'TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      return {
        icon: Clock,
        bgColor: 'bg-blue-50 dark:bg-blue-950/30',
        borderColor: 'border-blue-300 dark:border-blue-700',
        iconColor: 'text-blue-600 dark:text-blue-400',
        titleColor: 'text-blue-900 dark:text-blue-100',
        textColor: 'text-blue-800 dark:text-blue-200',
        headerBg: 'bg-blue-100 dark:bg-blue-900/40',
        title: 'Request Timeout',
      };
    
    case 'CONNECTION_ERROR':
      return {
        icon: WifiOff,
        bgColor: 'bg-purple-50 dark:bg-purple-950/30',
        borderColor: 'border-purple-300 dark:border-purple-700',
        iconColor: 'text-purple-600 dark:text-purple-400',
        titleColor: 'text-purple-900 dark:text-purple-100',
        textColor: 'text-purple-800 dark:text-purple-200',
        headerBg: 'bg-purple-100 dark:bg-purple-900/40',
        title: 'Connection Error',
      };
    
    case 'SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return {
        icon: Server,
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        borderColor: 'border-red-300 dark:border-red-700',
        iconColor: 'text-red-600 dark:text-red-400',
        titleColor: 'text-red-900 dark:text-red-100',
        textColor: 'text-red-800 dark:text-red-200',
        headerBg: 'bg-red-100 dark:bg-red-900/40',
        title: 'Service Error',
      };
    
    case 'STREAM_ERROR':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
        borderColor: 'border-yellow-300 dark:border-yellow-700',
        iconColor: 'text-yellow-600 dark:text-yellow-400',
        titleColor: 'text-yellow-900 dark:text-yellow-100',
        textColor: 'text-yellow-800 dark:text-yellow-200',
        headerBg: 'bg-yellow-100 dark:bg-yellow-900/40',
        title: 'Stream Error',
      };
    
    default:
      return {
        icon: XCircle,
        bgColor: 'bg-gray-50 dark:bg-gray-900/30',
        borderColor: 'border-gray-300 dark:border-gray-700',
        iconColor: 'text-gray-600 dark:text-gray-400',
        titleColor: 'text-gray-900 dark:text-gray-100',
        textColor: 'text-gray-800 dark:text-gray-200',
        headerBg: 'bg-gray-100 dark:bg-gray-800/40',
        title: 'Error',
      };
  }
};

/**
 * Get helpful suggestions based on error code
 */
const getErrorSuggestions = (errorCode: string, statusCode?: number): string[] => {
  switch (errorCode) {
    case 'AUTHENTICATION_ERROR':
      return [
        'Check your API key in Settings',
        'Verify the API key is correct and active',
        'Ensure the API key has not expired',
      ];
    
    case 'PERMISSION_ERROR':
      return [
        'Verify your API key has the required permissions',
        'Check if your account has access to this service',
        'Contact your API provider for access',
      ];
    
    case 'RATE_LIMIT_ERROR':
      return [
        'Wait a few moments before trying again',
        'Consider upgrading your API plan',
        'Reduce the frequency of requests',
      ];
    
    case 'TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      return [
        'Check your internet connection',
        'Try again in a moment',
        'The AI service may be experiencing high load',
      ];
    
    case 'CONNECTION_ERROR':
      return [
        'Check your internet connection',
        'Verify the API endpoint URL in Settings',
        'Check if the AI service is accessible',
      ];
    
    case 'SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return [
        'The AI service is experiencing issues',
        'Try again in a few minutes',
        'Check the service status page',
      ];
    
    case 'STREAM_ERROR':
      return [
        'Try sending your message again',
        'Check your internet connection',
        'The connection may have been interrupted',
      ];
    
    default:
      return [
        'Try sending your message again',
        'Check your API configuration in Settings',
        'Verify your internet connection',
      ];
  }
};

const ErrorDialog = ({ isOpen, onClose, error }: ErrorDialogProps) => {
  const [copySuccess, setCopySuccess] = useState(false);

  useEffect(() => {
    if (isOpen && error) {
      logger.info('Error dialog opened', {
        errorCode: error.errorCode,
        statusCode: error.statusCode,
        hasDetails: !!error.details,
      }, 'ErrorDialog');
    }
  }, [isOpen, error]);

  if (!isOpen || !error) {
    return null;
  }

  const style = getErrorStyle(error.errorCode, error.statusCode);
  const Icon = style.icon;
  const suggestions = getErrorSuggestions(error.errorCode, error.statusCode);

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      logger.debug('Error dialog closed by backdrop click', {
        errorCode: error.errorCode,
      }, 'ErrorDialog');
      onClose();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      logger.debug('Error dialog closed by Escape key', {
        errorCode: error.errorCode,
      }, 'ErrorDialog');
      onClose();
    }
  };

  const handleCloseClick = () => {
    logger.debug('Error dialog closed by close button', {
      errorCode: error.errorCode,
    }, 'ErrorDialog');
    onClose();
  };

  const handleCopyError = async () => {
    try {
      const errorText = `Error: ${error.userMessage}\n\nCode: ${error.errorCode}${error.statusCode ? ` (${error.statusCode})` : ''}\n\n${error.details ? `Details: ${error.details}\n\n` : ''}${error.errorData ? `Additional Info: ${JSON.stringify(error.errorData, null, 2)}` : ''}`;
      await navigator.clipboard.writeText(errorText);
      logger.info('Error details copied to clipboard', {
        errorCode: error.errorCode,
        textLength: errorText.length,
      }, 'ErrorDialog');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      logger.error('Failed to copy error details', {
        error: err instanceof Error ? err.message : 'Unknown error',
      }, 'ErrorDialog');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-dialog-title"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className={`${style.bgColor} border ${style.borderColor} rounded-xl shadow-2xl w-[550px] max-w-[90%] max-h-[85vh] overflow-hidden animate-scaleIn`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 ${style.headerBg} border-b ${style.borderColor}`}>
          <div className="flex items-center gap-3">
            <div className={`${style.iconColor} flex-shrink-0`}>
              <Icon className="w-6 h-6" />
            </div>
            <div>
              <h2 id="error-dialog-title" className={`text-lg font-bold ${style.titleColor}`}>
                {style.title}
              </h2>
              {error.statusCode && (
                <p className={`text-xs ${style.textColor} opacity-75 mt-0.5`}>
                  Error Code: {error.statusCode}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleCloseClick}
            className={`w-9 h-9 rounded-lg hover:bg-black/10 dark:hover:bg-white/10 flex items-center justify-center transition-all duration-200 ${style.iconColor}`}
            aria-label="Close error dialog"
            tabIndex={0}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto max-h-[calc(85vh-180px)]">
          {/* Error Message */}
          <div className="space-y-2">
            <h3 className={`text-sm font-semibold ${style.titleColor}`}>
              What happened?
            </h3>
            <p className={`text-sm ${style.textColor} leading-relaxed`}>
              {error.userMessage}
            </p>
          </div>

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <div className={`space-y-2 pt-4 border-t ${style.borderColor}`}>
              <h3 className={`text-sm font-semibold ${style.titleColor}`}>
                What can you do?
              </h3>
              <ul className={`text-sm ${style.textColor} space-y-2 list-none`}>
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-2 leading-relaxed">
                    <span className={`${style.iconColor} flex-shrink-0 mt-0.5`}>•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Technical Details (collapsed by default) */}
          {(error.details || error.errorData) && (
            <details className={`pt-4 border-t ${style.borderColor}`}>
              <summary className={`text-sm font-semibold ${style.titleColor} cursor-pointer hover:opacity-80 transition-opacity select-none`}>
                Technical Details
              </summary>
              <div className="mt-3 space-y-3">
                {error.details && (
                  <div>
                    <div className={`text-xs font-medium ${style.titleColor} mb-1.5`}>
                      Error Details:
                    </div>
                    <div className={`text-xs ${style.textColor} opacity-80 font-mono bg-black/5 dark:bg-white/5 p-3 rounded-lg overflow-x-auto whitespace-pre-wrap break-words border ${style.borderColor}`}>
                      {error.details}
                    </div>
                  </div>
                )}
                {error.errorData && (
                  <div>
                    <div className={`text-xs font-medium ${style.titleColor} mb-1.5`}>
                      Additional Information:
                    </div>
                    <div className={`text-xs ${style.textColor} opacity-80 font-mono bg-black/5 dark:bg-white/5 p-3 rounded-lg overflow-x-auto border ${style.borderColor}`}>
                      {typeof error.errorData === 'string' 
                        ? error.errorData 
                        : JSON.stringify(error.errorData, null, 2)}
                    </div>
                  </div>
                )}
              </div>
            </details>
          )}
        </div>

        {/* Footer Actions */}
        <div className={`px-6 py-4 border-t ${style.borderColor} ${style.headerBg} flex items-center justify-between gap-3`}>
          <button
            onClick={handleCopyError}
            className={`px-4 py-2 text-sm font-medium rounded-lg border ${style.borderColor} bg-background/50 hover:bg-background transition-all duration-200 flex items-center gap-2 ${style.textColor} ${copySuccess ? 'bg-green-500/20' : ''}`}
            aria-label="Copy error details"
            tabIndex={0}
          >
            {copySuccess ? (
              <>
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span>Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Copy Details</span>
              </>
            )}
          </button>
          <button
            onClick={handleCloseClick}
            className={`px-5 py-2 text-sm font-semibold rounded-lg ${style.iconColor} bg-background/80 hover:bg-background border ${style.borderColor} transition-all duration-200 shadow-sm hover:shadow-md`}
            aria-label="Close"
            tabIndex={0}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorDialog;


