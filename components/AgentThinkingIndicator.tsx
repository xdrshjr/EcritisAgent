/**
 * AgentThinkingIndicator Component
 * Shows "Agent is thinking..." with a bouncing dots animation.
 * Used in the message stream when Agent mode is active.
 */

'use client';

import { useLanguage } from '@/lib/i18n/LanguageContext';
import { getDictionary } from '@/lib/i18n/dictionaries';

const AgentThinkingIndicator = () => {
  const { locale } = useLanguage();
  const dict = getDictionary(locale);

  return (
    <div className="flex items-center gap-2.5 text-muted-foreground ml-14 mb-4">
      {/* Bouncing dots */}
      <div className="flex gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
      <span className="text-sm">{dict.chat.agentThinking}</span>
    </div>
  );
};

export default AgentThinkingIndicator;
