/**
 * AgentToggle Component
 * Toggle switch for enabling/disabling Agent mode in the chat toolbar.
 * Styled consistently with the existing Advanced Mode toggle.
 */

'use client';

interface AgentToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

const AgentToggle = ({ enabled, onChange, disabled = false }: AgentToggleProps) => {
  const toggle = () => {
    if (!disabled) onChange(!enabled);
  };

  return (
    <div className="flex items-center gap-2">
      <label
        className={`text-xs font-medium cursor-pointer select-none ${
          disabled ? 'text-muted-foreground/50 cursor-not-allowed' : 'text-muted-foreground'
        }`}
        onClick={toggle}
      >
        Agent
      </label>
      <button
        onClick={toggle}
        disabled={disabled}
        className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
          enabled ? 'bg-emerald-500' : 'bg-input'
        }`}
        role="switch"
        aria-checked={enabled}
        aria-label="Toggle Agent mode"
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
};

export default AgentToggle;
