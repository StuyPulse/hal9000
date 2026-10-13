import React from 'react';
import {useLocalSearchParams} from 'expo-router';
import {TeamProfileScreen} from '../../src/features/StrategyViews';
export default function Team(){const {id}=useLocalSearchParams<{id:string}>();return <TeamProfileScreen teamId={id}/>}
