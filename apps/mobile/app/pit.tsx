import React from 'react';
import {useLocalSearchParams} from 'expo-router';
import {ManualScoutingScreen} from '../src/features/ManualScouting';
export default function Pit(){const {entryId}=useLocalSearchParams<{entryId:string}>();return <ManualScoutingScreen kind="pit" entryId={entryId} fieldArt={require('../assets/2026-field-map.png')}/>}
