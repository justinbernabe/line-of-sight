const state = {
  current: null,
  target: null,
  sensorHeading: null,
  sensorAbsolute: false,
  gpsHeading: null,
  manualHeading: 0,
  watchId: null,
  lastPosition: null,
  lastOrientationEventAt: 0,
  orientationListening: false,
};

const ui = {
  enableSensorsBtn: document.getElementById("enableSensorsBtn"),
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

function formatCoordinates({ lat, lon, accuracy }) {
  if (!Number.isFinite(accuracy)) {
    return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  }
  return `${lat.toFixed(6)}, ${lon.toFixed(6)} (+/- ${Math.round(accuracy)} m)`;
}

function setStatus(message, tone = "info") {
  ui.statusLine.textContent = message;
  ui.statusLine.dataset.tone = tone;
}

function getActiveHeading() {
  if (state.sensorHeading !== null && state.sensorAbsolute) {
    return { value: state.sensorHeading, source: "motion sensor (true north)" };
  }
  if (state.gpsHeading !== null) {
    return { value: state.gpsHeading, source: "gps course" };
  }
  if (state.sensorHeading !== null) {
    return { value: state.sensorHeading, source: "motion sensor (relative)" };
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
    ui.guidanceText.textContent = "Enable sensors and set a destination.";
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
    ui.guidanceText.textContent = "Straight ahead.";
  } else if (relative < 0) {
    ui.guidanceText.textContent = `Turn left ${Math.round(Math.abs(relative))}deg`;
  } else {
    ui.guidanceText.textContent = `Turn right ${Math.round(relative)}deg`;
  }
}

function updateGpsHeadingFromPosition(nextPosition, coords) {
  let headingUpdated = false;

  if (Number.isFinite(coords.heading) && coords.heading >= 0) {
    const speed = Number(coords.speed);
    if (!Number.isFinite(speed) || speed > 0.5) {
      state.gpsHeading = smoothAngle(state.gpsHeading, coords.heading, 0.36);
      headingUpdated = true;
    }
  }

  if (!headingUpdated && state.lastPosition) {
    const movedMeters = calculateDistanceMeters(
      state.lastPosition.lat,
      state.lastPosition.lon,
      nextPosition.lat,
      nextPosition.lon,
    );

    if (movedMeters >= 4) {
      const movementBearing = calculateBearing(
        state.lastPosition.lat,
        state.lastPosition.lon,
        nextPosition.lat,
        nextPosition.lon,
      );
      state.gpsHeading = smoothAngle(state.gpsHeading, movementBearing, 0.34);
    }
  }
}

function onLocationSuccess(position) {
  const lat = position.coords.latitude;
  const lon = position.coords.longitude;
  const accuracy = position.coords.accuracy;
  const next = { lat, lon, accuracy };

  updateGpsHeadingFromPosition(next, position.coords);

  state.lastPosition = next;
  state.current = next;
  ui.positionText.textContent = formatCoordinates(next);
  updateCompass();
}

function onLocationError(error) {
  const codeMessage = {
    1: "permission denied",
    2: "position unavailable",
    3: "request timed out",
  };
  const fallback = error && typeof error.message === "string" ? error.message : "Location access failed.";
  const reason = codeMessage[error && error.code] || fallback;
  setStatus(`Location issue: ${reason}`, "error");
}

function getCurrentPositionPromise(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function startLocationWatch() {
  if (!("geolocation" in navigator)) {
    return false;
  }

  if (state.watchId !== null) {
    navigator.geolocation.clearWatch(state.watchId);
  }

  state.watchId = navigator.geolocation.watchPosition(onLocationSuccess, onLocationError, {
    enableHighAccuracy: true,
    timeout: 20000,
    maximumAge: 1000,
  });
  return true;
}

async function enableGeolocation() {
  if (!("geolocation" in navigator)) {
    setStatus("This browser has no geolocation API.", "error");
    return false;
  }

  try {
    setStatus("Requesting precise GPS permission...", "info");
    const initialPosition = await getCurrentPositionPromise({
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 0,
    });
    onLocationSuccess(initialPosition);
    startLocationWatch();
    return true;
  } catch (error) {
    onLocationError(error);
    return false;
  }
}

function getScreenOrientationAngle() {
  if (screen.orientation && Number.isFinite(screen.orientation.angle)) {
    return screen.orientation.angle;
  }
  if (typeof window.orientation === "number") {
    return window.orientation;
  }
  return 0;
}

function getHeadingFromOrientationEvent(event) {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return {
      heading: normalizeDegrees(event.webkitCompassHeading),
      absolute: true,
    };
  }

  if (Number.isFinite(event.alpha)) {
    return {
      heading: normalizeDegrees(360 - event.alpha + getScreenOrientationAngle()),
      absolute: event.absolute === true,
    };
  }

  return null;
}

function handleOrientation(event) {
  const reading = getHeadingFromOrientationEvent(event);
  if (!reading) {
    return;
  }

  state.sensorHeading = smoothAngle(state.sensorHeading, reading.heading, 0.3);
  state.sensorAbsolute = reading.absolute;
  state.lastOrientationEventAt = Date.now();
  updateCompass();
}

function ensureOrientationListeners() {
  if (state.orientationListening) {
    return;
  }
  window.addEventListener("deviceorientationabsolute", handleOrientation, true);
  window.addEventListener("deviceorientation", handleOrientation, true);
  state.orientationListening = true;
}

async function requestMotionPermissionsIfNeeded() {
  if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
    const motionResult = await DeviceMotionEvent.requestPermission();
    if (motionResult !== "granted") {
      return false;
    }
  }

  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    const orientationResult = await DeviceOrientationEvent.requestPermission();
    if (orientationResult !== "granted") {
      return false;
    }
  }

  return true;
}

async function enableOrientation() {
  if (!("DeviceOrientationEvent" in window)) {
    setStatus("Motion sensor API unavailable. GPS heading will be used while moving.", "warn");
    return false;
  }

  try {
    const permissionGranted = await requestMotionPermissionsIfNeeded();
    if (!permissionGranted) {
      setStatus("Motion permission was denied.", "error");
      return false;
    }

    ensureOrientationListeners();

    setTimeout(() => {
      if (Date.now() - state.lastOrientationEventAt > 2500) {
        setStatus(
          "Motion allowed but no heading events yet. On iPhone, enable Safari Motion & Orientation Access.",
          "warn",
        );
      }
    }, 2800);

    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not enable motion sensor.";
    setStatus(message, "error");
    return false;
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

async function handleEnableSensorsClick() {
  ui.enableSensorsBtn.disabled = true;
  ui.enableSensorsBtn.textContent = "Requesting permissions...";

  const geoEnabled = await enableGeolocation();
  const motionEnabled = await enableOrientation();

  if (geoEnabled && motionEnabled) {
    setStatus("GPS and motion active. Enter an address and point.", "ok");
  } else if (geoEnabled) {
    setStatus("GPS active. Motion unavailable; heading updates when you move.", "warn");
  } else if (motionEnabled) {
    setStatus("Motion active, but location denied. Enable location to navigate.", "warn");
  } else {
    setStatus("Sensors were not enabled. Check browser permissions and retry.", "error");
  }

  ui.enableSensorsBtn.disabled = false;
  ui.enableSensorsBtn.textContent = "Re-check Sensors";
}

async function handleAddressSubmit(event) {
  event.preventDefault();
  const address = ui.addressInput.value.trim();
  if (!address) {
    setStatus("Enter an address first.", "error");
    return;
  }

  setStatus("Geocoding destination...", "info");

  try {
    const result = await geocodeAddress(address);
    state.target = result;
    ui.targetText.textContent = `${result.label} (${result.lat.toFixed(5)}, ${result.lon.toFixed(5)})`;

    if (!state.current) {
      setStatus("Destination set. Enable GPS so compass can point from your location.", "warn");
    } else {
      setStatus("Destination locked.", "ok");
    }

    updateCompass();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to geocode address.";
    setStatus(message, "error");
  }
}

function handleManualHeadingInput() {
  state.manualHeading = normalizeDegrees(Number(ui.manualHeading.value));
  ui.manualHeadingValue.textContent = `${Math.round(state.manualHeading)}deg`;
  updateCompass();
}

function init() {
  ui.enableSensorsBtn.addEventListener("click", handleEnableSensorsClick);
  ui.addressForm.addEventListener("submit", handleAddressSubmit);
  ui.manualHeading.addEventListener("input", handleManualHeadingInput);
  updateCompass();
}

init();
