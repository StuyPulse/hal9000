/** Window geometry, not device model or orientation lock, controls adaptation. */
export function windowLayout(width: number, height: number, insets = { left: 0, right: 0 }, fontScale = 1) {
  const safeWidth = Math.max(0, width - insets.left - insets.right);
  const wide = safeWidth >= 700 * Math.max(1, fontScale);
  const large = safeWidth >= 1000 * Math.max(1, fontScale);
  const compactHeight = height < 500;
  const largeText = fontScale >= 1.3;
  const gutter = compactHeight ? 12 : wide ? 24 : 16;
  const maxWidth = large ? 1180 : 920;
  const contentWidth = Math.max(0, Math.min(safeWidth, maxWidth) - gutter * 2);
  return { width, height, fontScale, safeWidth, wide, large, largeText, landscape: width > height, compactHeight, inlineActions: compactHeight || largeText, gutter, maxWidth, contentWidth, columns: large ? 3 : wide ? 2 : 1 };
}

/** Preserve field proportions and leave room for controls on short windows. */
export function fieldSize(availableWidth: number, windowHeight: number) {
  const aspect = 1380 / 674;
  const maxHeight = windowHeight < 500 ? Math.max(140, windowHeight * 0.48) : 360;
  const width = Math.max(1, Math.min(availableWidth, maxHeight * aspect));
  return { width, height: width / aspect };
}
