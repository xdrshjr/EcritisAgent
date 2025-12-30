/**
 * ContextMenu Component
 * Reusable right-click context menu for chat messages
 * Supports copy, edit, and delete operations
 */

'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Copy, Edit, Trash2, X } from 'lucide-react';
import { logger } from '@/lib/logger';

export interface ContextMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
  onClose: () => void;
}

const ContextMenu = ({ items, position, onClose }: ContextMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [adjustedPosition, setAdjustedPosition] = useState<{ x: number; y: number } | null>(null);

  // Reset visibility and calculate position when position prop changes
  useLayoutEffect(() => {
    if (position) {
      // Initial position from props
      let { x, y } = position;
      
      // Adjust position to keep menu within viewport
      if (menuRef.current) {
        const { offsetWidth, offsetHeight } = menuRef.current;
        const { innerWidth, innerHeight } = window;

        // Check horizontal overflow
        if (x + offsetWidth > innerWidth) {
          x = Math.max(0, x - offsetWidth);
        }

        // Check vertical overflow
        if (y + offsetHeight > innerHeight) {
          y = Math.max(0, y - offsetHeight);
        }
      }

      setAdjustedPosition({ x, y });
      setIsVisible(true);
      
      logger.debug('Context menu opened', {
        originalPosition: position,
        adjustedPosition: { x, y },
        itemCount: items.length,
      }, 'ContextMenu');
    } else {
      setIsVisible(false);
      setAdjustedPosition(null);
    }
  }, [position, items.length]);

  useEffect(() => {
    if (!isVisible) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        logger.debug('Context menu closed by outside click', undefined, 'ContextMenu');
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        logger.debug('Context menu closed by escape key', undefined, 'ContextMenu');
        onClose();
      }
    };

    // Use capture phase to ensure we handle the event before others if needed,
    // but bubbling is usually fine.
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isVisible, onClose]);

  const handleItemClick = (item: ContextMenuItem) => {
    if (item.disabled) {
      logger.debug('Context menu item clicked but disabled', {
        itemId: item.id,
        itemLabel: item.label,
      }, 'ContextMenu');
      return;
    }

    logger.info('Context menu item clicked', {
      itemId: item.id,
      itemLabel: item.label,
      position: adjustedPosition,
    }, 'ContextMenu');

    try {
      item.action();
      onClose();
    } catch (error) {
      logger.error('Context menu item action failed', {
        itemId: item.id,
        itemLabel: item.label,
        error: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined,
      }, 'ContextMenu');
    }
  };

  if (!position) return null;

  // Use Portal to render the menu at the document body level
  // This avoids positioning issues caused by parent transforms (e.g., animate-fadeIn)
  const menuContent = (
    <div
      ref={menuRef}
      className={`fixed z-[9999] bg-background border border-border shadow-lg rounded-md py-1 min-w-[160px] transition-all duration-150 ${
        isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
      }`}
      style={{
        left: adjustedPosition ? adjustedPosition.x : position.x,
        top: adjustedPosition ? adjustedPosition.y : position.y,
        transformOrigin: 'top left',
      }}
      role="menu"
      aria-label="Context menu"
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => handleItemClick(item)}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus loss on text selection
          disabled={item.disabled}
          className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 transition-colors hover:bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed ${
            item.disabled ? 'cursor-not-allowed' : 'cursor-pointer'
          }`}
          role="menuitem"
          tabIndex={0}
          aria-label={item.label}
        >
          <span className="w-4 h-4 flex-shrink-0">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
        </button>
      ))}
    </div>
  );

  // Only render on client side
  if (typeof document === 'undefined') return null;

  return createPortal(menuContent, document.body);
};

export default ContextMenu;