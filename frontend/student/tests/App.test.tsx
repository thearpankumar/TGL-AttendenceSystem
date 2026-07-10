import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from '../src/App';
import * as useIsMobileModule from '../src/hooks/useIsMobile';

vi.mock('../src/hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(),
}));

// Mock the components so we don't need to render the whole app
vi.mock('../src/components/MobileDeviceRequired', () => ({
  default: () => <div data-testid="mobile-required">Mobile Access Required</div>,
}));

vi.mock('../src/pages/StudentScan', () => ({
  default: () => <div data-testid="student-scan">Student Scan</div>,
}));

vi.mock('../src/pages/LegacyAttend', () => ({
  default: () => <div data-testid="legacy-attend">Legacy Attend</div>,
}));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders application routing successfully', () => {
    render(<App />);
    expect(screen.queryByTestId('mobile-required')).not.toBeInTheDocument();
  });
});
