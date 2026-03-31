import type { DemoStep } from "../types";

export const mapSteps: DemoStep[] = [
  {
    id: "map-intro",
    module: "map",
    title: "Prospect Map",
    body: "The Map page visualizes your leads geographically. Each marker represents a lead — hover to see details, or filter to focus on specific areas.",
    beforeShow: [
      { type: "navigate", value: "/map" },
      { type: "waitFor", target: "[data-tour='map-overview']" },
    ],
  },
  {
    id: "map-overview",
    module: "map",
    title: "Interactive Map",
    body: "The map is centered on Minnesota and shows all geocoded leads. Pan, zoom, and click markers to see lead name, company, pipeline value, and status.",
    target: "map-overview",
    targetAttr: "data-tour",
    placement: "top",
  },
  {
    id: "map-filters",
    module: "map",
    title: "Map Filters",
    body: "Filter markers by branch, lead status, assigned rep, or search by name. The map updates in real time as you change filters — markers appear and disappear instantly.",
    target: "map-filters",
    placement: "bottom",
  },
  {
    id: "map-geocode",
    module: "map",
    title: "Geocoding",
    body: "Leads with addresses but no coordinates can be geocoded using this button. It uses OpenStreetMap's Nominatim service at 1 request per second to plot them on the map.",
    target: "map-geocode",
    placement: "bottom",
  },
  {
    id: "map-done",
    module: "map",
    title: "Map Complete",
    body: "That's the Map! Next up depends on your role — if you have access, we'll look at Import, Reports, or Automations. Otherwise we'll head to Settings.",
  },
];
