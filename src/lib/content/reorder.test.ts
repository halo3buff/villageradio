import { describe, it, expect } from 'vitest';
import { moveUp, moveDown, moveTo, reindexOrder } from './reorder';

describe('moveUp', () => {
  it('swaps an item with the one above it', () => {
    expect(moveUp(['a', 'b', 'c'], 1)).toEqual(['b', 'a', 'c']);
  });
  it('is a no-op at the top', () => {
    expect(moveUp(['a', 'b'], 0)).toEqual(['a', 'b']);
  });
  it('is a no-op for an out-of-range index', () => {
    expect(moveUp(['a', 'b'], 5)).toEqual(['a', 'b']);
  });
  it('does not mutate the input', () => {
    const list = ['a', 'b'];
    moveUp(list, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('moveDown', () => {
  it('swaps an item with the one below it', () => {
    expect(moveDown(['a', 'b', 'c'], 1)).toEqual(['a', 'c', 'b']);
  });
  it('is a no-op at the bottom', () => {
    expect(moveDown(['a', 'b'], 1)).toEqual(['a', 'b']);
  });
});

describe('moveTo', () => {
  it('relocates an item forwards', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });
  it('relocates an item backwards', () => {
    expect(moveTo(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });
  it('is a no-op when from === to', () => {
    expect(moveTo(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
  it('does not mutate the input', () => {
    const list = ['a', 'b', 'c'];
    moveTo(list, 0, 2);
    expect(list).toEqual(['a', 'b', 'c']);
  });
});

describe('reindexOrder', () => {
  it('reassigns order to match array position', () => {
    const items = [
      { id: 'a', order: 9 },
      { id: 'b', order: 4 },
      { id: 'c', order: 7 },
    ];
    expect(reindexOrder(items)).toEqual([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ]);
  });
  it('preserves other fields and does not mutate the input', () => {
    const items = [{ id: 'a', order: 5, caption: 'hi' }];
    const out = reindexOrder(items);
    expect(out).toEqual([{ id: 'a', order: 0, caption: 'hi' }]);
    expect(items[0].order).toBe(5);
  });
});
