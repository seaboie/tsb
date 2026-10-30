
(async function () {
  const TARGET = "วัดรางบัว";
  const CHECK_MS = 10000;
    // ===== ตั้งค่าสีและเงาแผงควบคุม =====
    const PANEL_STYLE = {
        normalBg: "#78b6f4",       // พื้นหลังปกติ
        normalText: "#1e293b",     // สีตัวอักษรปกติ

        alarmBg: "#7f1d1d",        // พื้นหลังตอนแจ้งเตือน
        alarmText: "#ffffff",      // ตัวอักษรตอนแจ้งเตือน

        normalResult: "#dce6f0",   // กล่องแสดงผลปกติ
        alarmResult: "#991b1b",    // กล่องแสดงผลตอนเตือน

        shadow: "0 8px 30px rgba(0,0,0,0.95)", // เงาแผง
        shadowButton: "0 4px 16px rgba(0,0,0,0.45)"
    };
  const REPEAT_COUNT = 3;
  const REPEAT_GAP_MS = 5000;

  if (window.busWatcher) window.busWatcher.destroy();

  let running = true;
  let watching = true;
  let soundEnabled = false;
  let alarmActive = false;
  let currentKey = "";
  let alertTimer = null;
  let checkTimer = null;
  let round = 0;

  const originalTitle = document.title;
  const activeNotifications = new Set();

  const audio = new Audio(
    "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
  );
  audio.loop = true;
  audio.volume = 1;
  audio.preload = "auto";

  document.getElementById("bus-watcher-panel")?.remove();
  document.getElementById("bus-watcher-launcher")?.remove();

  // สร้างแผงควบคุม
  const panel = document.createElement("div");
  panel.id = "bus-watcher-panel";

  panel.style.cssText =
    "position:fixed;top:12px;right:12px;width:320px;" +
    "max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);" +
    "overflow-y:auto;z-index:2147483647;box-sizing:border-box;" +
    "background:#eef3f8;color:#1e293b;padding:16px;" +
    "border-radius:14px;" +
    "box-shadow:" + PANEL_STYLE.shadow + ";" +
    "box-shadow:" + PANEL_STYLE.shadowButton + ";cursor:pointer";
    "font:15px/1.6 system-ui,sans-serif;" +
    "transition:background 0.2s";

  panel.innerHTML = `
    <b style="font-size:20px">🚌 ระบบเฝ้าป้าย</b>
    <div style="margin:8px 0">ป้ายเป้าหมาย: ${TARGET}</div>

    <div id="bw-status" style="color:#2563eb;margin:12px 0">
      กรุณาเปิดเสียงก่อนเริ่มใช้งาน
    </div>

    <button id="bw-enable" style="
      width:100%;padding:14px;background:#2563eb;color:white;
      border:0;border-radius:8px;font-size:16px;font-weight:bold;
      cursor:pointer">
      🔊 เปิดเสียงและเริ่มเฝ้าป้าย
    </button>
  `;

  document.body.appendChild(panel);

  // ปุ่มเรียกแผงกลับมา
  const launcher = document.createElement("button");
  launcher.id = "bus-watcher-launcher";
  launcher.textContent = "🚌 แสดงแผงควบคุม";

  launcher.style.cssText =
    "display:none;position:fixed;right:12px;bottom:12px;" +
    "z-index:2147483647;padding:12px 16px;" +
    "background:#2563eb;color:white;border:0;" +
    "border-radius:12px;font-size:15px;font-weight:bold;" +
    "box-shadow:0 4px 16px #0004;cursor:pointer";

  document.body.appendChild(launcher);

  function status(message, color = "#2563eb") {
    const el = panel.querySelector("#bw-status");
    if (el) {
      el.textContent = message;
      el.style.color = color;
    }
  }

  // เปลี่ยนสีแผงตามสถานะ
  function setPanelTheme(alarm) {
    panel.style.background = alarm
        ? PANEL_STYLE.alarmBg
        : PANEL_STYLE.normalBg;

    panel.style.color = alarm
        ? PANEL_STYLE.alarmText
        : PANEL_STYLE.normalText;

    const result = panel.querySelector("#bw-result");

    if (result) {
        result.style.background = alarm
        ? PANEL_STYLE.alarmResult
        : PANEL_STYLE.normalResult;

        result.style.color = alarm
        ? PANEL_STYLE.alarmText
        : PANEL_STYLE.normalText;
    }
  }

  // แสดงหรือซ่อนปุ่มรับทราบ
  function updateAckButton(show) {
    const btn = panel.querySelector("#bw-ack");
    if (btn) {
      btn.style.display = show ? "block" : "none";
    }
  }

  function closeNotifications() {
    for (const n of activeNotifications) {
      n.close();
    }
    activeNotifications.clear();
  }

  function stopAlarm() {
    alarmActive = false;

    clearTimeout(alertTimer);
    alertTimer = null;

    audio.pause();
    audio.currentTime = 0;

    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }

    closeNotifications();

    setPanelTheme(false);
    updateAckButton(false);

    document.title = originalTitle;
  }

  function speak(message) {
    if (!("speechSynthesis" in window)) return;

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "th-TH";
    utterance.rate = 0.9;
    utterance.volume = 1;

    speechSynthesis.speak(utterance);
  }

  function notify(buses) {
    if (
      !("Notification" in window) ||
      Notification.permission !== "granted"
    ) return;

    try {
      const n = new Notification("🚌 รถถึงป้าย " + TARGET, {
        body: "พบรถ " + buses + " ที่ป้ายเป้าหมาย",
        requireInteraction: true
      });

      activeNotifications.add(n);

      n.onclose = () => activeNotifications.delete(n);

      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.warn("Notification ไม่สำเร็จ", e);
    }
  }

  // เริ่มแจ้งเตือน
  function startAlarm(buses) {
    stopAlarm();

    alarmActive = true;
    round = 0;

    setPanelTheme(true);
    updateAckButton(true);

    document.title = "🚨 รถถึงป้าย " + TARGET;

    const result = panel.querySelector("#bw-result");

    if (result) {
      result.textContent =
        "🚨 รถ " + buses + " ถึง " + TARGET +
        " เวลา " + new Date().toLocaleTimeString("th-TH");
    }

    notify(buses);

    function repeat() {
      if (!running || !watching || !alarmActive) return;

      round++;

      status(
        "🚨 แจ้งเตือนรอบ " + round + "/" + REPEAT_COUNT,
        "#fde68a"
      );

      if (soundEnabled) {
        audio.play().catch(e =>
          console.warn("เล่นเสียงไม่ได้", e)
        );
      }

      speak(
        "แจ้งเตือน รถ " + buses +
        " ถึงป้าย " + TARGET +
        " แล้ว ค่ะ"
      );

      if (round < REPEAT_COUNT) {
        alertTimer = setTimeout(repeat, REPEAT_GAP_MS);
      } else {
        status(
          "แจ้งครบ 3 รอบแล้ว · กดรับทราบเพื่อปิดเสียง",
          "#fde68a"
        );
      }
    }

    repeat();
  }

  // ตรวจสอบรถ
  function check() {
    if (!running || !watching) return;

    const items = document.querySelectorAll(".timeline-item");
    const buses = new Set();

    for (const item of items) {
      const text = item.textContent || "";
      const html = item.innerHTML || "";

      if (text.includes(TARGET) && html.includes("16-")) {
        for (const match of html.matchAll(/16-\d+/g)) {
          buses.add(match[0]);
        }
      }
    }

    const list = [...buses].sort().join(", ");

    if (!list) {
      currentKey = "";

      if (!alarmActive) {
        status("กำลังเฝ้าป้าย · ตรวจทุก 10 วินาที");
      }

      return;
    }

    const key = TARGET + "|" + list;

    if (key === currentKey) return;

    currentKey = key;

    console.log("พบรถ:", list, "ถึง", TARGET);

    startAlarm(list);
  }

  // สร้างแผงควบคุมหลังเปิดเสียง
  function showControls(permission) {
    panel.innerHTML = `
      <b style="font-size:20px">🚌 ระบบเฝ้าป้าย</b>

      <div style="margin:8px 0">
        ป้ายเป้าหมาย: ${TARGET}
      </div>

      <div id="bw-status" style="color:#2563eb;margin:10px 0">
        กำลังเฝ้าป้าย
      </div>

      <div id="bw-result" style="
        padding:10px;background:#dce6f0;color:#1e293b;
        border-radius:8px;margin:10px 0;overflow-wrap:anywhere">
        ยังไม่พบรถ
      </div>

      <div style="font-size:12px;color:#64748b;margin:8px 0">
        🔊 เสียง: พร้อมใช้งาน<br>
        🔔 Notification: ${permission}
      </div>

      <!-- รับทราบ: แสดงเฉพาะตอนแจ้งเตือน -->
      <button id="bw-ack" style="
        display:none;width:100%;padding:13px;
        background:#15803d;color:white;border:0;
        border-radius:8px;margin:5px 0;font-size:16px;
        font-weight:bold;cursor:pointer">
        ✅ รับทราบแล้ว · ปิดการแจ้งเตือน
      </button>

      <button id="bw-resume" style="
        width:100%;padding:11px;background:#2563eb;
        color:white;border:0;border-radius:8px;
        margin:5px 0;font-size:15px;cursor:pointer">
        ▶️ เฝ้าป้ายต่อ
      </button>

      <button id="bw-pause" style="
        width:100%;padding:11px;background:#64748b;
        color:white;border:0;border-radius:8px;
        margin:5px 0;font-size:15px;cursor:pointer">
        ⏸ หยุดเฝ้าป้าย
      </button>

      <button id="bw-hide" style="
        width:100%;padding:10px;background:#ffffff;
        color:#334155;border:1px solid #cbd5e1;
        border-radius:8px;margin:5px 0;cursor:pointer">
        🙈 ซ่อนแผงควบคุม
      </button>

      <div style="text-align:center;margin-top:12px">
        <button id="bw-destroy" style="
          padding:5px 12px;background:transparent;
          color:#b91c1c;border:0;font-size:12px;
          cursor:pointer;text-decoration:underline">
          ปิดระบบทั้งหมด
        </button>
      </div>
    `;

    // รับทราบแล้ว
    panel.querySelector("#bw-ack").onclick = () => {
      stopAlarm();

      status(
        watching
          ? "รับทราบแล้ว · กำลังเฝ้าป้ายต่อ"
          : "รับทราบแล้ว · ระบบหยุดเฝ้าป้ายอยู่"
      );
    };

    // เฝ้าป้ายต่อ
    panel.querySelector("#bw-resume").onclick = () => {
      if (!running) return;

      watching = true;

      if (checkTimer === null) {
        checkTimer = setInterval(check, CHECK_MS);
      }

      status("กำลังเฝ้าป้าย · ตรวจทุก 10 วินาที");

      check();
    };

    // หยุดเฝ้าป้าย
    panel.querySelector("#bw-pause").onclick = () => {
      watching = false;

      clearInterval(checkTimer);
      checkTimer = null;

      stopAlarm();

      status("หยุดเฝ้าป้ายชั่วคราว");
    };

    // ซ่อนแผง
    panel.querySelector("#bw-hide").onclick = () => {
      panel.style.display = "none";
      launcher.style.display = "block";
    };

    // ปิดระบบทั้งหมด
    panel.querySelector("#bw-destroy").onclick = () => {
      window.busWatcher.destroy();
    };
  }

  // แสดงแผงกลับมา
  launcher.onclick = () => {
    panel.style.display = "block";
    launcher.style.display = "none";
  };

  // เปิดเสียงและขออนุญาต
  panel.querySelector("#bw-enable").onclick = async function () {
    const button = this;

    button.disabled = true;
    button.textContent = "⏳ กำลังทดสอบเสียง...";

    status("กำลังทดสอบเสียง กรุณารอสักครู่");

    try {
      audio.loop = false;
      await audio.play();

      audio.pause();
      audio.currentTime = 0;
      audio.loop = true;

      soundEnabled = true;
    } catch (e) {
      audio.pause();
      audio.currentTime = 0;
      audio.loop = true;

      button.disabled = false;
      button.textContent = "🔊 ลองเปิดเสียงอีกครั้ง";

      status(
        "เปิดเสียงไม่สำเร็จ กรุณาตรวจสอบเบราว์เซอร์",
        "#dc2626"
      );

      console.warn(e);
      return;
    }

    let permission = "ไม่รองรับ Notification";

    if ("Notification" in window) {
      try {
        if (Notification.permission === "default") {
          permission = await Notification.requestPermission();
        } else {
          permission = Notification.permission;
        }
      } catch (e) {
        permission = Notification.permission;
        console.warn(e);
      }
    }

    showControls(permission);

    status("เปิดเสียงแล้ว · กำลังเฝ้าป้าย");

    check();

    if (checkTimer === null) {
      checkTimer = setInterval(check, CHECK_MS);
    }
  };

  // API สำหรับควบคุมผ่าน Console
  window.busWatcher = {
    stopAlarm,
    check,

    resume() {
      if (!running) return;

      watching = true;

      if (checkTimer === null) {
        checkTimer = setInterval(check, CHECK_MS);
      }

      check();
    },

    pause() {
      watching = false;

      clearInterval(checkTimer);
      checkTimer = null;

      stopAlarm();
    },

    show() {
      panel.style.display = "block";
      launcher.style.display = "none";
    },

    hide() {
      panel.style.display = "none";
      launcher.style.display = "block";
    },

    destroy() {
      if (!running) return;

      running = false;
      watching = false;

      stopAlarm();

      clearInterval(checkTimer);
      clearTimeout(alertTimer);

      audio.pause();
      audio.src = "";

      panel.remove();
      launcher.remove();

      document.title = originalTitle;

      delete window.busWatcher;

      console.log("ปิดระบบเฝ้าป้ายทั้งหมดแล้ว");
    }
  };

  console.log("ระบบเฝ้าป้ายพร้อมใช้งาน กรุณากดเปิดเสียง");
})();
