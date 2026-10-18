import TVWidget from "./TVWidget";

const CALENDAR_CONFIG = {
  colorTheme: "dark",
  isTransparent: true,
  width: "100%",
  height: "100%",
  locale: "id",
  importanceFilter: "0,1",
  countryFilter: "us,eu,cn,jp,gb,id",
};

export default function EconomicCalendar() {
  return (
    <section className="panel overflow-hidden">
      <header className="panel-header">
        <h2>Kalender Ekonomi</h2>
        <span className="text-xs text-muted">Rilis data penting</span>
      </header>
      <TVWidget script="events" config={CALENDAR_CONFIG} height={560} />
    </section>
  );
}
