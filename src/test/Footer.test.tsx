import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Footer } from '../components/Footer';
import { REPOSITORY_URL } from '../constants';

describe('Footer build info', () => {
  it('links the commit hash to the repository and shows when the build was made', () => {
    render(<Footer buildInfo={{ commit: 'abc1234', builtAtIso: '2026-09-27T20:10:00.000Z' }} />);

    const commitLink = screen.getByRole('link', { name: 'abc1234' });
    expect(commitLink.getAttribute('href')).toBe(`${REPOSITORY_URL}/commit/abc1234`);
    const builtAt = document.querySelector('time');
    expect(builtAt?.getAttribute('dateTime')).toBe('2026-09-27T20:10:00.000Z');
    expect(builtAt?.textContent).toMatch(/2026/);
  });

  it('marks a local build without linking a commit', () => {
    render(<Footer buildInfo={{ commit: 'dev', builtAtIso: null }} />);

    expect(screen.getByText(/dev build/i)).toBeDefined();
    expect(screen.queryByRole('link', { name: 'dev' })).toBeNull();
    expect(document.querySelector('time')).toBeNull();
  });
});
