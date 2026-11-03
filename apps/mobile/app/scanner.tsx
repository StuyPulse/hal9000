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
import { Button, DISPLAY, GroupLabel, Label, List, ListRow, Status, TeamTag } from '../src/components/ui';
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
  const [progress, setProgress] = useState('Point at a scout\'s code');
  const [torch, setTorch] = useState(false);
  const [paused, setPaused] = useState(false);
  const [live, setLive] = useState<Live>(null);
  const [finished, setFinished] = useState<Finished[]>([]);
  const frames = useRef<RelayPacket[]>([]), processing = useRef(false);
  const collector = useRef(new FountainCollector()), lastFrame = useRef(''), scopeKey = `${viewer?.userId}:${viewer?.organizationId}:${bundle?.event.id}`;
  useEffect(() => { collector.current.reset(); lastFrame.current = ''; setLive(null); setFinished([]); }, [scopeKey]);
  if (!viewer || !canReceiveQr(viewer.role)) return <Screen><Label theme={theme}>Only masters and strategists can receive reports.</Label></Screen>;
  const scanFountain = async (text: string) => {
    if (text === lastFrame.current) return;
    lastFrame.current = text;
    if (processing.current) return;
    let result;
    // A misread frame is routine with an animated code. The next one replaces it.
    try { result = collector.current.accept(text); } catch { return; }
    const { decoder, alreadyFinished } = result;
    if (alreadyFinished) { setProgress('Already saved. Scan the next phone.'); return; }
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
      setProgress('Saved. Scan the next phone.');
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
  const received = records.filter(r => r.origin === 'relay');
  return <Screen>
    <View style={{ flexDirection: split ? 'row' : 'column', gap: 16 }}>
      <View style={{ flex: split ? 1 : undefined, minWidth: 0, gap: 12 }}>
        {permission?.granted ? focused && appActive ? <CameraView style={{ height: compactHeight ? Math.max(160, height * 0.48) : 300, borderRadius: 16, overflow: 'hidden' }} enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onMountError={() => setProgress('The camera didn\'t start. Close and reopen this screen.')} onBarcodeScanned={paused ? undefined : ({ data }) => void scan(data)} /> : <Label theme={theme} muted>Camera paused.</Label> : <>
          <Button title={permission?.canAskAgain === false ? 'Allow camera in Settings' : 'Allow camera'} theme={theme} onPress={() => { void (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()).catch(e => setProgress(friendlyError(e))); }} />
        </>}
      </View>
      <View style={{ flex: split ? 1 : undefined, minWidth: 0, gap: 12 }}>
        {live ? <View accessibilityLabel={`Transfer ${live.code}: ${live.solved} of ${live.total} pieces`} accessibilityLiveRegion="polite" style={{ gap: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Text style={{ color: theme.text, fontSize: 30, fontFamily: DISPLAY, letterSpacing: 3 }}>{live.code}</Text><Text style={{ color: theme.muted, fontSize: 15, fontVariant: ['tabular-nums'] }}>{live.solved} of {live.total}</Text></View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: theme.panel, overflow: 'hidden' }}><View style={{ height: 10, width: `${Math.round(live.solved / live.total * 100)}%`, backgroundColor: theme.success }} /></View>
        </View> : <Text accessibilityLiveRegion="polite" style={{ color: theme.text, fontSize: 16 }}>{progress}</Text>}
        {finished.map((f, i) => <View key={`${f.code}:${i}`} style={{ gap: 2 }}>
          <Text style={{ color: theme.success, fontSize: 16, fontWeight: '700' }}>{f.code}: {f.saved} saved{f.alreadyHere ? `, ${f.alreadyHere} already here` : ''}</Text>
          {f.rejected.length ? <Text selectable accessibilityRole="alert" style={{ color: theme.danger, fontSize: 14 }}>{f.rejected.length} not saved. {f.rejected[0].reason}</Text> : null}
        </View>)}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={torch ? 'Light off' : 'Light'} theme={theme} secondary disabled={!permission?.granted} onPress={() => setTorch(!torch)} style={{ flex: 1 }} />
          <Button title="Reset" theme={theme} secondary onPress={() => { frames.current = []; setPaused(false); setProgress('Point at a scout\'s code'); }} style={{ flex: 1 }} />
        </View>
        {canUploadRelay(viewer.role) ? <Button title={online ? 'Upload received reports' : 'Upload when connected'} theme={theme} disabled={!online} onPress={() => void sync()} /> : <Label theme={theme} muted>A master or the scout uploads these.</Label>}
      </View>
    </View>
    {received.length ? <><GroupLabel theme={theme}>Received here ({received.length})</GroupLabel><List theme={theme}>{received.map(r => <ListRow key={r.entry.id} theme={theme} title={r.entry.entry_type === 'pre_scout' ? 'Pre-scout' : r.entry.entry_type === 'pit' ? 'Pit' : 'Match'} detail={r.error} lead={<TeamTag label={bundle?.teams.find(t => t.id === r.entry.team_id)?.displayNumber ?? '?'} size="md" theme={theme} />} tail={<Status label={deliveryLabel[deliveryState(r)]} tone={deliveryState(r) === 'uploaded' ? 'ok' : deliveryState(r) === 'attention' ? 'bad' : 'quiet'} theme={theme} />} />)}</List></> : null}
  </Screen>;
}
