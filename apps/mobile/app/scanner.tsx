import { friendlyError } from '../src/core/friendly-error';
import React, { useEffect, useState, useRef } from 'react';
import { AppState, Linking, View } from 'react-native';
import { useIsFocused } from 'expo-router/react-navigation';
import { Text } from '../src/components/AppText';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Crypto from 'expo-crypto';
import { useApp } from '../src/core/context';
import { Screen } from '../src/components/Screen';
import { useLayout } from '../src/components/layout';
import { Button, Label, Section, Row } from '../src/components/ui';
import { packetSchema, assemble, parseRelaySnapshot, type RelayPacket } from '../src/core/relay-model';

export default function Scanner() {
  const { viewer, bundle, theme, receiveEntry, records, sync } = useApp();
  const { wide, compactHeight, height } = useLayout();
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const listener = AppState.addEventListener('change', state => setAppActive(state === 'active')); return () => listener.remove(); }, []);
  const [progress, setProgress] = useState('Ready to scan');
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const frames = useRef<RelayPacket[]>([]), processing = useRef(false);
  if (!viewer || !['master', 'admin', 'developer'].includes(viewer.role)) return <Screen><Label theme={theme}>Master access is required.</Label></Screen>;
  const scan = async (text: string) => {
    if (processing.current || paused) return;
    try {
      const packet = packetSchema.parse(JSON.parse(text));
      if (frames.current[0] && frames.current[0].transfer !== packet.transfer) frames.current = [];
      if (!frames.current.some(p => p.index === packet.index)) frames.current.push(packet);
      setProgress(`${frames.current.length} of ${packet.count} frames captured`);
      const snapshot = assemble(frames.current);
      if (!snapshot) return;
      processing.current = true;
      const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, snapshot);
      if (hash !== packet.checksum) throw Error('QR integrity check failed. Rescan the transfer.');
      const { entry, revision, proof } = parseRelaySnapshot(snapshot);
      await receiveEntry(entry, revision, proof);
      setProgress(`Received locally · ${bundle?.teams.find(t => t.id === entry.team_id)?.displayNumber ?? 'team'} · revision ${revision}`);
      setPaused(true);
      frames.current = [];
    } catch (e) {
      setProgress(friendlyError(e));
      frames.current = [];
    } finally { processing.current = false; }
  };
  const split = wide && compactHeight;
  return <Screen>
    <View style={{ flexDirection: split ? 'row' : 'column', gap: 16 }}>
      <View style={{ flex: split ? 1 : undefined, minWidth: 0, gap: 12 }}>
        {permission?.granted ? focused && appActive ? <CameraView style={{ height: compactHeight ? Math.max(160, height * 0.48) : 300, borderRadius: 16, overflow: 'hidden' }} enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={() => setProgress('The camera could not start. Reopen this screen or use direct sync.')} onBarcodeScanned={paused ? undefined : ({ data }) => void scan(data)} /> : <Label theme={theme}>Camera paused while this screen is inactive.</Label> : <>
          <Label theme={theme}>Camera access is needed only to scan scout QR codes.</Label>
          <Button title={permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera for scanning'} theme={theme} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(e => setProgress(friendlyError(e))); }} />
        </>}
      </View>
      <View style={{ flex: split ? 1 : undefined, minWidth: 0, gap: 12 }}>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 16 }}>{progress}</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={torch ? 'Torch off' : 'Torch on'} theme={theme} secondary disabled={!permission?.granted} onPress={() => setTorch(!torch)} style={{ flex: 1 }} />
          <Button title="Scan next report" theme={theme} secondary onPress={() => { frames.current = []; setPaused(false); setProgress('Ready to scan'); }} style={{ flex: 1 }} />
        </View>
        <Button title="Upload signed receipts" theme={theme} onPress={() => void sync()} />
      </View>
    </View>
    <Section title="Master upload queue" theme={theme}>{records.filter(r => r.origin === 'relay').map(r => <Row key={r.entry.id} title={`${bundle?.teams.find(t => t.id === r.entry.team_id)?.displayNumber ?? 'Team'} · ${r.status}`} subtitle={r.error ?? `revision ${r.revision}`} theme={theme} />)}</Section>
  </Screen>;
}
