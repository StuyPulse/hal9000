import {friendlyError} from '../../core/friendly-error';
import React,{useState} from 'react';
import {Switch,View} from 'react-native';
import {DEFAULT_2026_FORM,type FormDefinition} from '@wildcard/shared';
import type {Palette,EventBundle} from '../../core/types';
import {Button,Choice,Input,Label,Row,Section} from '../../components/ui';
import {editableFormSchema} from '../../core/setup-model';

type Field=FormDefinition['fields'][number];
const cloneForm=(form:FormDefinition):FormDefinition=>({...form,fields:form.fields.map(field=>({...field,options:field.options?[...field.options]:undefined}))});
export function FormBuilder({theme,forms,busy,onPublish}:{theme:Palette;forms:EventBundle['forms'];busy:boolean;onPublish:(form:FormDefinition)=>Promise<void>}){
 const [form,setForm]=useState<FormDefinition>(()=>cloneForm(DEFAULT_2026_FORM)),[selected,setSelected]=useState(0),[error,setError]=useState(''),[preview,setPreview]=useState(false);
 const field=form.fields[selected];
 const patch=(v:Partial<Field>)=>setForm(f=>({...f,fields:f.fields.map((field,i)=>i===selected?{...field,...v}:field)}));
 const move=(delta:number)=>{const to=selected+delta;if(to<0||to>=form.fields.length)return;setForm(f=>{const fields=[...f.fields];[fields[selected],fields[to]]=[fields[to],fields[selected]];return {...f,fields}});setSelected(to)};
 const publish=async()=>{try{const checked=editableFormSchema.parse(form);setError('');await onPublish(checked)}catch(e){setError(friendlyError(e))}};
 return <Section title="Versioned form builder" theme={theme}>
  <Label theme={theme} muted>Publishing creates a new immutable version. These generic definitions do not replace the website’s specialized REBUILT v4 match or v2 pit/pre-scout forms.</Label>
  {forms.map(f=><Row key={f.id} theme={theme} title={`Use ${f.name} v${f.version} as a starting point`} onPress={()=>{setForm(cloneForm(f.definition));setSelected(0)}}/>)}
  <Input label="Form title" theme={theme} value={form.title} onChangeText={title=>setForm(f=>({...f,title}))}/>
  <Input label="Game year" theme={theme} value={String(form.gameYear)} keyboardType="number-pad" onChangeText={gameYear=>setForm(f=>({...f,gameYear:Number(gameYear)}))}/>
  <Button secondary title={preview?'Edit fields':'Preview the form'} theme={theme} onPress={()=>setPreview(v=>!v)}/>
  {preview?form.fields.map((f,i)=><Section title={`${f.section} · ${f.label}${f.required?' *':''}`} theme={theme} key={`${f.id}:${i}`}><Label theme={theme} muted>{f.helpText||f.type}</Label>{f.type==='select'?<Label theme={theme}>{(f.options??[]).join(' / ')}</Label>:<Input editable={false} theme={theme} label={`Preview ${f.label}`} placeholder={f.type==='notes'?'Scout notes':f.type==='boolean'?'Yes / No':f.type==='rating'?'Rating':'0'}/>}</Section>):<>
   <Label theme={theme}>Fields · {form.fields.length}/100</Label>
   {form.fields.map((f,i)=><Row key={`${f.id}:${i}`} theme={theme} title={`${i+1}. ${f.label}${i===selected?' · editing':''}`} subtitle={`${f.section} · ${f.type}`} onPress={()=>setSelected(i)}/>)}
   <Button secondary title="Add field" theme={theme} disabled={form.fields.length>=100} onPress={()=>{setSelected(form.fields.length);setForm(f=>({...f,fields:[...f.fields,{id:`field_${Date.now()}`,label:'New field',type:'counter',section:'auto',required:false}]}))}}/>
   {field&&<Section title="Edit field" theme={theme}>
    <Input label="Stable field ID" theme={theme} value={field.id} autoCapitalize="none" onChangeText={id=>patch({id})}/>
    <Input label="Label" theme={theme} value={field.label} onChangeText={label=>patch({label})}/>
    <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(['counter','boolean','select','rating','notes'] as const).map(type=><Choice key={type} theme={theme} label={type} selected={field.type===type} onPress={()=>patch({type})}/>)}</View>
    <View style={{flexDirection:'row',gap:8}}>{(['auto','teleop','notes'] as const).map(section=><Choice key={section} theme={theme} label={section} selected={field.section===section} onPress={()=>patch({section})}/>)}</View>
    <Row theme={theme} title="Required" tail={<Switch accessibilityLabel="Field required" value={field.required} onValueChange={required=>patch({required})}/>}/>
    {field.type==='select'&&<Input label="Choices · one per line" multiline theme={theme} value={(field.options??[]).join('\n')} onChangeText={v=>patch({options:v.split('\n')})}/>}
    <Input label="Help text" theme={theme} value={field.helpText??''} onChangeText={helpText=>patch({helpText})}/>
    <View style={{flexDirection:'row',gap:8}}><Button secondary title="Move earlier" theme={theme} disabled={selected===0} onPress={()=>move(-1)} style={{flex:1}}/><Button secondary title="Move later" theme={theme} disabled={selected===form.fields.length-1} onPress={()=>move(1)} style={{flex:1}}/></View>
    <Button secondary title="Remove field" theme={theme} disabled={form.fields.length===1} onPress={()=>{setForm(f=>({...f,fields:f.fields.filter((_,i)=>i!==selected)}));setSelected(Math.max(0,selected-1))}}/>
   </Section>}
  </>}
  {error&&<Label theme={theme}>{error}</Label>}
  <Button title={busy?'Publishing…':'Publish new version'} theme={theme} disabled={busy} onPress={()=>void publish()}/>
 </Section>;
}
