import { render, screen } from '@testing-library/react';
import ChatDialog from '../ChatDialog';

vi.mock('../ChatMessage', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="chat-message-mock">{content}</div>
  ),
}));

vi.mock('../ChatInput', () => ({
  __esModule: true,
  default: ({ onSend }: { onSend: (message: string) => void }) => (
    <button type="button" data-testid="chat-input-mock" onClick={() => onSend('test')}>
      send
    </button>
  ),
}));

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

vi.mock('@/lib/modelConfig', () => ({
  loadModelConfigs: vi.fn().mockResolvedValue({ models: [] }),
  getDefaultModel: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/modelConfigSync', () => ({
  syncModelConfigsToCookies: vi.fn(),
}));

vi.mock('@/lib/apiConfig', () => ({
  buildApiUrl: vi.fn().mockResolvedValue('/api/mock'),
}));

beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

describe('ChatDialog (embedded variant)', () => {
  it('renders embedded layout without close control and ignores isOpen flag', async () => {
    render(
      <ChatDialog
        isOpen={false}
        onClose={vi.fn()}
        variant="embedded"
        title="Embedded Chat"
      />
    );

    const container = await screen.findByTestId('chat-dialog-embedded');
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute('role', 'region');
    expect(screen.queryByLabelText(/close chat/i)).not.toBeInTheDocument();
  });
});

