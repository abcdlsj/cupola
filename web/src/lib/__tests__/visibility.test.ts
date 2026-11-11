import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useDocumentVisible } from '../visibility';

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

describe('useDocumentVisible', () => {
  afterEach(() => setVisibility('visible'));

  it('follows the document visibility, so polling can stop in a background tab', () => {
    setVisibility('visible');
    const { result } = renderHook(() => useDocumentVisible());
    expect(result.current).toBe(true);

    setVisibility('hidden');
    expect(result.current).toBe(false);

    setVisibility('visible');
    expect(result.current).toBe(true);
  });
});
