import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AppBar } from '../components/ui/AppBar';

describe('AppBar', () => {
  it('goes home when the title is clicked', () => {
    const onTitleClick = vi.fn();
    render(<AppBar title="DropWave" onTitleClick={onTitleClick} />);

    fireEvent.click(screen.getByRole('button', { name: 'DropWave' }));

    expect(onTitleClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'DropWave' })).toBeDefined();
  });
});
