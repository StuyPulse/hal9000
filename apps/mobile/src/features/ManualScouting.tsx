import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Text, View, type ImageSourcePropType } from 'react-native';
import { useRouter } from 'expo-router';
import {PhotoSubmissionQueue} from '../components/PhotoSubmissionQueue';
import { SvgXml } from 'react-native-svg';
import type { LocalSubmission, Payload } from '../core/types';
import { Button, Card, Choice, Input, Row, Section } from '../components/ui';
import { AutoPathCanvas } from './AutoPathCanvas';
import { Badge, Notice, Screen, Stepper, TeamPicker, useFeatureApp } from './common';
import { prescoutBlocked, prescoutCoordination } from './stats';
import {
  DRIVETRAIN_LENGTH, DRIVETRAIN_WIDTH, EXPERIENCE_OPTIONS, HOPPER_CAPACITY, MANUAL_TITLES, OPERATOR_EXPERIENCE_OPTIONS,
  PIT_TEXT_FIELDS, PRE_SCOUT_TEXT_FIELDS, ROBOT_WEIGHT, TRAVERSAL_OPTIONS, joinPayload, parseTraversal, perimeterOf, reviewRows,
  setDimensions, splitPayload, toggleTraversal, unknownKeys, validateManual, mergeManualPayload, PERIMETER_LIMIT, type ManualKind, type TextField,
} from './manualFields';

type Step = 'form' | 'review' | 'done';
const AUTOSAVE_MS = 700;

/** Pit scouting and pre-scouting: the website's two version-2 manual forms. */
export function ManualScoutingScreen({ kind, entryId, fieldArt }: { kind: ManualKind; entryId?: string; fieldArt?: ImageSourcePropType }) {
  const app = useFeatureApp();
  const { theme, bundle, viewer, records } = app;
  const router = useRouter();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [extras, setExtras] = useState<Payload>({});
  const [step, setStep] = useState<Step>('form');
  const [recordId, setRecordId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [photoTeamId, setPhotoTeamId] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<{ text: string; error: boolean } | null>(null);

  // Latest values for the debounced writer; state alone would be stale inside timers.
  const latest = useRef({ teamId, fields, extras });
  latest.current = { teamId, fields, extras };
  const recordIdRef = useRef<string | null>(null);
  const creating = useRef<Promise<string> | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedEntry = useRef<string | null>(null);
  const basePayload = useRef<Payload>({});

  const title = MANUAL_TITLES[kind];
  const eventId = bundle?.event.id;
  const privileged = viewer?.role === 'admin' || viewer?.role === 'developer' || viewer?.role === 'global_scout';

  const adoptRecord = useCallback((record: LocalSubmission) => {
    const split = splitPayload(record.entry.payload);
    basePayload.current = record.entry.payload;
    recordIdRef.current = record.entry.id;
    creating.current = Promise.resolve(record.entry.id);
    setRecordId(record.entry.id);
    setTeamId(record.entry.team_id);
    setPhotoTeamId(record.entry.team_id);
    setFields(split.fields);
    setExtras(split.extras);
    dirty.current = false;
    setSavedAt(new Date(record.changedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
  }, []);

  useEffect(() => {
    if (!entryId || loadedEntry.current === entryId) return;
    const found = records.find((record) => record.entry.id === entryId && record.entry.entry_type === kind);
    if (found) { loadedEntry.current = entryId; adoptRecord(found); }
  }, [entryId, records, kind, adoptRecord]);

  const persist = useCallback(async (finalize: boolean) => {
    const { teamId: team, fields: current, extras: other } = latest.current;
    if (!team) return null;
    const payload = joinPayload(current, other);
    try {
      if (!recordIdRef.current) {
        // createDraft returns an existing own draft for this team. Keep its saved fields as the base
        // so starting a fresh form never silently erases earlier work.
        const existing = app.records.find((item) => item.origin === 'own' && item.entry.entry_type === kind && item.entry.team_id === team && item.entry.event_id === eventId && item.entry.status === 'draft');
        const base = existing ? joinPayload({ ...splitPayload(existing.entry.payload).fields, ...current }, { ...splitPayload(existing.entry.payload).extras, ...other }) : payload;
        creating.current ??= app.createDraft(kind, team, null, null, base).then((created) => {
          basePayload.current = created.entry.payload;
          recordIdRef.current = created.entry.id;
          setRecordId(created.entry.id);
          return created.entry.id;
        });
      }
      const id = await creating.current!;
      const next = mergeManualPayload(basePayload.current, current, other);
      await app.saveDraft(id, next, finalize);
      basePayload.current = next;
      dirty.current = false;
      setSaveError(null);
      setSavedAt(new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' }));
      return id;
    } catch (error) {
      creating.current = recordIdRef.current ? creating.current : null;
      setSaveError(error instanceof Error ? error.message : 'Could not save on this device.');
      return null;
    }
  }, [app, kind]);

  // Autosave: every edit is written through the context to local storage after a short pause.
  // The context object may change identity on every render, so timers go through a ref.
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const schedule = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void persistRef.current(false); }, AUTOSAVE_MS);
  }, []);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current) void persistRef.current(false);
  }, []);

  const setField = (id: string, value: string) => { setFields((current) => ({ ...current, [id]: value })); schedule(); };
  const patchFields = (next: Record<string, string>) => { setFields(next); schedule(); };

  const markedTeamIds = useMemo(() => {
    const submitted = new Set<string>();
    for (const entry of bundle?.entries ?? []) if (entry.entry_type === kind && entry.status === 'submitted' && entry.event_id === eventId) submitted.add(entry.team_id);
    for (const record of records) if (record.entry.entry_type === kind && record.entry.status === 'submitted' && record.entry.event_id === eventId) submitted.add(record.entry.team_id);
    return [...submitted];
  }, [bundle?.entries, records, kind, eventId]);

  const drafts = useMemo(() => records.filter((record) => record.entry.entry_type === kind && record.entry.event_id === eventId && record.entry.status === 'draft' && record.origin === 'own' && record.entry.id !== recordId), [records, kind, eventId, recordId]);
  const chooseTeam = (id:string) => {
    const existing = drafts.find(item=>item.entry.team_id===id);
    if(existing)adoptRecord(existing);
    else {setTeamId(id);setPhotoTeamId(id);}
  };

  const photoCoverage = useMemo(() => {
    const photographed = new Set<string>();
    for (const photo of bundle?.photos ?? []) if (photo.event_id === eventId) photographed.add(photo.team_id);
    for (const photo of app.photos) if (photo.event_id === eventId) photographed.add(photo.team_id);
    return photographed;
  }, [bundle?.photos, app.photos, eventId]);

  const missingEntry = Boolean(entryId) && !loadedEntry.current && !records.some((item) => item.entry.id === entryId);
  if (bundle && viewer && missingEntry) {
    return <Screen theme={theme}><Notice theme={theme} tone="warning">This report is not stored on this device, so it cannot be edited here yet. Open it from Submissions on a device that wrote it, or use the website.</Notice></Screen>;
  }
  if (!bundle || !viewer) {
    return <Screen theme={theme}><Notice theme={theme} tone="warning">Download the active event before filling out {title.toLowerCase()} reports.</Notice></Screen>;
  }

  const teamName = (id: string) => { const team = bundle.teams.find((item) => item.id === id); return team ? `${team.displayNumber} · ${team.name}` : 'Unknown team'; };
  const validation = validateManual(kind, teamId, fields);
  const rows = reviewRows(kind, fields);
  const record = records.find((item) => item.entry.id === recordId);
  const editing = Boolean(entryId);
  const coordination = prescoutCoordination(bundle.prescoutAssignments, viewer.userId);
  const assignedHere = Boolean(teamId && coordination.mine.has(teamId));
  const preScoutBlocked = kind === 'pre_scout' && prescoutBlocked({ privileged, teamId, eventActive: bundle.event.status === 'active', eventTeamIds: bundle.teams.map((item) => item.id), assignedTeamIds: coordination.mine });
  const preScoutNote = preScoutBlocked
    ? bundle.event.status !== 'active' ? 'This event is not the active event and this team is not assigned to you, so the server would reject the report. Ask an admin to assign the team or activate the event.' : 'This team is not registered to the active event and is not assigned to you, so the server would reject the report.'
    : null;
  const blocked = validation.errors.length > 0 || preScoutBlocked;

  async function submit() {
    if (blocked || submitting) return;
    setSubmitting(true);
    if (timer.current) clearTimeout(timer.current);
    const id = await persist(true);
    setSubmitting(false);
    if (id) setStep('done');
  }

  function startAnother() {
    if (timer.current) clearTimeout(timer.current);
    recordIdRef.current = null;
    creating.current = null;
    dirty.current = false;
    loadedEntry.current = null;
    basePayload.current = {};
    setRecordId(null); setTeamId(null); setFields({}); setExtras({}); setSavedAt(null); setSaveError(null); setStep('form');
  }

  // ---- done ----
  if (step === 'done') {
    return (
      <Screen theme={theme}>
        <Card theme={theme}>
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 22, fontWeight: '700' }}>{editing ? 'Changes saved' : `${title} saved`}</Text>
          <Text style={{ color: theme.muted, fontSize: 15, lineHeight: 22 }}>{teamId ? teamName(teamId) : ''}</Text>
          <Badge theme={theme} tone={record?.status === 'synced' ? 'success' : record?.status === 'failed' ? 'danger' : 'warning'} text={record?.status === 'synced' ? 'Uploaded' : record?.status === 'failed' ? 'Upload failed — will retry' : 'Saved on this device · waiting to upload'} />
          {record?.error ? <Notice theme={theme} tone="danger">{record.error}</Notice> : null}
        </Card>
        {recordId ? <Button theme={theme} title="View report" icon="check" onPress={() => router.push(`/submission/${recordId}` as never)} /> : null}
        <Button theme={theme} secondary title={kind === 'pit' ? 'Scout another robot' : 'Start another report'} onPress={startAnother} />
      </Screen>
    );
  }

  // ---- review ----
  if (step === 'review') {
    return (
      <Screen theme={theme} footer={<>
        <Button theme={theme} title={submitting ? 'Saving…' : editing ? 'Save changes' : `Submit ${title.toLowerCase()}`} disabled={submitting || blocked} onPress={() => { void submit(); }} />
        <Button theme={theme} secondary title="Back to edit" onPress={() => setStep('form')} />
      </>}>
        <Section theme={theme} title={`Review ${title.toLowerCase()}`}>
          <Card theme={theme}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '700' }}>{teamId ? teamName(teamId) : 'No team'}</Text>
            {rows.map((row) => (
              <View key={row.id} style={{ gap: 2 }}>
                <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>{row.label}</Text>
                <Text style={{ color: row.value === 'Not recorded' ? theme.muted : theme.text, fontSize: 16 }}>{row.value}</Text>
              </View>
            ))}
            {kind === 'pit' ? (
              <View style={{ gap: 6 }}>
                <Text style={{ color: theme.muted, fontSize: 13, fontWeight: '600' }}>Autonomous routes</Text>
                {fields.auto_routines_drawing ? <View style={{ aspectRatio: 1380 / 674, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.panel }}><SvgXml xml={fields.auto_routines_drawing} width="100%" height="100%" /></View> : <Text style={{ color: theme.muted }}>Not recorded</Text>}
              </View>
            ) : null}
            {unknownKeys(kind, joinPayload(fields, extras)).length ? <Text style={{ color: theme.muted, fontSize: 13 }}>Also keeping fields this version does not show: {unknownKeys(kind, joinPayload(fields, extras)).join(', ')}.</Text> : null}
          </Card>
        </Section>
        {validation.errors.map((message) => <Notice key={message} theme={theme} tone="danger">{message}</Notice>)}
        {validation.warnings.map((message) => <Notice key={message} theme={theme} tone="warning">{message}</Notice>)}
        {saveError ? <Notice theme={theme} tone="danger">{saveError} Your edits are still on screen; try again.</Notice> : null}
      </Screen>
    );
  }

  // ---- form ----
  const textField = (field: TextField) => (
    <View key={field.id}>
      <Input theme={theme} label={field.label} value={fields[field.id] ?? ''} onChangeText={(value) => setField(field.id, value)} placeholder={field.placeholder} multiline />
      {field.helper ? <Text style={{ color: theme.muted, fontSize: 13 }}>{field.helper}</Text> : null}
    </View>
  );
  const length = Number(fields.drivetrain_length ?? 0);
  const width = Number(fields.drivetrain_width ?? 0);
  const perimeter = perimeterOf(length, width);
  const traversal = parseTraversal(fields.traversal);
  const photoTarget = photoTeamId ?? teamId;
  const teamPhotos = app.photos.filter((photo) => photo.team_id === photoTarget && photo.event_id === eventId);
  const syncedPhotos = (bundle.photos ?? []).filter((photo) => photo.team_id === photoTarget && photo.event_id === eventId);
  const missing = bundle.teams.filter((team) => !photoCoverage.has(team.id)).sort((a, b) => a.number - b.number);

  return (
    <Screen theme={theme} scrollEnabled={!drawing} footer={teamId ? <Button theme={theme} title="Review report" icon="check" disabled={blocked} onPress={() => { if (timer.current) clearTimeout(timer.current); void persist(false); setStep('review'); }} /> : undefined}>
      <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 26, fontWeight: '700' }}>{title}</Text>
      <Text style={{ color: theme.muted, fontSize: 15 }}>{bundle.event.name}</Text>
      {editing ? <Notice theme={theme}>The report stays attached to its original team and event.</Notice> : null}
      {preScoutNote ? <Notice theme={theme} tone="warning">{preScoutNote}</Notice> : null}
      {!app.online ? <Notice theme={theme}>Offline · saved on this device</Notice> : null}

      {!editing && !recordId && drafts.length ? (
        <Section theme={theme} title="Resume a draft">
          {drafts.slice(0, 4).map((draft) => (
            <Row key={draft.entry.id} theme={theme} title={teamName(draft.entry.team_id)} subtitle={`Saved ${new Date(draft.changedAt).toLocaleString()}`} onPress={() => { loadedEntry.current = draft.entry.id; adoptRecord(draft); }} />
          ))}
        </Section>
      ) : null}

      {kind === 'pre_scout' && !editing && !recordId && coordination.mine.size ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: '600' }}>Assigned to you</Text>
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {bundle.teams.filter((team) => coordination.mine.has(team.id)).sort((a, b) => a.number - b.number).map((team) => (
              <Choice key={team.id} theme={theme} label={`${team.displayNumber}${markedTeamIds.includes(team.id) ? ' ✓' : ''}`} selected={teamId === team.id} onPress={() => chooseTeam(team.id)} />
            ))}
          </View>
        </View>
      ) : null}
      <TeamPicker theme={theme} teams={bundle.teams} value={teamId} disabled={editing || Boolean(recordId)} markedIds={markedTeamIds} markedLabel={kind === 'pit' ? 'Pit report submitted' : 'Pre-scout report submitted'} onChange={chooseTeam} />
      {recordId && !editing ? <Button theme={theme} secondary title="Change team (start a new report)" onPress={startAnother} /> : null}
      {kind === 'pre_scout' && teamId ? (() => {
        const scouts = coordination.byTeam.get(teamId) ?? [];
        const names = scouts.filter((id) => id !== viewer.userId).map((id) => bundle.profiles?.[id] ?? 'A scout');
        return <Text style={{ color: theme.muted, fontSize: 13 }}>{assignedHere ? `Assigned to you${names.length ? ` and ${names.join(', ')}` : ''}.` : names.length ? `Assigned to ${names.join(', ')}. You can still submit a report.` : 'No one is assigned to this team; anyone can report it.'}</Text>;
      })() : null}

      {teamId ? (
        <>
          {kind === 'pre_scout' ? (
            <Section theme={theme} title="Plan">
              <Input theme={theme} label="Average game pieces scored" value={fields.average_pieces ?? ''} onChangeText={(value) => setField('average_pieces', value.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" maxLength={3} placeholder="e.g. 35" />
              {PRE_SCOUT_TEXT_FIELDS.map(textField)}
            </Section>
          ) : (
            <>
              <Section theme={theme} title="Drive team">
                <Text style={{ color: theme.text, fontWeight: '600' }}>Driver experience</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {EXPERIENCE_OPTIONS.map((option) => <Choice key={option.value} theme={theme} label={option.label} selected={fields.driver_experience === option.value} onPress={() => setField('driver_experience', option.value)} />)}
                </View>
                <Text style={{ color: theme.text, fontWeight: '600' }}>Operator experience</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {OPERATOR_EXPERIENCE_OPTIONS.map((option) => <Choice key={option.value} theme={theme} label={option.label} selected={fields.operator_experience === option.value} onPress={() => setField('operator_experience', option.value)} />)}
                </View>
                {textField(PIT_TEXT_FIELDS.contact_info)}
                {textField(PIT_TEXT_FIELDS.offseason)}
              </Section>

              <Section theme={theme} title="Robot">
                <Text style={{ color: theme.text, fontWeight: '600' }}>Drivetrain dimensions without bumpers</Text>
                <Text style={{ color: perimeter > PERIMETER_LIMIT ? theme.warning : theme.muted, fontSize: 14 }}>Perimeter: {perimeter} in / {PERIMETER_LIMIT} in max.</Text>
                <Stepper theme={theme} label={`${DRIVETRAIN_LENGTH.label}`} unit="in" min={DRIVETRAIN_LENGTH.min} max={DRIVETRAIN_LENGTH.max} step={DRIVETRAIN_LENGTH.step} value={length} emptyWhenZero onChange={(value) => patchFields(setDimensions(fields, value, width))} />
                <Stepper theme={theme} label={`${DRIVETRAIN_WIDTH.label}`} unit="in" min={DRIVETRAIN_WIDTH.min} max={DRIVETRAIN_WIDTH.max} step={DRIVETRAIN_WIDTH.step} value={width} emptyWhenZero onChange={(value) => patchFields(setDimensions(fields, length, value))} />
                <Stepper theme={theme} label={ROBOT_WEIGHT.label} unit="lb" hint={ROBOT_WEIGHT.hint} min={ROBOT_WEIGHT.min} max={ROBOT_WEIGHT.max} step={ROBOT_WEIGHT.step} value={Number(fields.robot_weight ?? 0)} emptyWhenZero onChange={(value) => setField('robot_weight', String(value))} />
                <Stepper theme={theme} label={HOPPER_CAPACITY.label} unit="fuel" min={HOPPER_CAPACITY.min} max={HOPPER_CAPACITY.max} step={HOPPER_CAPACITY.step} value={Number(fields.hopper_capacity ?? 0)} emptyWhenZero onChange={(value) => setField('hopper_capacity', String(value))} />
                <Text style={{ color: theme.text, fontWeight: '600' }}>Traversal</Text>
                <Text style={{ color: theme.muted, fontSize: 13 }}>Select every route the robot can use.</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {TRAVERSAL_OPTIONS.map((option) => <Choice key={option.value} theme={theme} label={`${option.label} · ${option.hint}`} selected={traversal.includes(option.value)} onPress={() => setField('traversal', toggleTraversal(fields.traversal, option.value))} />)}
                </View>
              </Section>

              <Section theme={theme} title="Strategy">
                {textField(PIT_TEXT_FIELDS.teleop_active_hub)}
                {textField(PIT_TEXT_FIELDS.teleop_inactive_hub)}
                {textField(PIT_TEXT_FIELDS.scoring_area)}
                {textField(PIT_TEXT_FIELDS.comments)}
              </Section>

              <Section theme={theme} title="Autonomous routines / paths">
                <AutoPathCanvas key={`${recordId ?? 'new'}`} theme={theme} value={fields.auto_routines_drawing ?? ''} fieldArt={fieldArt} onDrawingChange={setDrawing} onChange={(svg) => setField('auto_routines_drawing', svg)} />
                <Input theme={theme} label="Auton notes" value={fields.auto_routines_notes ?? ''} onChangeText={(value) => setField('auto_routines_notes', value)} multiline placeholder={'Red — scores preload, then returns through the trench\nBlue — collects from DEPOT before shooting\nGreen — alternate routine'} />
              </Section>
            </>
          )}

          {validation.errors.map((message) => <Notice key={message} theme={theme} tone="danger">{message}</Notice>)}
          {saveError ? <Text style={{ color: theme.danger, fontSize: 13 }}>{saveError}</Text> : null}
        </>
      ) : null}

      {kind === 'pit' ? (
        <Section theme={theme} title="Photos & coverage">
          
          <PhotoSubmissionQueue initialTeamId={photoTarget}/>
          {photoMessage ? <Notice theme={theme} tone={photoMessage.error ? 'danger' : 'success'}>{photoMessage.text}</Notice> : null}
          {teamPhotos.length || syncedPhotos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {teamPhotos.map((photo) => (
                <View key={photo.id} style={{ width: 96, gap: 4 }}>
                  <Image accessibilityLabel="Pit photo saved on this device" source={{ uri: photo.localUri }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: theme.panel }} />
                  <Badge theme={theme} tone={photo.status === 'synced' ? 'success' : photo.status === 'failed' ? 'danger' : 'warning'} text={photo.status === 'synced' ? 'Uploaded' : photo.status === 'failed' ? 'Failed' : 'Pending'} />
                </View>
              ))}
              {syncedPhotos.filter((photo) => photo.signedUrl).map((photo) => (
                <Image key={photo.id} accessibilityLabel="Pit photo" source={{ uri: photo.signedUrl }} style={{ width: 96, height: 96, borderRadius: 10, backgroundColor: theme.panel }} />
              ))}
            </View>
          ) : null}
          <Text accessibilityRole="header" style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{bundle.teams.length - missing.length} of {bundle.teams.length} teams have a pit photo</Text>
          {missing.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {missing.slice(0, 60).map((team) => <Choice key={team.id} theme={theme} label={team.displayNumber} selected={photoTarget === team.id} onPress={() => setPhotoTeamId(team.id)} />)}
            </View>
          ) : <Notice theme={theme} tone="success">Every team has a pit photo.</Notice>}
        </Section>
      ) : null}
    </Screen>
  );
}

export default ManualScoutingScreen;
