/**
 * PVT&T FACTORY - SUPERVISOR MACHINE QR CODE SCANNER
 * --------------------------------------------------
 * Module: /js/dashboard/qr-machine-scanner.js
 * Enables supervisors to quickly scan machine QR codes via the browser's camera
 * and instantly open the machine's maintenance & performance modal.
 */

(function () {
  'use strict';

  let html5Qr = null;
  let isScanning = false;
  let availableCameras = [];
  let currentCameraIndex = 0;
  let isTorchOn = false;
  let torchSupported = false;

  /* =========================================================
     AUDIO & HAPTIC FEEDBACK (Web Audio API Synth)
  ========================================================= */
  function playScanSuccessBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Dual-tone chime (A5 to E6)
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.1);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.16);
    } catch (_) {
      // Audio context not allowed or unsupported - ignore silently
    }

    // Haptic vibration on mobile devices
    if (navigator.vibrate) {
      try {
        navigator.vibrate([70, 40, 70]);
      } catch (_) {}
    }
  }

  /* =========================================================
     QR CODE PAYLOAD PARSING
     Handles URLs, query parameters, JSON, and raw machine codes
  ========================================================= */
  function parseMachineQrPayload(rawText) {
    if (!rawText) return null;
    const str = String(rawText).trim();
    let machine = '';
    let dept = '';

    // 1. Try URL parsing (absolute or relative)
    try {
      let urlObj = null;
      if (str.startsWith('http://') || str.startsWith('https://')) {
        urlObj = new URL(str);
      } else if (str.startsWith('/') || (str.includes('?') && !str.includes(' '))) {
        urlObj = new URL(str, window.location.origin);
      }

      if (urlObj && urlObj.searchParams) {
        machine =
          urlObj.searchParams.get('machine') ||
          urlObj.searchParams.get('machine_no') ||
          urlObj.searchParams.get('machineNo') ||
          urlObj.searchParams.get('mc') ||
          urlObj.searchParams.get('m') ||
          '';
        dept =
          urlObj.searchParams.get('dept') ||
          urlObj.searchParams.get('dept_code') ||
          urlObj.searchParams.get('department') ||
          '';

        if (machine) {
          return { machine: machine.trim(), dept: dept.trim() };
        }
      }
    } catch (_) {
      // Not a valid URL, proceed to next pattern
    }

    // 2. Try JSON payload: e.g. {"machine": "F1", "dept": "BLOW"}
    if (str.startsWith('{') && str.endsWith('}')) {
      try {
        const obj = JSON.parse(str);
        machine =
          obj.machine ||
          obj.machine_no ||
          obj.machineNo ||
          obj.code ||
          obj.id ||
          '';
        dept = obj.dept || obj.department || obj.dept_code || '';
        if (machine) {
          return { machine: String(machine).trim(), dept: String(dept).trim() };
        }
      } catch (_) {}
    }

    // 3. Key-value string: e.g. "machine=F1&dept=blow" or "MACHINE: F1"
    const mcMatch = str.match(/(?:machine|machine_no|mc|m\/c|id)\s*[:=]\s*([a-zA-Z0-9_\-\.]+)/i);
    if (mcMatch && mcMatch[1]) {
      machine = mcMatch[1].trim();
      const deptMatch = str.match(/(?:dept|department|dept_code)\s*[:=]\s*([a-zA-Z0-9_\-\.]+)/i);
      if (deptMatch && deptMatch[1]) dept = deptMatch[1].trim();
      return { machine, dept };
    }

    // 4. Clean plain alphanumeric identifier (e.g. "F1", "PIPE-01", "CR-01", "BLOW-02")
    const cleanStr = str.replace(/^[#\s]+/, '').trim();
    if (cleanStr.length > 0 && cleanStr.length <= 40) {
      return { machine: cleanStr, dept: '' };
    }

    return { machine: str, dept: '' };
  }

  /* =========================================================
     CAMERA LIFECYCLE & SCANNING
  ========================================================= */
  async function startQrScanner() {
    const streamContainer = document.getElementById('qr-camera-stream');
    if (!streamContainer) return;

    updateScanStatus('กำลังเปิดกล้องถ่ายภาพ...', 'info');

    // Ensure Html5Qrcode is loaded
    if (typeof Html5Qrcode === 'undefined') {
      updateScanStatus('กำลังดาวน์โหลดไลบรารีสแกนเนอร์...', 'info');
      await loadHtml5QrcodeLibrary();
      if (typeof Html5Qrcode === 'undefined') {
        updateScanStatus('ไม่สามารถโหลดไลบรารีสแกนเนอร์ได้ กรุณาอัปโหลดรูปภาพแทน', 'error');
        return;
      }
    }

    try {
      if (!html5Qr) {
        html5Qr = new Html5Qrcode('qr-camera-stream', {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
        });
      }

      // Query available cameras to see if camera switching is possible
      try {
        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length > 0) {
          availableCameras = devices;
          const flipBtn = document.getElementById('btn-toggle-camera-facing');
          if (flipBtn) {
            flipBtn.style.display = devices.length > 1 ? 'inline-flex' : 'none';
          }
        }
      } catch (_) {}

      // Configuration for scanning
      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const edgeSize = Math.max(180, Math.floor(minEdge * 0.72));
          return { width: edgeSize, height: edgeSize };
        },
        aspectRatio: 1.0,
      };

      // Try starting with environment (back) camera first
      let cameraSpec = { facingMode: 'environment' };
      if (availableCameras.length > 0 && availableCameras[currentCameraIndex]) {
        cameraSpec = availableCameras[currentCameraIndex].id;
      }

      await html5Qr.start(
        cameraSpec,
        config,
        onScanSuccess,
        onScanProgress
      );

      isScanning = true;
      updateScanStatus('เล็งกล้องไปที่ QR Code ติดข้างเครื่องจักร', 'active');
      checkTorchSupport();

    } catch (err) {
      console.warn('[QR Scanner] Camera start failed with primary constraints:', err);
      // Fallback attempt: try starting with any default camera
      try {
        await html5Qr.start(
          { facingMode: 'user' },
          { fps: 12, qrbox: { width: 220, height: 220 } },
          onScanSuccess,
          onScanProgress
        );
        isScanning = true;
        updateScanStatus('เล็งกล้องไปที่ QR Code ประจำเครื่อง', 'active');
        checkTorchSupport();
      } catch (fallbackErr) {
        console.error('[QR Scanner] Camera start error:', fallbackErr);
        handleCameraError(fallbackErr);
      }
    }
  }

  function onScanProgress() {
    // Continuous scan tick - camera is actively examining frames
  }

  async function onScanSuccess(decodedText) {
    if (!isScanning) return;
    isScanning = false;

    // Visual & audio feedback
    playScanSuccessBeep();

    const targetBox = document.querySelector('.qr-target-box');
    if (targetBox) {
      targetBox.classList.add('scan-success-flash');
    }

    const parsed = parseMachineQrPayload(decodedText);
    const machineName = parsed ? parsed.machine : String(decodedText).trim();
    const deptCode = parsed ? parsed.dept : '';

    updateScanStatus(`ตรวจพบรหัสเครื่อง: ${machineName}`, 'success');

    // Cleanly stop camera
    try {
      if (html5Qr) {
        await html5Qr.stop();
        html5Qr.clear();
      }
    } catch (err) {
      console.warn('[QR Scanner] Error stopping camera:', err);
    }

    // Brief timeout so user sees the success state
    setTimeout(() => {
      closeQrScanModal();
      dispatchOpenMachineModal(machineName, deptCode);
    }, 280);
  }

  async function stopQrScanner() {
    isScanning = false;
    isTorchOn = false;
    torchSupported = false;

    const torchBtn = document.getElementById('btn-toggle-camera-torch');
    if (torchBtn) {
      torchBtn.style.display = 'none';
      torchBtn.classList.remove('active');
    }

    if (html5Qr) {
      try {
        await html5Qr.stop();
        html5Qr.clear();
      } catch (err) {
        // May already be stopped
      }
    }

    const targetBox = document.querySelector('.qr-target-box');
    if (targetBox) {
      targetBox.classList.remove('scan-success-flash');
    }
  }

  function handleCameraError(err) {
    isScanning = false;
    const msg = (err && (err.message || err.name)) ? String(err.message || err.name) : 'ไม่ทราบสาเหตุ';

    let userFriendlyMsg = 'ไม่สามารถเข้าถึงกล้องได้ กรุณาอนุญาตสิทธิ์การใช้กล้อง หรือเลือกอัปโหลดรูปภาพ';
    if (msg.includes('NotAllowedError') || msg.includes('Permission')) {
      userFriendlyMsg = 'เบราว์เซอร์ปฏิเสธสิทธิ์การเข้าถึงกล้อง กรุณาแตะที่ไอคอนแม่กุญแจบนแถบ URL เพื่ออนุญาตสิทธิ์การใช้กล้อง';
    } else if (msg.includes('NotFoundError') || msg.includes('DevicesNotFoundError')) {
      userFriendlyMsg = 'ไม่พบอุปกรณ์กล้องถ่ายภาพบนอุปกรณ์นี้ ท่านสามารถเลือกรูปภาพ QR หรือพิมพ์รหัสเครื่องด้านล่างได้ค่ะ';
    } else if (msg.includes('NotReadableError') || msg.includes('TrackStartError')) {
      userFriendlyMsg = 'กล้องกำลังถูกใช้งานโดยแอปพลิเคชันอื่น กรุณาปิดแอปอื่นแล้วลองใหม่';
    }

    updateScanStatus(userFriendlyMsg, 'error');

    // Auto-focus manual machine selector so user can easily proceed
    const manualSelect = document.getElementById('qr-quick-machine-select');
    if (manualSelect) {
      setTimeout(() => manualSelect.focus(), 300);
    }
  }

  function updateScanStatus(text, type) {
    const pill = document.getElementById('qr-scan-status');
    const label = document.getElementById('qr-scan-status-text');
    if (!pill || !label) return;

    label.textContent = text;
    pill.className = `qr-scan-status-pill status-${type}`;
  }

  /* =========================================================
     CAMERA CONTROLS (Torch, Switch Camera, File Scan)
  ========================================================= */
  async function toggleCameraFacing() {
    if (availableCameras.length <= 1) return;

    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    await stopQrScanner();
    await startQrScanner();
  }

  async function checkTorchSupport() {
    const torchBtn = document.getElementById('btn-toggle-camera-torch');
    if (!torchBtn || !html5Qr) return;

    try {
      const capabilities = html5Qr.getRunningTrackCapabilities();
      if (capabilities && capabilities.torch) {
        torchSupported = true;
        torchBtn.style.display = 'inline-flex';
        torchBtn.innerHTML = `
          <span class="material-symbols-outlined">${isTorchOn ? 'flashlight_off' : 'flashlight_on'}</span>
          <span>${isTorchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}</span>
        `;
      } else {
        torchSupported = false;
        torchBtn.style.display = 'none';
      }
    } catch (_) {
      torchSupported = false;
      torchBtn.style.display = 'none';
    }
  }

  async function toggleTorch() {
    if (!html5Qr || !torchSupported) return;

    try {
      isTorchOn = !isTorchOn;
      await html5Qr.applyVideoConstraints({
        advanced: [{ torch: isTorchOn }],
      });

      const torchBtn = document.getElementById('btn-toggle-camera-torch');
      if (torchBtn) {
        torchBtn.classList.toggle('active', isTorchOn);
        torchBtn.innerHTML = `
          <span class="material-symbols-outlined">${isTorchOn ? 'flashlight_off' : 'flashlight_on'}</span>
          <span>${isTorchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}</span>
        `;
      }
    } catch (err) {
      console.warn('[QR Scanner] Toggle torch failed:', err);
    }
  }

  function handleFileInputChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    updateScanStatus('กำลังประมวลผลรูปภาพ QR...', 'info');

    const tempScanner = new Html5Qrcode('qr-camera-stream');
    tempScanner
      .scanFile(file, true)
      .then((decodedText) => {
        onScanSuccess(decodedText);
      })
      .catch((err) => {
        console.warn('[QR Scanner] File scan failed:', err);
        updateScanStatus('ไม่พบรหัส QR ในภาพที่เลือก กรุณาลองด้วยภาพอื่น หรือเลือกรหัสเครื่องด้านล่าง', 'error');
      });

    // Reset input so same file can be selected again if needed
    event.target.value = '';
  }

  /* =========================================================
     MODAL CONTROLS (Open / Close)
  ========================================================= */
  function openQrScanModal() {
    const modal = document.getElementById('qr-scan-modal');
    if (!modal) return;

    populateMachineDropdown();

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    // Start camera
    startQrScanner();
  }

  function closeQrScanModal() {
    const modal = document.getElementById('qr-scan-modal');
    if (!modal) return;

    stopQrScanner();

    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  /* =========================================================
     DISPATCH OPEN MACHINE MODAL
  ========================================================= */
  function dispatchOpenMachineModal(machineName, deptCode) {
    const cleanMachine = String(machineName || '').trim();
    if (!cleanMachine) {
      showNotice('กรุณาระบุรหัสเครื่องจักร', 'error');
      return;
    }

    // Check if openMachineInfoModal is available in current window
    if (typeof window.openMachineInfoModal === 'function') {
      window.openMachineInfoModal(cleanMachine, deptCode);
      showNotice(`เปิดข้อมูลเครื่อง ${cleanMachine} สำเร็จ`, 'success');
      return;
    }

    // If on a page without machine modal (e.g., supervisor-dashboard.html), navigate to main dashboard
    const targetUrl = new URL('/', window.location.origin);
    targetUrl.searchParams.set('machine', cleanMachine);
    if (deptCode) targetUrl.searchParams.set('dept', deptCode);

    showNotice(`กำลังเปิดข้อมูลเครื่อง ${cleanMachine}...`, 'info');
    window.location.href = targetUrl.toString();
  }

  function showNotice(msg, type) {
    if (typeof window.showDashboardToast === 'function') {
      window.showDashboardToast(msg, type);
    } else {
      console.log(`[QR Notice: ${type}]`, msg);
    }
  }

  /* =========================================================
     POPULATE MACHINE DROPDOWN FALLBACK
  ========================================================= */
  function populateMachineDropdown() {
    const select = document.getElementById('qr-quick-machine-select');
    if (!select) return;

    const existingOptions = select.querySelectorAll('option:not([value=""])');
    if (existingOptions.length > 0) return; // Already populated

    // Gather machines from dashboard data cache or Supabase client
    const allData = window.pvtDashboardRawCache || [];
    const machineMap = new Map();

    allData.forEach((row) => {
      const m = String(row.machine_no || row.machine || '').trim();
      const dCode = row.department_code || row.dept || '';
      const dName = row.department_name || dCode;
      if (m && !machineMap.has(m)) {
        machineMap.set(m, { machine: m, deptCode: dCode, deptName: dName });
      }
    });

    // Also check localStorage activeMachineCache if any
    try {
      const cached = JSON.parse(localStorage.getItem('pvt_known_machines') || '[]');
      cached.forEach((item) => {
        if (item.machine && !machineMap.has(item.machine)) {
          machineMap.set(item.machine, item);
        }
      });
    } catch (_) {}

    // Sort machine names naturally
    const sorted = Array.from(machineMap.values()).sort((a, b) =>
      a.machine.localeCompare(b.machine, undefined, { numeric: true, sensitivity: 'base' })
    );

    if (sorted.length === 0) {
      // Default common factory machines for quick testing / selection
      const defaults = [
        { machine: 'F1', deptCode: 'BLOW', deptName: 'เป่าขวด (BLOW)' },
        { machine: 'F2', deptCode: 'BLOW', deptName: 'เป่าขวด (BLOW)' },
        { machine: 'PIPE-01', deptCode: 'PIPE', deptName: 'ผลิตท่อ (PIPE)' },
        { machine: 'PIPE-02', deptCode: 'PIPE', deptName: 'ผลิตท่อ (PIPE)' },
        { machine: 'INJ-01', deptCode: 'INJECTION', deptName: 'ฉีดขึ้นรูป (INJ)' },
        { machine: 'CR-01', deptCode: 'CRUSHER', deptName: 'บดเศษ (CRUSHER)' },
      ];
      defaults.forEach((item) => sorted.push(item));
    }

    let html = '<option value="">-- เลือกรหัสเครื่องจากรายการ --</option>';
    sorted.forEach((item) => {
      const deptLabel = item.deptName ? ` [${item.deptName}]` : (item.deptCode ? ` [${item.deptCode}]` : '');
      html += `<option value="${escapeAttr(item.machine)}" data-dept="${escapeAttr(item.deptCode || '')}">เครื่อง ${escapeHTML(item.machine)}${escapeHTML(deptLabel)}</option>`;
    });

    select.innerHTML = html;
  }

  function handleManualSelectOpen() {
    const select = document.getElementById('qr-quick-machine-select');
    if (!select || !select.value) {
      showNotice('กรุณาเลือกรหัสเครื่องจักร', 'error');
      return;
    }

    const selectedOption = select.options[select.selectedIndex];
    const machine = select.value;
    const dept = selectedOption ? selectedOption.getAttribute('data-dept') || '' : '';

    closeQrScanModal();
    dispatchOpenMachineModal(machine, dept);
  }

  /* =========================================================
     DYNAMIC SCRIPT LOADER (Fallback for Html5Qrcode)
  ========================================================= */
  function loadHtml5QrcodeLibrary() {
    return new Promise((resolve) => {
      if (typeof Html5Qrcode !== 'undefined') {
        resolve();
        return;
      }

      // Try local vendor first
      const script = document.createElement('script');
      script.src = '/js/vendor/html5-qrcode.min.js';
      script.onload = () => resolve();
      script.onerror = () => {
        // Fallback to CDN
        const cdnScript = document.createElement('script');
        cdnScript.src = 'https://unpkg.com/html5-qrcode';
        cdnScript.onload = () => resolve();
        cdnScript.onerror = () => resolve();
        document.head.appendChild(cdnScript);
      };
      document.head.appendChild(script);
    });
  }

  /* =========================================================
     HELPERS
  ========================================================= */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;');
  }

  /* =========================================================
     AUTO-INITIALIZATION & EVENT LISTENERS
  ========================================================= */
  function initQrScanner() {
    // Check URL parameters for machine code on page load (e.g. ?machine=F1)
    try {
      const params = new URLSearchParams(window.location.search);
      const urlMachine = params.get('machine') || params.get('scan_machine');
      const urlDept = params.get('dept') || params.get('dept_code');
      if (urlMachine && typeof window.openMachineInfoModal === 'function') {
        setTimeout(() => {
          window.openMachineInfoModal(urlMachine, urlDept);
        }, 600);
      }
    } catch (_) {}

    // Attach floating Scan QR button event
    const floatingBtn = document.getElementById('btn-floating-scan-qr');
    if (floatingBtn) {
      floatingBtn.addEventListener('click', openQrScanModal);
    }

    // Modal backdrop click to close
    const modalBackdrop = document.getElementById('qr-scan-modal');
    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) {
          closeQrScanModal();
        }
      });
    }

    // Modal Close Button
    const closeBtn = document.getElementById('btn-close-qr-scan');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeQrScanModal);
    }

    // Camera Flip Button
    const flipBtn = document.getElementById('btn-toggle-camera-facing');
    if (flipBtn) {
      flipBtn.addEventListener('click', toggleCameraFacing);
    }

    // Torch Toggle Button
    const torchBtn = document.getElementById('btn-toggle-camera-torch');
    if (torchBtn) {
      torchBtn.addEventListener('click', toggleTorch);
    }

    // File Input change
    const fileInput = document.getElementById('qr-file-input');
    if (fileInput) {
      fileInput.addEventListener('change', handleFileInputChange);
    }

    // Manual machine select button
    const manualBtn = document.getElementById('btn-qr-open-selected-machine');
    if (manualBtn) {
      manualBtn.addEventListener('click', handleManualSelectOpen);
    }

    // Keyboard navigation (Esc to close)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('qr-scan-modal');
        if (modal && modal.style.display !== 'none' && modal.getAttribute('aria-hidden') !== 'true') {
          closeQrScanModal();
        }
      }
    });
  }

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initQrScanner);
  } else {
    initQrScanner();
  }

  // Export to global scope
  window.openQrScanModal = openQrScanModal;
  window.closeQrScanModal = closeQrScanModal;
  window.parseMachineQrPayload = parseMachineQrPayload;
})();
