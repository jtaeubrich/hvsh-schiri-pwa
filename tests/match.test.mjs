import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractMatchId, feeRates, mapHandball360Payload, localDateFromISO, suggestFeeRate } from '../match.js';

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

test('suggests documented league base fees only for the applicable season and competition', () => {
  const date='2026-11-21T13:00:00+00:00';
  const cases=[
    ['Oberliga Schleswig-Holstein Männer','',45],
    ['Verbandsliga Schleswig-Holstein Frauen / Meisterrunde - Nord','',40],
    ['Oberliga Schleswig-Holstein männliche B-Jugend','',35],
    ['Regionalliga Nord Männer','',80],
    ['Regionalliga Nord Frauen','',70],
    ['Regionalliga Nord weibliche C-Jugend','',60],
    ['Kreisoberliga Männer / Kreisoberliga Männer Nord','Handballverband Schleswig-Holstein',30],
    ['Kreisliga weibliche D-Jugend','Handballverband Schleswig-Holstein',undefined],
    ['Kreisliga Männer','Handballverband Westfalen',undefined],
    ['Oberliga Schleswig-Holstein Jugend Qualifikation','',undefined],
  ];
  for(const [competition,organizer,amount] of cases) {
    assert.equal(feeRates[suggestFeeRate(competition,organizer,date)]?.amount,amount,competition);
  }
  assert.equal(suggestFeeRate('Regionalliga Nord Männer','','2027-07-01'),'');
  assert.equal(suggestFeeRate('Regionalliga Nord Männer','','2026-11-31'),'');
  const payload={match_id:'591223',match:{data:[{id:591223,date,phase:{competition:{
    name:'Kreisliga Männer',federation:{name:'Handballverband Schleswig-Holstein'},
  }}}]}};
  assert.equal(mapHandball360Payload(payload).feeRate,'khvAdults');
});

test('uses the configured Förde youth rate with the staffel code or regional organizer', () => {
  const raw={match_id:'591223',match:{data:[{
    id:591223,code:'2627FORBKRDJMA0802',date:'2026-11-21T13:00:00+00:00',
    phase:{name:'HGRF-RLmD-V-A',competition:{name:'Regionsliga MÄNNLICH'}},
  }]}};
  const match=mapHandball360Payload(raw);
  assert.equal(feeRates[match.feeRate].amount,15);
  assert.equal(suggestFeeRate('Weibliche E-Jugend','HGR Förde','2027-11-20'),'foerdeYouth');
  assert.equal(suggestFeeRate('Regionsliga Männer / HGRF-RLM','HGR Förde','2026-11-21'),'');
  assert.equal(suggestFeeRate('Regionsliga mD','KHV Lübeck','2026-11-21'),'');
});
