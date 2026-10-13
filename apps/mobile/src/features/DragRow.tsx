import React, { useContext, useMemo, useRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Text } from '../components/AppText';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { ScrollRefContext } from './common';

/**
 * A row that can be reordered by touching and holding its handle, then dragging.
 * The row follows the finger; `onDrop` receives the vertical distance in points so the
 * caller can convert it into a new position.
 */
export function DragRow({ children, enabled = true, onDrop, onLayoutHeight, onLift, color, style }: {
  children: (handle: React.ReactNode) => React.ReactNode;
  enabled?: boolean;
  onDrop: (offsetY: number) => void;
  onLayoutHeight?: (height: number) => void;
  onLift?: (lifted: boolean) => void;
  color: string;
  style?: object;
}) {
  const scrollRef = useContext(ScrollRefContext);
  const dropRef = useRef(onDrop);
  const liftRef = useRef(onLift);
  dropRef.current = onDrop;
  liftRef.current = onLift;
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);

  const pan = useMemo(() => {
    let gesture = Gesture.Pan()
      .enabled(enabled)
      .activateAfterLongPress(220)
      .runOnJS(true)
      .onStart(() => { liftRef.current?.(true); lifted.value = withSpring(1); void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined); })
      .onUpdate((event) => { offset.value = event.translationY; })
      .onEnd((event) => { dropRef.current(event.translationY); })
      .onFinalize(() => { liftRef.current?.(false); offset.value = withSpring(0); lifted.value = withSpring(0); });
    if (scrollRef?.current) gesture = gesture.blocksExternalGesture(scrollRef as never);
    return gesture;
  }, [enabled, scrollRef, offset, lifted]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }, { scale: 1 + lifted.value * 0.02 }],
    zIndex: lifted.value > 0.01 ? 10 : 0,
    shadowOpacity: lifted.value * 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: lifted.value * 8,
  }));

  const handle = enabled ? (
    <GestureDetector gesture={pan}>
      <View accessibilityRole="adjustable" accessibilityLabel="Reorder. Touch and hold, then drag." hitSlop={8} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color, fontSize: 24, lineHeight: 26 }}>≡</Text>
      </View>
    </GestureDetector>
  ) : null;

  return (
    <Animated.View onLayout={(event: LayoutChangeEvent) => onLayoutHeight?.(event.nativeEvent.layout.height)} style={[style, animated]}>
      {children(handle)}
    </Animated.View>
  );
}
