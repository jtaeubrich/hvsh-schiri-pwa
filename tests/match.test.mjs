import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMatchId, mapHandball360Payload, localDateFromISO } from '../match.js';

test('match links and numeric IDs accepted with strict origin', () => {
  assert.equal(extractMatchId('https://www.handball.net/match/591223'), '591223');
  assert.equal(extractMatchId('591223'), '591223');
  assert.equal(extractMatchId('https://evil.example/match/591223'), null);
  assert.equal(extractMatchId('https://www.handball.net/match/591223/other'), null);
});
test('Handball360 time remains literal local time without adding UTC offset', () => {
  assert.deepEqual(localDateFromISO('2026-11-21T10:30:00+00:00'), {date:'21.11.2026',time:'10:30'});
  assert.deepEqual(localDateFromISO('2026-11-21'), {date:'21.11.2026',time:''});
});
test('maps fields and does not mistake match ID for official Spielnummer', () => {
  const raw = {match_id:'591223',match:{data:[{id:'591223',date:'2026-11-21T10:30:00Z',local:{name:'Heimverein'},visitor:{name:'Gastverein'},phase:{name:'mJB-RL-2',competition:{name:'Regionsliga'}},field:{name:'Sporthalle',installation:{city:'Kiel'}},number:'591223'}]}};
  const x=mapHandball360Payload(raw,'591223');
  assert.equal(x.gameNumber,'');
  assert.equal(x.home,'Heimverein');
  assert.equal(x.away,'Gastverein');
  assert.equal(x.hall,'Sporthalle');
  assert.equal(x.place,'Kiel');
  assert.equal(x.competition,'Regionsliga / mJB-RL-2');
});
test('rejects a mismatched response ID', () => {
  assert.throws(()=>mapHandball360Payload({match_id:'591223',match:{data:[{id:'600000'}]}},'591223'), /inkonsistent/);
});
test('uses a dedicated official match number when available', () => {
  const x=mapHandball360Payload({match_id:'591223',match:{data:[{id:'591223',game_number:'2627ABC01234',local:{name:'A'},visitor:{name:'B'}}]}});
  assert.equal(x.gameNumber,'2627ABC01234');
  assert.equal(x.hasOfficialNumber,true);
});
