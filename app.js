import {extractMatchId, mapHandball360Payload} from './match.js';
import {loadFormImage, paintPreview, generateHVSH} from './pdf.js';

// Existing deployed endpoint used by the Spielanalyse PWA.
// Fixed destination prevents accidentally transmitting the token to arbitrary hosts.
const PROXY = 'https://handball360-proxy-235703972531.europe-west1.run.app';
const TOKEN_KEY = 'handballSpielanalyse.proxyToken';
const id = key => document.getElementById(key);
const formKeys = ['gameNumber','competition','date','time','home','away','hall','place','referee1','referee2','fee1','fee2'];
let matchId='';let previewImage=null;let pdfObjectUrl=null;let demonstration=false;

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
  for(const key of ['editorPanel','refereePanel','exportPanel'])id(key).classList.remove('disabled');
  id('exportButton').disabled=false;
};
function fillFromProxy(payload,expectedId=null) {
  const source=mapHandball360Payload(payload,expectedId);
  demonstration=Boolean(payload._test_fixture);
  matchId=source.matchId;
  id('sourceLink').href=source.sourceUrl;id('sourceLink').hidden=false;
  for(const key of ['gameNumber','competition','date','time','home','away','hall','place']) id(key).value=source[key]||'';
  activate();draw();
  if(source.hasOfficialNumber){showStatus('Spieldaten für '+source.matchId+' geladen. Bitte alle Angaben vor Export prüfen.','ok');}
  else{showStatus('Spieldaten für '+source.matchId+' geladen. Die HVSH-Spielnummer fehlt in der Antwort und bleibt zur manuellen Ergänzung frei.','ok');}
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
  const requested=extractMatchId(id('matchInput').value);
  if(!requested){showStatus('Bitte einen gültigen handball.net-Spiel-Link oder eine numerische Match-ID eingeben.','error');return;}
  const token=getToken();
  if(!token){id('proxyDetails').open=true;showStatus('Für den Abruf wird der vorhandene Spielanalyse-Proxy-Token benötigt. Bitte Token eintragen.','error');return;}
  id('loadButton').disabled=true;
  matchId='';id('exportButton').disabled=true;id('pdfLink').hidden=true;id('sourceLink').hidden=true;
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
  }finally {clearTimeout(timeout);id('loadButton').disabled=false;}
});

id('jsonFile').addEventListener('change',async e=>{
  const file=e.target.files?.[0];if(!file)return;
  try{
    matchId='';id('exportButton').disabled=true;id('pdfLink').hidden=true;id('sourceLink').hidden=true;
    const raw=JSON.parse(await file.text());
    const expected=extractMatchId(id('matchInput').value);
    const mapped=fillFromProxy(raw,expected||null);
    if(raw._test_fixture)showStatus('FIKTIVE TESTDATEN für '+mapped.matchId+' geladen. Nicht als echte Spielabrechnung verwenden!','error');
  }catch(err){showStatus('JSON konnte nicht importiert werden: '+String(err.message||err),'error');}
  e.target.value='';
});

for(const key of formKeys)id(key).addEventListener('input',draw);
id('refereeCount').addEventListener('change',()=>{
  const two=id('refereeCount').value==='2';
  id('ref2Name').hidden=!two;id('ref2Fee').hidden=!two;
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
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
