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
  const competition = firstText(phase.competition?.name, meta.competition?.name, meta.competition);
  const group = firstText(phase.name, phase.group?.name, meta.group?.name);
  const hall = meta.field || meta.venue || meta.hall || meta.sports_hall || meta.sportsHall || meta.installation || {};
  const extra = (Array.isArray(payload.additional_info?.data) ? payload.additional_info.data[0] : payload.additional_info?.data) || {};
  const installation = hall.installation || meta.installation || extra.installation || extra.field?.installation || {};
  const date = localDateFromISO(meta.date);
  // Identifiers named 'number' can differ between Handball360 versions.
  // Leave this editable and blank unless a dedicated number field is present.
  let gameNumber = firstText(meta.match_number, meta.matchNumber, meta.game_number, meta.gameNumber,
    meta.official_match_number, meta.officialNumber, meta.spielnummer);
  if (gameNumber === id) gameNumber = '';
  return {
    matchId: id,
    sourceUrl: `https://www.handball.net/match/${id}`,
    gameNumber,
    competition: [competition, group && group !== competition ? group : ''].filter(Boolean).join(' / '),
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
