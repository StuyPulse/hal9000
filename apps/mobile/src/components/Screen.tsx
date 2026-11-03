import React, { useContext, useState } from 'react';
import { KeyboardAvoidingView, Platform, RefreshControl, View, Pressable, ActivityIndicator } from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { Text } from './AppText';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '../core/context';
import { useLayout } from './layout';

export function Screen({ children, scroll = true, scrollEnabled = true, scrollRef, footer, footerInset = true, topInset = false, pinFooter = false }: {
  children: React.ReactNode; scroll?: boolean; scrollEnabled?: boolean;
  scrollRef?: React.RefObject<unknown>; footer?: React.ReactNode; footerInset?: boolean; topInset?: boolean;
  /** Keep the footer on screen even on short windows, for actions that must always be in reach. */
  pinFooter?: boolean;
}) {
  const { theme, viewer, error, dismissError, refresh, online } = useApp();
  const [pulling, setPulling] = useState(false);
  const insets = useSafeAreaInsets();
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  const { gutter, maxWidth, compactHeight, inlineActions, safeWidth } = useLayout();
  // An exact width, not '100%': iOS keeps the old percentage width when the phone rotates with this screen open.
  const column = { width: Math.min(safeWidth, maxWidth), alignSelf: 'center' as const };
  // On short windows the action scrolls too, rather than consuming the form's height.
  const inlineFooter = inlineActions && scroll && !pinFooter;
  const practiceNotice=viewer?.demo?<Text style={{alignSelf:'center',backgroundColor:theme.panel,color:theme.warning,fontSize:12,fontWeight:'700',overflow:'hidden',borderRadius:10,paddingHorizontal:10,paddingVertical:compactHeight?2:4}}>Practice mode</Text>:null;
  const action = footer ? <View style={{ paddingHorizontal: gutter, paddingTop: compactHeight ? 6 : 12, paddingBottom: footerInset ? Math.max(compactHeight ? 6 : 12, insets.bottom) : compactHeight ? 6 : 12, gap: 8, backgroundColor: theme.bg }}><View style={{ ...column, width: Math.max(0, column.width - gutter * 2), gap: 8 }}>{footer}</View></View> : null;
  return <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={headerHeight}>
    <View style={{ flex: 1, minHeight: 0, paddingLeft: insets.left, paddingRight: insets.right, paddingTop: topInset ? insets.top : 0 }}>
      {!scroll?practiceNotice:null}
      {error && <Pressable accessibilityRole="button" accessibilityLabel={`${error} Dismiss notice`} onPress={dismissError} style={{ backgroundColor: theme.panel, padding: 12, minHeight: 48 }}><Text accessibilityLiveRegion="polite" style={{ color: theme.danger }}>{error}</Text></Pressable>}
      {scroll ? <ScrollView
        ref={scrollRef as never} style={{ flex: 1 }} scrollEnabled={scrollEnabled}
        refreshControl={online && !viewer?.demo ? <RefreshControl refreshing={pulling} tintColor={theme.tint} onRefresh={() => { setPulling(true); void refresh().catch(() => undefined).finally(() => setPulling(false)); }} /> : undefined}
        keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={{ padding: gutter, paddingBottom: footer ? 16 : Math.max(28, insets.bottom + 20), gap: 12, ...column }}>
        {practiceNotice}{children}{inlineFooter ? action : null}
      </ScrollView> : <View style={{ flex: 1, minHeight: 0, padding: gutter, gap: compactHeight ? 8 : 12, ...column }}>{children}</View>}
      {!inlineFooter ? action : null}
    </View>
  </KeyboardAvoidingView>;
}
export function Loading() { const { theme } = useApp(); return <View style={{ flex: 1, backgroundColor: theme.bg, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={theme.tint} /></View>; }
