import test from 'node:test';
import assert from 'node:assert/strict';
import {SLIDE_START,SLIDE_STEP,slideDelta} from './slide-count';

test('small movements count as a tap, not a slide', () => {
 assert.equal(slideDelta(SLIDE_START-1,5),0);
 assert.equal(slideDelta(-(SLIDE_START-1),5),0);
});

test('sliding right adds one ball per step', () => {
 assert.equal(slideDelta(SLIDE_STEP,0),1);
 assert.equal(slideDelta(SLIDE_STEP*15+5,0),15);
});

test('sliding left takes balls back but never below zero', () => {
 assert.equal(slideDelta(-SLIDE_STEP*3,10),-3);
 assert.equal(slideDelta(-SLIDE_STEP*30,4),-4);
});
