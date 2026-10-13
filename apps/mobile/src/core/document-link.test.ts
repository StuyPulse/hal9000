import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeGoogleDocumentUrl} from './document-link';
test('accepts website-valid Google document links including /u/N/d/',()=>{
 assert.ok(normalizeGoogleDocumentUrl('https://docs.google.com/document/d/abc_DEF-123/edit'));
 assert.ok(normalizeGoogleDocumentUrl('https://docs.google.com/spreadsheets/u/0/d/abc123/edit?usp=sharing'));
 assert.ok(normalizeGoogleDocumentUrl('  https://docs.google.com/presentation/d/abc123  '));
});
test('rejects other hosts, schemes, folders and malformed input',()=>{
 for(const bad of ['http://docs.google.com/document/d/abc','https://drive.google.com/file/d/abc','https://docs.google.com/forms/d/abc','https://docs.google.com/document/d/','not a url',''])assert.equal(normalizeGoogleDocumentUrl(bad),null);
});
