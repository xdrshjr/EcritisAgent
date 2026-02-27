/**
 * useDraggablePopup Hook
 * Shared hook for draggable fixed-position popup panels.
 * Uses position: fixed with viewport-relative coordinates.
 * Handles drag movement with viewport boundary constraints.
 */

import { useState, useRef, useEffect, useCallback } from 'react';

interface Position {
  top: number;
  left: number;
}

/**
 * Hook for making a popup panel draggable with viewport boundary constraints.
 * The popup uses `position: fixed` with left-edge positioning.
 *
 * @param initialPosition - Viewport-relative position (left edge, top edge)
 * @returns position, isDragging state, panelRef, and handleDragStart callback
 */
export const useDraggablePopup = (initialPosition: Position) => {
  const [position, setPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Sync position with initialPosition when not dragging
  useEffect(() => {
    if (!isDragging) {
      setPosition(initialPosition);
    }
    // Only re-sync when the actual coordinate values change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPosition.top, initialPosition.left]);

  const clampToViewport = useCallback((left: number, top: number): Position => {
    const margin = 8;
    const panel = panelRef.current;
    const pw = panel?.offsetWidth ?? 300;
    const ph = panel?.offsetHeight ?? 200;
    return {
      left: Math.max(margin, Math.min(window.innerWidth - pw - margin, left)),
      top: Math.max(margin, Math.min(window.innerHeight - ph - margin, top)),
    };
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragOffsetRef.current = {
      x: e.clientX - position.left,
      y: e.clientY - position.top,
    };
    setIsDragging(true);
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (e: MouseEvent) => {
      const newLeft = e.clientX - dragOffsetRef.current.x;
      const newTop = e.clientY - dragOffsetRef.current.y;
      setPosition(clampToViewport(newLeft, newTop));
    };

    const onUp = () => setIsDragging(false);

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, clampToViewport]);

  return { position, isDragging, panelRef, handleDragStart };
};
