const state = {
  current: null,
  target: null,
  sensorHeading: null,
  movementHeading: null,
  manualHeading: 0,
  watchId: null,
  lastPosition: null,
};

const ui = {
  startLocationBtn: document.getElementById("startLocationBtn"),
  enableCompassBtn: document.getElementById("enableCompassBtn"),
  addressForm: document.getElementById("addressForm"),
  addressInput: document.getElementById("addressInput"),
  manualHeading: document.getElementById("manualHeading"),
  manualHeadingValue: document.getElementById("manualHeadingValue"),
  statusLine: document.getElementById("statusLine"),
  positionText: document.getElementById("positionText"),
  targetText: document.getElementById("targetText"),
  distanceText: document.getElementById("distanceText"),
  headingSourceText: document.getElementById("headingSourceText"),
  guidanceText: document.getElementById("guidanceText"),
  compassRose: document.getElementById("compassRose"),
  targetNeedle: document.getElementById("targetNeedle"),
};

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function smoothAngle(previous, next, factor = 0.25) {
  if (previous === null) {
    return normalizeDegrees(next);
  }
  const delta = ((next - previous + 540) % 360) - 180;
  return normalizeDegrees(previous + delta * factor);
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians) {
  return (radians * 180) / Math.PI;
}

function calculateBearing(fromLat, fromLon, toLat, toLon) {
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const dLon = toRadians(toLon - fromLon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function calculateDistanceMeters(fromLat, fromLon, toLat, toLon) {
  const earthRadius = 6371000;
  const lat1 = toRadians(fromLat);
  const lat2 = toRadians(toLat);
  const dLat = lat2 - lat1;
  const dLon = toRadians(toLon - fromLon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) {
    return "--";
  }
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatCoordinates({ lat, lon }) {
  return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
}

function setStatus(message, isError = false) {
  ui.statusLine.textContent = message;
  ui.statusLine.style.color = isError ? "#ffb1a9" : "#ffd990";
}

function getActiveHeading() {
  if (state.sensorHeading !== null) {
    return { value: state.sensorHeading, source: "device sensor" };
  }
  if (state.movementHeading !== null) {
    return { value: state.movementHeading, source: "gps movement" };
  }
  return { value: state.manualHeading, source: "manual slider" };
}

function updateCompass() {
  const activeHeading = getActiveHeading();
  const heading = activeHeading.value;
  ui.headingSourceText.textContent = `${activeHeading.source} (${Math.round(heading)}deg)`;
  ui.compassRose.style.transform = `rotate(${-heading}deg)`;

  if (!state.current || !state.target) {
    ui.targetNeedle.classList.add("hidden");
    ui.distanceText.textContent = "--";
    ui.guidanceText.textContent = "Set a target address.";
    return;
  }

  const bearingToTarget = calculateBearing(
    state.current.lat,
    state.current.lon,
    state.target.lat,
    state.target.lon,
  );
  const distanceMeters = calculateDistanceMeters(
    state.current.lat,
    state.current.lon,
    state.target.lat,
    state.target.lon,
  );
  const relative = ((bearingToTarget - heading + 540) % 360) - 180;
  ui.targetNeedle.classList.remove("hidden");
  ui.targetNeedle.style.transform = `rotate(${relative}deg)`;
  ui.distanceText.textContent = formatDistance(distanceMeters);

  if (Math.abs(relative) <= 6) {
    ui.guidanceText.textContent = `Ahead. Keep moving forward.`;
  } else if (relative < 0) {
    ui.guidanceText.textContent = `Turn left ${Math.round(Math.abs(relative))}deg`;
  } else {
    ui.guidanceText.textContent = `Turn right ${Math.round(relative)}deg`;
  }
}

function onLocationSuccess(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const next = { lat, lon };

  if (state.lastPosition) {
    const movedMeters = calculateDistanceMeters(
      state.lastPosition.lat,
      state.lastPosition.lon,
      next.lat,
      next.lon,
    );
    if (movedMeters >= 3) {
      const movementBearing = calculateBearing(
        state.lastPosition.lat,
        state.lastPosition.lon,
        next.lat,
        next.lon,
      );
      state.movementHeading = smoothAngle(state.movementHeading, movementBearing, 0.35);
    }
  }

  state.lastPosition = next;
  state.current = next;
  ui.positionText.textContent = formatCoordinates(next);
  updateCompass();
}

function onLocationError(error) {
  const message =
    error && typeof error.message === "string" ? error.message : "Location access failed.";
  setStatus(`Location error: ${message}`, true);
}

function startLocationTracking() {
  if (!("geolocation" in navigator)) {
    setStatus("This browser does not support geolocation.", true);
    return;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  setStatus("Requesting live GPS location...");
  state.watchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 1000,
  });
}

function getHeadingFromEvent(event) {
  if (typeof event.webkitCompassHeading === "number") {
    return normalizeDegrees(event.webkitCompassHeading);
  }
  if (event.absolute === true && typeof event.alpha === "number") {
    return normalizeDegrees(360 - event.alpha);
  }
  if (typeof event.alpha === "number") {
    return normalizeDegrees(360 - event.alpha);
  }
  return null;
}

function handleOrientation(event) {
  const incoming = getHeadingFromEvent(event);
  if (incoming === null) {
    return;
  }
  state.sensorHeading = smoothAngle(state.sensorHeading, incoming, 0.32);
  updateCompass();
}

async function enableOrientation() {
  if (!("DeviceOrientationEvent" in window)) {
    setStatus("This browser has no orientation sensor API.", true);
    return;
  }

  try {
    const maybePermission = DeviceOrientationEvent.requestPermission;
    if (typeof maybePermission === "function") {
      const result = await maybePermission.call(DeviceOrientationEvent);
      if (result !== "granted") {
        setStatus("Compass sensor permission denied.", true);
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", handleOrientation, true);
    window.addEventListener("deviceorientation", handleOrientation, true);
    setStatus("Compass sensor enabled.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not enable compass sensor.";
    setStatus(message, true);
  }
}

async function geocodeAddress(address) {
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");
  endpoint.searchParams.set("q", address);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("limit", "1");
  endpoint.searchParams.set("addressdetails", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Geocoder failed (${response.status})`);
  }
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("No match found for that address.");
  }

  const top = data[0];
  const lat = Number(top.lat);
  const lon = Number(top.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Geocoder returned invalid coordinates.");
  }

  return { lat, lon, label: top.display_name || address };
}

async function handleAddressSubmit(event) {
  event.preventDefault();
  const address = ui.addressInput.value.trim();
  if (!address) {
    setStatus("Enter an address first.", true);
    return;
  }

  setStatus("Geocoding address...");
  try {
    const result = await geocodeAddress(address);
    state.target = result;
    ui.targetText.textContent = `${result.label} (${result.lat.toFixed(5)}, ${result.lon.toFixed(5)})`;
    setStatus("Target locked. Compass now points to destination.");
    updateCompass();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to geocode address.";
    setStatus(message, true);
  }
}

function handleManualHeadingInput() {
  state.manualHeading = normalizeDegrees(Number(ui.manualHeading.value));
  ui.manualHeadingValue.textContent = `${Math.round(state.manualHeading)}deg`;
  updateCompass();
}

function init() {
  ui.startLocationBtn.addEventListener("click", startLocationTracking);
  ui.enableCompassBtn.addEventListener("click", enableOrientation);
  ui.addressForm.addEventListener("submit", handleAddressSubmit);
  ui.manualHeading.addEventListener("input", handleManualHeadingInput);
  updateCompass();
}

init();
