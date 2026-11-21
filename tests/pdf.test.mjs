import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {mapHandball360Payload} from '../match.js';
import {generateHVSH} from '../pdf.js';
const here=dirname(fileURLToPath(import.meta.url));

test('PDF generator creates a valid local A4 document without a PDF API',async()=>{
  const jpeg=await fs.readFile(join(here,'../assets/hvsh-form.jpg'));
  const old=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>jpeg});
  try{
    const gameNumber='2627FORBKRDJMA0802';
    const payload={match_id:'591223',match:{data:[{
      id:591223,code:gameNumber,date:'2026-11-21T13:00:00+00:00',
      local:{name:'Musterverein Heim'},visitor:{name:'Musterverein Gast'},
    }]}};
    const match=mapHandball360Payload(payload,'591223');
    assert.equal(match.gameNumber,gameNumber);
    assert.equal(match.hasOfficialNumber,true);
    const model={...match,refereeCount:2,referee1:'',referee2:'',fee1:'15,00',fee2:'15,00'};
    const {blob,shortened}=await generateHVSH(model);
    assert.equal(shortened.length,0);
    assert.ok(blob.size>400000);
    const bytes=new Uint8Array(await blob.arrayBuffer());
    assert.ok(new TextDecoder().decode(bytes.slice(0,8)).startsWith('%PDF-1.4'));
    assert.ok(Buffer.from(bytes).includes(`(${gameNumber}) Tj`));
    const pdfPath=join(here,'_artifacts','node_hvsh.pdf');
    await fs.mkdir(dirname(pdfPath),{recursive:true});
    await fs.writeFile(pdfPath,bytes);
  }finally{globalThis.fetch=old;}
});
