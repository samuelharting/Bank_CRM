import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { apiFetch } from "../lib/api";
import { useAuth } from "../auth/useAuth";
import { ToastContainer, type ToastMessage } from "../components/Toast";
import { formatLeadStatus, type LeadStatus } from "../types";

const DEFAULT_CENTER: [number, number] = [46.7, -94.5];
const DEFAULT_ZOOM = 7;

const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

interface MapMarker {
  id: string;
  name: string;
  company: string | null;
  city: string | null;
  state: string | null;
  status: string;
  pipelineValue: number;
  lat: number;
  lng: number;
  branch: string | null;
  assignedTo: string | null;
}

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function ProspectMap(): JSX.Element {
  useAuth();
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoding, setGeocoding] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((type: ToastMessage["type"], message: string) => {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, message }]);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const loadMarkers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ markers: MapMarker[] }>("/map/leads");
      setMarkers(data.markers);
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Failed to load map data");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadMarkers().catch(() => undefined);
  }, [loadMarkers]);

  const runGeocode = async (): Promise<void> => {
    setGeocoding(true);
    try {
      const res = await apiFetch<{ processed: number; geocoded: number }>("/map/geocode", { method: "POST" });
      addToast("success", `Geocoded ${res.geocoded} of ${res.processed} leads (Nominatim has a 1 req/sec rate limit — run again for more)`);
      await loadMarkers();
    } catch (e) {
      addToast("error", e instanceof Error ? e.message : "Geocoding failed");
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <section className="space-y-4">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-slate-900">Prospect Map</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{markers.length} lead{markers.length !== 1 ? "s" : ""}</span>
        </div>
        <button
          onClick={() => runGeocode().catch(() => undefined)}
          disabled={geocoding}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {geocoding ? "Geocoding…" : "Geocode addresses"}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        {loading ? (
          <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">Loading map…</div>
        ) : (
          <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="h-full w-full">
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {markers.map((m) => (
              <Marker key={m.id} position={[m.lat, m.lng]} icon={defaultIcon}>
                <Popup>
                  <div className="text-sm">
                    <p className="font-semibold">{m.name}</p>
                    {m.company && <p className="text-slate-600">{m.company}</p>}
                    <p className="text-xs text-slate-500">
                      {formatLeadStatus(m.status as LeadStatus)} · {currency.format(m.pipelineValue)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {[m.city, m.state].filter(Boolean).join(", ")}
                      {m.branch ? ` · ${m.branch}` : ""}
                    </p>
                    {m.assignedTo && <p className="text-xs text-slate-400">{m.assignedTo}</p>}
                    <Link to={`/leads?leadId=${m.id}`} className="text-xs text-blue-600 hover:underline">
                      Open lead →
                    </Link>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>
    </section>
  );
}
