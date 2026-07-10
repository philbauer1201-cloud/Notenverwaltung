# Architektur- und Entwicklungsrichtlinien (Global für alle Projekte)

## 1. UI & Responsiveness (Strikte Layout-Vorgaben)
- **Technologie-Stack**: Verwende ausschließlich HTML5, CSS (Vanilla) und modernes JavaScript (ES6+).
- **Layout**: Das Layout muss absolut fluid sein. Nutze CSS Flexbox für flexible Container und CSS Grid für tabellarische oder rasterartige Darstellungen.
- **Keine Pixel (px)**: Verwende **KEINE festen Pixelwerte** (px). Nutze ausschließlich relative Einheiten: `rem` für Schriften und Abstände, `%` oder `vw`/`vh` für Dimensionen.
- **Basis-Schriftgröße**: Setze im CSS für das Root-Element immer: `html { font-size: 62.5%; }` (damit 1rem exakt 10px entspricht).

## 2. Daten-Architektur (Headless-Ansatz)
- **Strikte Trennung**: Die Benutzeroberfläche (HTML) darf keine statisch programmierten Nutzdaten enthalten. Code und Daten sind strikt voneinander zu trennen.
- **Datenobjekt**: Erstelle im JavaScript-Teil ein modulares State/Daten-Objekt (z. B. `let appData = { ... };`) als universelle Schnittstelle.
- **Zentrales Rendering**: Implementiere eine zentrale Funktion wie `renderUI(data)`, die das gesamte responsive Layout basierend auf diesem Datenobjekt dynamisch im DOM aufbaut.

## 3. Entwicklungsebenen (Modus-Schalter)
- **Test- und Live-Modus**: Baue eine diskrete Steuerungsleiste (z. B. "Admin-Top-Bar") für die lokale Entwicklung ein, die mindestens zwei Modi unterstützt:
  - **„Modus: Entwicklung“**: Lädt ein lokales Set an fiktiven Mock-Daten, um das Layout und die Logik (Flexbox/Berechnungen) lokal am Rechner zu testen.
  - **„Modus: Live-Vorschau“**: Simuliert die Web-Darstellung der echten, finalen Datenstruktur ohne die Bearbeitungswerkzeuge/Mock-Daten.
