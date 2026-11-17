/**
 * ============================================================================
 * AGRIVISION 2.0 — 3D ROVER MODEL CONTROLLER
 * Authors: Divyansh Arora & Neerav Kaushik (DAV Public School, Jyoti Nagar)
 * ============================================================================
 */

(function () {
  'use strict';

  // Subsystem descriptions database for interactive inspector
  const subsystemData = {
    all: {
      title: 'AgriVision 4WD Autonomous Field Unit',
      desc: 'The complete AgriVision agricultural robotics platform, integrating autonomous mobility, environmental monitoring, optical crop inspection, and subsurface soil moisture analysis.',
      specs: [
        { label: 'Platform:', val: '4WD Rocker-Bogie Off-Road Chassis' },
        { label: 'Ground Clearance:', val: '65 mm (Obstacle Capable)' },
        { label: 'Operating Voltage:', val: '11.1V – 12.6V DC' },
        { label: 'Communication:', val: 'ESP32 Wi-Fi / Blynk Cloud' }
      ]
    },
    chassis: {
      title: 'Chassis, Suspension & DC Geared Motors',
      desc: 'Constructed from lightweight, corrosion-proof acrylic and ABS mounts. Powered by four independent 12V high-torque DC geared motors with high-grip rubber tractor tread wheels for traversing wet soil and furrows.',
      specs: [
        { label: 'Motors:', val: '4× 12V High-Torque Geared Motors' },
        { label: 'Driver IC:', val: 'L298N Dual H-Bridge (2A Peak)' },
        { label: 'Wheel Spec:', val: '85mm Deep-Tread Agricultural Rubber' },
        { label: 'Steering:', val: 'Differential Skid-Steer (Zero Radius)' }
      ]
    },
    esp32: {
      title: 'ESP32 Dual-Core Microcontroller Unit',
      desc: 'The master telemetry brain of the rover. Runs freeRTOS tasks managing sensor acquisition, motor control PWM signals, Wi-Fi telemetry streaming to Blynk IoT, and autonomous obstacle avoidance algorithms.',
      specs: [
        { label: 'Processor:', val: 'Xtensa Dual-Core 32-bit LX6 @ 240MHz' },
        { label: 'Memory:', val: '520 KB SRAM + 4 MB SPI Flash' },
        { label: 'Wireless:', val: 'Wi-Fi 802.11 b/g/n & Bluetooth 4.2' },
        { label: 'Operating Pin:', val: '3.3V Logic Level with 5V Power' }
      ]
    },
    camera: {
      title: 'ESP32-CAM Optical Vision & Surveillance Mast',
      desc: 'Elevated 140mm optical mast featuring an OV2640 2-Megapixel image sensor. Broadcasts real-time MJPEG visual feed on port 81 for live crop foliage disease inspection and navigation surveillance.',
      specs: [
        { label: 'Camera Sensor:', val: 'OmniVision OV2640 (UXGA 1600x1200)' },
        { label: 'Stream Format:', val: 'MJPEG over HTTP TCP Port 81' },
        { label: 'Mast Height:', val: '140mm above chassis deck' },
        { label: 'Frame Rate:', val: 'Up to 25 FPS (QVGA/VGA)' }
      ]
    },
    sonar: {
      title: 'Dual HC-SR04 Ultrasonic Rangefinders',
      desc: 'Mounted on the forward bumper at 30-degree complementary angles (Port and Starboard). Emits 40 kHz ultrasonic pulses to detect crop stalks, irrigation ridges, and obstacles from 2cm to 400cm.',
      specs: [
        { label: 'Transducer Freq:', val: '40 kHz Ultrasound' },
        { label: 'Detection Range:', val: '2 cm – 400 cm' },
        { label: 'Port Pins:', val: 'Trigger: GPIO 5 • Echo: GPIO 18' },
        { label: 'Starboard Pins:', val: 'Trigger: GPIO 19 • Echo: GPIO 21' }
      ]
    },
    soil: {
      title: 'Subsurface Capacitive Soil Moisture Probe',
      desc: 'Corrosion-resistant capacitive moisture probe lowered from the rear chassis. Measures dielectric permittivity of the surrounding soil to determine volumetric water content (VWC) directly at crop roots.',
      specs: [
        { label: 'Sensor Type:', val: 'Capacitive Soil Moisture v1.2' },
        { label: 'ADC Channel:', val: 'ESP32 GPIO 34 (ADC1 Channel 6)' },
        { label: 'Output Range:', val: '0 – 4095 Raw ADC (Calibrated %)' },
        { label: 'Corrosion Shield:', val: 'Epoxy Coated Copper Traces' }
      ]
    },
    solar: {
      title: 'Auxiliary Monocrystalline Solar Panel & 3S Battery',
      desc: 'Roof-mounted 6V 2W monocrystalline solar cell linked via a schottky protection diode and TP4056/BMS controller to trickle-charge the 3S 18650 Li-ion battery pack during daylight field operations.',
      specs: [
        { label: 'Battery Chemistry:', val: '3S 18650 Lithium-Ion (11.1V)' },
        { label: 'Total Capacity:', val: '2600 mAh (28.8 Wh)' },
        { label: 'Regulator:', val: 'LM2596 High-Efficiency Step-Down Buck' },
        { label: 'Solar Output:', val: '6V 330mA Monocrystalline Panel' }
      ]
    }
  };

  let scene, camera, renderer, controls, roverGroup;
  let isAutoRotate = true;
  let isWireframe = false;
  const partsMap = {};

  const container = document.getElementById('canvas3dContainer');
  const canvas = document.getElementById('rover3dCanvas');

  function init3D() {
    if (typeof THREE === 'undefined') {
      console.warn('Three.js CDN not reachable, initializing 2.5D Canvas fallback.');
      initCanvasFallback();
      return;
    }

    try {
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;

      // 1. Scene & Camera
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060d0a);
      scene.fog = new THREE.FogExp2(0x060d0a, 0.0018);

      camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
      camera.position.set(220, 160, 260);

      // 2. Renderer
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      // 3. OrbitControls
      if (typeof THREE.OrbitControls !== 'undefined') {
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't flip below ground
        controls.minDistance = 80;
        controls.maxDistance = 600;
        controls.target.set(0, 30, 0);
      }

      // 4. Lights
      setupLighting();

      // 5. Build Procedural 3D Rover
      buildRoverModel();

      // 6. Ground & Tech Grid
      buildGroundGrid();

      // 7. Event listeners
      window.addEventListener('resize', onWindowResize);
      setupUIInteractions();

      // 8. Animation Loop
      animate();
    } catch (err) {
      console.error('WebGL Initialization error:', err);
      initCanvasFallback();
    }
  }

  function setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);

    // Primary Sun Light
    const sunLight = new THREE.DirectionalLight(0xffffff, 0.85);
    sunLight.position.set(150, 250, 150);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // Tech Emerald Rim Light
    const emeraldRim = new THREE.DirectionalLight(0x10b981, 0.9);
    emeraldRim.position.set(-150, 80, -150);
    scene.add(emeraldRim);

    // Soft Cyan Undercarriage Light
    const cyanUnder = new THREE.PointLight(0x06b6d4, 1.2, 120);
    cyanUnder.position.set(0, 10, 0);
    scene.add(cyanUnder);
  }

  function buildRoverModel() {
    roverGroup = new THREE.Group();
    scene.add(roverGroup);

    // Materials
    const chassisMat = new THREE.MeshStandardMaterial({
      color: 0x0f241a,
      roughness: 0.35,
      metalness: 0.65
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937,
      roughness: 0.4,
      metalness: 0.8
    });

    const emeraldAccentMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0x064e3b,
      emissiveIntensity: 0.25
    });

    const rubberMat = new THREE.MeshStandardMaterial({
      color: 0x111827,
      roughness: 0.85,
      metalness: 0.1
    });

    // --- A. CHASSIS & FRAME ---
    const chassisGroup = new THREE.Group();
    partsMap.chassis = chassisGroup;
    roverGroup.add(chassisGroup);

    // Lower Main Deck
    const deckGeo = new THREE.BoxGeometry(110, 12, 150);
    const mainDeck = new THREE.Mesh(deckGeo, chassisMat);
    mainDeck.position.set(0, 32, 0);
    mainDeck.castShadow = true;
    mainDeck.receiveShadow = true;
    chassisGroup.add(mainDeck);

    // Deck Trim Ribbons
    const trimGeo = new THREE.BoxGeometry(112, 3, 152);
    const trimMesh = new THREE.Mesh(trimGeo, emeraldAccentMat);
    trimMesh.position.set(0, 38, 0);
    chassisGroup.add(trimMesh);

    // 4 Wheels & Axles
    const wheelPositions = [
      { x: -64, y: 26, z: 52 },   // Front Left
      { x: 64, y: 26, z: 52 },    // Front Right
      { x: -64, y: 26, z: -52 },  // Rear Left
      { x: 64, y: 26, z: -52 }    // Rear Right
    ];

    const wheelGeo = new THREE.CylinderGeometry(26, 26, 18, 24);
    wheelGeo.rotateZ(Math.PI / 2);

    const rimGeo = new THREE.CylinderGeometry(14, 14, 19, 16);
    rimGeo.rotateZ(Math.PI / 2);

    wheelPositions.forEach(pos => {
      // Tire
      const tire = new THREE.Mesh(wheelGeo, rubberMat);
      tire.position.set(pos.x, pos.y, pos.z);
      tire.castShadow = true;
      chassisGroup.add(tire);

      // Rim
      const rim = new THREE.Mesh(rimGeo, emeraldAccentMat);
      rim.position.set(pos.x, pos.y, pos.z);
      chassisGroup.add(rim);

      // Suspension strut
      const strutGeo = new THREE.CylinderGeometry(3, 3, 20, 8);
      const strut = new THREE.Mesh(strutGeo, darkMetalMat);
      strut.position.set(pos.x * 0.7, pos.y + 4, pos.z);
      strut.rotation.z = pos.x > 0 ? 0.3 : -0.3;
      chassisGroup.add(strut);
    });

    // --- B. ESP32 CENTRAL CONTROLLER ---
    const esp32Group = new THREE.Group();
    partsMap.esp32 = esp32Group;
    roverGroup.add(esp32Group);

    // ESP32 PCB
    const pcbGeo = new THREE.BoxGeometry(32, 4, 52);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, roughness: 0.3 });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.set(0, 40, -10);
    esp32Group.add(pcb);

    // ESP32 Metal Shield (WROOM-32)
    const shieldGeo = new THREE.BoxGeometry(18, 4, 18);
    const shieldMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.2 });
    const shield = new THREE.Mesh(shieldGeo, shieldMat);
    shield.position.set(0, 44, -14);
    esp32Group.add(shield);

    // Glowing ESP32 LED indicator
    const ledGeo = new THREE.SphereGeometry(1.5, 8, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x34d399 });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(8, 43, 6);
    esp32Group.add(led);

    // --- C. ESP32-CAM OPTICAL MAST ---
    const cameraGroup = new THREE.Group();
    partsMap.camera = cameraGroup;
    roverGroup.add(cameraGroup);

    // Mast Vertical Pole
    const mastPoleGeo = new THREE.CylinderGeometry(3.5, 4, 75, 12);
    const mastPole = new THREE.Mesh(mastPoleGeo, darkMetalMat);
    mastPole.position.set(0, 75, 25);
    mastPole.castShadow = true;
    cameraGroup.add(mastPole);

    // Camera Housing Box
    const camBoxGeo = new THREE.BoxGeometry(28, 22, 14);
    const camBox = new THREE.Mesh(camBoxGeo, chassisMat);
    camBox.position.set(0, 114, 25);
    camBox.castShadow = true;
    cameraGroup.add(camBox);

    // Camera OV2640 Lens
    const lensGeo = new THREE.CylinderGeometry(5.5, 6.5, 8, 16);
    lensGeo.rotateX(Math.PI / 2);
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.position.set(0, 114, 33);
    cameraGroup.add(lens);

    // Camera status ring (glowing red recording indicator)
    const ringGeo = new THREE.RingGeometry(6.6, 7.5, 16);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 114, 37.1);
    cameraGroup.add(ring);

    // --- D. DUAL HC-SR04 ULTRASONIC RANGEFINDERS ---
    const sonarGroup = new THREE.Group();
    partsMap.sonar = sonarGroup;
    roverGroup.add(sonarGroup);

    // Front Bumper Mount
    const bumperGeo = new THREE.BoxGeometry(90, 8, 10);
    const bumper = new THREE.Mesh(bumperGeo, chassisMat);
    bumper.position.set(0, 32, 78);
    sonarGroup.add(bumper);

    // Port Ultrasonic Sensor (Transducer Pair)
    createSonarPair(sonarGroup, -26, 32, 83);
    // Starboard Ultrasonic Sensor (Transducer Pair)
    createSonarPair(sonarGroup, 26, 32, 83);

    // --- E. SUBSURFACE SOIL MOISTURE PROBE ---
    const soilGroup = new THREE.Group();
    partsMap.soil = soilGroup;
    roverGroup.add(soilGroup);

    // Probe Arm extending down behind rear chassis
    const probeArmGeo = new THREE.CylinderGeometry(2.5, 2.5, 45, 8);
    const probeArm = new THREE.Mesh(probeArmGeo, darkMetalMat);
    probeArm.position.set(0, 20, -78);
    probeArm.rotation.x = 0.25;
    soilGroup.add(probeArm);

    // Capacitive Sensing Prongs (Entering ground zone)
    const prongGeo = new THREE.BoxGeometry(16, 28, 2);
    const prongMat = new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.3, metalness: 0.5 });
    const prong = new THREE.Mesh(prongGeo, prongMat);
    prong.position.set(0, -2, -84);
    soilGroup.add(prong);

    // --- F. SOLAR ARRAY & 3S BATTERY PACK ---
    const solarGroup = new THREE.Group();
    partsMap.solar = solarGroup;
    roverGroup.add(solarGroup);

    // Top Solar Panel Frame
    const solarFrameGeo = new THREE.BoxGeometry(86, 3, 76);
    const solarFrame = new THREE.Mesh(solarFrameGeo, chassisMat);
    solarFrame.position.set(0, 52, -26);
    solarGroup.add(solarFrame);

    // Monocrystalline Dark Blue PV Cells
    const pvCellGeo = new THREE.BoxGeometry(82, 1, 72);
    const pvCellMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      metalness: 0.85,
      roughness: 0.2
    });
    const pvCells = new THREE.Mesh(pvCellGeo, pvCellMat);
    pvCells.position.set(0, 54, -26);
    solarGroup.add(pvCells);

    // Grid lines on solar panel
    const gridLinesGeo = new THREE.BoxGeometry(82.5, 1.2, 1.5);
    const gridLinesMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    for (let gz = -50; gz <= -2; gz += 16) {
      const line = new THREE.Mesh(gridLinesGeo, gridLinesMat);
      line.position.set(0, 54.2, gz);
      solarGroup.add(line);
    }
  }

  function createSonarPair(parentGroup, x, y, z) {
    const pcbGeo = new THREE.BoxGeometry(34, 16, 2.5);
    const pcbMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a });
    const pcb = new THREE.Mesh(pcbGeo, pcbMat);
    pcb.position.set(x, y, z);
    parentGroup.add(pcb);

    const transGeo = new THREE.CylinderGeometry(6, 6, 9, 16);
    transGeo.rotateX(Math.PI / 2);
    const transMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });

    const trans1 = new THREE.Mesh(transGeo, transMat);
    trans1.position.set(x - 9, y, z + 5);
    parentGroup.add(trans1);

    const trans2 = new THREE.Mesh(transGeo, transMat);
    trans2.position.set(x + 9, y, z + 5);
    parentGroup.add(trans2);
  }

  function buildGroundGrid() {
    // High-tech circular agriculture platform
    const floorGeo = new THREE.CylinderGeometry(180, 180, 4, 48);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a1410,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.set(0, -2, 0);
    floor.receiveShadow = true;
    scene.add(floor);

    // Concentric Neon Rings
    const ring1Geo = new THREE.RingGeometry(175, 178, 48);
    ring1Geo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide });
    const ring1 = new THREE.Mesh(ring1Geo, ringMat);
    ring1.position.set(0, 0.2, 0);
    scene.add(ring1);

    // Subtle Grid Helper
    const grid = new THREE.GridHelper(360, 24, 0x10b981, 0x064e3b);
    grid.position.set(0, 0.1, 0);
    scene.add(grid);
  }

  function onWindowResize() {
    if (!renderer || !camera || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  function setupUIInteractions() {
    const btnResetView = document.getElementById('btnResetView');
    const btnToggleRotate = document.getElementById('btnToggleRotate');
    const btnToggleWireframe = document.getElementById('btnToggleWireframe');
    const chips = document.querySelectorAll('.subsystem-chip');
    const sensorRows = document.querySelectorAll('.sensor-node-row');

    if (btnResetView) {
      btnResetView.addEventListener('click', () => {
        if (controls) {
          controls.reset();
          camera.position.set(220, 160, 260);
          controls.target.set(0, 30, 0);
        }
      });
    }

    if (btnToggleRotate) {
      btnToggleRotate.addEventListener('click', () => {
        isAutoRotate = !isAutoRotate;
        btnToggleRotate.textContent = `Auto-Rotate: ${isAutoRotate ? 'ON' : 'OFF'}`;
        btnToggleRotate.classList.toggle('active', isAutoRotate);
      });
    }

    if (btnToggleWireframe) {
      btnToggleWireframe.addEventListener('click', () => {
        isWireframe = !isWireframe;
        btnToggleWireframe.classList.toggle('active', isWireframe);
        scene.traverse(obj => {
          if (obj.isMesh && obj.material) {
            obj.material.wireframe = isWireframe;
          }
        });
      });
    }

    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        highlightSubsystem(chip.dataset.part);
      });
    });

    sensorRows.forEach(row => {
      row.addEventListener('click', () => {
        const part = row.dataset.part;
        chips.forEach(c => {
          if (c.dataset.part === part) c.click();
        });
      });
    });
  }

  function highlightSubsystem(partKey) {
    const data = subsystemData[partKey] || subsystemData.all;
    const titleEl = document.getElementById('inspectorPartTitle');
    const descEl = document.getElementById('inspectorPartDesc');
    const specsEl = document.getElementById('inspectorPartSpecs');

    if (titleEl) titleEl.textContent = data.title;
    if (descEl) descEl.textContent = data.desc;
    if (specsEl) {
      specsEl.innerHTML = data.specs
        .map(s => `<div class="attr-row"><span>${s.label}</span> <strong>${s.val}</strong></div>`)
        .join('');
    }

    // Highlight 3D part meshes
    Object.keys(partsMap).forEach(key => {
      const group = partsMap[key];
      if (!group) return;

      if (partKey === 'all' || partKey === key) {
        group.traverse(obj => {
          if (obj.isMesh && obj.material) {
            obj.material.opacity = 1.0;
            obj.material.transparent = false;
          }
        });
      } else {
        group.traverse(obj => {
          if (obj.isMesh && obj.material) {
            obj.material.opacity = 0.28;
            obj.material.transparent = true;
          }
        });
      }
    });
  }

  function animate() {
    requestAnimationFrame(animate);

    if (isAutoRotate && roverGroup) {
      roverGroup.rotation.y += 0.005;
    }

    if (controls) {
      controls.update();
    }

    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
  }

  // --- 2.5D CANVAS FALLBACK (WHEN OFFLINE) ---
  function initCanvasFallback() {
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    let width = (canvas.width = container.clientWidth || 800);
    let height = (canvas.height = container.clientHeight || 500);

    let angle = 0.5;
    let isDragging = false;
    let startX = 0;

    canvas.addEventListener('mousedown', e => {
      isDragging = true;
      startX = e.clientX;
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      startX = e.clientX;
      angle += dx * 0.01;
    });

    function drawFallback() {
      ctx.fillStyle = '#060d0a';
      ctx.fillRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2 + 20;

      // Platform
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 90, 160, 40, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Rover Base Box (Rotated)
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);

      // Chassis
      ctx.fillStyle = '#0f241a';
      ctx.strokeStyle = '#34d399';
      ctx.fillRect(-70, -40, 140, 80);
      ctx.strokeRect(-70, -40, 140, 80);

      // Wheels
      ctx.fillStyle = '#1f2937';
      ctx.fillRect(-85, -50, 18, 30);
      ctx.fillRect(67, -50, 18, 30);
      ctx.fillRect(-85, 20, 18, 30);
      ctx.fillRect(67, 20, 18, 30);

      // ESP32 Central Brain
      ctx.fillStyle = '#065f46';
      ctx.fillRect(-25, -20, 50, 40);
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(15, 10, 3, 0, Math.PI * 2);
      ctx.fill();

      // Camera Mast
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(0, 30, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();

      if (isAutoRotate) angle += 0.008;
      requestAnimationFrame(drawFallback);
    }

    drawFallback();
  }

  // Bootstrap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init3D);
  } else {
    init3D();
  }
})();
