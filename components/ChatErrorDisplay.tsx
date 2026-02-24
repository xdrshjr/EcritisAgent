/**
 * ChatErrorDisplay Component
 * Displays error messages in chat with elegant, user-friendly styling
 * Supports different error types with appropriate icons and colors
 */

'use client';

import { AlertCircle, WifiOff, Lock, Clock, Server, AlertTriangle, XCircle } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface ChatErrorData {
  errorCode: string;
  statusCode?: number;
  message: string;
  details?: string;
  userMessage: string;
  errorData?: any;
}

export interface ChatErrorDisplayProps {
  error: ChatErrorData;
  timestamp?: Date;
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
        borderColor: 'border-amber-200 dark:border-amber-800',
        iconColor: 'text-amber-600 dark:text-amber-400',
        titleColor: 'text-amber-900 dark:text-amber-100',
        textColor: 'text-amber-800 dark:text-amber-200',
        title: 'Authentication Error',
      };
    
    case 'PERMISSION_ERROR':
      return {
        icon: Lock,
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        borderColor: 'border-red-200 dark:border-red-800',
        iconColor: 'text-red-600 dark:text-red-400',
        titleColor: 'text-red-900 dark:text-red-100',
        textColor: 'text-red-800 dark:text-red-200',
        title: 'Permission Denied',
      };
    
    case 'RATE_LIMIT_ERROR':
      return {
        icon: Clock,
        bgColor: 'bg-orange-50 dark:bg-orange-950/30',
        borderColor: 'border-orange-200 dark:border-orange-800',
        iconColor: 'text-orange-600 dark:text-orange-400',
        titleColor: 'text-orange-900 dark:text-orange-100',
        textColor: 'text-orange-800 dark:text-orange-200',
        title: 'Rate Limit Exceeded',
      };
    
    case 'TIMEOUT':
    case 'GATEWAY_TIMEOUT':
      return {
        icon: Clock,
        bgColor: 'bg-blue-50 dark:bg-blue-950/30',
        borderColor: 'border-blue-200 dark:border-blue-800',
        iconColor: 'text-blue-600 dark:text-blue-400',
        titleColor: 'text-blue-900 dark:text-blue-100',
        textColor: 'text-blue-800 dark:text-blue-200',
        title: 'Request Timeout',
      };
    
    case 'CONNECTION_ERROR':
      return {
        icon: WifiOff,
        bgColor: 'bg-purple-50 dark:bg-purple-950/30',
        borderColor: 'border-purple-200 dark:border-purple-800',
        iconColor: 'text-purple-600 dark:text-purple-400',
        titleColor: 'text-purple-900 dark:text-purple-100',
        textColor: 'text-purple-800 dark:text-purple-200',
        title: 'Connection Error',
      };
    
    case 'SERVER_ERROR':
    case 'SERVICE_UNAVAILABLE':
      return {
        icon: Server,
        bgColor: 'bg-red-50 dark:bg-red-950/30',
        borderColor: 'border-red-200 dark:border-red-800',
        iconColor: 'text-red-600 dark:text-red-400',
        titleColor: 'text-red-900 dark:text-red-100',
        textColor: 'text-red-800 dark:text-red-200',
        title: 'Service Error',
      };
    
    case 'STREAM_ERROR':
      return {
        icon: AlertTriangle,
        bgColor: 'bg-yellow-50 dark:bg-yellow-950/30',
        borderColor: 'border-yellow-200 dark:border-yellow-800',
        iconColor: 'text-yellow-600 dark:text-yellow-400',
        titleColor: 'text-yellow-900 dark:text-yellow-100',
        textColor: 'text-yellow-800 dark:text-yellow-200',
        title: 'Stream Error',
      };
    
    default:
      return {
        icon: XCircle,
        bgColor: 'bg-gray-50 dark:bg-gray-950/30',
        borderColor: 'border-gray-200 dark:border-gray-800',
        iconColor: 'text-gray-600 dark:text-gray-400',
        titleColor: 'text-gray-900 dark:text-gray-100',
        textColor: 'text-gray-800 dark:text-gray-200',
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

const ChatErrorDisplay = ({ error, timestamp }: ChatErrorDisplayProps) => {
  const style = getErrorStyle(error.errorCode, error.statusCode);
  const Icon = style.icon;
  const suggestions = getErrorSuggestions(error.errorCode, error.statusCode);

  logger.debug('Rendering error display', {
    errorCode: error.errorCode,
    statusCode: error.statusCode,
    hasDetails: !!error.details,
  }, 'ChatErrorDisplay');

  return (
    <div className="mb-6 animate-fadeIn">
      <div
        className={`rounded-lg border ${style.borderColor} ${style.bgColor} p-4 shadow-sm transition-all hover:shadow-md`}
      >
        {/* Error Header */}
        <div className="flex items-start gap-3 mb-3">
          <div className={`flex-shrink-0 ${style.iconColor}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${style.titleColor} mb-1`}>
              {style.title}
              {error.statusCode && (
                <span className="ml-2 text-xs font-normal opacity-75">
                  (Code: {error.statusCode})
                </span>
              )}
            </div>
            <div className={`text-sm ${style.textColor} leading-relaxed`}>
              {error.userMessage}
            </div>
          </div>
        </div>

        {/* Suggestions */}
        {suggestions.length > 0 && (
          <div className={`mt-3 pt-3 border-t ${style.borderColor}`}>
            <div className={`text-xs font-medium ${style.titleColor} mb-2`}>
              Suggestions:
            </div>
            <ul className={`text-xs ${style.textColor} space-y-1.5 list-disc list-inside`}>
              {suggestions.map((suggestion, index) => (
                <li key={index} className="leading-relaxed">
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Technical Details (collapsed by default, for debugging) */}
        {(error.details || error.errorData) && (
          <details className={`mt-3 pt-3 border-t ${style.borderColor}`}>
            <summary className={`text-xs font-medium ${style.titleColor} cursor-pointer hover:opacity-80 transition-opacity`}>
              Technical Details
            </summary>
            <div className={`mt-2 space-y-2`}>
              {error.details && (
                <div>
                  <div className={`text-xs font-medium ${style.titleColor} mb-1`}>
                    Error Details:
                  </div>
                  <div className={`text-xs ${style.textColor} opacity-75 font-mono bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto whitespace-pre-wrap break-words`}>
                    {error.details}
                  </div>
                </div>
              )}
              {error.errorData && (
                <div>
                  <div className={`text-xs font-medium ${style.titleColor} mb-1`}>
                    Additional Information:
                  </div>
                  <div className={`text-xs ${style.textColor} opacity-75 font-mono bg-black/5 dark:bg-white/5 p-2 rounded overflow-x-auto`}>
                    {typeof error.errorData === 'string' 
                      ? error.errorData 
                      : JSON.stringify(error.errorData, null, 2)}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Timestamp */}
        {timestamp && (
          <div className={`mt-3 text-xs ${style.textColor} opacity-60`}>
            {timestamp.toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatErrorDisplay;

