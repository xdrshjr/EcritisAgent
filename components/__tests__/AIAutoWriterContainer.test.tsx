import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import AIAutoWriterContainer from '../AIAutoWriterContainer';

vi.mock('@/lib/logger', () => ({
  logger: {
    component: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('../DocAgentPanel', () => ({
  __esModule: true,
  default: (props: any) => (
    <div data-testid="doc-agent-panel-mock">DocAgentPanel</div>
  ),
}));

vi.mock('../WordEditorPanel', () => {
  const MockWordEditor = forwardRef((props: any, ref) => {
    const contentRef = useRef('<p>initial</p>');

    useImperativeHandle(ref, () => ({
      getEditor: () => ({
        getHTML: () => contentRef.current,
        commands: {
          setContent: (value: string) => {
            contentRef.current = value;
          },
        },
      }),
      insertImageAfterSection: vi.fn(() => true),
    }));

    useEffect(() => {
      props.onContentChange?.(contentRef.current);
    }, [props.onContentChange]);

    return <div data-testid="word-editor-panel-mock" />;
  });

  MockWordEditor.displayName = 'MockWordEditorPanel';

  return {
    __esModule: true,
    default: MockWordEditor,
  };
});

vi.mock('@/lib/docEditorOperations', () => ({
  replaceSectionInEditor: vi.fn(),
  appendSectionToEditor: vi.fn(),
  insertSectionInEditor: vi.fn(),
  deleteSectionFromEditor: vi.fn(),
}));

describe('AIAutoWriterContainer', () => {
  it('renders both panels (editor + doc agent)', () => {
    const handleWidthChange = vi.fn();

    render(
      <AIAutoWriterContainer
        leftPanelWidth={55}
        onLeftPanelWidthChange={handleWidthChange}
      />
    );

    expect(screen.getByTestId('word-editor-panel-mock')).toBeInTheDocument();
    expect(screen.getByTestId('doc-agent-panel-mock')).toBeInTheDocument();
  });

  it('updates width when user drags the resizer', async () => {
    const handleWidthChange = vi.fn();

    render(
      <AIAutoWriterContainer
        leftPanelWidth={55}
        onLeftPanelWidthChange={handleWidthChange}
      />
    );

    const container = screen.getByTestId('auto-writer-container') as HTMLDivElement;
    const resizer = screen.getByTestId('auto-writer-resizer');

    container.getBoundingClientRect = () =>
      ({
        left: 0,
        width: 1000,
      }) as DOMRect;

    fireEvent.mouseDown(resizer, { clientX: 500 });
    fireEvent.mouseMove(document, { clientX: 650 });

    await waitFor(() => {
      expect(handleWidthChange).toHaveBeenCalled();
    });

    fireEvent.mouseUp(document);
  });
});
