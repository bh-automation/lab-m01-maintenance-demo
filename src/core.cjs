// Kernlogik V3.2 – Quelle code/kernlogik.js (nur Kommentare entfernt). Nicht von Hand ändern.
const KONFIG = {
  maschinen_id: 'LAB-M01',
  mail_aktiv: true,                 // false = keine Mail-Aktion (Testschalter, Kriterium 25)
  we_zwei_bestaetigungen: true,     // ENTSCHEIDUNG D1 – DEMO-freigegeben 13.10.2026
  lieferschein_muster: /^DEMO-LS-\d{4}$/,
  foto_mime_erlaubt: ['image/jpeg', 'image/png'],
  max_menge_je_vorgang: 99,         // ENTSCHEIDUNG H1 – DEMO-freigegeben 13.10.2026, Plausibilitätsgrenze je Vorgang
  dublettenfenster_sekunden: 120,   // ENTSCHEIDUNG G1 – DEMO-freigegeben 13.10.2026, Zeitfenster Dublettenverdacht
  foto_modus: 'TEMP',               // ENTSCHEIDUNG C=F-A – DEMO-freigegeben 13.10.2026, nur temporär; 'DRIVE' (F-B) nicht freigegeben
  max_mailversuche: 2,              // ENTSCHEIDUNG I1 – DEMO-freigegeben 13.10.2026, Erstversand + höchstens 1 Nachsendung
};
const OEL_TEXT = {
  gebinde: 'Ich habe die Bezeichnung des verwendeten Schmierstoffs mit der angezeigten Zuordnung abgeglichen.',
  einfuellstelle: 'Ich habe den Schmierstoff an der ausgewiesenen richtigen Einfüllstelle eingefüllt.',
  wiederbetrieb: 'Die Maschine ist wieder in Betrieb.',
};
const WE_TEXT = {
  ware: 'Ware und DEMO-Lieferschein wurden geprüft (simuliert).',
  buchung: 'Ich bestätige diese Zugangsbuchung als DEMO-Meisterrolle.',
};
const WIEDERHOLUNG_TEXT = 'Ich bestätige: Dies ist eine weitere, tatsächlich erfolgte Entnahme.';
function kurzHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').toUpperCase();
}
function erzeugeId(prefix, submittedAt, teile) {
  return prefix + '-' + kurzHash([submittedAt].concat(teile).map(String).join('|'));
}
function pruefeMenge(roh, maxMenge) {
  const max = maxMenge === undefined ? KONFIG.max_menge_je_vorgang : maxMenge;
  if (roh === null || roh === undefined || typeof roh === 'boolean') return { ok: false, fehler: 'Menge fehlt' };
  let n;
  if (typeof roh === 'number') {
    n = roh;
  } else {
    const s = String(roh).trim();
    if (s === '') return { ok: false, fehler: 'Menge fehlt' };
    if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, fehler: 'Menge ist keine Zahl' };
    n = Number(s);
  }
  if (!Number.isFinite(n)) return { ok: false, fehler: 'Menge ist keine Zahl' };
  if (!Number.isInteger(n)) return { ok: false, fehler: 'Menge muss eine ganze Zahl sein' };
  if (n <= 0) return { ok: false, fehler: 'Menge muss größer als 0 sein' };
  if (!Number.isSafeInteger(n)) return { ok: false, fehler: 'Menge außerhalb des zulässigen Zahlenbereichs' };
  if (n > max) return { ok: false, fehler: 'Menge über der Plausibilitätsgrenze von ' + max + ' Stück je Vorgang – bitte prüfen' };
  return { ok: true, wert: n };
}
function pruefeKuerzel(k) {
  return typeof k === 'string' && k.trim().length > 0;
}
function istBestaetigt(wert, text) {
  if (Array.isArray(wert)) return wert.includes(text);
  return wert === true;
}
function gleicherArtikel(zeile, artikel) {
  return zeile.maschinen_id === artikel.maschinen_id && zeile.artikel_id === artikel.artikel_id;
}
function findeArtikel(stamm, maschinen_id, artikel_id) {
  return stamm.find(a => a.maschinen_id === maschinen_id && a.artikel_id === artikel_id) || null;
}
function istGebucht(zeile) {
  return String(zeile.pruefstatus || '').startsWith('GEBUCHT');
}
function buchbestand(artikel, journal) {
  return journal
    .filter(z => gleicherArtikel(z, artikel) && istGebucht(z))
    .reduce((summe, z) => summe + Number(z.delta), Number(artikel.startbestand));
}
function letzteWarnung(warnungen, artikel) {
  const eigene = warnungen.filter(w => gleicherArtikel(w, artikel));
  return eigene.length ? eigene[eigene.length - 1] : null;
}
function warnungOffen(warnungen, artikel) {
  const l = letzteWarnung(warnungen, artikel);
  return !!l && l.status === 'OFFEN';
}
function pruefschluessel(artikel_id, menge, kuerzel, foto) {
  return 'P-' + kurzHash([artikel_id, menge, String(kuerzel).trim().toUpperCase(), foto.name, foto.groesse || ''].join('|'));
}
function findeDublette(journal, schluessel, jetzt, fensterSek) {
  const t = Date.parse(jetzt);
  const treffer = journal.filter(z => istGebucht(z) && z.art === 'ENTNAHME' && z.pruefschluessel === schluessel);
  for (let i = treffer.length - 1; i >= 0; i--) {
    const tz = Date.parse(treffer[i].zeitpunkt);
    if (!Number.isFinite(t) || !Number.isFinite(tz)) return { zeile: treffer[i], sekunden: null };
    const diff = (t - tz) / 1000;
    if (diff <= fensterSek) return { zeile: treffer[i], sekunden: Math.round(diff) }; // negative Differenz = Zukunft = Verdacht
  }
  return null;
}
function abgewiesen(fehler, zusatz) {
  return Object.assign({ status: 'ABGEWIESEN', fehler, journal: null, warnung: null, mail: null, warnaktion: 'KEINE' }, zusatz || {});
}
function fotoNachweis(f, modus) {
  if (modus === 'DRIVE') return 'DRIVE-LINK FEHLT';   // muss vor dem Anfügen ersetzt werden (setzeDriveNachweis)
  return 'TEMP: ' + f.name + ' (' + f.mime + (f.groesse ? ', ' + f.groesse : '') +
    ') – nur im n8n-Ausführungsprotokoll (Variante F-A), keine Dauerablage';
}
function setzeDriveNachweis(zeile, link) {
  if (!zeile) return { ok: false, fehler: 'Keine Journalzeile vorhanden' };
  if (typeof link !== 'string' || !/^https:\/\/\S+$/.test(link.trim())) {
    return { ok: false, fehler: 'Foto wurde nicht dauerhaft gespeichert – nichts gebucht' };
  }
  return { ok: true, zeile: Object.assign({}, zeile, { fotonachweis: 'DRIVE: ' + link.trim() }) };
}
function baueWarnMail(a, bestand, vorgang_id, nachsendung) {
  const zeilen = [
    nachsendung ? 'NACHSENDUNG – die erste Warnmail zu diesem Warnereignis ist fehlgeschlagen.' : null,
    'DEMO-Nachbestellwarnung (Übungsdaten, keine automatische Bestellung)',
    'Maschine: ' + a.maschinen_id,
    'Artikel: ' + a.artikel_id + ' – ' + a.bezeichnung_demo,
    'Buchbestand (errechnet, nicht gezählt): ' + bestand + ' ' + a.einheit,
    'Meldebestand: ' + a.meldebestand + ' | Sicherheitsbestand: ' + a.sicherheitsbestand,
    bestand < Number(a.sicherheitsbestand) ? 'Achtung: Sicherheitsbestand unterschritten.' : null,
    'DEMO-Beschaffungslink: ' + a.beschaffungslink_demo,
    'Auslösender Vorgang: ' + vorgang_id,
  ].filter(Boolean);
  return {
    betreff: '[DEMO] ' + (nachsendung ? 'NACHSENDUNG: ' : '') + 'Meldebestand erreicht – ' + a.artikel_id + ' (' + a.maschinen_id + ')',
    text: zeilen.join('\n'),
  };
}
function baueOelMail(stelle, m) {
  return {
    betreff: '[DEMO] Schmierstoffrückmeldung ' + m.maschinen_id + ' – ' + stelle.einfuellstelle_label,
    text: [
      'DEMO-Schmierstoffrückmeldung (Übungsdaten)',
      'Maschine: ' + m.maschinen_id,
      'Einfüllstelle: ' + stelle.einfuellstelle_id + ' – ' + stelle.einfuellstelle_label,
      'Schmierstoff laut DEMO-Stammdaten: ' + m.schmierstoff_id_demo + ' – ' + m.schmierstoff_vollbezeichnung_demo,
      'Mitarbeiter bestätigt: Gebindeetikett mit der angezeigten Zuordnung abgeglichen.',
      'Mitarbeiter bestätigt: Nachfüllung an der ausgewiesenen Einfüllstelle.',
      'Mitarbeiter bestätigt Wiederinbetriebnahme.',
      'Kürzel: ' + m.kuerzel,
      'Erfasst: ' + m.zeitpunkt,
      'Meldungs-ID: ' + m.meldung_id,
      'Hinweis: Angaben des Mitarbeiters; keine technische Prüfung und keine Produktionsfreigabe durch die Software.',
    ].join('\n'),
  };
}
function originalEntnahme(e, ctx) {
  const k = Object.assign({}, KONFIG, ctx.konfig || {});
  const fehler = [];
  if (e.maschinen_id !== k.maschinen_id) fehler.push('Unbekannte Maschinenkennung');
  const artikel = findeArtikel(ctx.stamm, k.maschinen_id, e.artikel_id);
  if (!artikel) fehler.push('Unbekannte Artikel-ID');
  const m = pruefeMenge(e.menge, k.max_menge_je_vorgang);
  if (!m.ok) fehler.push(m.fehler);
  if (!pruefeKuerzel(e.kuerzel)) fehler.push('Mitarbeiterkürzel fehlt');
  const f = e.foto;
  if (!f || !f.name || !f.mime) fehler.push('Dokumentationsfoto fehlt');
  else if (!k.foto_mime_erlaubt.includes(f.mime)) fehler.push('Foto muss JPG oder PNG sein');
  if (fehler.length) return abgewiesen(fehler, { abschluss: 'Nicht gebucht: ' + fehler.join('; ') + '. Bitte Eingabe korrigieren.' });
  const kuerzel = e.kuerzel.trim();
  const vorgang_id = erzeugeId('ENT', e.submittedAt, [k.maschinen_id, artikel.artikel_id, m.wert, kuerzel, f.name]);
  if (ctx.journal.some(z => z.vorgang_id === vorgang_id)) {
    return {
      status: 'DUPLIKAT', vorgang_id, fehler: ['Vorgang bereits verarbeitet – keine zweite Buchung'],
      journal: null, warnung: null, mail: null, warnaktion: 'KEINE',
      abschluss: 'Diese Sendung wurde bereits verarbeitet – keine zweite Buchung.',
    };
  }
  const vorher = buchbestand(artikel, ctx.journal);
  const schluessel = pruefschluessel(artikel.artikel_id, m.wert, kuerzel, f);
  const basis = {
    vorgang_id, zeitpunkt: ctx.zeitpunkt, maschinen_id: k.maschinen_id, artikel_id: artikel.artikel_id,
    art: 'ENTNAHME', menge: m.wert, kuerzel, lieferschein_demo: '', fotonachweis: fotoNachweis(f, k.foto_modus),
    pruefschluessel: schluessel, dublettenpruefung: 'OK',
  };
  const dublette = findeDublette(ctx.journal, schluessel, ctx.zeitpunkt, k.dublettenfenster_sekunden);
  if (dublette) {
    if (!istBestaetigt(e.wiederholung_bestaetigt, WIEDERHOLUNG_TEXT)) {
      const abstand = dublette.sekunden === null || dublette.sekunden < 0 ? 'kurz zuvor' : 'vor ' + dublette.sekunden + ' s';
      return {
        status: 'DUPLIKATVERDACHT', vorgang_id,
        fehler: ['Gleiche Entnahme ' + abstand + ' bereits gebucht (' + dublette.zeile.vorgang_id + ')'],
        journal: Object.assign({}, basis, {
          delta: 0, buchbestand_vorher: vorher, buchbestand_nachher: vorher,
          pruefstatus: 'NICHT_GEBUCHT_DUPLIKATVERDACHT', dublettenpruefung: 'VERDACHT:' + dublette.zeile.vorgang_id,
        }),
        warnung: null, mail: null, warnaktion: 'KEINE',
        abschluss: 'Nicht gebucht: Die gleiche Entnahme (' + artikel.artikel_id + ', ' + m.wert + ' Stück, gleiches Foto) wurde ' +
          abstand + ' bereits gebucht. Ist es wirklich eine weitere Entnahme, Formular neu ausfüllen und ' +
          '„Wiederholung bestätigen“ ankreuzen.',
      };
    }
    basis.dublettenpruefung = 'WIEDERHOLUNG_BESTAETIGT:' + dublette.zeile.vorgang_id;
  }
  if (m.wert > vorher) {
    return {
      status: 'BESTANDSDIFFERENZ', vorgang_id,
      fehler: ['Entnahme ' + m.wert + ' größer als Buchbestand ' + vorher + ': nicht gebucht, Bestandsdifferenz klären'],
      journal: Object.assign({}, basis, { delta: 0, buchbestand_vorher: vorher, buchbestand_nachher: vorher, pruefstatus: 'NICHT_GEBUCHT_BESTANDSDIFFERENZ' }),
      warnung: null, mail: null, warnaktion: 'KEINE',
      abschluss: 'Nicht gebucht: Menge größer als Buchbestand (' + vorher + '). Die Differenz ist protokolliert, der Meister klärt.',
    };
  }
  const nachher = vorher - m.wert;
  const unterSicherheit = nachher < Number(artikel.sicherheitsbestand);
  const journal = Object.assign({}, basis, {
    delta: -m.wert, buchbestand_vorher: vorher, buchbestand_nachher: nachher,
    pruefstatus: unterSicherheit ? 'GEBUCHT_UNTER_SICHERHEITSBESTAND' : 'GEBUCHT',
  });
  let warnung = null;
  let mail = null;
  let nachsendung = null;
  let warnaktion = 'KEINE';
  let mailversuch = 0;
  const letzte = letzteWarnung(ctx.warnungen, artikel);
  const offen = !!letzte && letzte.status === 'OFFEN';
  const bisherigeVersuche = letzte ? Number(letzte.email_versuche || 1) : 0;
  if (nachher <= Number(artikel.meldebestand) && !offen) {
    warnung = {
      warnung_id: 'WRN-' + vorgang_id.slice(4), zeitpunkt: ctx.zeitpunkt, maschinen_id: k.maschinen_id,
      artikel_id: artikel.artikel_id, buchbestand: nachher, meldebestand: Number(artikel.meldebestand),
      status: 'OFFEN', email_status: k.mail_aktiv ? 'AUSSTEHEND' : 'DEAKTIVIERT', email_versuche: k.mail_aktiv ? 1 : 0, vorgang_id,
    };
    if (k.mail_aktiv) { mail = baueWarnMail(artikel, nachher, vorgang_id, false); mailversuch = 1; }
    warnaktion = k.mail_aktiv ? 'NEU_MIT_MAIL' : 'NEU_OHNE_MAIL';
  } else if (offen && k.mail_aktiv && letzte.email_status === 'FEHLER' && bisherigeVersuche < k.max_mailversuche) {
    mailversuch = bisherigeVersuche + 1;
    nachsendung = { warnung_id: letzte.warnung_id, versuch: mailversuch };
    mail = baueWarnMail(artikel, nachher, vorgang_id, true);
    warnaktion = 'NACHSENDEN';
  }
  const hinweise = [];
  if (unterSicherheit) hinweise.push('Achtung: Sicherheitsbestand unterschritten.');
  if (warnaktion === 'NEU_MIT_MAIL') hinweise.push('Meldebestand erreicht – Warnmail an Gmail übergeben.');
  if (warnaktion === 'NEU_OHNE_MAIL') hinweise.push('Meldebestand erreicht – Warnung protokolliert (Mailversand deaktiviert).');
  if (warnaktion === 'NACHSENDEN') hinweise.push('Frühere Warnmail war fehlgeschlagen – Nachsendung an Gmail übergeben.');
  if (warnaktion === 'KEINE' && offen && (letzte.email_status === 'FEHLER' || letzte.email_status === 'AUSSTEHEND')) {
    hinweise.push('Warnmail zu diesem Artikel ist nicht bestätigt zugestellt – bitte Meister informieren.');
  }
  if (basis.dublettenpruefung.startsWith('WIEDERHOLUNG_BESTAETIGT')) hinweise.push('Als bewusste Wiederholung gebucht.');
  return {
    status: 'GEBUCHT', vorgang_id, fehler: [], journal, warnung, mail, nachsendung, warnaktion, mailversuch,
    hinweis: unterSicherheit ? 'Sicherheitsbestand unterschritten – kritisch' : '',
    abschluss: ['Entnahme gebucht. Buchbestand neu: ' + nachher + '.'].concat(hinweise).join(' '),
  };
}
function originalZugang(e, ctx) {
  const k = Object.assign({}, KONFIG, ctx.konfig || {});
  const fehler = [];
  if (e.maschinen_id !== k.maschinen_id) fehler.push('Unbekannte Maschinenkennung');
  const artikel = findeArtikel(ctx.stamm, k.maschinen_id, e.artikel_id);
  if (!artikel) fehler.push('Unbekannte Artikel-ID');
  const m = pruefeMenge(e.menge, k.max_menge_je_vorgang);
  if (!m.ok) fehler.push(m.fehler);
  if (!pruefeKuerzel(e.kuerzel)) fehler.push('Meisterkürzel fehlt');
  const ls = typeof e.lieferschein_demo === 'string' ? e.lieferschein_demo.trim() : '';
  if (!ls) fehler.push('DEMO-Lieferscheinnummer fehlt');
  else if (!k.lieferschein_muster.test(ls)) fehler.push('Lieferscheinnummer muss dem DEMO-Format DEMO-LS-0000 entsprechen');
  if (k.we_zwei_bestaetigungen && !istBestaetigt(e.ware_geprueft, WE_TEXT.ware)) fehler.push('Warenprüfung nicht bestätigt');
  if (!istBestaetigt(e.buchung_bestaetigt, WE_TEXT.buchung)) fehler.push('Buchung nicht durch Meisterrolle bestätigt');
  if (fehler.length) return abgewiesen(fehler, { abschluss: 'Nicht gebucht: ' + fehler.join('; ') + '. Bitte Eingabe korrigieren.' });
  const kuerzel = e.kuerzel.trim();
  const vorgang_id = erzeugeId('ZUG', e.submittedAt, [k.maschinen_id, artikel.artikel_id, m.wert, ls, kuerzel]);
  if (ctx.journal.some(z => z.vorgang_id === vorgang_id)) {
    return {
      status: 'DUPLIKAT', vorgang_id, fehler: ['Vorgang bereits verarbeitet – keine zweite Buchung'],
      journal: null, warnung: null, mail: null, warnaktion: 'KEINE',
      abschluss: 'Diese Sendung wurde bereits verarbeitet – keine zweite Buchung.',
    };
  }
  const vorher = buchbestand(artikel, ctx.journal);
  const basis = {
    vorgang_id, zeitpunkt: ctx.zeitpunkt, maschinen_id: k.maschinen_id, artikel_id: artikel.artikel_id,
    art: 'ZUGANG', menge: m.wert, kuerzel, lieferschein_demo: ls, fotonachweis: '',
    pruefschluessel: '', dublettenpruefung: 'LIEFERSCHEIN',
  };
  const lsDoppelt = ctx.journal.some(z => z.art === 'ZUGANG' && istGebucht(z) && z.lieferschein_demo === ls && gleicherArtikel(z, artikel));
  if (lsDoppelt) {
    return {
      status: 'LIEFERSCHEIN_DOPPELT', vorgang_id,
      fehler: ['Lieferschein ' + ls + ' für ' + artikel.artikel_id + ' bereits gebucht – nicht gebucht, prüfen'],
      journal: Object.assign({}, basis, { delta: 0, buchbestand_vorher: vorher, buchbestand_nachher: vorher, pruefstatus: 'NICHT_GEBUCHT_LIEFERSCHEIN_DOPPELT' }),
      warnung: null, mail: null, warnaktion: 'KEINE',
      abschluss: 'Nicht gebucht: Lieferschein ' + ls + ' für ' + artikel.artikel_id + ' ist bereits gebucht. Bitte prüfen.',
    };
  }
  const nachher = vorher + m.wert;
  const journal = Object.assign({}, basis, { delta: m.wert, buchbestand_vorher: vorher, buchbestand_nachher: nachher, pruefstatus: 'GEBUCHT' });
  let warnung = null;
  if (warnungOffen(ctx.warnungen, artikel) && nachher > Number(artikel.meldebestand)) {
    warnung = {
      warnung_id: 'WRN-' + vorgang_id.slice(4), zeitpunkt: ctx.zeitpunkt, maschinen_id: k.maschinen_id,
      artikel_id: artikel.artikel_id, buchbestand: nachher, meldebestand: Number(artikel.meldebestand),
      status: 'RESET', email_status: 'KEINE_MAIL', email_versuche: 0, vorgang_id,
    };
  }
  return {
    status: 'GEBUCHT', vorgang_id, fehler: [], journal, warnung, mail: null, warnaktion: warnung ? 'RESET' : 'KEINE',
    abschluss: 'Zugang gebucht. Buchbestand neu: ' + nachher + '.' + (warnung ? ' Warnstatus zurückgesetzt.' : ''),
  };
}
function originalOel(e, ctx) {
  const k = Object.assign({}, KONFIG, ctx.konfig || {});
  const fehler = [];
  const mengenFelder = Object.keys(e).filter(x => /menge|liter|volumen/i.test(x));
  if (mengenFelder.length) fehler.push('Mengenangaben sind im Schmierstoffprozess nicht zulässig: ' + mengenFelder.join(', '));
  if (e.maschinen_id !== k.maschinen_id) fehler.push('Unbekannte Maschinenkennung');
  const stelle = (ctx.schmierStamm || []).find(s => s.maschinen_id === k.maschinen_id && s.einfuellstelle_id === e.einfuellstelle_id) || null;
  if (!stelle) fehler.push('Unbekannte Einfüllstelle');
  else if (e.schmierstoff_id_angezeigt !== stelle.schmierstoff_id_demo) {
    fehler.push('Angezeigter Schmierstoff passt nicht zur Einfüllstelle – keine Erfolgsmeldung, Klärung nach betrieblicher Vorschrift');
  }
  if (!istBestaetigt(e.bestaetigung_gebinde, OEL_TEXT.gebinde)) fehler.push('Gebindeetikett-Abgleich nicht bestätigt');
  if (!istBestaetigt(e.bestaetigung_einfuellstelle, OEL_TEXT.einfuellstelle)) fehler.push('Richtige Einfüllstelle nicht bestätigt');
  if (!istBestaetigt(e.bestaetigung_wiederbetrieb, OEL_TEXT.wiederbetrieb)) fehler.push('Wiederinbetriebnahme nicht bestätigt');
  if (!pruefeKuerzel(e.kuerzel)) fehler.push('Mitarbeiterkürzel fehlt');
  if (fehler.length) {
    return {
      status: 'ABGEWIESEN', fehler, meldung: null, mail: null,
      abschluss: 'Keine Erfolgsmeldung: ' + fehler.join('; ') + '. Bei Unklarheit nach betrieblicher Vorschrift klären.',
    };
  }
  const kuerzel = e.kuerzel.trim();
  const meldung_id = erzeugeId('OEL', e.submittedAt, [k.maschinen_id, stelle.einfuellstelle_id, kuerzel]);
  if ((ctx.meldungen || []).some(x => x.meldung_id === meldung_id)) {
    return {
      status: 'DUPLIKAT', meldung_id, fehler: ['Meldung bereits verarbeitet – keine zweite Mail'], meldung: null, mail: null,
      abschluss: 'Diese Rückmeldung wurde bereits verarbeitet – keine zweite Mail.',
    };
  }
  const meldung = {
    meldung_id, zeitpunkt: ctx.zeitpunkt, maschinen_id: k.maschinen_id,
    einfuellstelle_id: stelle.einfuellstelle_id,
    schmierstoff_id_demo: stelle.schmierstoff_id_demo,
    schmierstoff_vollbezeichnung_demo: stelle.schmierstoff_vollbezeichnung_demo,
    gebindeetikett_abgeglichen: 'JA', richtige_einfuellstelle_bestaetigt: 'JA', wiederbetrieb_bestaetigt: 'JA',
    kuerzel, mail_status: k.mail_aktiv ? 'AUSSTEHEND' : 'DEAKTIVIERT',
  };
  return {
    status: 'DOKUMENTIERT', meldung_id, fehler: [], meldung, mail: k.mail_aktiv ? baueOelMail(stelle, meldung) : null,
    abschluss: 'Rückmeldung dokumentiert. Mitarbeiterbestätigung erfasst – keine technische Freigabe.' +
      (k.mail_aktiv ? ' Abschlussmail an Gmail übergeben.' : ' (Mailversand deaktiviert.)'),
  };
}
function alsN8nItem(r, zeilenFeld) {
  const zeile = r[zeilenFeld] || null;
  return Object.assign({}, zeile || {}, {
    _hat_zeile: !!zeile, _status: r.status, _fehler: r.fehler || [], _abschluss: r.abschluss || '',
    _warnaktion: r.warnaktion || 'KEINE', _warnung: r.warnung || null, _mail: r.mail || null,
    _nachsendung: r.nachsendung || null, _mailversuch: r.mailversuch || 0,
  });
}



// LAB-M01 repair R1: fail closed before writes. Existing journal architecture remains.
function strictInt(value, label, min = 0) {
  if (!(typeof value === 'number' || typeof value === 'string' && /^-?\d+$/.test(value.trim()))) throw new Error(label + ': ganze Zahl erforderlich');
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min) throw new Error(label + ': unzulässiger Zahlenbereich');
  return n;
}
function requiredText(v, label) {
  if (typeof v !== 'string' || !v.trim() || v.length > 250 || /[\x00-\x1f]/.test(v)) throw new Error(label + ': ungültiger Text');
  return v.trim();
}
function stableRecord(row) {
  return JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k]) => !['row_number','rowNumber'].includes(k)).sort(([a],[b]) => a.localeCompare(b))));
}
function uniqueRows(rows, key, label) {
  if (!Array.isArray(rows)) throw new Error(label + ': Tabelle fehlt');
  const found = new Map();
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(label + ': ungültige Zeile');
    const id = requiredText(row[key], label + ' ID');
    if (found.has(id) && stableRecord(found.get(id)) !== stableRecord(row)) throw new Error(label + ': widersprüchliche ID ' + id);
    if (!found.has(id)) found.set(id, row);
  }
  return [...found.values()];
}
function checkedContext(ctx) {
  if (!ctx || !Array.isArray(ctx.stamm) || !Array.isArray(ctx.journal) || !Array.isArray(ctx.warnungen)) throw new Error('Kontexttabellen fehlen');
  const c = {...ctx};
  const seen = new Set();
  c.stamm = ctx.stamm.map(row => {
    const a = {...row};
    const key = requiredText(a.maschinen_id,'Maschine') + '|' + requiredText(a.artikel_id,'Artikel');
    if (seen.has(key)) throw new Error('Mehrdeutige Artikelstammdaten: ' + key);
    seen.add(key);
    for (const k of ['startbestand','meldebestand','sicherheitsbestand']) a[k] = strictInt(a[k],k);
    if (a.sicherheitsbestand > a.meldebestand) throw new Error('Sicherheitsbestand liegt über Meldebestand');
    return a;
  });
  c.journal = uniqueRows(ctx.journal.map(row => {
    const z = {...row};
    z.delta = strictInt(z.delta,'Journal delta',-Number.MAX_SAFE_INTEGER);
    z.menge = strictInt(z.menge,'Journal menge',1);
    for (const k of ['buchbestand_vorher','buchbestand_nachher']) z[k] = strictInt(z[k],k);
    requiredText(z.maschinen_id,'Journal Maschine'); requiredText(z.artikel_id,'Journal Artikel');
    if (!c.stamm.some(a => gleicherArtikel(z,a))) throw new Error('Journal ohne Stammdaten');
    if (!['ENTNAHME','ZUGANG'].includes(z.art)) throw new Error('Unbekannte Journalart');
    if (!['GEBUCHT','GEBUCHT_UNTER_SICHERHEITSBESTAND','NICHT_GEBUCHT_DUPLIKATVERDACHT','NICHT_GEBUCHT_BESTANDSDIFFERENZ','NICHT_GEBUCHT_LIEFERSCHEIN_DOPPELT'].includes(z.pruefstatus)) throw new Error('Unbekannter Journalstatus');
    const expected = istGebucht(z) ? (z.art === 'ENTNAHME' ? -z.menge : z.menge) : 0;
    if (z.delta !== expected || !Number.isSafeInteger(z.buchbestand_vorher + z.delta) || z.buchbestand_vorher + z.delta !== z.buchbestand_nachher) throw new Error('Widersprüchliche Journalwerte');
    return z;
  }), 'vorgang_id','Journal');
  for (const a of c.stamm) {
    let balance = a.startbestand;
    for (const z of c.journal.filter(z => gleicherArtikel(z,a))) {
      if (z.buchbestand_vorher !== balance) throw new Error('Journalfolge unvollständig oder parallel verändert: ' + a.artikel_id);
      balance += z.delta;
      if (!Number.isSafeInteger(balance) || balance < 0) throw new Error('Unsicherer Buchbestand');
    }
  }
  c.warnungen = uniqueRows(ctx.warnungen,'warnung_id','Warnung').map(w => {
    if (!['OFFEN','RESET'].includes(w.status)) throw new Error('Ungültiger Warnstatus');
    if (!['AUSSTEHEND','GESENDET','FEHLER','DEAKTIVIERT','KEINE_MAIL'].includes(w.email_status)) throw new Error('Ungültiger Mailstatus');
    strictInt(w.email_versuche,'Mailversuche'); strictInt(w.buchbestand,'Warnbestand'); strictInt(w.meldebestand,'Warnschwelle');
    if (!c.journal.some(z => z.vorgang_id === w.vorgang_id && gleicherArtikel(z,w) && istGebucht(z))) throw new Error('Warnung ohne zugehörige Buchung');
    return w;
  });
  for (const a of c.stamm) {
    let open = false;
    for (const z of c.journal.filter(z => gleicherArtikel(z,a) && istGebucht(z))) {
      const event = c.warnungen.filter(w => w.vorgang_id === z.vorgang_id);
      const wanted = z.art === 'ENTNAHME' && z.buchbestand_nachher <= a.meldebestand && !open ? 'OFFEN'
        : z.art === 'ZUGANG' && z.buchbestand_nachher > a.meldebestand && open ? 'RESET' : null;
      if (wanted && (event.length !== 1 || event[0].status !== wanted)) throw new Error('Teilbuchung: Warnung/Reset fehlt oder widersprüchlich; manuelle Klärung erforderlich');
      if (!wanted && event.length) throw new Error('Warnereignis passt nicht zur Journalfolge');
      if (wanted) open = wanted === 'OFFEN';
    }
  }
  return c;
}
function incomplete(id, detail) {
  return {status:'KLAERUNG_ERFORDERLICH',vorgang_id:id,fehler:[detail],journal:null,meldung:null,warnung:null,mail:null,warnaktion:'KEINE',abschluss:'Bereits protokollierter Vorgang: Verarbeitung und Mailstatus prüfen. Keine zweite Buchung und keine automatische Nachsendung. ' + detail};
}
function guardedMovement(fn,e,ctx,isTake) {
  try {
    const c = checkedContext(ctx);
    if (!e || typeof e !== 'object') throw new Error('Eingabe fehlt');
    requiredText(e.submittedAt,'Sendungskennung'); requiredText(e.kuerzel,'Kürzel');
    const q = strictInt(e.menge,'Menge',1);
    if (isTake && (!e.foto || e.foto.binary_verified !== true || !Number.isSafeInteger(e.foto.bytes) || e.foto.bytes <= 0 || e.foto.bytes > 10*1024*1024)) throw new Error('Foto: echte geprüfte JPG/PNG-Binärdatei erforderlich (maximal 10 MiB)');
    const r = fn({...e,menge:q},c);
    if (r.status === 'DUPLIKAT' || r.status === 'LIEFERSCHEIN_DOPPELT') return incomplete(r.vorgang_id,'Bei Teilabbruch Journal, Warnung/Reset und Mail manuell abgleichen.');
    if (r.journal && (!Number.isSafeInteger(r.journal.buchbestand_nachher) || r.journal.buchbestand_nachher < 0)) throw new Error('Ergebnisbestand außerhalb sicherem Zahlenbereich');
    // A pending/failed warning is never silently re-sent as a side effect of another booking.
    const last = letzteWarnung(c.warnungen,{maschinen_id:e.maschinen_id,artikel_id:e.artikel_id});
    if (isTake && last && last.status === 'OFFEN' && ['AUSSTEHEND','FEHLER'].includes(last.email_status)) return incomplete(r.vorgang_id,'Vorheriger Mailversand ist unbestätigt oder fehlgeschlagen; erst klären.');
    if (r.abschluss) r.abschluss = r.abschluss.replace('Warnmail an Gmail übergeben.','Warnmail vorbereitet; Versandstatus gesondert prüfen.');
    return r;
  } catch(err) { return abgewiesen([err.message],{abschluss:'Nicht gebucht: ' + err.message + '. Klärung erforderlich.'}); }
}
function verarbeiteEntnahme(e,ctx) { return guardedMovement(originalEntnahme,e,ctx,true); }
function verarbeiteZugang(e,ctx) { return guardedMovement(originalZugang,e,ctx,false); }
function verarbeiteOel(e,ctx) {
  try {
    requiredText(e.submittedAt,'Sendungskennung');
    requiredText(e.kuerzel,'Kürzel');
    const rows = ctx.schmierStamm || [];
    const seen = new Set();
    for (const s of rows) {
      const key = requiredText(s.maschinen_id,'Maschine')+'|'+requiredText(s.einfuellstelle_id,'Einfüllstelle');
      if (seen.has(key)) throw new Error('Mehrdeutige Schmierstoffzuordnung');
      seen.add(key); requiredText(s.schmierstoff_id_demo,'Schmierstoff');
    }
    const meldungen = uniqueRows(ctx.meldungen || [],'meldung_id','Schmierstoffmeldung');
    const r = originalOel(e,{...ctx,meldungen});
    if (r.status === 'DUPLIKAT') return incomplete(r.meldung_id,'Schmierstoffmeldung vorhanden; Mailstatus gesondert klären.');
    if (r.abschluss) r.abschluss = r.abschluss.replace('Abschlussmail an Gmail übergeben.','Abschlussmail vorbereitet; Versandstatus gesondert prüfen.');
    return r;
  } catch(err) { return {...abgewiesen([err.message],{abschluss:'Nicht dokumentiert: '+err.message+'. Klärung erforderlich.'}),meldung:null}; }
}

module.exports={verarbeiteEntnahme,verarbeiteZugang,verarbeiteOel,buchbestand,checkedContext};
