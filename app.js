
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const els = {
    distance: $('distance'), duration: $('duration'), speed: $('speed'), steps: $('steps'),
    startBtn: $('startBtn'), pauseBtn: $('pauseBtn'), stopBtn: $('stopBtn'),
    gpsStatus: $('gpsStatus'), gpsDot: $('gpsDot'), accuracyText: $('accuracyText'),
    lat: $('lat'), lng: $('lng'), alt: $('alt'), points: $('points'),
    history: $('history'), clearHistoryBtn: $('clearHistoryBtn'),
    sensorBtn: $('sensorBtn'), sensorSteps: $('sensorSteps'), installBtn: $('installBtn'),
    mapFallback: $('mapFallback')
  };

  const STRIDE_M = 0.75;
  const MAX_ACCURACY_M = 45;
  const MAX_SPEED_MPS = 12;
  const MIN_MOVING_SPEED_MPS = 0.3 / 3.6; // 0.3 km/h
  const MIN_MOVE_M = 2.5;

  let watchId = null;
  let isTracking = false;
  let isPaused = false;
  let startedAt = null;
  let pauseStartedAt = null;
  let pausedMs = 0;
  let totalDistanceM = 0;
  let lastAccepted = null;
  let acceptedPoints = [];
  let timerId = null;
  let currentSpeedMps = 0;
  let map, marker, polyline;
  let deferredPrompt = null;

  let sensorActive = false;
  let sensorStepCount = 0;
  let lastPeakAt = 0;
  let gravityZ = 0;
  let lastMagnitude = 0;

  function initMap() {
    try {
      if (!window.L) throw new Error('Leaflet no disponible');
      map = L.map('map', { zoomControl: true }).setView([-12.07, -75.21], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);
      polyline = L.polyline([], { weight: 5 }).addTo(map);
    } catch (e) {
      els.mapFallback.hidden = false;
      console.warn(e);
    }
  }

  function haversine(a, b) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.sqrt(s));
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2,'0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2,'0');
    const sec = String(s % 60).padStart(2,'0');
    return `${h}:${m}:${sec}`;
  }

  function elapsedMs() {
    if (!startedAt) return 0;
    const end = isPaused && pauseStartedAt ? pauseStartedAt : Date.now();
    return end - startedAt - pausedMs;
  }

  function renderStats() {
    els.distance.textContent = `${(totalDistanceM / 1000).toFixed(2)} km`;
    els.duration.textContent = fmtTime(elapsedMs());
    els.speed.textContent = `${(currentSpeedMps * 3.6).toFixed(1)} km/h`;
    els.steps.textContent = Math.round(totalDistanceM / STRIDE_M).toLocaleString('es-PE');
    els.points.textContent = acceptedPoints.length.toLocaleString('es-PE');
  }

  function setGpsState(text, mode='idle') {
    els.gpsStatus.textContent = text;
    els.gpsDot.className = 'dot' + (mode === 'live' ? ' live' : mode === 'bad' ? ' bad' : '');
  }

  function updateMap(point) {
    if (!map) return;
    const latlng = [point.lat, point.lng];
    if (!marker) {
      marker = L.circleMarker(latlng, {
        radius: 9, weight: 4, fillOpacity: 1
      }).addTo(map);
      map.setView(latlng, 17);
    } else {
      marker.setLatLng(latlng);
    }
    if (polyline && acceptedPoints.length) {
      polyline.setLatLngs(acceptedPoints.map(p => [p.lat, p.lng]));
    }
    if (isTracking && !isPaused) {
      map.panTo(latlng, { animate: true, duration: .5 });
    }
  }

  function onPosition(pos) {
    const c = pos.coords;
    const point = {
      lat: c.latitude,
      lng: c.longitude,
      accuracy: c.accuracy ?? 999,
      altitude: c.altitude,
      speed: c.speed,
      ts: pos.timestamp || Date.now()
    };

    els.lat.textContent = point.lat.toFixed(6);
    els.lng.textContent = point.lng.toFixed(6);
    els.alt.textContent = Number.isFinite(point.altitude) ? `${point.altitude.toFixed(1)} m` : '—';
    els.accuracyText.textContent = `Precisión: ${Math.round(point.accuracy)} m`;
    setGpsState(point.accuracy <= MAX_ACCURACY_M ? 'GPS activo' : 'GPS con baja precisión', point.accuracy <= MAX_ACCURACY_M ? 'live' : 'idle');
    updateMap(point);

    if (!isTracking || isPaused) return;
    if (point.accuracy > MAX_ACCURACY_M) return;

    if (!lastAccepted) {
      lastAccepted = point;
      acceptedPoints.push(point);
      renderStats();
      return;
    }

    const dt = Math.max(0.001, (point.ts - lastAccepted.ts) / 1000);
    const d = haversine(lastAccepted, point);
    const computedSpeed = d / dt;
    const reliableSpeed = Number.isFinite(point.speed) && point.speed >= 0 ? point.speed : computedSpeed;

    if (reliableSpeed < MIN_MOVING_SPEED_MPS) {
      // Por debajo de 0.3 km/h consideramos que el usuario está quieto.
      currentSpeedMps = 0;
      lastAccepted = point;
      renderStats();
    } else if (d >= MIN_MOVE_M && reliableSpeed <= MAX_SPEED_MPS) {
      totalDistanceM += d;
      currentSpeedMps = reliableSpeed;
      lastAccepted = point;
      acceptedPoints.push(point);
      updateMap(point);
      renderStats();
    } else if (d < MIN_MOVE_M) {
      currentSpeedMps = 0;
      lastAccepted = point;
      renderStats();
    }
  }

  function onPositionError(err) {
    let msg = 'Error de GPS';
    if (err.code === 1) msg = 'Permiso de ubicación denegado';
    if (err.code === 2) msg = 'Ubicación no disponible';
    if (err.code === 3) msg = 'GPS tardó demasiado';
    setGpsState(msg, 'bad');
    console.warn(err);
  }

  function ensureWatch() {
    if (!('geolocation' in navigator)) {
      setGpsState('Este dispositivo no ofrece geolocalización', 'bad');
      return false;
    }
    if (watchId == null) {
      watchId = navigator.geolocation.watchPosition(onPosition, onPositionError, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000
      });
    }
    return true;
  }

  function startTracking() {
    if (!ensureWatch()) return;
    isTracking = true;
    isPaused = false;
    startedAt = Date.now();
    pauseStartedAt = null;
    pausedMs = 0;
    totalDistanceM = 0;
    lastAccepted = null;
    acceptedPoints = [];
    currentSpeedMps = 0;
    if (polyline) polyline.setLatLngs([]);
    els.startBtn.disabled = true;
    els.pauseBtn.disabled = false;
    els.stopBtn.disabled = false;
    els.pauseBtn.textContent = 'Pausar';
    timerId = setInterval(renderStats, 1000);
    renderStats();
  }

  function togglePause() {
    if (!isTracking) return;
    if (!isPaused) {
      isPaused = true;
      pauseStartedAt = Date.now();
      currentSpeedMps = 0;
      els.pauseBtn.textContent = 'Continuar';
    } else {
      isPaused = false;
      pausedMs += Date.now() - pauseStartedAt;
      pauseStartedAt = null;
      lastAccepted = null;
      els.pauseBtn.textContent = 'Pausar';
    }
    renderStats();
  }

  function stopTracking() {
    if (!isTracking) return;
    if (isPaused && pauseStartedAt) {
      pausedMs += Date.now() - pauseStartedAt;
      pauseStartedAt = null;
    }
    const record = {
      id: Date.now(),
      date: new Date().toISOString(),
      distanceM: totalDistanceM,
      durationMs: elapsedMs(),
      stepsApprox: Math.round(totalDistanceM / STRIDE_M),
      sensorSteps: sensorStepCount,
      points: acceptedPoints.length
    };
    saveRecord(record);
    isTracking = false;
    isPaused = false;
    currentSpeedMps = 0;
    lastAccepted = null;
    clearInterval(timerId);
    timerId = null;
    els.startBtn.disabled = false;
    els.pauseBtn.disabled = true;
    els.stopBtn.disabled = true;
    els.pauseBtn.textContent = 'Pausar';
    renderStats();
    renderHistory();
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem('camilo_walk_history') || '[]'); }
    catch { return []; }
  }

  function saveRecord(record) {
    const arr = loadHistory();
    arr.unshift(record);
    localStorage.setItem('camilo_walk_history', JSON.stringify(arr.slice(0, 50)));
  }

  function renderHistory() {
    const arr = loadHistory();
    if (!arr.length) {
      els.history.className = 'history-empty';
      els.history.textContent = 'Todavía no hay recorridos guardados.';
      return;
    }
    els.history.className = '';
    els.history.innerHTML = arr.map(r => {
      const d = new Date(r.date);
      const date = d.toLocaleString('es-PE', { dateStyle:'medium', timeStyle:'short' });
      return `<div class="history-item">
        <div>
          <strong>${(r.distanceM/1000).toFixed(2)} km · ${Number(r.stepsApprox).toLocaleString('es-PE')} pasos</strong>
          <div class="meta">${date}</div>
        </div>
        <div style="text-align:right">
          <strong>${fmtTime(r.durationMs)}</strong>
          <div class="meta">${r.points} puntos GPS</div>
        </div>
      </div>`;
    }).join('');
  }

  async function enableSensors() {
    try {
      if (typeof DeviceMotionEvent === 'undefined') {
        alert('Este navegador no expone el sensor de movimiento.');
        return;
      }
      if (typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') throw new Error('Permiso de movimiento denegado');
      }
      if (!sensorActive) {
        window.addEventListener('devicemotion', onMotion);
        sensorActive = true;
        els.sensorBtn.textContent = 'Activo';
        els.sensorBtn.disabled = true;
      }
    } catch (e) {
      alert('No se pudo activar el sensor de movimiento: ' + e.message);
    }
  }

  function onMotion(ev) {
    const a = ev.accelerationIncludingGravity || ev.acceleration;
    if (!a) return;
    const x = a.x || 0, y = a.y || 0, z = a.z || 0;
    const mag = Math.sqrt(x*x + y*y + z*z);
    gravityZ = gravityZ * 0.9 + mag * 0.1;
    const dynamic = Math.abs(mag - gravityZ);
    const now = performance.now();

    // Detector deliberadamente conservador para evitar muchos falsos positivos.
    if (dynamic > 1.35 && lastMagnitude <= 1.35 && now - lastPeakAt > 320) {
      sensorStepCount++;
      els.sensorSteps.textContent = sensorStepCount.toLocaleString('es-PE');
      lastPeakAt = now;
    }
    lastMagnitude = dynamic;
  }

  els.startBtn.addEventListener('click', startTracking);
  els.pauseBtn.addEventListener('click', togglePause);
  els.stopBtn.addEventListener('click', stopTracking);
  els.sensorBtn.addEventListener('click', enableSensors);
  els.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('¿Borrar el historial guardado en este dispositivo?')) {
      localStorage.removeItem('camilo_walk_history');
      renderHistory();
    }
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    els.installBtn.hidden = false;
  });

  els.installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    els.installBtn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    els.installBtn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(console.warn);
    });
  }

  initMap();
  renderHistory();
  renderStats();
  ensureWatch();
})();
