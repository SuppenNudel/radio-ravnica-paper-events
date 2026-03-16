const eventsEl = document.getElementById("events");
const metaEl = document.getElementById("meta");
const mapMetaEl = document.getElementById("map-meta");
const cityFilterEl = document.getElementById("city-filter");
const formatFilterEl = document.getElementById("format-filter");
const distanceLocationEl = document.getElementById("distance-location");
const distanceKmEl = document.getElementById("distance-km");
const applyDistanceBtn = document.getElementById("apply-distance");
const clearDistanceBtn = document.getElementById("clear-distance");
const template = document.getElementById("event-card-template");

const map = L.map("events-map", {
  zoomControl: true,
  scrollWheelZoom: true,
});

const markerLayer = L.layerGroup().addTo(map);
const distanceLayer = L.layerGroup().addTo(map);

const tileLayers = {
  "Carto Positron Clean": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }),
  "Carto Positron": L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  }),
  "OpenStreetMap DE": L.tileLayer("https://tile.openstreetmap.de/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  "OpenStreetMap Standard": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }),
  "OpenTopoMap": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
    maxZoom: 17,
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  }),
};

const defaultBaseLayer = tileLayers["OpenStreetMap DE"];
defaultBaseLayer.addTo(map);

L.control
  .layers(tileLayers, {
    "Event-Marker": markerLayer,
    "Distanz-Kreis": distanceLayer,
  })
  .addTo(map);

// If the default tiles are temporarily unavailable, switch to OSM DE automatically.
let switchedToFallback = false;
defaultBaseLayer.on("tileerror", () => {
  if (switchedToFallback) {
    return;
  }
  switchedToFallback = true;
  if (map.hasLayer(defaultBaseLayer)) {
    map.removeLayer(defaultBaseLayer);
    tileLayers["OpenStreetMap Standard"].addTo(map);
    mapMetaEl.textContent = "Kartenkacheln nicht verfuegbar, auf OpenStreetMap Standard gewechselt.";
  }
});

map.setView([51.1657, 10.4515], 6);

const geocodeCachePrefix = "paper-events-geocode-v1:";

let state = {
  events: [],
  generatedAt: null,
  geocodeErrors: 0,
  userLocation: null,
};

function populateFormatOptions(events) {
  const formats = new Set();
  for (const eventItem of events) {
    if (!Array.isArray(eventItem.formats)) {
      continue;
    }
    for (const format of eventItem.formats) {
      if (format) {
        formats.add(format);
      }
    }
  }

  const sortedFormats = [...formats].sort((left, right) => left.localeCompare(right, "de"));
  formatFilterEl.innerHTML = "";

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Alle Formate";
  formatFilterEl.appendChild(defaultOption);

  for (const format of sortedFormats) {
    const option = document.createElement("option");
    option.value = format;
    option.textContent = format;
    formatFilterEl.appendChild(option);
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildAddressQuery(eventItem) {
  return [eventItem.location_name, eventItem.location_address, eventItem.location_city].filter(Boolean).join(", ");
}

function getCachedCoordinates(query) {
  try {
    const raw = localStorage.getItem(geocodeCachePrefix + query.toLowerCase());
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
      return parsed;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function setCachedCoordinates(query, value) {
  try {
    localStorage.setItem(geocodeCachePrefix + query.toLowerCase(), JSON.stringify(value));
  } catch (_) {
    // Ignore storage limits; map still works without cache persistence.
  }
}

async function geocodeAddress(query) {
  const cached = getCachedCoordinates(query);
  if (cached) {
    return cached;
  }

  // Respect Nominatim usage by keeping request rate low.
  await sleep(350);
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "Accept-Language": "de",
    },
  });
  if (!response.ok) {
    throw new Error(`Geocoding failed (${response.status})`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) {
    return null;
  }

  const first = data[0];
  const result = {
    lat: Number(first.lat),
    lon: Number(first.lon),
  };
  if (!Number.isFinite(result.lat) || !Number.isFinite(result.lon)) {
    return null;
  }

  setCachedCoordinates(query, result);
  return result;
}

function geocodeCandidates(eventItem) {
  const full = buildAddressQuery(eventItem);
  const addressOnly = [eventItem.location_address, eventItem.location_city].filter(Boolean).join(", ");
  const nameAndCity = [eventItem.location_name, eventItem.location_city].filter(Boolean).join(", ");
  const cityOnly = eventItem.location_city || "";

  return [full, addressOnly, nameAndCity, cityOnly].filter((value, index, arr) => {
    const trimmed = (value || "").trim();
    return trimmed && arr.findIndex((v) => (v || "").trim().toLowerCase() === trimmed.toLowerCase()) === index;
  });
}

function makePopupHtml(eventItem) {
  const title = eventItem.title || "Paper Event";
  const date = formatDateRange(eventItem.start_at, eventItem.end_at);
  const location = [eventItem.location_name, eventItem.location_address, eventItem.location_city].filter(Boolean).join(" | ");
  const formats = eventItem.formats?.length ? eventItem.formats.join(", ") : "n/a";
  return `
    <strong>${title}</strong><br>
    ${date}<br>
    ${location}<br>
    Formate: ${formats}
  `;
}

async function ensureCoordinates(events) {
  let changed = false;
  for (const eventItem of events) {
    if (typeof eventItem.lat === "number" && typeof eventItem.lon === "number") {
      continue;
    }
    const queries = geocodeCandidates(eventItem);
    if (!queries.length) {
      continue;
    }

    let coords = null;
    for (const query of queries) {
      try {
        coords = await geocodeAddress(query);
      } catch (_) {
        state.geocodeErrors += 1;
      }
      if (coords) {
        eventItem.lat = coords.lat;
        eventItem.lon = coords.lon;
        changed = true;
        break;
      }
    }

    if (changed) {
      const filtered = applyFilters(state.events);
      renderMap(filtered);
      changed = false;
    }
  }
}

function renderMap(events) {
  markerLayer.clearLayers();
  distanceLayer.clearLayers();

  if (state.userLocation) {
    const origin = [state.userLocation.lat, state.userLocation.lon];
    const originColor = "#cc5b2f";
    L.circle(origin, {
      radius: state.userLocation.maxKm * 1000,
      color: originColor,
      fillColor: originColor,
      fillOpacity: 0.08,
      weight: 2,
    }).addTo(distanceLayer);
    const originIcon = L.divIcon({
      className: "",
      html: `<div style="
        width:16px;height:16px;
        background:${originColor};
        border:2px solid #fff;
        border-radius:50%;
        box-shadow:0 1px 4px rgba(0,0,0,0.4);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      popupAnchor: [0, -10],
    });
    L.marker(origin, { icon: originIcon })
      .bindPopup(`<strong>Dein Standort</strong><br>${state.userLocation.query}`)
      .addTo(distanceLayer);
  }

  const mappable = events.filter(
    (eventItem) => typeof eventItem.lat === "number" && typeof eventItem.lon === "number"
  );
  const bounds = [];

  for (const eventItem of mappable) {
    const marker = L.marker([eventItem.lat, eventItem.lon]);
    marker.bindPopup(makePopupHtml(eventItem));
    markerLayer.addLayer(marker);
    bounds.push([eventItem.lat, eventItem.lon]);
  }

  if (bounds.length === 1) {
    map.setView(bounds[0], 11);
  } else if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [26, 26], maxZoom: 12 });
  }

  const unresolved = events.length - mappable.length;
  mapMetaEl.textContent = `${mappable.length}/${events.length} Events auf der Karte` +
    (unresolved > 0 ? ` | ${unresolved} nicht aufgeloeste Adressen` : "") +
    (state.geocodeErrors > 0 ? ` | ${state.geocodeErrors} Geocoding-Fehler` : "");
}

function formatDateRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : null;
  const options = {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  const startText = new Intl.DateTimeFormat("de-DE", options).format(start);
  if (!end) {
    return startText;
  }

  const endText = new Intl.DateTimeFormat("de-DE", options).format(end);
  return `${startText} -> ${endText}`;
}

function cardFor(eventItem, index) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector(".card");
  card.style.animationDelay = `${Math.min(index * 35, 320)}ms`;

  node.querySelector(".title").textContent = eventItem.title || "Paper Event";
  node.querySelector(".type").textContent = eventItem.event_type || "";
  node.querySelector(".date").textContent = formatDateRange(eventItem.start_at, eventItem.end_at);

  const locationBits = [eventItem.location_name, eventItem.location_address, eventItem.location_city].filter(Boolean);
  node.querySelector(".location").textContent = locationBits.join(" | ") || "Kein Ort";

  const distanceEl = node.querySelector(".distance");
  if (state.userLocation && typeof eventItem.distanceKm === "number") {
    distanceEl.textContent = `Entfernung: ${eventItem.distanceKm.toFixed(1)} km`;
  } else {
    distanceEl.textContent = "";
  }

  node.querySelector(".formats").textContent = eventItem.formats?.length
    ? `Formate: ${eventItem.formats.join(", ")}`
    : "Formate: k.A.";

  const link = node.querySelector(".event-link");
  if (eventItem.url) {
    link.href = eventItem.url;
  } else if (eventItem.thread_id && state.serverId) {
    link.href = `https://discord.com/channels/${state.serverId}/${eventItem.thread_id}/${eventItem.thread_id}`;
  } else {
    link.removeAttribute("href");
    link.textContent = "Kein Link verfuegbar";
    link.style.pointerEvents = "none";
    link.style.opacity = "0.65";
  }

  return node;
}

function applyFilters(events) {
  const cityNeedle = cityFilterEl.value.trim().toLowerCase();
  const selectedFormat = formatFilterEl.value.trim().toLowerCase();
  const userLocation = state.userLocation;

  return events.filter((item) => {
    const cityOk = !cityNeedle || (item.location_city || "").toLowerCase().includes(cityNeedle);
    const formats = Array.isArray(item.formats) ? item.formats.map((format) => format.toLowerCase()) : [];
    const formatOk = !selectedFormat || formats.includes(selectedFormat);

    let distanceOk = true;
    if (userLocation) {
      if (typeof item.lat !== "number" || typeof item.lon !== "number") {
        distanceOk = false;
      } else {
        item.distanceKm = haversineKm(userLocation.lat, userLocation.lon, item.lat, item.lon);
        distanceOk = item.distanceKm <= userLocation.maxKm;
      }
    } else {
      item.distanceKm = null;
    }

    return cityOk && formatOk && distanceOk;
  });
}

function render() {
  const filtered = applyFilters(state.events);
  eventsEl.innerHTML = "";

  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.textContent = "Keine Events fuer diese Filterkombination.";
    eventsEl.appendChild(empty);
  } else {
    filtered.forEach((eventItem, i) => eventsEl.appendChild(cardFor(eventItem, i)));
  }

  const generated = state.generatedAt ? new Date(state.generatedAt).toLocaleString("de-DE") : "k.A.";
  const distanceText = state.userLocation
    ? ` | Distanz: <= ${state.userLocation.maxKm} km von ${state.userLocation.query}`
    : "";
  metaEl.textContent = `${filtered.length}/${state.events.length} Events angezeigt${distanceText} | Generiert: ${generated}`;
  renderMap(filtered);
}

async function resolveUserLocation(query) {
  const direct = await geocodeAddress(query);
  if (direct) {
    return direct;
  }
  return geocodeAddress(`${query}, Germany`);
}

async function applyDistanceFilter() {
  const query = distanceLocationEl.value.trim();
  const maxKm = Number(distanceKmEl.value || "0");

  if (!query || !maxKm) {
    state.userLocation = null;
    render();
    return;
  }

  mapMetaEl.textContent = "Resolving your location...";
  try {
    const coords = await resolveUserLocation(query);
    if (!coords) {
      mapMetaEl.textContent = `Ort konnte nicht aufgeloest werden: ${query}`;
      return;
    }

    state.userLocation = {
      query,
      maxKm,
      lat: coords.lat,
      lon: coords.lon,
    };

    map.setView([coords.lat, coords.lon], 8);
    await ensureCoordinates(state.events);
    render();
  } catch (error) {
    mapMetaEl.textContent = `Distanzfilter fehlgeschlagen: ${String(error)}`;
  }
}

function clearDistanceFilter() {
  state.userLocation = null;
  distanceLocationEl.value = "";
  distanceKmEl.value = "0";
  render();
}

async function loadEvents() {
  const response = await fetch("./data/events.json", { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Failed to load events.json (${response.status})`);
  }
  const payload = await response.json();
  state.events = payload.events || [];
  state.generatedAt = payload.generated_at || null;
  state.serverId = payload.server_id || null;
  populateFormatOptions(state.events);
  render();
  mapMetaEl.textContent = "Adressen fuer Kartenmarker werden aufgeloest...";
  await ensureCoordinates(state.events);
  render();
}

cityFilterEl.addEventListener("input", render);
formatFilterEl.addEventListener("input", render);
applyDistanceBtn.addEventListener("click", applyDistanceFilter);
clearDistanceBtn.addEventListener("click", clearDistanceFilter);
distanceLocationEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    applyDistanceFilter();
  }
});

loadEvents().catch((error) => {
  metaEl.textContent = String(error);
});
