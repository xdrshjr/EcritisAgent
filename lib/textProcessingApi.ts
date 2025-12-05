/**
 * Text Processing API Client
 * Handles API calls for text processing operations (polish, rewrite, check)
 */

import { logger } from './logger';
import { buildFlaskApiUrl } from './flaskConfig';

export type TextProcessingType = 'polish' | 'rewrite' | 'check';

export interface TextProcessingRequest {
  text: string;
  type: TextProcessingType;
  modelId?: string;
}

export interface TextProcessingResponse {
  result: string;
  type: TextProcessingType;
}

export interface TextCheckResponse {
  issues: Array<{
    type: 'grammar' | 'spelling' | 'style' | 'other';
    message: string;
    suggestion?: string;
  }>;
}

/**
 * Process text using LLM (polish or rewrite)
 */
export const processText = async (
  request: TextProcessingRequest
): Promise<TextProcessingResponse> => {
  const startTime = Date.now();
  logger.info('Text processing request initiated', {
    type: request.type,
    textLength: request.text.length,
    textPreview: request.text.substring(0, 100),
    modelId: request.modelId || 'default',
  }, 'TextProcessingAPI');

  try {
    const apiUrl = '/api/text-processing';
    logger.debug('Calling text processing API', {
      url: apiUrl,
      type: request.type,
      textLength: request.text.length,
      modelId: request.modelId || 'default',
    }, 'TextProcessingAPI');

    const requestBody = {
      text: request.text,
      type: request.type,
      modelId: request.modelId,
    };

    logger.debug('Text processing request body prepared', {
      type: requestBody.type,
      hasModelId: !!requestBody.modelId,
    }, 'TextProcessingAPI');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    logger.debug('Text processing API response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      type: request.type,
    }, 'TextProcessingAPI');

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Text processing API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500),
        type: request.type,
        url: apiUrl,
      }, 'TextProcessingAPI');

      throw new Error(
        `Text processing failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json() as TextProcessingResponse;
    
    logger.debug('Text processing response parsed', {
      type: data.type,
      hasResult: !!data.result,
      resultLength: data.result?.length || 0,
    }, 'TextProcessingAPI');

    // Validate response structure
    if (!data.result || typeof data.result !== 'string') {
      logger.warn('Text processing response has invalid structure', {
        dataType: typeof data,
        dataKeys: Object.keys(data),
        resultType: typeof data.result,
      }, 'TextProcessingAPI');
    }
    
    logger.success('Text processing completed', {
      type: request.type,
      resultLength: data.result.length,
      duration: `${Date.now() - startTime}ms`,
    }, 'TextProcessingAPI');

    return data;
  } catch (error) {
    logger.error('Text processing request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      type: request.type,
      duration: `${Date.now() - startTime}ms`,
    }, 'TextProcessingAPI');

    throw error;
  }
};

/**
 * Check text for issues
 */
export const checkText = async (
  text: string,
  modelId?: string
): Promise<TextCheckResponse> => {
  const startTime = Date.now();
  logger.info('Text check request initiated', {
    textLength: text.length,
    textPreview: text.substring(0, 100),
    modelId: modelId || 'default',
  }, 'TextProcessingAPI');

  try {
    const apiUrl = '/api/text-processing';
    logger.debug('Calling text check API', {
      url: apiUrl,
      textLength: text.length,
      modelId: modelId || 'default',
    }, 'TextProcessingAPI');

    const requestBody = {
      text,
      type: 'check' as const,
      modelId,
    };

    logger.debug('Text check request body prepared', {
      type: requestBody.type,
      hasModelId: !!requestBody.modelId,
    }, 'TextProcessingAPI');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    logger.debug('Text check API response received', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    }, 'TextProcessingAPI');

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('Text check API error', {
        status: response.status,
        statusText: response.statusText,
        error: errorText.substring(0, 500),
        url: apiUrl,
      }, 'TextProcessingAPI');

      throw new Error(
        `Text check failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json() as TextCheckResponse;
    
    logger.debug('Text check response parsed', {
      hasIssues: Array.isArray(data.issues),
      issueCount: data.issues?.length || 0,
    }, 'TextProcessingAPI');

    // Validate response structure
    if (!Array.isArray(data.issues)) {
      logger.warn('Text check response has invalid structure', {
        dataType: typeof data,
        dataKeys: Object.keys(data),
        issuesType: typeof data.issues,
      }, 'TextProcessingAPI');
      
      // Normalize to expected structure
      const normalizedData: TextCheckResponse = {
        issues: Array.isArray(data.issues) ? data.issues : [],
      };
      
      logger.debug('Text check response normalized', {
        issueCount: normalizedData.issues.length,
      }, 'TextProcessingAPI');
      
      logger.success('Text check completed', {
        issueCount: normalizedData.issues.length,
        duration: `${Date.now() - startTime}ms`,
        normalized: true,
      }, 'TextProcessingAPI');

      return normalizedData;
    }

    // Validate each issue structure
    const validatedIssues = data.issues.map((issue, index) => {
      if (!issue || typeof issue !== 'object') {
        logger.warn('Invalid issue structure found', {
          issueIndex: index,
          issueType: typeof issue,
        }, 'TextProcessingAPI');
        return {
          type: 'other' as const,
          message: String(issue || '未知问题'),
        };
      }

      const validTypes = ['grammar', 'spelling', 'style', 'other'];
      const issueType = validTypes.includes(issue.type) ? issue.type : 'other';
      
      if (!issue.message || typeof issue.message !== 'string') {
        logger.warn('Issue missing message field', {
          issueIndex: index,
          issueType: issueType,
        }, 'TextProcessingAPI');
      }

      return {
        type: issueType,
        message: String(issue.message || '未知问题'),
        suggestion: issue.suggestion ? String(issue.suggestion) : undefined,
      };
    });

    logger.debug('Text check issues validated', {
      originalCount: data.issues.length,
      validatedCount: validatedIssues.length,
    }, 'TextProcessingAPI');
    
    logger.success('Text check completed', {
      issueCount: validatedIssues.length,
      duration: `${Date.now() - startTime}ms`,
    }, 'TextProcessingAPI');

    return {
      issues: validatedIssues,
    };
  } catch (error) {
    logger.error('Text check request failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      errorStack: error instanceof Error ? error.stack : undefined,
      duration: `${Date.now() - startTime}ms`,
    }, 'TextProcessingAPI');

    throw error;
  }
};

