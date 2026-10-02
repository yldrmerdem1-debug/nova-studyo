import test from 'node:test';
import assert from 'node:assert/strict';
import { rankThumbnailCandidates } from '../src/pipeline/thumbnails.js';

const candidate=(id,index,details={})=>({i:index,b:{media:{
  file:`${id}.jpg`,type:'image',gorsel:3,kalite:3,sourceId:id,...details,
}}});

test('Apollo 13 Director cover favors the verified flown crew over a generated face and equipment photos',()=>{
  const shots=[
    candidate('ai-lovell',0,{provider:'openai',editorial:{sourceRole:'reconstruction'}}),
    candidate('service-module',1,{provider:'archive',permissionVerified:true,sourceUrl:'https://www.nasa.gov/image-article/apollo-13/',editorial:{sourceRole:'evidence',reason:'NASA photograph of the service module'}}),
    candidate('flight-crew',2,{provider:'archive',permissionVerified:true,sourceUrl:'https://images.nasa.gov/details/S70-36485',editorial:{sourceRole:'evidence',reason:'NASA photograph of the flown crew, Lovell, Swigert and Haise'}}),
    candidate('wrong-crew',3,{provider:'archive',permissionVerified:false,sourceUrl:'https://example.invalid/crew',editorial:{sourceRole:'evidence',reason:'Portrait of the crew'}}),
  ];
  const ranked=rankThumbnailCandidates(shots,{mediaKind:'director'}).map(x=>x.b.media.sourceId);
  assert.deepEqual(ranked,['flight-crew','service-module','ai-lovell','wrong-crew']);
  assert.deepEqual(rankThumbnailCandidates(shots,{mediaKind:'mixed'}).map(x=>x.b.media.sourceId),['ai-lovell','service-module','flight-crew','wrong-crew']);
});

test('relevance and visual quality still outrank cover provenance',()=>{
  const shots=[
    candidate('archive-portrait',0,{gorsel:2,provider:'archive',permissionVerified:true,sourceUrl:'https://www.nasa.gov/',editorial:{sourceRole:'evidence',reason:'Portrait of the subject'}}),
    candidate('relevant-scene',1,{gorsel:3,provider:'openai',editorial:{sourceRole:'reconstruction'}}),
  ];
  assert.equal(rankThumbnailCandidates(shots,{mediaKind:'director'})[0].b.media.sourceId,'relevant-scene');
});
