import React, { useContext, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, type ImageSourcePropType, Image } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { Palette } from '../core/types';
import { ScrollRefContext } from './common';
import { Button } from '../components/ui';
import { appendPoint, canStartStroke, clampPoint, MAX_STROKES, PATH_COLORS, PATH_HEIGHT, PATH_WIDTH, START_OPACITY, strokesToSvg, svgToStrokes, type Stroke } from './autoPath';

/**
 * Finger/stylus drawing over the 1380x674 field space. Emits the website's SVG string
 * via onChange when a stroke ends or is undone/cleared. `fieldArt` is optional because
 * the field image is not bundled in apps/mobile/assets yet.
 */
export function AutoPathCanvas({ theme, value, onChange, onDrawingChange, fieldArt }: { theme: Palette; value: string; onChange: (svg: string) => void; onDrawingChange?: (drawing: boolean) => void; fieldArt?: ImageSourcePropType }) {
  const [strokes, setStrokes] = useState<Stroke[]>(() => svgToStrokes(value));
  const scrollRef = useContext(ScrollRefContext);
  const [color, setColor] = useState<string>(PATH_COLORS[0].value);
  const [width, setWidth] = useState(0);
  const strokesRef = useRef(strokes);
  const colorRef = useRef(color);
  const widthRef = useRef(0);
  const drawing = useRef(false);
  colorRef.current = color;
  widthRef.current = width;

  const commit = (next: Stroke[], persist: boolean) => {
    strokesRef.current = next;
    setStrokes(next);
    if (persist) onChange(strokesToSvg(next));
  };
  const toPoint = (x: number, y: number) => {
    const w = widthRef.current || 1;
    return clampPoint((x / w) * PATH_WIDTH, (y / (w * (PATH_HEIGHT / PATH_WIDTH))) * PATH_HEIGHT);
  };

  // Gesture Handler (not PanResponder): a PanResponder inside a ScrollView loses the touch to the scroll view on iOS.
  const pan = useMemo(() => Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    // Hold the screen's scroll view back while a finger is on the canvas.
    .blocksExternalGesture(...(scrollRef ? [scrollRef as never] : []))
    .onBegin((event) => {
      if (!canStartStroke(strokesRef.current)) return;
      drawing.current = true;
      onDrawingChange?.(true);
      commit([...strokesRef.current, { color: colorRef.current, points: [toPoint(event.x, event.y)] }], false);
    })
    .onUpdate((event) => {
      if (!drawing.current) return;
      commit(appendPoint(strokesRef.current, toPoint(event.x, event.y)), false);
    })
    .onFinalize(() => finish()),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  function finish() {
    if (!drawing.current) return;
    drawing.current = false;
    onDrawingChange?.(false);
    // A tap that never moved leaves a one-point stroke; the website drops it too.
    commit(strokesRef.current.filter((stroke) => stroke.points.length > 1), true);
  }

  const height = width * (PATH_HEIGHT / PATH_WIDTH);
  const usable = strokes.filter((stroke) => stroke.points.length > 1);
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {PATH_COLORS.map((pen) => (
          <Pressable key={pen.value} accessibilityRole="button" accessibilityLabel={`${pen.name} pen`} accessibilityState={{ selected: color === pen.value }} onPress={() => setColor(pen.value)}
            style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: color === pen.value ? 2 : 1, borderColor: color === pen.value ? theme.tint : theme.line, backgroundColor: color === pen.value ? theme.selection : theme.surface, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: pen.value, borderWidth: 1, borderColor: theme.line }} />
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: '600' }}>{pen.name}</Text>
          </Pressable>
        ))}
      </View>
      <GestureHandlerRootView>
      <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityLabel={`Autonomous path drawing area. ${usable.length} of ${MAX_STROKES} routes drawn. Draw with one finger.`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ width: '100%', height: height || 220, borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? '#1b2330' : '#e6ebf2', borderWidth: 1, borderColor: theme.line }}
      >
        {fieldArt ? <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}><Image source={fieldArt} resizeMode="stretch" style={{ width: '100%', height: '100%', opacity: 0.9 }} /></View> : null}
        <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${PATH_WIDTH} ${PATH_HEIGHT}`}>
          <Defs>
            {usable.map((stroke, index) => (
              <LinearGradient key={`g${index}`} id={`pen-${index}`} gradientUnits="userSpaceOnUse" x1={stroke.points[0].x} y1={stroke.points[0].y} x2={stroke.points[stroke.points.length - 1].x} y2={stroke.points[stroke.points.length - 1].y}>
                <Stop offset="0" stopColor={stroke.color} stopOpacity={START_OPACITY} />
                <Stop offset="1" stopColor={stroke.color} stopOpacity={1} />
              </LinearGradient>
            ))}
          </Defs>
          {usable.map((stroke, index) => (
            <Path key={`p${index}`} d={`M ${stroke.points.map((p) => `${p.x} ${p.y}`).join(' L ')}`} fill="none" stroke={`url(#pen-${index})`} strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </Svg>
        {!usable.length ? (
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: theme.muted, fontSize: 14 }}>Draw each autonomous route here</Text>
          </View>
        ) : null}
      </View>
      </GestureDetector>
      </GestureHandlerRootView>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button theme={theme} secondary title="Undo stroke" icon="undo" disabled={!strokes.length} onPress={() => commit(strokesRef.current.slice(0, -1), true)} style={{ flex: 1 }} />
        <Button theme={theme} secondary title="Clear all" disabled={!strokes.length} onPress={() => commit([], true)} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
