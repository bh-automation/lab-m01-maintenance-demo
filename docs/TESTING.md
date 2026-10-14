# Testnachweis · Stand 15. Oktober 2026

## Nachweise und ihre Reichweite

| Ebene | Befund | Aussagegrenze |
|---|---|---|
| Tatsächliche n8n-Basisläufe, 14.10.2026 | Entnahme 6→3 mit Warnung; Zugang 3→6 mit Reset; Schmierstoffmeldung mit drei Bestätigungen; Gmail-Ergebnisse vorhanden | Drei ausgewählte, betreute Basisfälle; keine Last- oder Dauerverfügbarkeitsprüfung |
| Negative n8n-Prüfungen, 14.10.2026 | Wiederholung/Nullmenge ohne neue Buchung; nachgelagerter Tabellen-Audit 11/11 PASS | Dokumentierter historischer Teststand, kein permanentes Monitoring |
| Menschlicher Smartphone-Test | Vom Projektinhaber im Workshop-Loop als bestanden und kontrolliert bestätigt | Gerät, Betriebssystem und jede spätere Kartenvariante nicht einzeln protokolliert |
| 13 lokale Aufgaben | 64 Assertions bestanden; wiederholte Eingaben ohne zusätzliche Schreibaktion | Persistenz- und Mailerfolg werden im Speicher simuliert |
| Finaler Kartenexport | 13 Vorderseiten jeweils bei 110 und 300 dpi decodiert: 26/26 | Digitaler Rastertest, kein Ersatz für jeden physischen Druckscan |

Originale Cloud- und Postfachbelege sind privat. Die öffentliche Tabelle ist eine redigierte Zusammenfassung dieser Belege, keine unabhängig öffentlich verifizierbare Cloud-Attestierung. `evidence/provenance.json` hält die Prüfsummen der privaten Belegdateien zur internen Zuordnung; ein Hash allein beweist keinen Lauf.

## Reproduzierbarer Prüflauf

`node tests/workshop.cjs` prüft die ausgelieferten 13 Fälle in genau dieser Reihenfolge mit frischem synthetischem Anfangsstand. Jede Wiederholung erhält denselben Anfangsstand; es entstehen keine externen Nebenwirkungen. Ausgabe: 64 PASS, 0 FAIL. Ein Fehler beendet den Prozess ungleich null.

| Aufgaben | Ablauf | Bestand |
|---|---|---|
| 01 / 02 | Entnahme / Zugang, V05 | 6→3→6 |
| 03 | Schmierstoff, ZS-01 | dokumentiert |
| 04 / 05 | Entnahme / Zugang, V01 | 10→6→10 |
| 06 | Schmierstoff, SP-01 | dokumentiert |
| 07 / 08 | Entnahme / Zugang, V02 | 8→4→8 |
| 09 | Schmierstoff, GT-01 | dokumentiert |
| 10 / 11 | Entnahme / Zugang, V03 | 20→10→20 |
| 12 | Schmierstoff, ZS-01 mit anderem Kürzel | dokumentiert |
| 13 | Entnahme, V04 | 12→10, keine Warnmail |

Erwartet: neun Bewegungen und vier Rückmeldungen. Der Kern erzeugt acht Mailobjekte (vier Warnungen und vier Schmierstoffmeldungen) sowie vier Wareneingangs-Resetereignisse. Die vier Wareneingangsmails entstehen in der Cloud außerhalb dieses Kerns und werden hier nicht gerendert oder versendet. Die zwölf Mail-Erwartungen in den Beispieldaten beschreiben den gesamten DEMO-Ablauf; sie sind keine zwölf lokalen Mailobjekte und keine Zustellnachweise. Die Fälle verwenden Foto-Metadaten als ausdrücklich simulierten Eingang nach der Binärprüfung.

Die neue Veröffentlichung wird erneut ausgeführt, weil Dateipfade und Paketierung geändert wurden. Das ist eine Prüfung der veröffentlichten Fassung, keine Wiederholung aller früheren Cloud-Tests.
