// =========================================================
// POPUP SERVICE
// ใช้แทน confirm() ของ Browser
// =========================================================

window.showConfirm = function (
  message,
  title = "ยืนยันการทำรายการ"
) {
  return new Promise((resolve) => {
    const modal = document.getElementById("app-confirm");
    const titleEl = document.getElementById("app-confirm-title");
    const messageEl = document.getElementById("app-confirm-message");
    const okBtn = document.getElementById("app-confirm-ok");
    const cancelBtn = document.getElementById("app-confirm-cancel");

    // ถ้า HTML popup ยังไม่ได้ใส่ ให้กลับไปใช้ confirm() เดิมก่อน
    // กันระบบค้าง / กันกดออกไม่ได้
    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
      const result = confirm(message);
      resolve(result);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.classList.remove("hidden");

    function close(result) {
      modal.classList.add("hidden");

      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);

      resolve(result);
    }

    function onOk() {
      close(true);
    }

    function onCancel() {
      close(false);
    }

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
  });
};