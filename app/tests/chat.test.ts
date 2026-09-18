import {test} from 'node:test';
import assert from 'node:assert/strict';
import {decodeEntities,mentionQuery,applyMention,mentionsMe,segments,createThread} from '../src/chat.ts';

test('the five entities the server escapes come back as characters',()=>{
 assert.equal(decodeEntities('&lt;b&gt; &amp; &quot;ça&quot; &#39;ok&#39;'),'<b> & "ça" \'ok\'');
 assert.equal(decodeEntities('&#x27;'),'\'');
 assert.equal(decodeEntities('rien à décoder'),'rien à décoder');
 assert.equal(decodeEntities('&amp;lt;'),'&lt;');// one pass only, never a double decode
});

test('a mention is only detected on a fresh @ before the caret',()=>{
 assert.deepEqual(mentionQuery('@ma',3),{start:0,query:'ma'});
 assert.deepEqual(mentionQuery('salut @lu',9),{start:6,query:'lu'});
 assert.deepEqual(mentionQuery('salut @',7),{start:6,query:''});
 assert.equal(mentionQuery('mail@domaine',12),null);// glued to a word
 assert.equal(mentionQuery('salut @lu',5),null);// caret before the @
 assert.equal(mentionQuery('@ma la suite',12),null);// a space closed it
 assert.equal(mentionQuery('salut',5),null);
 assert.equal(mentionQuery('@'+'x'.repeat(21),22),null);// too long to be a pseudo
});

test('a picked mention replaces the query and leaves the caret after the space',()=>{
 assert.deepEqual(applyMention('salut @lu',6,9,'Luce'),{value:'salut @Luce ',caret:12});
 assert.deepEqual(applyMention('@lu ça va',0,3,'Luce'),{value:'@Luce  ça va',caret:6});
 assert.deepEqual(applyMention('@',0,1,'Luce'),{value:'@Luce ',caret:6});
});

test('being mentioned ignores the case but respects word boundaries',()=>{
 assert.ok(mentionsMe('salut @maxime !','Maxime'));
 assert.ok(mentionsMe('@MAXIME','maxime'));
 assert.ok(mentionsMe('coucou @maxime, ça va ?','maxime'));
 assert.equal(mentionsMe('salut @maximilien','maxime'),false);
 assert.equal(mentionsMe('maxime sans arobase','maxime'),false);
 assert.equal(mentionsMe('salut @maxime',''),false);
});

test('segments split the text so mentions can be highlighted',()=>{
 assert.deepEqual(segments('salut @luce ça va'),[{kind:'text',value:'salut '},{kind:'mention',value:'@luce'},{kind:'text',value:' ça va'}]);
 assert.deepEqual(segments('@a @b'),[{kind:'mention',value:'@a'},{kind:'text',value:' '},{kind:'mention',value:'@b'}]);
 assert.deepEqual(segments('rien'),[{kind:'text',value:'rien'}]);
 assert.deepEqual(segments('mail@domaine'),[{kind:'text',value:'mail@domaine'}]);
 assert.deepEqual(segments(''),[]);
});

test('the thread keeps the last 200 messages',()=>{
 const t=createThread();
 assert.equal(t.MAX,200);
 for(let i=0;i<250;i++)t.push({id:'a',name:'A',color:0,text:String(i),ts:i,mine:false});
 assert.equal(t.list.length,200);
 assert.equal(t.list[0].text,'50');assert.equal(t.list[199].text,'249');
 t.clear();assert.equal(t.list.length,0);
});
