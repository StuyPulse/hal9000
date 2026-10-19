import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fieldSize, windowLayout } from './layout-model';

test('phone landscape uses usable width after both cutouts', () => {
  const result = windowLayout(844, 390, {left: 59, right: 59});
  assert.equal(result.safeWidth, 726);
  assert.equal(result.contentWidth, 702);
  assert.equal(result.compactHeight, true);
  assert.equal(result.wide, true);
  assert.equal(result.large, false);
});
test('small landscape phones stay single column instead of squeezing counters', () => {
  assert.equal(windowLayout(667, 375).columns, 1);
  assert.equal(windowLayout(812, 375, {left: 59, right: 59}).columns, 1);
});
test('rotation and split view recompute the layout without device checks', () => {
  assert.equal(windowLayout(390, 844).columns, 1);
  assert.equal(windowLayout(1024, 768).columns, 3);
  assert.equal(windowLayout(507, 768).columns, 1);
  assert.equal(windowLayout(768, 1024).compactHeight, false);
});
test('large text falls back to one column', () => {
  assert.equal(windowLayout(844, 390, {left: 59, right: 59}, 1.4).columns, 1);
});
test('large text scrolls action footers even in portrait',()=>{
 assert.equal(windowLayout(390,844,undefined,2).inlineActions,true);
 assert.equal(windowLayout(390,844).inlineActions,false);
 assert.equal(windowLayout(844,390).inlineActions,true);
});
test('content and fields stay bounded across phone and tablet sizes', () => {
  for (const [width, height] of [[320, 568], [568, 320], [390, 844], [844, 390], [768, 1024], [1366, 1024]]) {
    const layout = windowLayout(width, height);
    const field = fieldSize(layout.contentWidth, height);
    assert.ok(field.width <= layout.contentWidth);
    assert.ok(field.height <= 360);
    assert.ok(Math.abs(field.width / field.height - 1380 / 674) < 0.0001);
    if (height < 500) assert.ok(field.height <= height * 0.48);
  }
});
