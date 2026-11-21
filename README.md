# Schiri-Abrechnung (HVSH) – eigenständige PWA

**Ziel:** Aus einem handball.net-Spiel-Link das HVSH-Formular »Abrechnung Spielbetrieb 1.3« für eine oder zwei Personen erstellen. Die bestehende Google-Cloud-Run-Schnittstelle aus `jtaeubrich/Spielanalyse` wird unverändert verwendet.

## Start

1. Repository `jtaeubrich/hvsh-schiri-pwa` anlegen und die Dateien auf Branch `main` hochladen. In **Settings → Pages → Build and deployment** die Quelle **GitHub Actions** auswählen. Der Workflow `.github/workflows/pages.yml` startet bei jedem Push auf `main`, führt die Tests aus und veröffentlicht danach die statische App. Geplante Adresse: `https://jtaeubrich.github.io/hvsh-schiri-pwa/`. Die Domain `jtaeubrich.github.io` ist für den Proxy freigegeben, sofern die vorhandene CORS-Konfiguration unverändert ist.
2. Für lokale Tests: `python3 -m http.server 5173` im App-Ordner, dann `http://localhost:5173/` öffnen. Der Proxy benötigt ggf. eine CORS-Freigabe für `http://localhost:5173`.
3. `https://www.handball.net/match/591223` oder eine Match-ID eintragen und **Abrufen** wählen.
4. Verwendet wird der unter derselben Web-Origin bereits gespeicherte `handballSpielanalyse.proxyToken`. Ohne vorhandenen Token kann er manuell unter »Proxy-Zugriff« eingetragen werden. Ein neu eingegebener Token wird nur dann dauerhaft im Browser gespeichert, wenn die Checkbox aktiviert wird; andernfalls nur für die Sitzung. **Sicherheit:** Inhalte anderer Webapps unter derselben `jtaeubrich.github.io`-Origin können technisch auf LocalStorage zugreifen. Für eine strengere Trennung wäre später ein eigener sicherer Anmeldeweg nötig.
5. Daten kontrollieren, ggf. HVSH-Spielnummer ergänzen, Anzahl Schiedsrichter und Einsatzgelder einstellen, PDF erzeugen.

**Keine automatische Online-Anmeldung:** Der bestehende Proxy authentifiziert über Bearer-Token; die PWA besitzt kein eigenes Account- oder Login-System. API-Token gehören **nicht** in GitHub-Dateien oder Parameter der Webseite.

## Datenquellen und Grenzen

- Proxy: `GET https://handball360-proxy-235703972531.europe-west1.run.app/match/{ID}`, Header `Authorization: Bearer {Token}`.
- JSON-Modell: `{match_id,match:{data:[...]},events,lineups,additional_info}`.
- Übernommen werden: Datum (wörtliche lokale Handball360-Anstoßzeit), Wettbewerb/Staffel, Heim, Gast, Hallenname und Ort, sofern tatsächlich vorhanden. Diese Felder sind bearbeitbar.
- **Die handball.net-Match-ID ist nicht zwingend die offizielle HVSH-Spielnummer.** Wenn kein unterscheidbares, explizites Nummernfeld geliefert wird, bleibt die HVSH-Spielnummer leer.
- Profile mit Name, Straße und Hausnummer, PLZ und Ort werden ausdrücklich gespeichert und können ausgewählt, geändert und gelöscht werden. Sie bleiben im Browser und werden nicht in den Proxy-JSON-Export geschrieben. Gewählte Anschriften erscheinen im PDF.
- Einsatzgeld: Für eindeutig zugeordnete Ligaspiele der Saison 2026/27 wird der belegte Grundbetrag je Schiedsrichter vorgeschlagen. Bei offenen Zuordnungen bleibt das Feld leer. Beträge sind editierbar. Vorschläge verlinken die Bestimmungen des HVSH (§ 27), der Regionalliga Nord (§ 14.13) oder des gemeinsamen KHV-Spielbetriebs (C.3). Wochentagszuschläge werden angezeigt, sofern vorgesehen, und bei Bedarf manuell eingetragen.
- Die Basisvorlage ist die HVSH-Abrechnung Spielbetrieb 1.3 (Stand gültig ab Dezember 2023). Ihre Seite ist als JPEG mit 220 dpi hinterlegt, um ohne Drittanbieterbibliothek lokal PDF-Dateien erzeugen zu können. Zusätzliche Werte werden als durchsuchbarer Vektortext eingetragen. Die unveränderte Ursprungs-PDF befindet sich unter `assets/`.
- Ein PDF wird **ausschließlich im Browser** erzeugt; es wird kein PDF-Service aufgerufen. Die Netzverbindung wird nur zum Abrufen der Spieldaten über den bestehenden Proxy benötigt. Token und Matchdaten landen nicht im Service-Worker-Cache.
- Test-JSON mit dem Merkmal `_test_fixture` wird im erzeugten PDF gut sichtbar als **TESTDATEN** gekennzeichnet.
- Bei sehr langen Feldwerten wird die PDF-Erzeugung abgelehnt, statt Informationen still zu kürzen.

## Test ohne Proxy-Zugriff

`tests/example-proxy-response.json` ist **ausschließlich ein synthetischer Testdatensatz** und darf nicht als reale Spielinformation verwendet werden. Über »Alternativ: Proxy-JSON-Datei laden« lässt sich der Import und PDF-Export auch offline testen. Das im Formular vorgegebene Spiel `591223` ist hierbei nur die Test-ID; alle Mannschafts- und Hallendaten in der JSON sind fiktiv.

Für automatische Mapping-Tests: `node --test tests/*.test.mjs` (Node.js >= 18). Für PWA-Funktionalität über `localhost` oder HTTPS testen, nicht per `file://` öffnen.

## Deployment ohne Änderung der Spielanalyse

Option A (vorgesehen): Eigenes GitHub-Repository `hvsh-schiri-pwa` unter dem vorhandenen GitHub-Nutzer veröffentlichen und **Settings → Pages → Source: GitHub Actions** aktivieren. Der mitgelieferte Workflow prüft den Code und veröffentlicht nur die benötigten statischen Dateien. Dadurch liegt die PWA unter derselben Origin wie die Spielanalyse und kann den bestehenden Proxy-CORS-Eintrag und den dort bereits gespeicherten Token nutzen. Beim ersten Einrichten ist diese Pages-Einstellung manuell zu setzen. Ein öffentliches Repo ist bei GitHub Free für Pages geeignet.

Option B: Unterverzeichnis im bestehenden `Spielanalyse`-Repository mit eigener Pages-Route verwenden. Hier wäre jedoch ein Eingriff in das bestehende Projekt nötig. Für eine getrennte App empfehlen wir Option A.

Nicht dokumentierte interne handball.net-Endpunkte können sich ändern; der bestehende Proxy bleibt die einzige Datenzugriffsschicht. Der Proxy-Zugriff und die Nutzungsbedingungen sollten vor einem breiteren öffentlichen Einsatz geprüft werden.

## Geplante Erweiterungen

- IBAN und abweichende Startadresse für die Anreise
- Wahl des Verkehrsmittels und der tatsächlichen Anreise, Reisekosten nach gültiger HVSH-Regelung, Berechnung je Person
- Historie und Formularversionierung, gegebenenfalls Signaturen
- Vorlagenweiterentwicklung / Update auf neuere HVSH-Abrechnungsformulare

