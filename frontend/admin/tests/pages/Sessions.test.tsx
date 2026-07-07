import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Sessions from '../../src/pages/Sessions';
import axios from 'axios';
import { MemoryRouter } from 'react-router-dom';

describe('Sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderComponent = () => render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Sessions />
    </MemoryRouter>
  );

  it('should render sessions list', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) {
        return Promise.resolve({
          data: [
            { _id: '1', locationId: { name: 'Room 101' }, isActive: true, expiresAt: new Date(Date.now() + 10000).toISOString(), createdAt: new Date().toISOString() }
          ]
        });
      }
      if (url.includes('/locations')) return Promise.resolve({ data: [{ _id: 'loc1', name: 'Room 101' }] });
      return Promise.resolve({ data: [] });
    });

    renderComponent();
    await waitFor(() => {
      expect(screen.getByText('Room 101')).toBeInTheDocument();
      expect(screen.getByText(/Active/i)).toBeInTheDocument();
    });
  });

  it('should render empty state if no sessions', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) return Promise.resolve({ data: [] });
      if (url.includes('/locations')) return Promise.resolve({ data: [{ _id: 'loc1', name: 'Room 101' }] });
      return Promise.resolve({ data: [] });
    });
    
    renderComponent();
    await waitFor(() => {
      expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument();
    });
  });

  it('should toggle create session modal', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) return Promise.resolve({ data: [] });
      if (url.includes('/locations')) return Promise.resolve({ data: [{ _id: 'loc1', name: 'Room 101' }] });
      return Promise.resolve({ data: [] });
    });
    
    renderComponent();
    await waitFor(() => expect(screen.getAllByText('Create Session')[0]).toBeInTheDocument());
    
    fireEvent.click(screen.getAllByText('Create Session')[0]);
    expect(screen.getByText(/Select a location/i)).toBeInTheDocument();
    
    fireEvent.click(screen.getByText(/Cancel/i));
    await waitFor(() => {
      expect(screen.queryByText(/Select a location/i)).not.toBeInTheDocument();
    });
  });

  it('should submit new session form', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) return Promise.resolve({ data: [] });
      if (url.includes('/locations')) return Promise.resolve({ data: [{ _id: 'loc1', name: 'Room 101' }] });
      return Promise.resolve({ data: [] });
    });
    (axios.post as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) return Promise.resolve({ data: { _id: 'new-session-id' } });
      if (url.includes('/shortlinks')) return Promise.resolve({ data: { shortCode: 'TESTCODE' } });
      return Promise.resolve({ data: {} });
    });
    
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockImplementation(() => Promise.resolve()) }
    });

    const { container } = renderComponent();
    await waitFor(() => expect(screen.getAllByText('Create Session')[0]).toBeInTheDocument());
    
    fireEvent.click(screen.getAllByText('Create Session')[0]);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'loc1' } });
    
    const form = container.querySelector('form');
    fireEvent.submit(form!);
    
    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/admin/sessions', expect.any(Object));
      expect(axios.post).toHaveBeenCalledWith('/api/admin/shortlinks', expect.any(Object));
    });
  });

  it('should handle delete confirmation', async () => {
    (axios.get as any).mockImplementation((url: string) => {
      if (url.includes('/sessions')) return Promise.resolve({ data: [{ _id: 'session-1', isActive: true, expiresAt: new Date(Date.now() + 10000).toISOString(), createdAt: new Date().toISOString(), attendanceCount: 5, locationId: { name: 'Room 101' } }] });
      if (url.includes('/locations')) return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
    (axios.delete as any).mockResolvedValue({});

    renderComponent();
    await waitFor(() => expect(screen.getByText('Room 101')).toBeInTheDocument());
    
    fireEvent.click(screen.getByText('Delete'));
    const passwordInput = screen.getByPlaceholderText(/admin password/i);
    fireEvent.change(passwordInput, { target: { value: 'password123' } });
    
    fireEvent.click(screen.getByText('Confirm Delete'));
    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith('/api/admin/sessions/session-1', { data: { password: 'password123' } });
    });
  });
});
