import React, { useContext, useMemo, useRef, useState } from 'react';
import { Text, View, Image, type ImageSourcePropType } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import type { Palette } from '../core/types';
import { ScrollRefContext } from './common';
import { Button, Choice } from '../components/ui';
import { DRAWING_COLORS, toDisplay, toStored, type DrawStroke } from './strategyDrawing';

const ASPECT = 674 / 1380;
const MAX_POINTS = 800;

/** Free-hand match-strategy sketch in normalized coordinates; the parent owns persistence. */
export function StrategyCanvas({ theme, strokes, onChange, onDrawingChange, flipped, fieldArt }: { theme: Palette; strokes: DrawStroke[]; onChange: (strokes: DrawStroke[]) => void; onDrawingChange?: (drawing: boolean) => void; flipped: boolean; fieldArt?: ImageSourcePropType }) {
  const scrollRef = useContext(ScrollRefContext);
  const [color, setColor] = useState<string>(DRAWING_COLORS[0]);
  const [width, setWidth] = useState(0);
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;
  const colorRef = useRef(color);
  colorRef.current = color;
  const flippedRef = useRef(flipped);
  flippedRef.current = flipped;
  const widthRef = useRef(0);
  widthRef.current = width;
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const active = useRef(false);

  const pan = useMemo(() => {
    const point = (x: number, y: number) => {
      const w = widthRef.current || 1;
      return toStored(x / w, y / (w * ASPECT), flippedRef.current);
    };
    const end = () => { if (active.current) { active.current = false; onDrawingChange?.(false); } };
    // Gesture Handler (not PanResponder): the latter loses the touch to the parent ScrollView on iOS.
    return Gesture.Pan()
      .runOnJS(true)
      .minDistance(0)
    // Hold the screen's scroll view back while a finger is on the canvas.
    .blocksExternalGesture(...(scrollRef ? [scrollRef as never] : []))
      .onBegin((event) => {
        active.current = true;
        onDrawingChange?.(true);
        changeRef.current([...strokesRef.current, { color: colorRef.current, points: [point(event.x, event.y)] }]);
      })
      .onUpdate((event) => {
        if (!active.current) return;
        const current = strokesRef.current;
        const last = current[current.length - 1];
        if (!last || last.points.length >= MAX_POINTS) return;
        changeRef.current([...current.slice(0, -1), { ...last, points: [...last.points, point(event.x, event.y)] }]);
      })
      .onFinalize(end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const w = width || 1;
  const h = w * ASPECT;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DRAWING_COLORS.map((value, index) => <Choice key={value} theme={theme} label={`Pen ${index + 1}${color === value ? ' ✓' : ''}`} selected={color === value} onPress={() => setColor(value)} />)}
      </View>
      <GestureHandlerRootView>
      <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityLabel={`Strategy field. ${strokes.length} strokes drawn. Draw with one finger.`}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        style={{ width: '100%', height: width ? h : 220, borderRadius: 14, overflow: 'hidden', backgroundColor: theme.dark ? '#1b2330' : '#e6ebf2', borderWidth: 1, borderColor: theme.line }}
      >
        {fieldArt ? <View pointerEvents="none" style={{ position: 'absolute', width: '100%', height: '100%' }}><Image source={fieldArt} resizeMode="stretch" style={{ width: '100%', height: '100%', transform: [{ rotate: flipped ? '180deg' : '0deg' }] }} /></View> : null}
        <Svg pointerEvents="none" width="100%" height="100%" viewBox={`0 0 ${w} ${h}`}>
          {strokes.map((stroke, index) => {
            const pts = stroke.points.map((p) => toDisplay(p, flipped));
            const d = pts.length === 1 ? `M ${pts[0].x * w} ${pts[0].y * h} l 0.1 0.1` : `M ${pts.map((p) => `${p.x * w} ${p.y * h}`).join(' L ')}`;
            return <Path key={index} d={d} fill="none" stroke={stroke.color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />;
          })}
        </Svg>
        {!strokes.length ? <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: theme.muted }}>Sketch a strategy path</Text></View> : null}
 </View>
      </GestureDetector>
      </GestureHandlerRootView>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button theme={theme} secondary title="Undo" icon="undo" disabled={!strokes.length} onPress={() => onChange(strokes.slice(0, -1))} style={{ flex: 1 }} />
        <Button theme={theme} secondary title="Clear" disabled={!strokes.length} onPress={() => onChange([])} style={{ flex: 1 }} />
      </View>
    </View>
  );
}
