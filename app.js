/**
 * ============================================================================
 * AGRIVISION 2.0 — SMART AGRICULTURE TELEMETRY HUB
 * Core Telemetry & Simulation Controller (Continuous Telemetry Engine)
 * Authors: Divyansh Arora & Neerav Kaushik
 * School: DAV Public School, Jyoti Nagar, East of Loni Road
 * ============================================================================
 */

(function () {
  'use strict';

  // --- APPLICATION STATE CONFIGURATION ---
  const state = {
    // Connection & Device Telemetry
    isMonitoring: true,
    roverConnected: true,
    cameraConnected: false,
    soilSensorActive: false, // In NO DATA FOUND state
    audioEnabled: true,

    // Starting Telemetry Readings (Per Section 3 Requirements)
    readings: {
      temperature: 26.5,     // Target starting value: 26.5 °C
      humidity: 58,          // Target starting value: 58 %
      mq2: 312,              // Target starting value: 312 ADC
      mq135: 428,            // Target starting value: 428 ADC
      sonar1: 'NO DATA FOUND',
      sonar2: 'NO DATA FOUND',
      soilMoisture: 'NO DATA FOUND'
    },

    // Simulation Timing Control (Per Section 3 Requirements)
    simClocks: {
      tempLastChanged: Date.now(),
      tempHoldDurationMs: 35000, // 30–40 seconds hold
      humidityLastChanged: Date.now(),
      humidityHoldDurationMs: 30000,
      gasLastDrift: Date.now()
    },

    // Sensor History Buffers for Canvas Sparklines
    history: {
      temperature: [26.5, 26.5, 26.5, 26.5, 26.5, 26.5, 26.5, 26.5, 26.5, 26.5],
      humidity: [58, 58, 58, 58, 58, 58, 58, 58, 58, 58],
      mq2: [312, 312, 312, 312, 312, 312, 312, 312, 312, 312],
      mq135: [428, 428, 428, 428, 428, 428, 428, 428, 428, 428]
    },

    // Network / IoT Target Settings
    config: {
      roverIp: '192.168.4.1',
      cameraUrl: 'http://192.168.4.1:81/stream',
      blynkToken: '',
      blynkPin: 'V1',
      autoReconnect: true
    },

    // Active alert filter ('all', 'hardware', 'simulated')
    alertFilter: 'all',

    // WebRTC / Camera Stream Objects
    webcamMediaStream: null
  };

  // --- AUDIO SYNTHESIZER (WEB AUDIO API) ---
  const soundFX = {
    ctx: null,
    init() {
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      } catch (err) {
        console.warn('Web Audio not supported:', err);
      }
    },
    playTone(frequency, type, duration, gainVal = 0.05) {
      if (!state.audioEnabled) return;
      if (!this.ctx) this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      try {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);
        gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        // Suppress audio policy warnings
      }
    },
    ping() { this.playTone(880, 'sine', 0.1, 0.03); },
    success() {
      this.playTone(523.25, 'triangle', 0.12, 0.04);
      setTimeout(() => this.playTone(659.25, 'triangle', 0.15, 0.04), 100);
      setTimeout(() => this.playTone(783.99, 'triangle', 0.25, 0.05), 200);
    },
    warning() {
      this.playTone(440, 'sawtooth', 0.15, 0.04);
      setTimeout(() => this.playTone(370, 'sawtooth', 0.2, 0.04), 140);
    },
    alert() {
      this.playTone(600, 'square', 0.15, 0.06);
      setTimeout(() => this.playTone(450, 'square', 0.2, 0.06), 160);
    }
  };

  // --- DOM ELEMENT REFERENCES ---
  const els = {
    // Navigation & Status
    globalStatusDot: document.getElementById('globalStatusDot'),
    globalStatusText: document.getElementById('globalStatusText'),
    globalConnPill: document.getElementById('globalConnPill'),
    startMonitoringBtn: document.getElementById('startMonitoringBtn'),
    audioToggleBtn: document.getElementById('audioToggleBtn'),
    audioIconOn: document.getElementById('audioIconOn'),
    audioIconOff: document.getElementById('audioIconOff'),
    settingsBtn: document.getElementById('settingsBtn'),

    // Hero Specs & Engine
    systemStatusLabel: document.getElementById('systemStatusLabel'),
    monitoringDot: document.getElementById('monitoringDot'),
    monitoringStatusLabel: document.getElementById('monitoringStatusLabel'),
    lastHeartbeat: document.getElementById('lastHeartbeat'),
    telemetryStateBadge: document.getElementById('telemetryStateBadge'),
    telemetryModeHeadline: document.getElementById('telemetryModeHeadline'),

    // Section A Readings
    tempValue: document.getElementById('tempValue'),
    humidityValue: document.getElementById('humidityValue'),
    mq2Value: document.getElementById('mq2Value'),
    mq135Value: document.getElementById('mq135Value'),
    tempSparkline: document.getElementById('tempSparkline'),
    humiditySparkline: document.getElementById('humiditySparkline'),
    mq2Sparkline: document.getElementById('mq2Sparkline'),
    mq135Sparkline: document.getElementById('mq135Sparkline'),
    mq2StatusDot: document.getElementById('mq2StatusDot'),
    mq2StatusText: document.getElementById('mq2StatusText'),
    mq135StatusDot: document.getElementById('mq135StatusDot'),
    mq135StatusText: document.getElementById('mq135StatusText'),

    // Section D Camera
    camStatusPill: document.getElementById('camStatusPill'),
    camDot: document.getElementById('camDot'),
    camBadgeText: document.getElementById('camBadgeText'),
    camViewport: document.getElementById('camViewport'),
    cameraStreamImg: document.getElementById('cameraStreamImg'),
    cameraWebcamVideo: document.getElementById('cameraWebcamVideo'),
    camOfflineOverlay: document.getElementById('camOfflineOverlay'),
    connectCameraBtn: document.getElementById('connectCameraBtn'),
    webcamToggleBtn: document.getElementById('webcamToggleBtn'),
    streamUrlDisplay: document.getElementById('streamUrlDisplay'),
    editCamUrlBtn: document.getElementById('editCamUrlBtn'),
    hudClock: document.getElementById('hudClock'),
    hudFpsText: document.getElementById('hudFpsText'),

    // Section E Activity & Alerts
    roverLinkStatusText: document.getElementById('roverLinkStatusText'),
    lastTelemetryClock: document.getElementById('lastTelemetryClock'),
    roverLatencyVal: document.getElementById('roverLatencyVal'),
    alertsStream: document.getElementById('alertsStream'),
    toggleRoverConnBtn: document.getElementById('toggleRoverConnBtn'),
    triggerGasAlertBtn: document.getElementById('triggerGasAlertBtn'),
    triggerClearBtn: document.getElementById('triggerClearBtn'),

    // Modals
    initializationModal: document.getElementById('initializationModal'),
    initProgressFill: document.getElementById('initProgressFill'),
    cancelInitBtn: document.getElementById('cancelInitBtn'),
    enterDashboardBtn: document.getElementById('enterDashboardBtn'),
    step1: document.getElementById('step1'),
    step2: document.getElementById('step2'),
    step3: document.getElementById('step3'),
    step4: document.getElementById('step4'),
    step5: document.getElementById('step5'),

    networkErrorModal: document.getElementById('networkErrorModal'),
    errTargetHost: document.getElementById('errTargetHost'),
    retryConnectionBtn: document.getElementById('retryConnectionBtn'),
    dismissErrorBtn: document.getElementById('dismissErrorBtn'),

    configModal: document.getElementById('configModal'),
    closeConfigBtn: document.getElementById('closeConfigBtn'),
    cancelConfigBtn: document.getElementById('cancelConfigBtn'),
    saveConfigBtn: document.getElementById('saveConfigBtn'),
    configRoverIp: document.getElementById('configRoverIp'),
    configCamUrl: document.getElementById('configCamUrl'),
    configBlynkToken: document.getElementById('configBlynkToken'),
    configBlynkPin: document.getElementById('configBlynkPin'),
    configAutoReconnect: document.getElementById('configAutoReconnect')
  };

  // --- INITIALIZATION ---
  function initDashboard() {
    setupCanvasSparklines();
    bindEvents();
    startSimulationLoop();
    startClockHUD();

    // Initial telemetry alerts
    addAlert('System Initialized', 'AgriVision Continuous Telemetry Hub active. Real-time sensor streaming initiated.', 'success', 'hardware');
    addAlert('Rover Connected', 'Handshake confirmed with ESP32 rover unit on ' + state.config.roverIp, 'info', 'hardware');
    addAlert('Soil Sensor Awaiting Hardware', 'Soil Moisture Telemetry: NO DATA FOUND. Connect capacitive probe to GPIO 34.', 'warning', 'hardware');
    addAlert('Obstacle Sonar Awaiting Telemetry', 'Ultrasonic Detection: NO DATA FOUND. Transducers on Port & Starboard idle.', 'warning', 'hardware');
    addAlert('Camera Stream Unavailable', 'Awaiting stream sync from ESP32-CAM optical interface.', 'warning', 'hardware');
  }

  // --- SECTION 4: SYSTEM STARTUP INITIALIZATION SEQUENCE ---
  let initStepTimeout = null;

  function runStartupSequence() {
    soundFX.ping();
    if (els.initializationModal) els.initializationModal.classList.remove('hidden');
    if (els.initProgressFill) els.initProgressFill.style.width = '0%';
    if (els.enterDashboardBtn) els.enterDashboardBtn.classList.add('hidden');

    const steps = [els.step1, els.step2, els.step3, els.step4, els.step5].filter(Boolean);
    steps.forEach(step => {
      step.className = 'init-step-item pending';
    });

    let currentStep = 0;
    function advanceStep() {
      if (currentStep < steps.length) {
        if (currentStep > 0) {
          steps[currentStep - 1].className = 'init-step-item completed';
        }
        steps[currentStep].className = 'init-step-item active';
        soundFX.ping();

        const progressPercent = Math.round(((currentStep + 1) / steps.length) * 100);
        if (els.initProgressFill) els.initProgressFill.style.width = `${progressPercent}%`;

        currentStep++;
        initStepTimeout = setTimeout(advanceStep, 700);
      } else {
        // Complete sequence
        if (steps.length > 0) steps[steps.length - 1].className = 'init-step-item completed';
        if (els.initProgressFill) els.initProgressFill.style.width = '100%';
        soundFX.success();

        setTimeout(() => {
          closeInitModal();
          state.isMonitoring = true;
          if (els.telemetryStateBadge) els.telemetryStateBadge.textContent = 'LIVE ACTIVE';
          addAlert('System Initialized', 'AgriVision Telemetry Interface ready. Continuous monitoring live.', 'success', 'hardware');
        }, 500);
      }
    }

    advanceStep();
  }

  function closeInitModal() {
    if (initStepTimeout) clearTimeout(initStepTimeout);
    if (els.initializationModal) els.initializationModal.classList.add('hidden');
  }

  // --- NETWORK ERROR MODAL CONTROLS ---
  function showNetworkErrorModal() {
    if (els.errTargetHost) els.errTargetHost.textContent = `${state.config.roverIp} (ESP32 AP)`;
    if (els.networkErrorModal) els.networkErrorModal.classList.remove('hidden');
  }

  function retryRoverConnection() {
    soundFX.ping();
    if (els.retryConnectionBtn) {
      els.retryConnectionBtn.innerHTML = `
        <svg class="spin-anim" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.3"></circle>
          <path d="M12 2a10 10 0 0 1 10 10"></path>
        </svg>
        <span>CHECKING ROVER SIGNAL...</span>
      `;
    }

    setTimeout(() => {
      state.roverConnected = true;
      setRoverConnectionUI(true);
      if (els.networkErrorModal) els.networkErrorModal.classList.add('hidden');
      if (els.retryConnectionBtn) {
        els.retryConnectionBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          <span>RETRY CONNECTION</span>
        `;
      }
      soundFX.success();
      addAlert('Rover Connected', 'Rover communication restored. Wi-Fi signal verified. Resuming live telemetry.', 'success', 'hardware');
    }, 1200);
  }

  // --- REALISTIC READING SIMULATION ENGINE (Per Section 3) ---
  function startSimulationLoop() {
    setInterval(() => {
      if (!state.isMonitoring) return;

      const now = Date.now();
      let updatedAny = false;

      // 1. Temperature: Remain around 26.5°C for approx 30–40 seconds before changing slightly
      if (now - state.simClocks.tempLastChanged >= state.simClocks.tempHoldDurationMs) {
        state.simClocks.tempLastChanged = now;
        // Randomize next hold duration between 30000ms and 40000ms
        state.simClocks.tempHoldDurationMs = 30000 + Math.random() * 10000;

        // Small variation around 26.5°C (delta: -0.2 to +0.2)
        const delta = (Math.floor(Math.random() * 5) - 2) * 0.1;
        let newTemp = 26.5 + delta;
        newTemp = Math.round(newTemp * 10) / 10;
        state.readings.temperature = newTemp;
        if (els.tempValue) els.tempValue.textContent = newTemp.toFixed(1);

        state.history.temperature.push(newTemp);
        if (state.history.temperature.length > 20) state.history.temperature.shift();
        drawSparkline(els.tempSparkline, state.history.temperature, '#10b981');
        updatedAny = true;
      }

      // 2. Humidity: Remain stable and change by around 1% at a time
      if (now - state.simClocks.humidityLastChanged >= state.simClocks.humidityHoldDurationMs) {
        state.simClocks.humidityLastChanged = now;
        state.simClocks.humidityHoldDurationMs = 25000 + Math.random() * 10000;

        // Change by ±1% around 58% (57% - 59%)
        const step = Math.random() < 0.5 ? -1 : 1;
        let newHumidity = state.readings.humidity + step;
        if (newHumidity < 56) newHumidity = 57;
        if (newHumidity > 60) newHumidity = 59;

        state.readings.humidity = newHumidity;
        if (els.humidityValue) els.humidityValue.textContent = newHumidity;

        state.history.humidity.push(newHumidity);
        if (state.history.humidity.length > 20) state.history.humidity.shift();
        drawSparkline(els.humiditySparkline, state.history.humidity, '#38bdf8');
        updatedAny = true;
      }

      // 3. MQ2 and MQ135: Drift gradually rather than jump randomly
      if (now - state.simClocks.gasLastDrift >= 16000) {
        state.simClocks.gasLastDrift = now;

        // MQ2 drift ±1 to ±2 ADC around 312
        const mq2Delta = (Math.random() < 0.5 ? -1 : 1) * Math.floor(Math.random() * 2 + 1);
        let newMq2 = state.readings.mq2 + mq2Delta;
        if (newMq2 < 305) newMq2 = 308;
        if (newMq2 > 322) newMq2 = 318;
        state.readings.mq2 = newMq2;
        if (els.mq2Value) els.mq2Value.textContent = newMq2;

        state.history.mq2.push(newMq2);
        if (state.history.mq2.length > 20) state.history.mq2.shift();
        drawSparkline(els.mq2Sparkline, state.history.mq2, '#f59e0b');

        // MQ135 drift ±1 to ±2 ADC around 428
        const mq135Delta = (Math.random() < 0.5 ? -1 : 1) * Math.floor(Math.random() * 2 + 1);
        let newMq135 = state.readings.mq135 + mq135Delta;
        if (newMq135 < 420) newMq135 = 423;
        if (newMq135 > 438) newMq135 = 432;
        state.readings.mq135 = newMq135;
        if (els.mq135Value) els.mq135Value.textContent = newMq135;

        state.history.mq135.push(newMq135);
        if (state.history.mq135.length > 20) state.history.mq135.shift();
        drawSparkline(els.mq135Sparkline, state.history.mq135, '#a855f7');
        updatedAny = true;
      }

      if (updatedAny) {
        if (els.lastHeartbeat) els.lastHeartbeat.textContent = 'Last ping: Just now';
        updateLastTelemetryClock();
      }
    }, 2000);
  }

  // --- SECTION D: CAMERA STREAM SURVEILLANCE ---
  function connectCameraHardwareStream() {
    soundFX.ping();
    const streamUrl = state.config.cameraUrl;
    if (els.streamUrlDisplay) els.streamUrlDisplay.textContent = streamUrl;

    const testImg = new Image();
    testImg.onload = function () {
      if (els.cameraStreamImg) {
        els.cameraStreamImg.src = streamUrl;
        els.cameraStreamImg.classList.remove('hidden');
      }
      if (els.camOfflineOverlay) els.camOfflineOverlay.classList.add('hidden');
      if (els.camStatusPill) els.camStatusPill.className = 'camera-status-pill online';
      if (els.camDot) els.camDot.className = 'cam-dot online';
      if (els.camBadgeText) els.camBadgeText.textContent = 'LIVE FEED';
      if (els.hudFpsText) els.hudFpsText.textContent = '24.0 FPS';
      state.cameraConnected = true;
      soundFX.success();
      addAlert('Camera Connected', `Active ESP32-CAM MJPEG stream locked on ${streamUrl}`, 'success', 'hardware');
    };

    testImg.onerror = function () {
      disconnectCamera();
      // Keep offline screen visible per explicit requirement:
      // "Camera Offline — Waiting for ESP32-CAM connection."
      addAlert('Camera Stream Unavailable', `Could not reach ${streamUrl}. Please verify ESP32-CAM power and Wi-Fi link.`, 'warning', 'hardware');
    };

    testImg.src = `${streamUrl}?t=${Date.now()}`;
  }

  function disconnectCamera() {
    state.cameraConnected = false;
    if (els.cameraStreamImg) {
      els.cameraStreamImg.src = '';
      els.cameraStreamImg.classList.add('hidden');
    }
    stopWebcamStream();
    if (els.camOfflineOverlay) els.camOfflineOverlay.classList.remove('hidden');
    if (els.camStatusPill) els.camStatusPill.className = 'camera-status-pill';
    if (els.camDot) els.camDot.className = 'cam-dot offline';
    if (els.camBadgeText) els.camBadgeText.textContent = 'OFFLINE';
    if (els.hudFpsText) els.hudFpsText.textContent = '0.0 FPS';
  }

  function toggleWebcamStream() {
    if (state.webcamMediaStream) {
      stopWebcamStream();
      disconnectCamera();
    } else {
      soundFX.ping();
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
        .then(stream => {
          state.webcamMediaStream = stream;
          if (els.cameraWebcamVideo) {
            els.cameraWebcamVideo.srcObject = stream;
            els.cameraWebcamVideo.classList.remove('hidden');
          }
          if (els.camOfflineOverlay) els.camOfflineOverlay.classList.add('hidden');
          if (els.camStatusPill) els.camStatusPill.className = 'camera-status-pill online';
          if (els.camDot) els.camDot.className = 'cam-dot online';
          if (els.camBadgeText) els.camBadgeText.textContent = 'WEBCAM HARDWARE';
          if (els.hudFpsText) els.hudFpsText.textContent = '30.0 FPS';
          state.cameraConnected = true;
          soundFX.success();
          addAlert('Camera Connected', 'Hardware video feed locked via local optical camera stream.', 'success', 'hardware');
        })
        .catch(err => {
          disconnectCamera();
          addAlert('Camera Stream Unavailable', 'Webcam access denied or unavailable: ' + err.message, 'warning', 'hardware');
        });
    }
  }

  function stopWebcamStream() {
    if (state.webcamMediaStream) {
      state.webcamMediaStream.getTracks().forEach(track => track.stop());
      state.webcamMediaStream = null;
      if (els.cameraWebcamVideo) {
        els.cameraWebcamVideo.srcObject = null;
        els.cameraWebcamVideo.classList.add('hidden');
      }
    }
  }

  // --- SECTION E: ALERTS & NOTIFICATIONS LOG ---
  function addAlert(title, message, type = 'info', category = 'hardware') {
    if (!els.alertsStream) return;
    const alertId = 'alert-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    const timeStr = getLocalTimeString();

    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'warning') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    } else if (type === 'error') {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    } else {
      iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    const card = document.createElement('div');
    card.id = alertId;
    card.className = `alert-card type-${type} category-${category}`;
    card.dataset.category = category;

    // Simulated sensor alerts strictly labeled as SIMULATED ALERT
    const simBadge = (category === 'simulated')
      ? `<span class="sim-alert-pill">SIMULATED ALERT</span>`
      : '';

    card.innerHTML = `
      <div class="alert-left-content">
        <div class="alert-icon-box">${iconSvg}</div>
        <div class="alert-body-text">
          <div class="alert-title-row">
            <span class="alert-title">${escapeHTML(title)}</span>
            ${simBadge}
          </div>
          <span class="alert-message">${escapeHTML(message)}</span>
        </div>
      </div>
      <span class="alert-time">${timeStr}</span>
    `;

    // Apply active filter
    if (state.alertFilter !== 'all' && state.alertFilter !== category) {
      card.classList.add('hidden');
    }

    els.alertsStream.prepend(card);

    while (els.alertsStream.children.length > 35) {
      els.alertsStream.removeChild(els.alertsStream.lastChild);
    }
  }

  function filterAlerts(category) {
    state.alertFilter = category;
    if (!els.alertsStream) return;
    const cards = els.alertsStream.querySelectorAll('.alert-card');
    cards.forEach(c => {
      if (category === 'all' || c.dataset.category === category) {
        c.classList.remove('hidden');
      } else {
        c.classList.add('hidden');
      }
    });
  }

  // --- ROVER CONNECTION CONTROLS ---
  function setRoverConnectionUI(isConnected) {
    state.roverConnected = isConnected;

    if (isConnected) {
      if (els.globalStatusDot) els.globalStatusDot.className = 'status-dot connected';
      if (els.globalStatusText) els.globalStatusText.textContent = 'ROVER CONNECTED';
      if (els.globalConnPill) els.globalConnPill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      if (els.monitoringDot) els.monitoringDot.style.background = '#10b981';
      if (els.monitoringStatusLabel) els.monitoringStatusLabel.textContent = 'Active';
      if (els.roverLinkStatusText) {
        els.roverLinkStatusText.textContent = 'ONLINE';
        els.roverLinkStatusText.className = 'summary-val connected';
      }
      if (els.telemetryStateBadge) els.telemetryStateBadge.textContent = 'LIVE ACTIVE';
      if (els.toggleRoverConnBtn) els.toggleRoverConnBtn.textContent = 'Simulate Rover Disconnect';
      if (els.roverLatencyVal) els.roverLatencyVal.textContent = '18 ms';
    } else {
      if (els.globalStatusDot) els.globalStatusDot.className = 'status-dot disconnected';
      if (els.globalStatusText) els.globalStatusText.textContent = 'ROVER DISCONNECTED';
      if (els.globalConnPill) els.globalConnPill.style.borderColor = 'rgba(239, 68, 68, 0.4)';
      if (els.monitoringDot) els.monitoringDot.style.background = '#ef4444';
      if (els.monitoringStatusLabel) els.monitoringStatusLabel.textContent = 'Disconnected';
      if (els.roverLinkStatusText) {
        els.roverLinkStatusText.textContent = 'OFFLINE';
        els.roverLinkStatusText.className = 'summary-val highlight-red';
      }
      if (els.telemetryStateBadge) els.telemetryStateBadge.textContent = 'DISCONNECTED';
      if (els.toggleRoverConnBtn) els.toggleRoverConnBtn.textContent = 'Reconnect Rover Link';
      if (els.roverLatencyVal) els.roverLatencyVal.textContent = 'TIMEOUT';
    }
  }

  function toggleRoverConnection() {
    soundFX.warning();
    if (state.roverConnected) {
      setRoverConnectionUI(false);
      showNetworkErrorModal();
      addAlert('Network Disconnected', 'AgriVision cannot communicate with the rover. Move the rover closer to Wi-Fi hotspot.', 'error', 'hardware');
    } else {
      setRoverConnectionUI(true);
      soundFX.success();
      addAlert('Rover Connected', 'ESP32 Wi-Fi link re-established on ' + state.config.roverIp, 'success', 'hardware');
    }
  }

  // --- CANVAS SPARKLINE CHARTS ---
  function setupCanvasSparklines() {
    drawSparkline(els.tempSparkline, state.history.temperature, '#10b981');
    drawSparkline(els.humiditySparkline, state.history.humidity, '#38bdf8');
    drawSparkline(els.mq2Sparkline, state.history.mq2, '#f59e0b');
    drawSparkline(els.mq135Sparkline, state.history.mq135, '#a855f7');
  }

  function drawSparkline(canvas, dataPoints, strokeColor) {
    if (!canvas || !canvas.getContext) return;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (dataPoints.length < 2) return;

    let min = Math.min(...dataPoints);
    let max = Math.max(...dataPoints);
    if (min === max) {
      min -= 1;
      max += 1;
    }

    const padding = 4;
    const effH = height - padding * 2;
    const stepX = (width - padding * 2) / (dataPoints.length - 1);

    ctx.beginPath();
    dataPoints.forEach((val, i) => {
      const x = padding + i * stepX;
      const normalized = (val - min) / (max - min);
      const y = height - padding - (normalized * effH);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    ctx.lineTo(width - padding, height);
    ctx.lineTo(padding, height);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, strokeColor + '33');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // --- HUD CLOCK & TELEMETRY TIMESTAMPS ---
  function startClockHUD() {
    setInterval(() => {
      const timeStr = getLocalTimeString();
      if (els.hudClock) els.hudClock.textContent = timeStr;
    }, 1000);
  }

  function updateLastTelemetryClock() {
    if (els.lastTelemetryClock) {
      els.lastTelemetryClock.textContent = getLocalTimeString();
    }
  }

  function getLocalTimeString() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // --- EVENT LISTENERS BINDING ---
  function bindEvents() {
    if (els.startMonitoringBtn) els.startMonitoringBtn.addEventListener('click', runStartupSequence);

    if (els.audioToggleBtn) {
      els.audioToggleBtn.addEventListener('click', () => {
        state.audioEnabled = !state.audioEnabled;
        if (state.audioEnabled) {
          if (els.audioIconOn) els.audioIconOn.classList.remove('hidden');
          if (els.audioIconOff) els.audioIconOff.classList.add('hidden');
          soundFX.ping();
        } else {
          if (els.audioIconOn) els.audioIconOn.classList.add('hidden');
          if (els.audioIconOff) els.audioIconOff.classList.remove('hidden');
        }
      });
    }

    if (els.settingsBtn) {
      els.settingsBtn.addEventListener('click', () => {
        soundFX.ping();
        if (els.configRoverIp) els.configRoverIp.value = state.config.roverIp;
        if (els.configCamUrl) els.configCamUrl.value = state.config.cameraUrl;
        if (els.configBlynkToken) els.configBlynkToken.value = state.config.blynkToken;
        if (els.configBlynkPin) els.configBlynkPin.value = state.config.blynkPin;
        if (els.configAutoReconnect) els.configAutoReconnect.checked = state.config.autoReconnect;
        if (els.configModal) els.configModal.classList.remove('hidden');
      });
    }

    // Camera actions
    if (els.connectCameraBtn) els.connectCameraBtn.addEventListener('click', connectCameraHardwareStream);
    if (els.webcamToggleBtn) els.webcamToggleBtn.addEventListener('click', toggleWebcamStream);
    if (els.editCamUrlBtn) {
      els.editCamUrlBtn.addEventListener('click', () => {
        if (els.settingsBtn) els.settingsBtn.click();
      });
    }

    // Alert filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        filterAlerts(e.target.dataset.filter);
        soundFX.ping();
      });
    });

    // Interactive Field Triggers
    if (els.toggleRoverConnBtn) els.toggleRoverConnBtn.addEventListener('click', toggleRoverConnection);

    if (els.triggerGasAlertBtn) {
      els.triggerGasAlertBtn.addEventListener('click', () => {
        soundFX.warning();
        state.readings.mq2 = 485;
        if (els.mq2Value) els.mq2Value.textContent = 485;
        if (els.mq2StatusText) els.mq2StatusText.textContent = 'Combustible Hydrocarbon Alert';
        if (els.mq2StatusDot) els.mq2StatusDot.style.background = '#f59e0b';
        addAlert('Elevated Combustible Gas Level', 'MQ2 sensor detected atmospheric fluctuation (485 ADC). Simulated field threshold warning triggered.', 'warning', 'simulated');
        setTimeout(() => {
          state.readings.mq2 = 312;
          if (els.mq2Value) els.mq2Value.textContent = 312;
          if (els.mq2StatusText) els.mq2StatusText.textContent = 'Baseline Levels (Safe)';
          if (els.mq2StatusDot) els.mq2StatusDot.style.background = '#10b981';
        }, 7000);
      });
    }

    if (els.triggerClearBtn) {
      els.triggerClearBtn.addEventListener('click', () => {
        if (els.alertsStream) els.alertsStream.innerHTML = '';
        soundFX.ping();
      });
    }

    // Modal controls
    if (els.cancelInitBtn) els.cancelInitBtn.addEventListener('click', closeInitModal);
    if (els.enterDashboardBtn) els.enterDashboardBtn.addEventListener('click', closeInitModal);

    if (els.retryConnectionBtn) els.retryConnectionBtn.addEventListener('click', retryRoverConnection);
    if (els.dismissErrorBtn) {
      els.dismissErrorBtn.addEventListener('click', () => {
        if (els.networkErrorModal) els.networkErrorModal.classList.add('hidden');
      });
    }

    if (els.closeConfigBtn) els.closeConfigBtn.addEventListener('click', () => els.configModal && els.configModal.classList.add('hidden'));
    if (els.cancelConfigBtn) els.cancelConfigBtn.addEventListener('click', () => els.configModal && els.configModal.classList.add('hidden'));

    if (els.saveConfigBtn) {
      els.saveConfigBtn.addEventListener('click', () => {
        state.config.roverIp = (els.configRoverIp && els.configRoverIp.value.trim()) || '192.168.4.1';
        state.config.cameraUrl = (els.configCamUrl && els.configCamUrl.value.trim()) || 'http://192.168.4.1:81/stream';
        state.config.blynkToken = (els.configBlynkToken && els.configBlynkToken.value.trim()) || '';
        state.config.blynkPin = (els.configBlynkPin && els.configBlynkPin.value.trim()) || 'V1';
        state.config.autoReconnect = els.configAutoReconnect ? els.configAutoReconnect.checked : true;

        if (els.streamUrlDisplay) els.streamUrlDisplay.textContent = state.config.cameraUrl;
        if (els.configModal) els.configModal.classList.add('hidden');
        soundFX.success();
        addAlert('Configuration Saved', `Rover target updated to ${state.config.roverIp}. Camera stream configured.`, 'success', 'hardware');
      });
    }
  }

  // --- DOM READY BOOTSTRAP ---
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

})();
