import {friendlyError} from '../src/core/friendly-error';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, View } from 'react-native';
import { Text } from '../src/components/AppText';
import { useApp } from '../src/core/context';
import { Screen } from '../src/components/Screen';
import { Button, Input, Label } from '../src/components/ui';

// Loaded lazily so builds without the native module (older installs receiving an OTA update) fall back to the browser.
let cachedWebView: React.ComponentType<any> | null | undefined;
function loadWebView() {
  if (cachedWebView !== undefined) return cachedWebView;
  try {
    cachedWebView = require('react-native-webview').WebView as React.ComponentType<any>;
  } catch {
    cachedWebView = null;
  }
  return cachedWebView;
}

// Same rewrite as the website's global-document.tsx: edit/view links load the read-only preview.
const previewUrl = (value: string) => {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/(edit|view|preview)\/?$/, '/preview');
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return value;
  }
};

export default function Global() {
  const { bundle, viewer, theme, online, saveGlobalDocument } = useApp();
  const [url, setUrl] = useState(bundle?.globalDocument ?? '');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const document = bundle?.globalDocument ?? null;
  const WebView = loadWebView();
  const canEdit = ['admin', 'strategist', 'developer'].includes(viewer?.role ?? '');

  const save = () => {
    setBusy(true);
    void saveGlobalDocument(url)
      .then(() => setEditing(false))
      .catch((error) => Alert.alert('Could not save', friendlyError(error)))
      .finally(() => setBusy(false));
  };

  const editor = (editing || !document) && canEdit ? (
    <View style={{ gap: 8 }}>
      <Input label="Google Docs, Sheets or Slides link" theme={theme} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Button title={busy ? 'Saving…' : 'Save link'} theme={theme} disabled={busy || !online || !url} onPress={save} /></View>
        {document ? <View style={{ flex: 1 }}><Button title="Cancel" secondary theme={theme} onPress={() => setEditing(false)} /></View> : null}
      </View>
    </View>
  ) : null;

  return (
    <Screen scroll={editing || !document}>
      {document ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {canEdit ? <View style={{ flex: 1 }}><Button title={editing ? 'Hide editor' : 'Change link'} secondary theme={theme} onPress={() => setEditing((value) => !value)} style={{ minHeight: 46, paddingVertical: 8 }} /></View> : null}
          <View style={{ flex: 1 }}><Button title="Open in Google" secondary theme={theme} onPress={() => void Linking.openURL(document)} style={{ minHeight: 46, paddingVertical: 8 }} /></View>
        </View>
      ) : null}
      {editor}
      {document ? (
        online && WebView ? (
          <View style={{ flex: 1, minHeight: editing ? 240 : undefined, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: theme.line, backgroundColor: theme.surface }}>
            <WebView
              source={{ uri: previewUrl(document) }}
              originWhitelist={['https://*']}
              onLoadEnd={() => setLoading(false)}
              onShouldStartLoadWithRequest={(request: { url: string }) => /^https:\/\/([a-z0-9-]+\.)*(google|gstatic)\.com\//.test(request.url)}
              startInLoadingState
              style={{ flex: 1, backgroundColor: theme.surface }}
            />
            {loading ? <View pointerEvents="none" style={{ position: 'absolute', top: 16, alignSelf: 'center' }}><ActivityIndicator color={theme.tint} /></View> : null}
          </View>
        ) : (
          <Text style={{ color: theme.muted, fontSize: 15 }}>{online ? 'Tap Open in Google to view the document.' : 'Connect to the internet to view the document.'}</Text>
        )
      ) : (
        <Label theme={theme} muted>{canEdit ? 'Add a Google document link for this event.' : 'No document linked yet.'}</Label>
      )}
    </Screen>
  );
}
