import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  Marker,
  NavigationControl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type MapMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Port, RouteLine, Selection } from "@/lib/ferry/types";
import { formatDuration } from "@/lib/ferry/format";

interface FerryMapProps {
  ports: Port[];
  routes: RouteLine[];
  visibleRouteIds: string[];
  selection: Selection | null;
  highlightedPortIds: string[];
  onSelect: (selection: Selection | null) => void;
}

const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

function routeFeatures(
  routes: RouteLine[],
  ports: Map<string, Port>,
  visible: Set<string>,
  selectedRouteId: string | null,
) {
  return routes
    .filter((route) => visible.has(route.id))
    .map((route) => {
      const from = ports.get(route.departure_port_id);
      const to = ports.get(route.arrival_port_id);
      if (!from || !to) return null;
      return {
        type: "Feature" as const,
        properties: {
          id: route.id,
          selected: selectedRouteId === route.id,
          dimmed: selectedRouteId !== null && selectedRouteId !== route.id,
        },
        geometry: {
          type: "LineString" as const,
          coordinates: [
            [from.longitude, from.latitude],
            [to.longitude, to.latitude],
          ],
        },
      };
    })
    .filter((feature): feature is NonNullable<typeof feature> => feature !== null);
}

const anchorStyles: Record<string, Partial<CSSStyleDeclaration>> = {
  left: { right: "12px", top: "-9px" },
  right: { left: "12px", top: "-9px" },
  top: { transform: "translateX(-50%)", left: "0", bottom: "12px" },
  bottom: { transform: "translateX(-50%)", left: "0", top: "12px" },
};

export default function FerryMap({
  ports,
  routes,
  visibleRouteIds,
  selection,
  highlightedPortIds,
  onSelect,
}: FerryMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const readyRef = useRef(false);
  const portMarkersRef = useRef<Map<string, Marker>>(new Map());
  const badgeMarkersRef = useRef<Map<string, Marker>>(new Map());
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [2.6, 39.4],
      zoom: 4.6,
      attributionControl: { compact: true },
    });
    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    map.on("load", () => {
      map.addSource("ferry-routes", {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "ferry-routes-line",
        type: "line",
        source: "ferry-routes",
        layout: { "line-cap": "round" },
        paint: {
          "line-color": [
            "case",
            ["get", "selected"],
            "oklch(0.68 0.145 55)",
            "oklch(0.42 0.105 238)",
          ],
          "line-width": ["case", ["get", "selected"], 3.4, 1.8],
          "line-opacity": ["case", ["get", "dimmed"], 0.28, 0.85],
        },
      });
      map.on("click", "ferry-routes-line", (event: MapLayerMouseEvent) => {
        const id = event.features?.[0]?.properties?.["id"];
        if (typeof id === "string") selectRef.current({ type: "route", id });
      });
      map.on("mouseenter", "ferry-routes-line", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "ferry-routes-line", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", (event: MapMouseEvent) => {
        const hits = map.queryRenderedFeatures(event.point, { layers: ["ferry-routes-line"] });
        if (hits.length === 0) selectRef.current(null);
      });
      readyRef.current = true;
      map.resize();
    });

    return () => {
      readyRef.current = false;
      portMarkersRef.current.forEach((marker) => marker.remove());
      portMarkersRef.current.clear();
      badgeMarkersRef.current.forEach((marker) => marker.remove());
      badgeMarkersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Port markers: GPS position comes from the data, label placement is separate.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const activeIds = new Set(highlightedPortIds);
    const dimming = highlightedPortIds.length > 0;

    ports.forEach((port) => {
      const existing = portMarkersRef.current.get(port.id);
      let marker: Marker;
      if (existing) {
        marker = existing;
      } else {
        const el = document.createElement("div");
        el.className = "port-marker";
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "port-marker__dot";
        dot.setAttribute("aria-label", port.name);
        const label = document.createElement("span");
        label.className = "port-marker__label";
        label.textContent = port.name;
        el.append(dot, label);
        const select = (event: Event) => {
          event.stopPropagation();
          selectRef.current({ type: "port", id: port.id });
        };
        dot.addEventListener("click", select);
        label.addEventListener("click", select);

        Object.assign(label.style, anchorStyles[port.label_anchor] ?? anchorStyles["left"]);
        label.style.marginLeft = `${port.label_offset_x}px`;
        label.style.marginTop = `${port.label_offset_y}px`;

        marker = new Marker({ element: el })
          .setLngLat([port.longitude, port.latitude])
          .addTo(map);
        portMarkersRef.current.set(port.id, marker);
      }
      const element = marker.getElement();
      element.dataset["active"] = String(activeIds.has(port.id));
      element.dataset["dimmed"] = String(dimming && !activeIds.has(port.id));
    });

    portMarkersRef.current.forEach((marker, id) => {
      if (!ports.some((port) => port.id === id)) {
        marker.remove();
        portMarkersRef.current.delete(id);
      }
    });
  }, [ports, highlightedPortIds]);

  // Route lines + discreet duration badges
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const portMap = new Map(ports.map((port) => [port.id, port]));
    const visible = new Set(visibleRouteIds);
    const selectedRouteId = selection?.type === "route" ? selection.id : null;

    const apply = () => {
      const source = map.getSource("ferry-routes") as GeoJSONSource | undefined;
      if (!source) return;
      source.setData({
        type: "FeatureCollection",
        features: routeFeatures(routes, portMap, visible, selectedRouteId),
      });

      const keep = new Set<string>();
      routes.forEach((route) => {
        if (!visible.has(route.id)) return;
        const from = portMap.get(route.departure_port_id);
        const to = portMap.get(route.arrival_port_id);
        if (!from || !to || !route.typical_duration_minutes) return;
        keep.add(route.id);
        const midpoint: [number, number] = [
          (from.longitude + to.longitude) / 2,
          (from.latitude + to.latitude) / 2,
        ];
        const existing = badgeMarkersRef.current.get(route.id);
        let marker: Marker;
        if (existing) {
          marker = existing;
          marker.setLngLat(midpoint);
        } else {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "duration-badge";
          el.textContent = formatDuration(route.typical_duration_minutes);
          el.addEventListener("click", (event) => {
            event.stopPropagation();
            selectRef.current({ type: "route", id: route.id });
          });
          marker = new Marker({ element: el }).setLngLat(midpoint).addTo(map);
          badgeMarkersRef.current.set(route.id, marker);
        }
        const element = marker.getElement();
        element.dataset["active"] = String(selectedRouteId === route.id);
        element.style.opacity = selectedRouteId && selectedRouteId !== route.id ? "0.35" : "1";
      });

      badgeMarkersRef.current.forEach((marker, id) => {
        if (!keep.has(id)) {
          marker.remove();
          badgeMarkersRef.current.delete(id);
        }
      });
    };

    if (readyRef.current) apply();
    else map.once("load", apply);
  }, [routes, ports, visibleRouteIds, selection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      const hide = map.getZoom() < 4.2;
      badgeMarkersRef.current.forEach((marker) => {
        marker.getElement().style.display = hide ? "none" : "";
      });
    };
    map.on("zoom", update);
    update();
    return () => {
      map.off("zoom", update);
    };
  }, []);

  // Recentre on the selection without hiding the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selection) return;
    if (selection.type === "port") {
      const port = ports.find((item) => item.id === selection.id);
      if (port) map.easeTo({ center: [port.longitude, port.latitude], duration: 600 });
      return;
    }
    if (selection.type === "route") {
      const route = routes.find((item) => item.id === selection.id);
      const from = ports.find((item) => item.id === route?.departure_port_id);
      const to = ports.find((item) => item.id === route?.arrival_port_id);
      if (from && to) {
        map.fitBounds(
          [
            [Math.min(from.longitude, to.longitude), Math.min(from.latitude, to.latitude)],
            [Math.max(from.longitude, to.longitude), Math.max(from.latitude, to.latitude)],
          ],
          { padding: 90, duration: 600, maxZoom: 7 },
        );
      }
    }
  }, [selection, ports, routes]);

  return <div ref={containerRef} className="absolute inset-0" />;
}
