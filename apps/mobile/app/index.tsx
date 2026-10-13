import React from 'react';
import {Redirect} from 'expo-router';
import {useApp} from '../src/core/context';
import {Loading} from '../src/components/Screen';
export default function Index(){const {ready,viewer}=useApp();if(!ready)return <Loading/>;return <Redirect href={viewer?'/(tabs)':'/login'}/>}
