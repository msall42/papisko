import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./components";
export default function LocationPicker({
  lat,
  lon,
  onChange,
}: {
  lat: number | null;
  lon: number | null;
  onChange: (lat: number, lon: number) => void;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let map: any;
    Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")])
      .then(([L]) => {
        if (cancelled || !container.current) return;
        map = L.map(container.current).setView(
          [lat ?? 14.73, lon ?? -17.39],
          12,
        );
        mapRef.current = map;
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);
        let marker: any;
        const place = (a: number, b: number) => {
          if (marker) marker.setLatLng([a, b]);
          else
            marker = L.circleMarker([a, b], {
              radius: 9,
              color: "#ed5725",
              fillOpacity: 0.8,
            }).addTo(map);
        };
        if (lat !== null && lon !== null) place(lat, lon);
        map.on("click", (e: any) => {
          place(e.latlng.lat, e.latlng.lng);
          change.current(e.latlng.lat, e.latlng.lng);
        });
      })
      .catch(() =>
        setError(
          "La carte est indisponible. Utilisez votre position ou les coordonnées.",
        ),
      );
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [open]);
  function locate() {
    setError("");
    if (!navigator.geolocation) {
      setError("Géolocalisation indisponible.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onChange(p.coords.latitude, p.coords.longitude);
        mapRef.current?.setView([p.coords.latitude, p.coords.longitude], 15);
        setOpen(false);
      },
      () =>
        setError("Position inaccessible. Choisissez un point sur la carte."),
      { timeout: 12000, maximumAge: 60000 },
    );
  }
  return (
    <div class="location-picker">
      <div class="row wrap-row">
        <button type="button" class="secondary" onClick={locate}>
          <Icon name="pin" /> Ma position
        </button>
        <button type="button" class="secondary" onClick={() => setOpen(!open)}>
          {open ? "Fermer la carte" : "Choisir sur la carte"}
        </button>
      </div>
      {open && (
        <>
          <p class="muted">
            Touchez votre adresse sur la carte. La carte nécessite une connexion
            Internet.
          </p>
          <div
            ref={container}
            class="map"
            role="region"
            aria-label="Carte de Dakar pour choisir le lieu de livraison"
          />
        </>
      )}
      {error && (
        <p role="alert" class="error">
          {error}
        </p>
      )}
      <details>
        <summary>Saisir les coordonnées manuellement</summary>
        <div class="two">
          <label>
            Latitude
            <input
              type="number"
              step="any"
              value={lat ?? ""}
              onChange={(e) =>
                onChange(Number(e.currentTarget.value), lon ?? -17.39)
              }
            />
          </label>
          <label>
            Longitude
            <input
              type="number"
              step="any"
              value={lon ?? ""}
              onChange={(e) =>
                onChange(lat ?? 14.73, Number(e.currentTarget.value))
              }
            />
          </label>
        </div>
      </details>
      {lat !== null && lon !== null && (
        <small>
          Position : {lat.toFixed(5)}, {lon.toFixed(5)} ·{" "}
          <a
            href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Vérifier
          </a>
        </small>
      )}
    </div>
  );
}
