import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { windowLayout } from '../core/layout-model';

/** Breakpoints: phone < 700, tablet/landscape >= 700, large >= 1000. */
export function useLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  return windowLayout(width, height, useSafeAreaInsets(), fontScale);
}
