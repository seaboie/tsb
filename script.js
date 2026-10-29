(async function () {
  const TARGET = "วัดรางบัว";
  const CHECK_MS = 10000;
  const REPEAT_COUNT = 3;
  const REPEAT_GAP_MS = 5000;

  // ล้างระบบเดิมก่อนเริ่มใหม่
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

  // สร้างแผงเริ่มต้น: มีปุ่มเพียงปุ่มเดียว
  const panel = document.createElement("div");
  panel.id = "bus-watcher-panel";
  panel.style.cssText =
    "position:fixed;top:12px;right:12px;width:320px;" +
    "max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);" +
    "overflow-y:auto;z-index:2147483647;" +
    "box-sizing:border-box;background:#111827;color:white;" +
    "padding:16px;border-radius:14px;box-shadow:0 8px 30px #0008;" +
    "font:15px/1.6 system-ui,sans-serif";

  panel.innerHTML = `
    <b style="font-size:20px">🚌 ระบบเฝ้าป้าย</b>
    <div style="margin:8px 0">ป้ายเป้าหมาย: ${TARGET}</div>
    <div id="bw-status" style="color:#93c5fd;margin:12px 0">
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

  // ปุ่มลอยสำหรับเรียกแผงที่ซ่อนอยู่
  const launcher = document.createElement("button");
  launcher.id = "bus-watcher-launcher";
  launcher.textContent = "🚌 แสดงแผงควบคุม";
  launcher.style.cssText =
    "display:none;position:fixed;right:12px;bottom:12px;" +
    "z-index:2147483647;padding:12px 16px;background:#2563eb;" +
    "color:white;border:0;border-radius:12px;font-size:15px;" +
    "font-weight:bold;box-shadow:0 4px 16px #0006;cursor:pointer";

  document.body.appendChild(launcher);

  function status(message, color = "#86efac") {
    const el = panel.querySelector("#bw-status");
    if (el) {
      el.textContent = message;
      el.style.color = color;
    }
  }

  function closeNotifications() {
    for (const notification of activeNotifications) {
      notification.close();
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

    if (panel.isConnected) {
      panel.style.background = "#111827";
    }

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
      console.warn("สร้าง Notification ไม่สำเร็จ", e);
    }
  }

  function startAlarm(buses) {
    stopAlarm();

    alarmActive = true;
    round = 0;

    panel.style.background = "#7f1d1d";
    document.title = "🚨 รถถึงป้าย " + TARGET;

    const resultEl = panel.querySelector("#bw-result");

    if (resultEl) {
      resultEl.textContent =
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
        "แจ้งเตือน รถ " + buses + " ถึงป้าย " +
        TARGET + " แล้ว รอบที่ " + round
      );

      if (round < REPEAT_COUNT) {
        alertTimer = setTimeout(repeat, REPEAT_GAP_MS);
      } else {
        status(
          "แจ้งครบ " + REPEAT_COUNT +
          " รอบแล้ว · เสียงดังต่อจนกดรับทราบ",
          "#fde68a"
        );
      }
    }

    repeat();
  }

  // ตรวจสอบข้อมูลรถจากหน้าเว็บ
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

    // ไม่แจ้งซ้ำหากเป็นข้อมูลรถชุดเดิม
    if (key === currentKey) return;

    currentKey = key;

    console.log("พบรถ:", list, "ถึง", TARGET);

    startAlarm(list);
  }

  // แสดงแผงควบคุมหลังเปิดเสียงสำเร็จ
  function showControls(notificationPermission) {
    panel.innerHTML = `
      <b style="font-size:20px">🚌 ระบบเฝ้าป้าย</b>

      <div style="margin:8px 0">
        ป้ายเป้าหมาย: ${TARGET}
      </div>

      <div id="bw-status" style="color:#86efac;margin:10px 0">
        กำลังเฝ้าป้าย
      </div>

      <div id="bw-result" style="
        padding:10px;background:#273449;border-radius:8px;
        margin:10px 0;overflow-wrap:anywhere">
        ยังไม่พบรถ
      </div>

      <div style="font-size:12px;color:#cbd5e1;margin:8px 0">
        เสียง: พร้อมใช้งาน<br>
        Notification: ${notificationPermission}
      </div>

      <button id="bw-ack" style="
        width:100%;padding:13px;background:#15803d;color:white;
        border:0;border-radius:8px;margin:4px 0;font-size:16px;
        font-weight:bold;cursor:pointer">
        ✅ รับทราบแล้ว · ปิดการแจ้งเตือน
      </button>

      <button id="bw-resume" style="
        width:100%;padding:11px;background:#2563eb;color:white;
        border:0;border-radius:8px;margin:4px 0;font-size:15px;
        cursor:pointer">
        ▶️ เฝ้าป้ายต่อ
      </button>

      <button id="bw-pause" style="
        width:100%;padding:11px;background:#4b5563;color:white;
        border:0;border-radius:8px;margin:4px 0;font-size:15px;
        cursor:pointer">
        ⏸ หยุดเฝ้าป้ายชั่วคราว
      </button>

      <button id="bw-hide" style="
        width:100%;padding:10px;background:transparent;color:white;
        border:1px solid #888;border-radius:8px;margin:4px 0;
        cursor:pointer">
        🙈 ซ่อนแผงควบคุม
      </button>

      <button id="bw-destroy" style="
        width:100%;padding:10px;background:#991b1b;color:white;
        border:0;border-radius:8px;margin:4px 0;cursor:pointer">
        🛑 ปิดระบบทั้งหมด
      </button>
    `;

    // รับทราบ: ปิดเสียงและ Notification แต่ไม่หยุดเฝ้าป้าย
    panel.querySelector("#bw-ack").onclick = () => {
      stopAlarm();

      status(
        watching
          ? "รับทราบแล้ว · กำลังเฝ้าป้ายต่อ"
          : "รับทราบแล้ว · ระบบหยุดเฝ้าป้ายอยู่"
      );
    };

    // เริ่มหรือกลับมาเฝ้าป้ายอีกครั้ง
    panel.querySelector("#bw-resume").onclick = () => {
      if (!running) return;

      watching = true;

      if (checkTimer === null) {
        checkTimer = setInterval(check, CHECK_MS);
      }

      status("กำลังเฝ้าป้าย · ตรวจทุก 10 วินาที");

      check();
    };

    // หยุดตรวจชั่วคราว แต่ไม่ทำลายระบบ
    panel.querySelector("#bw-pause").onclick = () => {
      watching = false;

      clearInterval(checkTimer);
      checkTimer = null;

      stopAlarm();

      status("หยุดเฝ้าป้ายชั่วคราว · กดเฝ้าป้ายต่อเพื่อเริ่มใหม่");
    };

    // ซ่อนแผง แต่ให้ระบบทำงานต่อ
    panel.querySelector("#bw-hide").onclick = () => {
      panel.style.display = "none";
      launcher.style.display = "block";
    };

    // ปิดระบบทั้งหมด
    panel.querySelector("#bw-destroy").onclick = () => {
      window.busWatcher.destroy();
    };
  }

  launcher.onclick = () => {
    panel.style.display = "block";
    launcher.style.display = "none";
  };

  // เปิดเสียงด้วยการกดปุ่มจากผู้ใช้
  panel.querySelector("#bw-enable").onclick = async function () {
    const button = this;

    button.disabled = true;
    button.textContent = "⏳ กำลังทดสอบเสียง...";
    status("กำลังทดสอบเสียง กรุณารอสักครู่", "#93c5fd");

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
        "เปิดเสียงไม่สำเร็จ กรุณาตรวจสอบเบราว์เซอร์หรือการเชื่อมต่อ",
        "#fca5a5"
      );

      console.warn("เปิดเสียงไม่สำเร็จ", e);
      return;
    }

    // ขออนุญาต Notification แยกจากการทดสอบเสียง
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
        console.warn("ขออนุญาต Notification ไม่สำเร็จ", e);
      }
    }

    // แสดงแผงควบคุมเมื่อเปิดเสียงสำเร็จ
    showControls(permission);

    status("เปิดเสียงแล้ว · กำลังเฝ้าป้าย");

    // เริ่มตรวจทันที ไม่ต้องรอ 10 วินาทีแรก
    check();

    if (checkTimer === null) {
      checkTimer = setInterval(check, CHECK_MS);
    }
  };

  // API สำหรับควบคุมจาก Console หรือสคริปต์อื่น
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

  console.log(
    "ระบบเฝ้าป้ายพร้อมเริ่มต้น กรุณากดปุ่มเปิดเสียง"
  );
})();









                                                        - [ ] Code 4        :       Work



(async function () {
  const TARGET = "วัดรางบัว";
  const CHECK_MS = 10000;
  const REPEAT_COUNT = 3;
  const REPEAT_GAP_MS = 5000;

  if (window.busWatcher) window.busWatcher.destroy();

  let running = true;
  let soundEnabled = false;
  let alarmActive = false;
  let currentKey = "";
  let alertTimer = null;
  let checkTimer = null;
  let round = 0;
  const originalTitle = document.title;

  const audio = new Audio(
    "https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg"
  );
  audio.loop = true;
  audio.volume = 1;

  document.getElementById("bus-watcher-panel")?.remove();

  const panel = document.createElement("div");
  panel.id = "bus-watcher-panel";
  panel.style.cssText =
    "position:fixed;top:12px;right:12px;width:320px;" +
    "max-width:calc(100vw - 24px);z-index:2147483647;" +
    "background:#111827;color:white;padding:16px;" +
    "border-radius:14px;box-shadow:0 8px 30px #0008;" +
    "font:15px/1.6 system-ui,sans-serif";

  panel.innerHTML = `
    <b style="font-size:20px">🚌 ระบบเฝ้าป้าย</b>
    <div style="margin:8px 0">ป้ายเป้าหมาย: ${TARGET}</div>
    <div id="bw-status" style="color:#86efac">กำลังเริ่มระบบ</div>
    <div id="bw-result" style="padding:10px;background:#273449;
      border-radius:8px;margin:10px 0">ยังไม่พบรถ</div>
    <button id="bw-enable" style="width:100%;padding:12px;
      background:#2563eb;color:white;border:0;border-radius:8px;
      margin:4px 0;font-size:15px">🔊 เปิดเสียงและการแจ้งเตือน</button>
    <button id="bw-stop" style="width:100%;padding:14px;
      background:#dc2626;color:white;border:0;border-radius:8px;
      margin:4px 0;font-size:17px;font-weight:bold">🛑 เฝ้าดูระบบต่อ</button>
    <button id="bw-watch-stop" style="width:100%;padding:10px;
      background:#4b5563;color:white;border:0;border-radius:8px;
      margin:4px 0">⏹ หยุดเฝ้าป้าย</button>
    <button id="bw-hide" style="width:100%;padding:8px;
      background:transparent;color:white;border:1px solid #888;
      border-radius:8px;margin-top:4px">ซ่อนแผงควบคุม</button>
  `;

  document.body.appendChild(panel);

  const statusEl = panel.querySelector("#bw-status");
  const resultEl = panel.querySelector("#bw-result");

  function status(message, color = "#86efac") {
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  function stopAlarm() {
    alarmActive = false;
    clearTimeout(alertTimer);
    alertTimer = null;
    audio.pause();
    audio.currentTime = 0;
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    panel.style.background = "#111827";
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
    if (!("Notification" in window) ||
        Notification.permission !== "granted") return;

    const n = new Notification("🚌 รถถึงป้าย " + TARGET, {
      body: "พบรถ " + buses + " ที่ป้ายเป้าหมาย",
      requireInteraction: true
    });

    n.onclick = () => {
      window.focus();
      n.close();
    };
  }

  function startAlarm(buses) {
    stopAlarm();
    alarmActive = true;
    round = 0;

    panel.style.background = "#7f1d1d";
    document.title = "🚨 รถถึงป้าย " + TARGET;

    resultEl.textContent =
      "🚨 รถ " + buses + " ถึง " + TARGET +
      " เวลา " + new Date().toLocaleTimeString("th-TH");

    notify(buses);

    function repeat() {
      if (!running || !alarmActive) return;
      round++;

      status("🚨 แจ้งเตือนรอบ " + round + "/" + REPEAT_COUNT, "#fde68a");

      if (soundEnabled) {
        audio.play().catch(e => console.warn("เล่นเสียงไม่ได้", e));
      }

      speak("แจ้งเตือน รถ " + buses + " ถึงป้าย " +
        TARGET + " แล้ว รอบที่ " + round);

      if (round < REPEAT_COUNT) {
        alertTimer = setTimeout(repeat, REPEAT_GAP_MS);
      } else {
        status("แจ้งครบ 3 รอบแล้ว · เสียงดังต่อจนกดหยุด", "#fde68a");
      }
    }

    repeat();
  }

  panel.querySelector("#bw-enable").onclick = async function () {
    try {
      // ทดลองเล่นเสียงจากการกดปุ่มโดยผู้ใช้
      audio.loop = false;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.loop = true;
      soundEnabled = true;

      let permission = "ไม่รองรับ Notification";

      if ("Notification" in window) {
        if (Notification.permission === "default") {
          await Notification.requestPermission();
        }
        permission = Notification.permission;
      }

      this.textContent = "✅ ตั้งค่าเสียงแล้ว";
      this.style.background = "#15803d";
      status("เสียงพร้อมใช้งาน · Notification: " + permission);
    } catch (e) {
      status("เปิดเสียงไม่สำเร็จ กรุณาตรวจการตั้งค่าเบราว์เซอร์", "#fca5a5");
      console.warn(e);
    }
  };

  panel.querySelector("#bw-stop").onclick = () => {
    stopAlarm();
    status("หยุดเสียงแล้ว · ระบบยังเฝ้าป้ายต่อ");
  };

  panel.querySelector("#bw-hide").onclick = () => {
    panel.style.display = "none";
  };

  function check() {
    if (!running) return;

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
      if (!alarmActive) status("กำลังเฝ้าป้าย · ตรวจทุก 10 วินาที");
      return;
    }

    const key = TARGET + "|" + list;
    if (key === currentKey) return;

    currentKey = key;
    console.log("พบรถ:", list, "ถึง", TARGET);
    startAlarm(list);
  }

  window.busWatcher = {
    stopAlarm,
    check,
    destroy() {
      running = false;
      stopAlarm();
      clearInterval(checkTimer);
      clearTimeout(alertTimer);
      audio.pause();
      panel.remove();
      document.title = originalTitle;
      delete window.busWatcher;
      console.log("หยุดระบบเฝ้าป้ายแล้ว");
    }
  };

  panel.querySelector("#bw-watch-stop").onclick =
    () => window.busWatcher.destroy();

  checkTimer = setInterval(check, CHECK_MS);
  check();

  status("กดปุ่มสีน้ำเงินเพื่อเปิดเสียงและอนุญาต Notification");
  console.log("เริ่มเฝ้าป้าย:", TARGET, "โดยไม่ใช้ alert()");
})();













