import React, { useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import type { Palette } from '../core/types';

export type TableColumn = { key: string; title: string; width: number; sortable?: boolean };

/**
 * Table with a sticky header row and a sticky first column. The header and body scroll
 * horizontally in lock-step; the page scrolls vertically with the header pinned.
 */
export function DataTable<Row>({ theme, columns, rows, rowKey, firstTitle = 'Team', firstWidth = 104, rowHeight = 52, renderFirst, renderCell, onPressRow, rowLabel, sortKey, sortDirection, onSort }: {
  theme: Palette; columns: TableColumn[]; rows: Row[]; rowKey: (row: Row) => string; firstTitle?: string; firstWidth?: number; rowHeight?: number;
  renderFirst: (row: Row) => React.ReactNode;
  renderCell: (row: Row, column: TableColumn) => React.ReactNode;
  onPressRow?: (row: Row) => void; rowLabel?: (row: Row) => string;
  sortKey?: string; sortDirection?: 'asc' | 'desc'; onSort?: (key: string) => void;
}) {
  const offset = useRef(new Animated.Value(0)).current;
  const translate = Animated.multiply(offset, -1);
  const onBodyScroll = Animated.event([{ nativeEvent: { contentOffset: { x: offset } } }], { useNativeDriver: true });
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  const headerHeight = 46;
  const [width, setWidth] = useState(0);
  return (
    <View style={{ flex: 1 }} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <View style={{ flexDirection: 'row', width: width || undefined, height: headerHeight, backgroundColor: theme.panel, borderBottomWidth: 1, borderColor: theme.line }}>
        <Pressable disabled={!onSort} accessibilityRole="button" accessibilityLabel={`Sort by ${firstTitle}`} onPress={() => onSort?.('team')} style={{ width: firstWidth, height: headerHeight, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: theme.panel, borderRightWidth: 1, borderColor: theme.line, zIndex: 2 }}>
          <Text style={{ color: sortKey === 'team' ? theme.tint : theme.text, fontWeight: '800', fontSize: 13 }}>{firstTitle}{sortKey === 'team' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</Text>
        </Pressable>
        <View style={{ width: Math.max(0, width - firstWidth), height: headerHeight, overflow: 'hidden' }}>
          <Animated.View style={{ flexDirection: 'row', width: total, height: headerHeight, transform: [{ translateX: translate }] }}>
            {columns.map((column) => (
              <Pressable key={column.key} disabled={!onSort || column.sortable === false} accessibilityRole="button" accessibilityLabel={`Sort by ${column.title}`} onPress={() => onSort?.(column.key)} style={{ width: column.width, height: headerHeight, justifyContent: 'center', paddingHorizontal: 10 }}>
                <Text numberOfLines={2} style={{ color: sortKey === column.key ? theme.tint : theme.text, fontWeight: '800', fontSize: 13 }}>{column.title}{sortKey === column.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}</Text>
              </Pressable>
            ))}
          
          </Animated.View>
        </View>
      </View>
      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: firstWidth, backgroundColor: theme.bg, borderRightWidth: 1, borderColor: theme.line, zIndex: 2 }}>
          {rows.map((row) => (
            <Pressable key={rowKey(row)} disabled={!onPressRow} accessibilityRole="button" accessibilityLabel={rowLabel?.(row)} onPress={() => onPressRow?.(row)} style={{ height: rowHeight, justifyContent: 'center', paddingHorizontal: 12, borderBottomWidth: 1, borderColor: theme.line }}>
              {renderFirst(row)}
            </Pressable>
          ))}
        </View>
        <Animated.ScrollView horizontal onScroll={onBodyScroll} scrollEventThrottle={16} showsHorizontalScrollIndicator style={{ flex: 1 }}>
          <View style={{ width: total }}>
            {rows.map((row) => (
              <View key={rowKey(row)} style={{ flexDirection: 'row', height: rowHeight, borderBottomWidth: 1, borderColor: theme.line }}>
                {columns.map((column) => (
                  <View key={column.key} style={{ width: column.width, height: rowHeight, justifyContent: 'center', paddingHorizontal: 10 }}>{renderCell(row, column)}</View>
                ))}
              </View>
            ))}
          </View>
        </Animated.ScrollView>
      </View>
      </ScrollView>
    </View>
  );
}
