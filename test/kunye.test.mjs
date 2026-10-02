import test from 'node:test';import assert from 'node:assert/strict';
import {kunyeUret} from '../src/pipeline/kunye.js';
import {permissionUsable} from '../src/pipeline/provenance.js';
const work={file:'a.jpg',provider:'wikimedia',lisans:'CC BY-SA 4.0',sahip:'Jane Doe',eser:'Lava lake',sayfa:'https://example.org/lava',lisansUrl:'https://creativecommons.org/licenses/by-sa/4.0/',modifications:'Kırpma'};
test('credits contain exact creator, license/source links and changes once per source',()=>{
 const result=kunyeUret({a:work,b:{...work,file:'b.jpg'}});assert.equal(result.zorunlu,1);assert.equal(result.toplam,2);assert.equal((result.metin.match(/"Lava lake"/g)||[]).length,1);for(const text of ['Jane Doe',work.sayfa,work.lisansUrl,'Kırpma'])assert.ok(result.metin.includes(text));
});
test('public domain sources remain individually traceable without mandatory attribution count',()=>{
 const result=kunyeUret({a:{file:'a.jpg',provider:'wikimedia',sahip:'US Navy',lisans:'Public domain',sayfa:'https://example.org/source'}});assert.equal(result.zorunlu,0);assert.match(result.metin,/US Navy/);assert.match(result.metin,/example.org\/source/);
});
test('unknown permissions are called out and cannot be selected',()=>{
 const unknown={file:'a.jpg',provider:'archive'};assert.match(kunyeUret({a:unknown}).metin,/doğrulanamadı/);assert.equal(permissionUsable(unknown),false);for(const lisans of ['BY-NC 2.0','CC BY-ND 4.0','BY-NC-SA 3.0'])assert.equal(permissionUsable({...work,lisans}),false);assert.equal(permissionUsable(work),true);
});
test('AI disclosure, empty input and English credits preserve their interfaces',()=>{
 assert.match(kunyeUret({a:{file:'a.jpg',provider:'ai'}}).metin,/yapay zekâ ile üretilmiştir/);assert.equal(kunyeUret({}).metin,'');assert.equal(kunyeUret({a:{provider:'wikimedia'}}).metin,'');assert.match(kunyeUret({a:work},{dil:'en'}).metin,/^Image credits:/);
});
