/**
 * Tests for components/AgentToolCallDisplay.tsx
 * Covers status rendering (running, complete, error), expand/collapse,
 * defaultExpanded prop, auto-expand on status transition, and tool summaries.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentToolCallDisplay from '../AgentToolCallDisplay';
import { getToolSummary } from '../AgentToolCallDisplay';
import type { AgentToolCall } from '@/lib/agentStreamParser';

// Mock i18n
vi.mock('@/lib/i18n/LanguageContext', () => ({
  useLanguage: () => ({ locale: 'en' }),
}));

vi.mock('@/lib/i18n/dictionaries', () => ({
  getDictionary: () => ({
    chat: {
      agentToolRunning: 'Executing...',
      agentToolComplete: 'Completed',
      agentToolError: 'Error',
    },
  }),
}));

const makeToolCall = (overrides: Partial<AgentToolCall> = {}): AgentToolCall => ({
  id: 'tool-1',
  toolName: 'read_file',
  toolInput: { path: '/test/file.ts' },
  status: 'running',
  ...overrides,
});

describe('AgentToolCallDisplay', () => {
  describe('status rendering', () => {
    it('shows tool name', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall()} />);
      expect(screen.getByText('read_file')).toBeInTheDocument();
    });

    it('shows running status text', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({ status: 'running' })} />);
      expect(screen.getByText('Executing...')).toBeInTheDocument();
    });

    it('shows complete status text', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({ status: 'complete' })} />);
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });

    it('shows complete status with duration', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        status: 'complete',
        startTime: 1000,
        endTime: 1250,
      })} />);
      expect(screen.getByText('Completed (250ms)')).toBeInTheDocument();
    });

    it('shows error status text', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({ status: 'error' })} />);
      expect(screen.getByText('Error')).toBeInTheDocument();
    });
  });

  describe('expand/collapse', () => {
    it('is collapsed by default', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: { path: '/test/file.ts' },
        result: 'file content here',
        status: 'complete',
      })} />);
      // Input and result labels should not be visible when collapsed
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
      expect(screen.queryByText('Result')).not.toBeInTheDocument();
    });

    it('shows input and result when expanded', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: { path: '/test/file.ts' },
        result: 'file content here',
        status: 'complete',
      })} />);

      // Click the header to expand
      const header = screen.getByText('read_file');
      fireEvent.click(header.closest('button')!);

      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.getByText('Result')).toBeInTheDocument();
    });

    it('toggles collapse on second click', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: 'some input',
        result: 'some result',
        status: 'complete',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;

      // Expand
      fireEvent.click(header);
      expect(screen.getByText('Input')).toBeInTheDocument();

      // Collapse
      fireEvent.click(header);
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
    });
  });

  describe('content display', () => {
    it('formats JSON input', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: { path: '/test', recursive: true },
        status: 'complete',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      // Check that JSON is formatted
      expect(screen.getByText(/\"path\"/)).toBeInTheDocument();
    });

    it('shows string input directly', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: 'simple string input',
        status: 'complete',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      expect(screen.getByText('simple string input')).toBeInTheDocument();
    });

    it('shows Error label for error results', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        status: 'error',
        result: 'File not found',
        isError: true,
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      // "Error" here is the label, not the status
      const errorLabels = screen.getAllByText('Error');
      expect(errorLabels.length).toBeGreaterThanOrEqual(1);
    });

    it('does not show input section when toolInput is null', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: undefined,
        result: 'some result',
        status: 'complete',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      expect(screen.queryByText('Input')).not.toBeInTheDocument();
      expect(screen.getByText('Result')).toBeInTheDocument();
    });

    it('does not show result section when result is null', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolInput: 'some input',
        result: undefined,
        status: 'running',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      expect(screen.getByText('Input')).toBeInTheDocument();
      expect(screen.queryByText('Result')).not.toBeInTheDocument();
    });

    it('truncates long results to 500 chars when expanded', () => {
      const longResult = 'x'.repeat(600);
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        result: longResult,
        status: 'complete',
      })} />);

      const header = screen.getByText('read_file').closest('button')!;
      fireEvent.click(header);

      // The result should be truncated with "…"
      const pre = screen.getByText(/^x+…$/);
      expect(pre.textContent!.length).toBe(501); // 500 + "…"
    });
  });

  describe('defaultExpanded prop', () => {
    it('starts expanded when defaultExpanded is true', () => {
      render(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: { path: '/test' }, result: 'data', status: 'running' })}
        defaultExpanded
      />);
      expect(screen.getByText('Input')).toBeInTheDocument();
    });

    it('starts collapsed when defaultExpanded is false', () => {
      render(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: { path: '/test' }, result: 'data', status: 'running' })}
        defaultExpanded={false}
      />);
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
    });

    it('can still be toggled after defaultExpanded=true', () => {
      render(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: 'x', status: 'running' })}
        defaultExpanded
      />);
      expect(screen.getByText('Input')).toBeInTheDocument();

      // Click to collapse
      fireEvent.click(screen.getByRole('button'));
      expect(screen.queryByText('Input')).not.toBeInTheDocument();
    });
  });

  describe('auto-expand on status transition', () => {
    it('auto-expands when status transitions to running', () => {
      const { rerender } = render(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: 'x', status: 'complete' })}
      />);
      // Starts collapsed
      expect(screen.queryByText('Input')).not.toBeInTheDocument();

      // Status transitions to running
      rerender(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: 'x', status: 'running' })}
      />);
      expect(screen.getByText('Input')).toBeInTheDocument();
    });

    it('does not collapse when status transitions from running to complete', () => {
      const { rerender } = render(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: 'x', status: 'running' })}
        defaultExpanded
      />);
      expect(screen.getByText('Input')).toBeInTheDocument();

      rerender(<AgentToolCallDisplay
        toolCall={makeToolCall({ toolInput: 'x', status: 'complete' })}
        defaultExpanded={false}
      />);
      // Should remain expanded — useState ignores new defaultExpanded after mount
      expect(screen.getByText('Input')).toBeInTheDocument();
    });
  });

  describe('getToolSummary', () => {
    it('returns command for bash', () => {
      expect(getToolSummary('bash', { command: 'npm test' })).toBe('npm test');
    });

    it('returns path for read', () => {
      expect(getToolSummary('read', { path: '/src/index.ts' })).toBe('/src/index.ts');
    });

    it('returns path for write', () => {
      expect(getToolSummary('write', { path: '/out/file.txt', content: 'hello' })).toBe('/out/file.txt');
    });

    it('returns path for edit', () => {
      expect(getToolSummary('edit', { path: 'app.ts', oldText: 'a', newText: 'b' })).toBe('app.ts');
    });

    it('returns pattern for grep', () => {
      expect(getToolSummary('grep', { pattern: 'TODO', path: '/src' })).toBe('TODO');
    });

    it('returns pattern for find (prioritized over path)', () => {
      expect(getToolSummary('find', { pattern: '*.ts', path: '/src' })).toBe('*.ts');
    });

    it('falls back to path for find when pattern is missing', () => {
      expect(getToolSummary('find', { path: '/src' })).toBe('/src');
    });

    it('returns path for ls', () => {
      expect(getToolSummary('ls', { path: '/home/user' })).toBe('/home/user');
    });

    it('truncates long values to 60 chars', () => {
      const longCmd = 'a'.repeat(80);
      const result = getToolSummary('bash', { command: longCmd })!;
      expect(result.length).toBe(61); // 60 + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('returns null for unknown tools', () => {
      expect(getToolSummary('unknown_tool', { foo: 'bar' })).toBeNull();
    });

    it('returns null when toolInput is null', () => {
      expect(getToolSummary('bash', null)).toBeNull();
    });

    it('returns null when toolInput is undefined', () => {
      expect(getToolSummary('bash', undefined)).toBeNull();
    });

    it('returns null when the expected property is missing', () => {
      expect(getToolSummary('bash', { other: 'value' })).toBeNull();
    });

    it('returns null for array toolInput', () => {
      expect(getToolSummary('bash', ['npm', 'test'])).toBeNull();
    });

    it('returns null for empty string property value', () => {
      expect(getToolSummary('bash', { command: '' })).toBeNull();
    });
  });

  describe('tool summary in header', () => {
    it('shows tool summary in collapsed header for known tools', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolName: 'bash',
        toolInput: { command: 'npm run build' },
        status: 'complete',
      })} />);
      expect(screen.getByText('npm run build')).toBeInTheDocument();
    });

    it('does not show summary for unknown tool names', () => {
      render(<AgentToolCallDisplay toolCall={makeToolCall({
        toolName: 'custom_tool',
        toolInput: { data: 'value' },
        status: 'complete',
      })} />);
      // The tool name should be present but no summary text
      expect(screen.getByText('custom_tool')).toBeInTheDocument();
      expect(screen.queryByText('value')).not.toBeInTheDocument();
    });
  });
});
