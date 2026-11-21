// Lightweight Handball360 match mapping for the existing Spielanalyse proxy.
// Do not infer an official HVSH Spielnummer from the handball.net match ID.

export function extractMatchId(input) {
  const value = String(input ?? '').trim();
  if (/^\d{4,12}$/.test(value)) return value;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || !['www.handball.net', 'handball.net'].includes(u.hostname)) return null;
    return /^\/match\/(\d{4,12})\/?$/.exec(u.pathname)?.[1] ?? null;
  } catch { return null; }
}

const firstText = (...values) => values.find(v => (typeof v === 'string' || typeof v === 'number') && String(v).trim())?.toString().trim() || '';
const label = value => typeof value === 'string' ? value.trim() : firstText(value?.name, value?.title, value?.designation);

const HVSH_RULES='https://www.hvsh.de/fileadmin/user_upload/Dateien/Spielbetrieb/Saison_26_27/260709_-_DFB_HVSH.pdf#page=22';
const HRN_RULES='https://www.hvsh.de/fileadmin/user_upload/Dateien/Spielbetrieb/Saison_26_27/260703_-_DFB_HRN_-_Regionalligen_Nord.pdf#page=8';
const KHV_RULES='https://khv-dithmarschen.de/fileadmin/user_upload/260807_-_DuFueBest_Gemeinsamer_Spielbetrieb_JoGSH_und_Senioren_-_Spielserie_2026-27_V2.pdf#page=10';

export const feeRates = {
  hvshOberliga: {label:'HVSH Oberliga Erwachsene', amount:45, weekday:10, url:HVSH_RULES},
  hvshVerbandsliga: {label:'HVSH Verbandsliga Erwachsene', amount:40, weekday:10, url:HVSH_RULES},
  hvshYouth: {label:'HVSH Oberliga Jugend', amount:35, weekday:5, url:HVSH_RULES},
  hvshCup: {label:'HVSH Pokal Erwachsene (vor dem Finalspieltag)', amount:40, weekday:10, url:HVSH_RULES},
  hrnMen: {label:'Regionalliga Nord Männer', amount:80, weekday:10, url:HRN_RULES},
  hrnWomen: {label:'Regionalliga Nord Frauen', amount:70, weekday:10, url:HRN_RULES},
  hrnYouth: {label:'Regionalliga Nord Jugend', amount:60, weekday:5, url:HRN_RULES},
  khvAdults: {label:'KHV Schleswig-Holstein Kreisoberliga / Kreisliga Erwachsene', amount:30, url:KHV_RULES},
};

export function suggestFeeRate(competition, organizer, isoDate) {
  const seasonDate=String(isoDate ?? '').slice(0,10);
  if(!localDateFromISO(isoDate).date || seasonDate<'2026-07-01' || seasonDate>='2027-07-01')return '';
  const name=competition.toLowerCase().replace(/[\u2010-\u2015]/g,'-');
  if(/pokal|turnier|qualifikation|freundschaft|relegation|entscheidung|ausscheidung/.test(name))return '';
  const youth=/jugend|\b[wm]j[a-d]\b/.test(name);
  const adults=/männer|frauen|senioren|erwachsene/.test(name);
  if(/\bregionalliga nord\b/.test(name)) {
    if(youth)return /\bd[- ]?jugend\b|jugend\s*d\b|\b[wm]jd\b/.test(name) ? '' : 'hrnYouth';
    if(/\bmänner\b/.test(name))return 'hrnMen';
    if(/\bfrauen\b/.test(name))return 'hrnWomen';
  }
  if(!/schleswig[ -]holstein|\bhvsh\b/i.test(name+' '+organizer))return '';
  if(/\boberliga\b/.test(name))return youth ? 'hvshYouth' : adults ? 'hvshOberliga' : '';
  if(/\bverbandsliga\b/.test(name) && adults && !youth)return 'hvshVerbandsliga';
  if(/\bkreis(?:ober)?liga\b/.test(name) && adults && !youth)return 'khvAdults';
  return '';
}

export function localDateFromISO(value) {
  // Handball360 date is already the published local wall clock in the source.
  // Do not apply timezone conversion to its literal date and time.
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(value || ''));
  if (!m) return {date: '', time: ''};
  const [ , yyyy, mm, dd, hh, mi] = m;
  const date = new Date(Date.UTC(+yyyy, +mm-1, +dd, 12));
  if (date.toISOString().slice(0, 10) !== `${yyyy}-${mm}-${dd}`) return {date: '', time: ''};
  if (hh !== undefined && (+hh > 23 || +mi > 59)) return {date: '', time: ''};
  return {date: `${dd}.${mm}.${yyyy}`, time: hh === undefined ? '' : `${hh}:${mi}`};
}

export function mapHandball360Payload(payload, expectedId = null) {
  const meta = Array.isArray(payload?.match?.data) ? payload.match.data[0]
    : Array.isArray(payload?.match) ? payload.match[0]
    : payload?.match?.data && !Array.isArray(payload.match.data) ? payload.match.data
    : null;
  if (!meta || typeof meta !== 'object') throw new Error('Keine Match-Metadaten in der Antwort gefunden. Erwartet wird das JSON unseres Handball360-Proxys.');
  const id = firstText(payload?.match_id, meta?.id);
  if (!/^\d{4,12}$/.test(id)) throw new Error('Ungültige Match-ID in der Antwort.');
  if (expectedId && String(expectedId) !== id) throw new Error(`Die Antwort gehört zu Spiel ${id}, erwartet war ${expectedId}.`);
  if (meta.id != null && String(meta.id) !== id) throw new Error('Die Match-ID in der Antwort ist inkonsistent.');
  const phase = meta.phase || {};
  const competitionInfo = phase.competition || meta.competition;
  const competition = firstText(label(phase.competition), label(meta.competition));
  const group = firstText(phase.name, phase.group?.name, meta.group?.name);
  const competitionLabel = [competition, group && group !== competition ? group : ''].filter(Boolean).join(' / ');
  const organizer = firstText(label(competitionInfo?.federation), label(meta.federation), label(phase.federation));
  const hall = meta.field || meta.venue || meta.hall || meta.sports_hall || meta.sportsHall || meta.installation || {};
  const extra = (Array.isArray(payload.additional_info?.data) ? payload.additional_info.data[0] : payload.additional_info?.data) || {};
  const installation = hall.installation || meta.installation || extra.installation || extra.field?.installation || {};
  const date = localDateFromISO(meta.date);
  // Handball360 returns the Spielnummer in code and the URL's Match-ID in id.
  const code = firstText(meta.code);
  let gameNumber = firstText(code === id ? '' : code,
    meta.match_number, meta.matchNumber, meta.game_number, meta.gameNumber,
    meta.official_match_number, meta.officialNumber, meta.spielnummer);
  if (gameNumber === id) gameNumber = '';
  return {
    matchId: id,
    sourceUrl: `https://www.handball.net/match/${id}`,
    gameNumber,
    competition: competitionLabel,
    feeRate: suggestFeeRate(competitionLabel,organizer,meta.date),
    date: date.date,
    time: date.time,
    home: firstText(meta.local?.name),
    away: firstText(meta.visitor?.name, meta.away?.name),
    hall: firstText(label(hall), label(extra.venue), label(extra.hall)),
    place: firstText(hall.city, hall.place, installation.city, installation.town,
      meta.venue?.city, meta.location?.city, extra.city, extra.location?.city),
    hasOfficialNumber: Boolean(gameNumber),
  };
}
