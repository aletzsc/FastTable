const downloadsEls = document.querySelectorAll("[data-downloads-count]");
const downloadButtons = document.querySelectorAll("[data-download-button]");
const statusEl = document.querySelector("[data-status]");

function setStatus(message, isError = false) {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle("error", isError);
  statusEl.classList.toggle("ok", !isError);
}

function formatNumber(value) {
  return new Intl.NumberFormat("es-MX").format(value);
}

async function loadDownloadCount() {
  try {
    const response = await fetch("/api/downloads", { method: "GET" });
    if (!response.ok) {
      throw new Error("No se pudo cargar el contador");
    }

    const data = await response.json();
    downloadsEls.forEach((el) => {
      el.textContent = formatNumber(data.downloads);
    });
    setStatus("Contador actualizado.");
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Error desconocido", true);
  }
}

async function registerDownload() {
  downloadButtons.forEach((button) => {
    button.disabled = true;
    button.dataset.previousLabel = button.textContent || "Descargar APK";
    button.textContent = "Preparando descarga...";
  });

  try {
    const response = await fetch("/api/download/apk", { method: "POST" });
    if (!response.ok) {
      throw new Error("No se pudo registrar la descarga");
    }

    const data = await response.json();
    downloadsEls.forEach((el) => {
      el.textContent = formatNumber(data.downloads);
    });
    setStatus("Descarga registrada.");

    if (data.apkUrl) {
      window.open(data.apkUrl, "_blank", "noopener,noreferrer");
    }
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Error desconocido", true);
  } finally {
    downloadButtons.forEach((button) => {
      button.disabled = false;
      button.textContent = button.dataset.previousLabel || "Descargar APK";
    });
  }
}

downloadButtons.forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    void registerDownload();
  });
});

void loadDownloadCount();
