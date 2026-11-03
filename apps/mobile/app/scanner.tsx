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
import { canReceiveQr, canUploadRelay } from '../src/core/relay-receipt';
import { deliveryLabel, deliveryState } from '../src/core/qr-share';
import { FountainCollector, isFountainFrame } from '@wildcard/shared/src/fountain-qr';
import { decodeReportBatch } from '@wildcard/shared/src/qr-batch';
import type { NativeEntry } from '../src/core/types';
import * as Haptics from 'expo-haptics';

type Live = { code: string; solved: number; total: number } | null;
type Finished = { code: string; saved: number; alreadyHere: number; rejected: { id: string | null; reason: string }[] };

export default function Scanner() {
  const { viewer, bundle, theme, receiveEntry, receiveEntries, records, sync, online } = useApp();
  const { wide, compactHeight, height } = useLayout();
  const [permission, requestPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => { const listener = AppState.addEventListener('change', state => setAppActive(state === 'active')); return () => listener.remove(); }, []);
  const [progress, setProgress] = useState('Ready to scan');
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<Live>(null);
  const [finished, setFinished] = useState<Finished[]>([]);
  const frames = useRef<RelayPacket[]>([]), processing = useRef(false);
  const collector = useRef(new FountainCollector()), lastFrame = useRef(''), scopeKey = `${viewer?.userId}:${viewer?.organizationId}:${bundle?.event.id}`;
  useEffect(() => { collector.current.reset(); lastFrame.current = ''; setLive(null); setFinished([]); }, [scopeKey]);
  if (!viewer || !canReceiveQr(viewer.role)) return <Screen><Label theme={theme}>Master or strategist access is required.</Label></Screen>;
  const scanFountain = async (text: string) => {
    if (text === lastFrame.current) return;
    lastFrame.current = text;
    if (processing.current) return;
    let result;
    // A misread frame is routine with an animated code. The next one replaces it.
    try { result = collector.current.accept(text); } catch { return; }
    const { decoder, alreadyFinished } = result;
    if (alreadyFinished) { setProgress('Already saved. Point at another phone.'); return; }
    if (!decoder) return;
    setLive({ code: decoder.code, solved: decoder.solved, total: decoder.k });
    if (!decoder.data) return;
    processing.current = true;
    try {
      const { reports, rejected } = decodeReportBatch(decoder.data);
      const summary = await receiveEntries(reports.map(r => ({ ...r, entry: r.entry as NativeEntry })));
      // Only a durable save closes the transfer; a failed save keeps it scannable.
      collector.current.markSaved(decoder.key);
      setFinished(current => [{ code: decoder.code, saved: summary.saved, alreadyHere: summary.alreadyHere, rejected: [...rejected, ...summary.rejected] }, ...current]);
      setLive(null);
      setProgress('Saved on this phone. Point at the next phone.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (e) {
      collector.current.forget(decoder.key);
      setLive(null);
      setProgress(`${friendlyError(e)} Keep scanning to retry.`);
    } finally { processing.current = false; }
  };
  const scan = async (text: string) => {
    if (isFountainFrame(text)) return scanFountain(text);
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
        {live ? <View accessibilityLabel={`Transfer ${live.code}: ${live.solved} of ${live.total} pieces`} accessibilityLiveRegion="polite" style={{ gap: 6 }}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: '600' }}>Code {live.code}: {live.solved} of {live.total} pieces</Text>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.panel, overflow: 'hidden' }}><View style={{ height: 10, width: `${Math.round(live.solved / live.total * 100)}%`, backgroundColor: theme.success }} /></View>
        </View> : <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 16 }}>{progress}</Text>}
        {finished.map((f, i) => <View key={`${f.code}:${i}`} style={{ gap: 2 }}>
          <Text style={{ color: theme.success, fontSize: 16, fontWeight: '600' }}>Code {f.code}: {f.saved} saved{f.alreadyHere ? `, ${f.alreadyHere} already here` : ''}</Text>
          {f.rejected.length ? <Text selectable accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14 }}>{f.rejected.length} not saved. {f.rejected[0].reason}</Text> : null}
        </View>)}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={torch ? 'Torch off' : 'Torch on'} theme={theme} secondary disabled={!permission?.granted} onPress={() => setTorch(!torch)} style={{ flex: 1 }} />
          <Button title="Scan next report" theme={theme} secondary onPress={() => { frames.current = []; setPaused(false); setProgress('Ready to scan'); }} style={{ flex: 1 }} />
        </View>
        {canUploadRelay(viewer.role) ? <Button title={online ? 'Upload received reports' : 'Upload when connected'} theme={theme} disabled={!online} onPress={() => void sync()} /> : <Label theme={theme} muted>Reports saved here count in your summary and strategy views. A master or the scout uploads them.</Label>}
      </View>
    </View>
    <Section title={`Received on this phone (${records.filter(r => r.origin === 'relay').length})`} theme={theme}>{records.filter(r => r.origin === 'relay').map(r => <Row key={r.entry.id} title={`${bundle?.teams.find(t => t.id === r.entry.team_id)?.displayNumber ?? 'Team'}: ${deliveryLabel[deliveryState(r)]}`} subtitle={r.error ?? undefined} theme={theme} />)}</Section>
  </Screen>;
}
