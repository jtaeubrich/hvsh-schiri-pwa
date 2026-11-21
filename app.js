import {extractMatchId, feeRates, mapHandball360Payload} from './match.js?v=0.2.0';
import {loadFormImage, paintPreview, generateHVSH} from './pdf.js?v=0.2.0';

// Existing deployed endpoint used by the Spielanalyse PWA.
// Fixed destination prevents accidentally transmitting the token to arbitrary hosts.
const PROXY = 'https://handball360-proxy-235703972531.europe-west1.run.app';
const TOKEN_KEY = 'handballSpielanalyse.proxyToken';
const PROFILE_KEY = 'hvsh-schiri-pwa.refereeProfiles';
const id = key => document.getElementById(key);
const profileFields = ['referee','street','postalCode','city'];
const people = [1,2];
const formKeys = ['gameNumber','competition','date','time','home','away','hall','place',
  ...people.flatMap(num=>[...profileFields.map(key=>key+num),'fee'+num])];
let matchId='';let previewImage=null;let pdfObjectUrl=null;let demonstration=false;
let matchMetadata=null;
let feeMatchId='';

const showStatus=(message,type='')=>{
  const box=id('status');box.textContent=message;box.className='status '+type;
};
const getToken=()=>id('proxyToken').value.trim();
const getFormState=()=>{
  const data=Object.fromEntries(formKeys.map(key=>[key,id(key).value.trim()]));
  data.refereeCount=Number(id('refereeCount').value);
  return data;
};
const draw=()=>{
  if(!previewImage)return;
  const short=paintPreview(id('previewCanvas'),previewImage,getFormState())||[];
  id('exportButton').disabled=!matchId;
  if(short.length){ id('numberHint').textContent='Hinweis: Mindestens ein Feld ist für die PDF-Vorlage sehr lang und wird auf der Vorschau gekürzt. Bitte Angaben vor Export verkürzen.'; }
  else{id('numberHint').textContent='Die Match-ID wird nicht als HVSH-Spielnummer übernommen. Fehlende Daten können ergänzt werden.';}
};
const activate=()=>{
  for(const key of ['editorPanel','exportPanel'])id(key).classList.remove('disabled');
  id('exportButton').disabled=false;
};

function readProfiles() {
  try {
    const stored=JSON.parse(localStorage.getItem(PROFILE_KEY) || '[]');
    return Array.isArray(stored) ? stored.filter(profile=>
      typeof profile?.id==='string' && typeof profile.referee==='string') : [];
  } catch { return []; }
}

function renderProfiles(profiles) {
  const sorted=[...profiles].sort((a,b)=>a.referee.localeCompare(b.referee,'de'));
  for(const num of people) {
    const select=id('profile'+num);
    const previous=select.value;
    select.replaceChildren(new Option('Manuell eingeben / neues Profil',''),
      ...sorted.map(profile=>new Option([profile.referee,profile.city].filter(Boolean).join(' · '),profile.id)));
    select.value=sorted.some(profile=>profile.id===previous) ? previous : '';
    id('deleteProfile'+num).disabled=!select.value;
  }
}

function writeProfiles(profiles, message) {
  try {
    localStorage.setItem(PROFILE_KEY,JSON.stringify(profiles));
  } catch {
    id('profileStatus').textContent='Profile können in diesem Browser gerade nicht gespeichert werden.';
    return false;
  }
  id('profileStatus').textContent=message;
  renderProfiles(profiles);
  return true;
}

for(const num of people) {
  const select=id('profile'+num);
  select.addEventListener('change',()=>{
    const profile=readProfiles().find(item=>item.id===select.value);
    for(const key of profileFields)id(key+num).value=profile?.[key] ?? '';
    id('deleteProfile'+num).disabled=!profile;
    draw();
  });
  id('saveProfile'+num).addEventListener('click',()=>{
    const fields=Object.fromEntries(profileFields.map(key=>[key,id(key+num).value.trim()]));
    if(!fields.referee) {
      id('profileStatus').textContent='Zum Speichern bitte den Namen eingeben.';
      id('referee'+num).focus();
      return;
    }
    const profiles=readProfiles();
    const profileId=select.value || crypto.randomUUID();
    const updated=profiles.filter(profile=>profile.id!==profileId);
    updated.push({id:profileId,...fields});
    if(writeProfiles(updated,'Profil in diesem Browser gespeichert.')) {
      select.value=profileId;
      id('deleteProfile'+num).disabled=false;
    }
  });
  id('deleteProfile'+num).addEventListener('click',()=>{
    if(!select.value)return;
    writeProfiles(readProfiles().filter(profile=>profile.id!==select.value),
      'Gespeichertes Profil gelöscht. Die Angaben im Formular bleiben bis zur nächsten Auswahl erhalten.');
  });
}
renderProfiles(readProfiles());
window.addEventListener('storage',event=>{
  if(event.key===PROFILE_KEY || event.key===null)renderProfiles(readProfiles());
});

const formatFee=amount=>amount.toFixed(2).replace('.',',');
const feeSelect=id('feeRate');
for(const [key,rate] of Object.entries(feeRates)) {
  feeSelect.add(new Option(rate.label+' · '+formatFee(rate.amount)+' €',key));
}

function describeFeeRate(key) {
  const rate=feeRates[key];
  const source=id('feeSource');
  source.hidden=!rate;
  if(rate)source.href=rate.url;
  id('feeHint').textContent=!rate ? 'Bei fehlender Zuordnung bitte den Satz der zuständigen Spielleitung eintragen.'
    : rate.weekday ? 'Grundbetrag pro Person. Bei Mo–Fr außer Feiertagen ggf. '+formatFee(rate.weekday)+' € Zuschlag je Person ergänzen.'
      : 'Grundbetrag pro Person laut Durchführungsbestimmungen.';
}

function fillFees(key) {
  const rate=feeRates[key];
  for(const num of people)id('fee'+num).value=rate ? formatFee(rate.amount) : '';
  describeFeeRate(key);
}
describeFeeRate('');
feeSelect.addEventListener('change',()=>{
  if(feeSelect.value)fillFees(feeSelect.value);
  else describeFeeRate('');
  draw();
});
function startLoad() {
  matchId='';
  matchMetadata=null;
  for(const key of ['loadButton','jsonFile','exportButton','exportJsonButton'])id(key).disabled=true;
  id('pdfLink').hidden=true;
  id('sourceLink').hidden=true;
}
function finishLoad() {
  id('loadButton').disabled=false;
  id('jsonFile').disabled=false;
}
function fillFromProxy(payload,expectedId=null) {
  const source=mapHandball360Payload(payload,expectedId);
  demonstration=Boolean(payload._test_fixture);
  matchId=source.matchId;
  matchMetadata={
    match_id:source.matchId,
    match_url:source.sourceUrl,
    match:payload.match,
    additional_info:payload.additional_info,
  };
  if(demonstration)matchMetadata._test_fixture=payload._test_fixture;
  id('exportJsonButton').disabled=false;
  id('sourceLink').href=source.sourceUrl;id('sourceLink').hidden=false;
  for(const key of ['gameNumber','competition','date','time','home','away','hall','place']) id(key).value=source[key]||'';
  if(source.matchId!==feeMatchId) {
    feeMatchId=source.matchId;
    feeSelect.value=source.feeRate;
    fillFees(source.feeRate);
  }
  activate();draw();
  if(source.hasOfficialNumber){showStatus('Spieldaten für '+source.matchId+' geladen. Bitte alle Angaben vor Export prüfen.','ok');}
  else{showStatus('Spieldaten für '+source.matchId+' geladen. Die HVSH-Spielnummer konnte nicht automatisch übernommen werden und kann ergänzt werden.','ok');}
  const link=id('pdfLink');link.hidden=true;
  return source;
}
function validateMoney(value,key) {
  const str=String(value||'').trim().replace(/\s/g,'');
  if(!/^\d{1,6}([,.]\d{1,2})?$/.test(str))throw new Error(`Bitte das Einsatzgeld für Person ${key} als Betrag eingeben, z. B. 15,00.`);
  const cents=Math.round(Number(str.replace(',','.'))*100);
  if(!Number.isFinite(cents)||cents<0)throw new Error('Ungültiges Einsatzgeld.');
  return (cents/100).toFixed(2).replace('.',',');
}

id('loadForm').addEventListener('submit', async e=>{
  e.preventDefault();
  if(id('loadButton').disabled)return;
  const requested=extractMatchId(id('matchInput').value);
  if(!requested){showStatus('Bitte einen gültigen handball.net-Spiel-Link oder eine numerische Match-ID eingeben.','error');return;}
  const token=getToken();
  if(!token){id('proxyDetails').open=true;showStatus('Für den Abruf wird der vorhandene Spielanalyse-Proxy-Token benötigt. Bitte Token eintragen.','error');return;}
  startLoad();
  showStatus('Lade Spieldaten über unseren bestehenden Proxy ...','working');
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),30000);
  try {
    const resp=await fetch(PROXY+'/match/'+encodeURIComponent(requested),{
      method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:controller.signal,cache:'no-store'});
    if(!resp.ok) {
      let message='';try{const err=await resp.json();message=err.message||err.error?.message||err.error||'';}catch{}
      throw new Error('Proxy antwortet mit HTTP '+resp.status+(message?' - '+String(message).slice(0,160):''));
    }
    const json=await resp.json();
    fillFromProxy(json,requested);
    try {
      if(id('rememberToken').checked)localStorage.setItem(TOKEN_KEY,token);
      else sessionStorage.setItem(TOKEN_KEY,token);
    } catch { /* Browsers with storage disabled can still use the current token. */ }
  }catch(error) {
    if(error.name==='AbortError')showStatus('Abruf hat das Zeitlimit überschritten. Proxy und Netzwerkverbindung überprüfen.','error');
    else if(error instanceof TypeError)showStatus('Der Proxy konnte nicht erreicht werden. Mögliche Ursachen: keine Verbindung oder CORS-Freigabe für diese Website fehlt.','error');
    else showStatus(String(error.message||error),'error');
  }finally {clearTimeout(timeout);finishLoad();}
});

id('jsonFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(id('loadButton').disabled)return;
  startLoad();
  try{
    const raw=JSON.parse(await file.text());
    const expected=extractMatchId(id('matchInput').value);
    const mapped=fillFromProxy(raw,expected||null);
    if(raw._test_fixture)showStatus('FIKTIVE TESTDATEN für '+mapped.matchId+' geladen. Nicht als echte Spielabrechnung verwenden!','error');
  }catch(err){showStatus('JSON konnte nicht importiert werden: '+String(err.message||err),'error');}
  finally{e.target.value='';finishLoad();}
});

id('exportJsonButton').addEventListener('click',()=>{
  if(!matchMetadata)return;
  const blob=new Blob([JSON.stringify(matchMetadata,null,2)+'\n'],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=id('jsonDownload');
  link.href=url;
  link.download='Handball360_Spielmetadaten_'+matchMetadata.match_id+'.json';
  link.click();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
});

for(const key of formKeys)id(key).addEventListener('input',draw);
id('refereeCount').addEventListener('change',()=>{
  const two=id('refereeCount').value==='2';
  id('refereePerson2').hidden=!two;id('ref2Fee').hidden=!two;
  draw();
});

id('exportButton').addEventListener('click',async()=>{
  if(!matchId)return;
  const button=id('exportButton');button.disabled=true;
  try{
    const values=getFormState();
    values.fee1=validateMoney(values.fee1,1);
    if(values.refereeCount===2)values.fee2=validateMoney(values.fee2,2);
    if(!/^\d{2}\.\d{2}\.\d{4}$/.test(values.date) || !values.home || !values.away)throw new Error('Für den PDF-Export sind ein gültiges Datumsformat (TT.MM.JJJJ), Heim- und Gastmannschaft erforderlich.');
    values.testFixture=demonstration;
    const {blob,shortened}=await generateHVSH(values);
    if(shortened.length)throw new Error('Felder sind zu lang für die HVSH-Vorlage ('+shortened.join(', ')+'). Bitte Text im Formular kürzen.');
    if(pdfObjectUrl)URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl=URL.createObjectURL(blob);
    const link=id('pdfLink');
    link.href=pdfObjectUrl;
    link.download='HVSH_Abrechnung_'+matchId+'.pdf';
    link.hidden=false;
    showStatus('PDF für '+matchId+' erstellt. Abrechnung vor der Unterschrift prüfen.','ok');
    link.click();
  }catch(err){showStatus('PDF konnte nicht erzeugt werden: '+String(err.message||err),'error');}
  finally{button.disabled=false;}
});

try {
  const stored=sessionStorage.getItem(TOKEN_KEY)||localStorage.getItem(TOKEN_KEY);
  if(stored)id('proxyToken').value=stored;
}catch{}
loadFormImage().then(img=>{previewImage=img;draw();}).catch(err=>showStatus('Formularhintergrund nicht geladen: '+err.message,'error'));
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).catch(()=>{}));
