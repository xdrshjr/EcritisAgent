/**
 * Tests for components/AgentToggle.tsx
 * Covers toggle switching and disabled state.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AgentToggle from '../AgentToggle';

describe('AgentToggle', () => {
  it('renders the Agent label', () => {
    render(<AgentToggle enabled={false} onChange={vi.fn()} />);
    expect(screen.getByText('Agent')).toBeInTheDocument();
  });

  it('renders a switch button with correct aria attributes when off', () => {
    render(<AgentToggle enabled={false} onChange={vi.fn()} />);
    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeInTheDocument();
    expect(switchBtn).toHaveAttribute('aria-checked', 'false');
  });

  it('renders with aria-checked true when enabled', () => {
    render(<AgentToggle enabled={true} onChange={vi.fn()} />);
    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onChange with true when toggling on', () => {
    const onChange = vi.fn();
    render(<AgentToggle enabled={false} onChange={onChange} />);

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('calls onChange with false when toggling off', () => {
    const onChange = vi.fn();
    render(<AgentToggle enabled={true} onChange={onChange} />);

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('toggles when label is clicked', () => {
    const onChange = vi.fn();
    render(<AgentToggle enabled={false} onChange={onChange} />);

    const label = screen.getByText('Agent');
    fireEvent.click(label);

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('does not call onChange when disabled', () => {
    const onChange = vi.fn();
    render(<AgentToggle enabled={false} onChange={onChange} disabled={true} />);

    const switchBtn = screen.getByRole('switch');
    fireEvent.click(switchBtn);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not call onChange when disabled label is clicked', () => {
    const onChange = vi.fn();
    render(<AgentToggle enabled={false} onChange={onChange} disabled={true} />);

    const label = screen.getByText('Agent');
    fireEvent.click(label);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('has the switch button disabled when disabled prop is true', () => {
    render(<AgentToggle enabled={false} onChange={vi.fn()} disabled={true} />);
    const switchBtn = screen.getByRole('switch');
    expect(switchBtn).toBeDisabled();
  });

  it('applies emerald-500 color when enabled', () => {
    render(<AgentToggle enabled={true} onChange={vi.fn()} />);
    const switchBtn = screen.getByRole('switch');
    expect(switchBtn.className).toContain('bg-emerald-500');
  });

  it('applies bg-input color when disabled', () => {
    render(<AgentToggle enabled={false} onChange={vi.fn()} />);
    const switchBtn = screen.getByRole('switch');
    expect(switchBtn.className).toContain('bg-input');
  });
});
