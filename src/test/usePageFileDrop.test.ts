import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, fireEvent, createEvent } from '@testing-library/react';
import { usePageFileDrop } from '../hooks/usePageFileDrop';

const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

function fileTransfer(files: File[] = [file]) {
  return { dataTransfer: { files, types: ['Files'] } };
}

/** Fires a drop on the window and reports whether the browser's default (opening the file) was blocked. */
function dropOnPage(files: File[] = [file]): boolean {
  const event = createEvent.drop(window, fileTransfer(files));
  fireEvent(window, event);
  return event.defaultPrevented;
}

describe('usePageFileDrop', () => {
  it('adds files dropped anywhere on the page', async () => {
    const onFiles = vi.fn();
    renderHook(() => usePageFileDrop(onFiles));

    await act(async () => {
      dropOnPage();
    });

    expect(onFiles).toHaveBeenCalledWith([{ file }]);
  });

  it('keeps the handle Chromium gives for a dropped file, so it can be read again after a reload', async () => {
    const onFiles = vi.fn();
    renderHook(() => usePageFileDrop(onFiles));
    const handle = { kind: 'file', name: 'hello.txt' };
    const items = [{ kind: 'file', getAsFileSystemHandle: () => Promise.resolve(handle) }];

    await act(async () => {
      fireEvent(window, createEvent.drop(window, { dataTransfer: { files: [file], items, types: ['Files'] } }));
    });

    expect(onFiles).toHaveBeenCalledWith([{ file, handle }]);
  });

  it('shows the drop target only while files are dragged over the page', () => {
    const { result } = renderHook(() => usePageFileDrop(() => {}));

    act(() => {
      fireEvent.dragEnter(window, fileTransfer());
    });
    expect(result.current.isDraggingFiles).toBe(true);

    act(() => {
      fireEvent.dragLeave(window, fileTransfer());
    });
    expect(result.current.isDraggingFiles).toBe(false);
  });

  it('ignores drags that carry no files, such as selected text', () => {
    const { result } = renderHook(() => usePageFileDrop(() => {}));

    act(() => {
      fireEvent.dragEnter(window, { dataTransfer: { files: [], types: ['text/plain'] } });
    });

    expect(result.current.isDraggingFiles).toBe(false);
  });

  it('never lets the browser open a dropped file, even when files cannot be added right now', () => {
    const { result } = renderHook(() => usePageFileDrop(null));

    let wasBlocked = false;
    act(() => {
      fireEvent.dragEnter(window, fileTransfer());
      wasBlocked = dropOnPage();
    });

    expect(wasBlocked).toBe(true);
    expect(result.current.isDraggingFiles).toBe(false);
  });

  it('adds pasted files, but leaves pastes into text fields alone', () => {
    const onFiles = vi.fn();
    renderHook(() => usePageFileDrop(onFiles));
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      fireEvent.paste(input, { clipboardData: { files: [file] } });
    });
    expect(onFiles).not.toHaveBeenCalled();

    act(() => {
      fireEvent.paste(document.body, { clipboardData: { files: [file] } });
    });
    expect(onFiles).toHaveBeenCalledWith([file]);
    input.remove();
  });
});
