/**
 * Taskbar Component
 * Vertical navigation bar on the left side with task icons
 */

'use client';

import { useState, useEffect } from 'react';
import { FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

export interface Task {
  id: string;
  title: string;
  icon: React.ReactNode;
  isActive: boolean;
}

interface TaskbarProps {
  tasks: Task[];
  onTaskChange: (taskId: string) => void;
}

const Taskbar = ({ tasks, onTaskChange }: TaskbarProps) => {
  const [hoveredTask, setHoveredTask] = useState<string | null>(null);

  useEffect(() => {
    logger.component('Taskbar', 'mounted', { tasksCount: tasks.length });
  }, [tasks.length]);

  const handleTaskClick = (taskId: string) => {
    logger.info('Task clicked', { taskId }, 'Taskbar');
    onTaskChange(taskId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, taskId: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleTaskClick(taskId);
    }
  };

  return (
    <aside className="w-12 bg-sidebar border-r border-sidebar-border flex flex-col items-center pt-2 pb-2 gap-1.5">
      {tasks.map((task) => {
        const isHovered = hoveredTask === task.id;
        const isActive = task.isActive;

        return (
          <div
            key={task.id}
            className="relative group"
            onMouseEnter={() => setHoveredTask(task.id)}
            onMouseLeave={() => setHoveredTask(null)}
          >
            <button
              onClick={() => handleTaskClick(task.id)}
              onKeyDown={(e) => handleKeyDown(e, task.id)}
              tabIndex={0}
              aria-label={task.title}
              className={cn(
                'w-8 h-8 flex items-center justify-center rounded-lg',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                isActive ? 'bg-primary text-primary-foreground shadow-sm' : '',
                !isActive && 'hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {task.icon}
            </button>

            {/* Tooltip */}
            {isHovered && (
              <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
                <div className="bg-popover text-popover-foreground px-2 py-1 border border-border rounded-md shadow-md whitespace-nowrap">
                  <span className="text-xs font-medium">{task.title}</span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </aside>
  );
};

export default Taskbar;

