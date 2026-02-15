# AIDocMaster - Agent Development Guide

This guide provides essential information for agentic coding agents working on this repository.

## Build, Lint, and Test Commands

### Development Commands
```bash
npm run dev              # Start Next.js development server (http://localhost:3000)
npm run build           # Production build
npm start               # Start production server
npm run lint            # Run ESLint
npm test                # Run all Vitest tests
```

### Single Test Commands
```bash
npx vitest run <test-file-path>  # Run specific test file
npx vitest <test-file-path>       # Watch mode
npm test -- --run <pattern>        # Run matching tests
```

### Desktop/Electron Commands
```bash
npm run electron:dev    # Start Electron with dev server
npm run bundle:python   # Bundle Python backend for desktop
npm run build:desktop   # Build desktop application
```

### Backend Commands
```bash
cd backend && python app.py  # Start Flask backend (port 5000)
pytest                      # Run Python tests
```

## Code Style Guidelines

### File Organization
- `components/*.tsx` - React UI components
- `app/api/*` - Next.js API routes
- `lib/*.ts` - Shared utility functions
- `types/*.d.ts` - TypeScript type definitions
- `components/__tests__/*.test.tsx` - Component tests

### Import Order
1. React and 'use client' directive
2. External libraries (lucide-react, etc.)
3. Internal imports with @ alias (@/lib/*, @/components/*)
4. Relative imports, type-only imports

Example:
```tsx
'use client';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import Component from './Component';
import type { Message } from '@/types/messages';
```

### Component Structure
```tsx
'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ComponentProps {
  prop1: string;
  prop2?: number;
}

const ComponentName = ({ prop1, prop2 }: ComponentProps) => {
  const [state, setState] = useState('');
  const handleClick = useCallback(() => {}, []);

  return (
    <div className={cn('base-class', conditional && 'conditional-class')}>
      {/* JSX */}
    </div>
  );
};
export default ComponentName;
```

### Styling & Accessibility
- **Use Tailwind CSS only** - No CSS files or inline style tags
- Use `cn()` from `@/lib/utils` for conditional classes
- Prefer early returns for conditional rendering
- Add a11y attributes: tabIndex, aria-label, onClick, onKeyDown

### TypeScript
- **Strict mode enabled** - All types must be defined
- Use interfaces for object shapes, type for unions/primitives
- Export types when used across files, put definitions in `types/`

### Naming Conventions
- Event handlers: "handle" prefix (handleClick, handleKeyDown)
- Variables: descriptive (isLoading, streamingContent)
- Constants: UPPER_SNAKE_CASE
- Functions: camelCase, descriptive actions

### Error Handling & Logging
```tsx
try {
  await fetchApi();
} catch (error) {
  logger.error('API request failed', {
    error: error instanceof Error ? error.message : 'Unknown error'
  }, 'ComponentName');
  setError('Failed to load data');
}
```
Use custom logger from `@/lib/logger`, not console.log.

### State Management
- Use React hooks (useState, useEffect, useCallback, useRef)
- Prefer useCallback for handlers passed to children
- Use useRef for DOM refs and non-reactive values

### Testing
```tsx
import { render, screen } from '@testing-library/react';
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn() } }));

describe('Component', () => {
  it('renders correctly', () => {
    render(<Component />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });
});
```

## Architecture Notes

### Multi-Agent System
- AgentRouter: Routes to AutoWriter or DocumentModifier
- AutoWriterAgent: Generates documents from scratch
- DocumentModifierAgent: Modifies existing documents

### Backend Integration
- Flask backend on port 5000, Next.js API routes proxy to it
- Use `buildApiUrl()` from `@/lib/apiConfig` for API URLs
- Streaming responses use SSE

### Key Libraries
- **UI**: React 19, Next.js 16, Tailwind CSS 4
- **Editor**: TipTap v3, **Icons**: Lucide React
- **Testing**: Vitest, @testing-library/react
- **Build**: Electron Builder

## Important Notes

1. **Always run lint after changes**: `npm run lint`
2. **Test single files**: `npx vitest run <test-file>`
3. **No CSS files**: Use Tailwind classes only
4. **TypeScript strict**: All code must be fully typed
5. **Accessibility**: All interactive elements need proper a11y attributes
6. **Error handling**: Always catch and log errors appropriately
7. **Logging**: Use custom logger, not console.log
