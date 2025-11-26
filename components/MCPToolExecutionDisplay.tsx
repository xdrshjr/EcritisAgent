/**
 * MCPToolExecutionDisplay Component
 * Displays the execution process of MCP tool calls in chat
 * Shows:
 * - Tool selection and reasoning
 * - Tool execution status
 * - Tool results
 * - Final answer generation
 */

'use client';

import { Hammer, CheckCircle, Loader2, AlertCircle, Sparkles } from 'lucide-react';

export interface MCPExecutionStep {
  type: 'reasoning' | 'tool_call' | 'tool_result' | 'final_answer';
  toolName?: string;
  reasoning?: string;
  parameters?: Record<string, any>;
  result?: any;
  status?: 'pending' | 'running' | 'success' | 'error';
  error?: string;
  timestamp?: Date;
}

export interface MCPToolExecutionDisplayProps {
  steps: MCPExecutionStep[];
  isComplete?: boolean;
}

const MCPToolExecutionDisplay = ({ steps, isComplete = false }: MCPToolExecutionDisplayProps) => {
  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="my-4 space-y-3">
      {/* Execution Steps */}
      {steps.map((step, index) => (
        <div
          key={index}
          className="bg-muted/40 border border-border/50 rounded-lg p-3 animate-fadeIn"
        >
          {/* Reasoning Step */}
          {step.type === 'reasoning' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">
                  AI Reasoning
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {step.reasoning}
                </p>
              </div>
            </div>
          )}

          {/* Tool Call Step */}
          {step.type === 'tool_call' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {step.status === 'running' && (
                  <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                )}
                {step.status === 'success' && (
                  <CheckCircle className="w-4 h-4 text-green-500" />
                )}
                {step.status === 'error' && (
                  <AlertCircle className="w-4 h-4 text-red-500" />
                )}
                {step.status === 'pending' && (
                  <Hammer className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    Calling Tool
                  </h4>
                  {step.toolName && (
                    <span className="px-2 py-0.5 text-xs font-mono bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded">
                      {step.toolName}
                    </span>
                  )}
                </div>
                {step.parameters && Object.keys(step.parameters).length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground/70 mb-1">Parameters:</p>
                    <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto">
                      {JSON.stringify(step.parameters, null, 2)}
                    </pre>
                  </div>
                )}
                {step.status === 'running' && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Executing tool...
                  </p>
                )}
                {step.error && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-2">
                    Error: {step.error}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Tool Result Step */}
          {step.type === 'tool_result' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <CheckCircle className="w-4 h-4 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="text-xs font-semibold text-green-600 dark:text-green-400">
                    Tool Result
                  </h4>
                  {step.toolName && (
                    <span className="px-2 py-0.5 text-xs font-mono bg-green-500/10 text-green-600 dark:text-green-400 rounded">
                      {step.toolName}
                    </span>
                  )}
                </div>
                {step.result && (
                  <div className="mt-2">
                    {typeof step.result === 'string' ? (
                      <p className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
                        {step.result.length > 500 
                          ? `${step.result.substring(0, 500)}...` 
                          : step.result
                        }
                      </p>
                    ) : (
                      <pre className="text-xs bg-background/50 rounded p-2 overflow-x-auto max-h-40">
                        {JSON.stringify(step.result, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Final Answer Step */}
          {step.type === 'final_answer' && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1">
                  Generating Final Answer
                </h4>
                <p className="text-xs text-muted-foreground italic">
                  Synthesizing results into response...
                </p>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Completion Indicator */}
      {isComplete && steps.length > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
          <p className="text-xs text-green-600 dark:text-green-400 font-medium">
            MCP execution completed successfully
          </p>
        </div>
      )}
    </div>
  );
};

export default MCPToolExecutionDisplay;

