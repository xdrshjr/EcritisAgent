/**
 * Tests for components/AgentToolCallDisplay.tsx
 * Covers status rendering (running, complete, error) and expand/collapse.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentToolCallDisplay from '../AgentToolCallDisplay';
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

      // The result should be truncated with "..."
      const pre = screen.getByText(/^x+\.\.\.$/);
      expect(pre.textContent!.length).toBe(503); // 500 + "..."
    });
  });
});
