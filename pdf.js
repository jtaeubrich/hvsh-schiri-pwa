// Dependency-free PDF writer for the locally stored HVSH 1.3 blank form.
// The original page is rendered as a 220-dpi JPEG background, and the filled
// content is printed as vector text over the unchanged form layout.
// No game or personal data is transmitted to any PDF service.

import {NORMAL as WIDTHS_NORMAL, BOLD as WIDTHS_BOLD} from './font-metrics.js';

const W = 595.2;
const H = 841.8;
const encoder = new TextEncoder();
export const TEMPLATE_URL = './assets/hvsh-form.jpg';

const rects = {
  gameNumber: {x:51.0, y:128.1, w:98.2, h:22.0},
  competition: {x:159.5, y:128.1, w:408.1, h:22.0},
  date: {x:51.0, y:164.8, w:98.2, h:22.0},
  home: {x:159.5, y:164.8, w:143.6, h:22.0},
  away: {x:329.2, y:164.8, w:163.1, h:22.0},
  hall: {x:51.0, y:201.2, w:252.1, h:21.8},
  place: {x:329.2, y:201.2, w:163.1, h:21.8},
  referee1: {x:65.0, y:254.4, w:238.1, h:21.8},
  referee2: {x:329.2, y:254.4, w:238.4, h:21.8},
  fee1: {x:237.5, y:622.4, w:65.5, h:22.0, align:'right', bold:true},
  fee2: {x:501.5, y:622.4, w:65.5, h:22.0, align:'right', bold:true},
};


function displayed(value) { return String(value ?? '').replace(/\s+/g,' ').trim(); }
function layoutItem(key, value) {
  const rect = rects[key];
  const input = displayed(value);
  if (!rect || !input) return null;
  const bold = Boolean(rect.bold);
  let size = bold ? 11.5 : 10.0;
  let text = input;
  const max = rect.w - 9;
  const measure = t => pdfTextWidth(t,size,bold);
  while (measure(text) > max && size > 6.5) size = Math.max(6.5, size - 0.1);
  if (measure(text) > max) {
    while (text.length > 1 && measure(text + '\u2026') > max) text = text.slice(0,-1);
    text += '\u2026';
  }
  const width = measure(text);
  const x = rect.align === 'right' ? rect.x + rect.w - 5 - width : rect.x + 5;
  const baseline = rect.y + rect.h / 2 + size * .35;
  return {key, input, text, x, baseline, size, bold, shortened:text!==input};
}

export function overlayLayout(data) {
  const count = data.refereeCount === 1 ? 1 : 2;
  const fields = [
    ['gameNumber',data.gameNumber], ['competition',data.competition],
    ['date',data.date], ['home',data.home], ['away',data.away],
    ['hall',data.hall], ['place',data.place],
    ['referee1',data.referee1], ['fee1',data.fee1],
    ...(count===2 ? [['referee2',data.referee2],['fee2',data.fee2]] : []),
  ];
  return {
    testFixture:Boolean(data.testFixture),
    fields: fields.map(([key,value]) => layoutItem(key,value)).filter(Boolean),
    // Mark the single Schiedsrichter role checkbox in the official form.
    cross: [[53.6,107.5,62.0,117.7],[62.0,107.5,53.6,117.7]],
  };
}

export async function loadFormImage() {
  const image = new Image();
  image.src = TEMPLATE_URL;
  await image.decode();
  return image;
}

export function paintPreview(canvas, image, data) {
  if (!canvas || !image) return;
  const ctx = canvas.getContext('2d');
  canvas.width = 1190;
  canvas.height = 1684;
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
  ctx.drawImage(image,0,0,W,H);
  const overlay = overlayLayout(data);
  ctx.fillStyle = '#000';
  for (const item of overlay.fields) {
    ctx.font = `${item.bold?'bold ':''}${item.size}px Arial, Helvetica, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(item.text,item.x,item.baseline);
  }
  if (overlay.testFixture) {
    ctx.save();ctx.translate(290,440);ctx.rotate(-Math.PI/4);ctx.fillStyle='rgba(100,100,100,.18)';ctx.font='bold 52px Helvetica,Arial,sans-serif';ctx.textAlign='center';ctx.fillText('TESTDATEN',0,0);ctx.restore();
  }
  ctx.strokeStyle = '#000'; ctx.lineWidth=1.2;
  for (const [x1,y1,x2,y2] of overlay.cross) { ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke(); }
  return overlay.fields.filter(item=>item.shortened).map(item=>item.key);
}

const extraWinAnsi = { '€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,
  'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,
  '“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,
  'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
function winAnsiByte(ch) {
  const point=ch.codePointAt(0);
  return point>255 ? (extraWinAnsi[ch]??63) : point;
}
function pdfTextWidth(text,size,bold=false) {
  const widths=bold?WIDTHS_BOLD:WIDTHS_NORMAL;
  let sum=0;
  for (const ch of String(text)) {
    const byte=winAnsiByte(ch);
    sum+=widths[(byte>=32&&byte<=255?byte:63)-32] || 556;
  }
  return sum*size/1000;
}
function pdfLiteral(value) {
  let out='';
  for(const ch of String(value)) {
    let byte=winAnsiByte(ch);
    if(byte===40 || byte===41 || byte===92) out+='\\'+String.fromCharCode(byte);
    else if(byte<32 || byte>126) out+='\\'+byte.toString(8).padStart(3,'0');
    else out+=String.fromCharCode(byte);
  }
  return out;
}

function contentStream(overlay) {
  const cmds = [`q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`];
  for(const item of overlay.fields) {
    const font = item.bold?'/F2':'/F1';
    cmds.push(`BT ${font} ${item.size.toFixed(2)} Tf 0 g 1 0 0 1 ${item.x.toFixed(2)} ${(H-item.baseline).toFixed(2)} Tm (${pdfLiteral(item.text)}) Tj ET`);
  }
  if (overlay.testFixture) {
    cmds.push('q 0.88 g BT /F2 52 Tf 0.7071 0.7071 -0.7071 0.7071 153 305 Tm (TESTDATEN) Tj ET Q');
  }
  cmds.push('0 G 1.1 w');
  for(const [x1,y1,x2,y2] of overlay.cross)
    cmds.push(`${x1} ${(H-y1).toFixed(2)} m ${x2} ${(H-y2).toFixed(2)} l S`);
  return encoder.encode(cmds.join('\n')+'\n');
}

function createPdfBytes(jpeg, width, height, overlay) {
  const img = new Uint8Array(jpeg), drawing=contentStream(overlay);
  const parts=[];let offset=0;const objOffsets=[0];
  const putBytes=b=>{parts.push(b);offset+=b.length;};
  const put=s=>putBytes(encoder.encode(s));
  const begin=n=>{objOffsets[n]=offset;put(`${n} 0 obj\n`);};
  const end=()=>put('\nendobj\n');
  put('%PDF-1.4\n%\xA3\xA3\xA3\xA3\n');
  begin(1);put('<< /Type /Catalog /Pages 2 0 R >>');end();
  begin(2);put('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');end();
  begin(3);put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /ProcSet [/PDF /Text /ImageC] /Font << /F1 5 0 R /F2 6 0 R >> /XObject << /Im0 4 0 R >> >> /Contents 7 0 R >>`);end();
  begin(4);put(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /BitsPerComponent 8 /ColorSpace /DeviceRGB /Filter /DCTDecode /Length ${img.length} >>\nstream\n`);putBytes(img);put('\nendstream');end();
  begin(5);put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');end();
  begin(6);put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');end();
  begin(7);put(`<< /Length ${drawing.length} >>\nstream\n`);putBytes(drawing);put('endstream');end();
  const xref=offset;
  put('xref\n0 8\n0000000000 65535 f \n');
  for(let i=1;i<=7;i++) put(`${String(objOffsets[i]).padStart(10,'0')} 00000 n \n`);
  put(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out=new Uint8Array(offset);let at=0;
  for(const chunk of parts){out.set(chunk,at);at+=chunk.length;}
  return out;
}

export async function generateHVSH(data) {
  const response=await fetch(TEMPLATE_URL, {cache:'force-cache'});
  if(!response.ok)throw new Error('HVSH-Formularhintergrund konnte nicht geladen werden.');
  const jpeg=await response.arrayBuffer();
  const overlay=overlayLayout(data);
  const bytes=createPdfBytes(jpeg,1819,2573,overlay);
  return {blob:new Blob([bytes],{type:'application/pdf'}),shortened:overlay.fields.filter(x=>x.shortened).map(x=>x.key)};
}
