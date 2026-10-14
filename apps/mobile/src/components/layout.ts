import { useWindowDimensions } from 'react-native';

/** Breakpoints: phone < 700, tablet/landscape >= 700, large >= 1000. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const wide = width >= 700;
  const large = width >= 1000;
  const landscape = width > height;
  const gutter = wide ? 28 : 20;
  const contentWidth = Math.min(width, large ? 1180 : 920) - gutter * 2;
  return { width, height, wide, large, landscape, gutter, contentWidth, columns: large ? 3 : wide ? 2 : 1 };
}
