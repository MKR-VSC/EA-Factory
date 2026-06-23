const steps = [
  "กำลังเชื่อมต่อฐานข้อมูล...",
  "กำลังโหลดรายงานล่าสุด...",
  "กำลังเตรียม Dashboard...",
  "พร้อมใช้งาน"
];

function animateCount() {
  document.querySelectorAll("[data-count]").forEach((el) => {
    const end = Number(el.dataset.count || 0);
    let start = 0;
    const step = Math.max(1, Math.ceil(end / 45));
    const timer = setInterval(() => {
      start += step;
      if (start >= end) {
        start = end;
        clearInterval(timer);
      }
      el.textContent = end > 100 ? start.toLocaleString("th-TH") : start;
    }, 18);
  });
}

function playIntro() {
  const splash = document.getElementById("splash-screen");
  const app = document.querySelector(".app-shell");
  const stepText = document.getElementById("step-text");

  splash.classList.remove("hide");
  app.classList.remove("show");
  document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = "0"));

  steps.forEach((text, index) => {
    setTimeout(() => (stepText.textContent = text), index * 520);
  });

  setTimeout(() => {
    splash.classList.add("hide");
    app.classList.add("show");
    animateCount();
  }, 2300);
}

window.addEventListener("load", playIntro);
document.getElementById("replay").addEventListener("click", playIntro);
