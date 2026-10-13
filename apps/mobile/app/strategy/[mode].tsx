import React from 'react';
import {Stack,useLocalSearchParams} from 'expo-router';
import {StrategyScreen} from '../../src/features/StrategyViews';
export default function Strategy(){const {mode}=useLocalSearchParams<{mode:string}>();const selected=(['summary','compare','picklist','strategy'].includes(mode)?mode:'summary') as 'summary'|'compare'|'picklist'|'strategy';return <><Stack.Screen options={{title:{summary:'Scouting summary',compare:'Compare teams',picklist:'Shared picklist',strategy:'Match strategy'}[selected]}}/><StrategyScreen mode={selected}/></>}
