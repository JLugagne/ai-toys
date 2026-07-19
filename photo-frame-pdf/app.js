(function () {
  "use strict";

  const PAGE_SIZES_CM = {
    a4: { w: 21, h: 29.7 },
    letter: { w: 21.59, h: 27.94 },
  };

  const frameWidthInput = document.getElementById("frame-width");
  const frameHeightInput = document.getElementById("frame-height");
  const orientationInputs = document.querySelectorAll('input[name="frame-orientation"]');
  const presetButtons = document.querySelectorAll("#frame-presets button");
  const photoInput = document.getElementById("photo-input");
  const fileDropLabel = document.getElementById("file-drop-label");
  const zoomSlider = document.getElementById("zoom-slider");
  const exportBtn = document.getElementById("export-btn");
  const statusMsg = document.getElementById("status-msg");
  const specLine = document.getElementById("spec-line");
  const cropFrame = document.querySelector(".crop-frame");
  const cropStage = document.getElementById("crop-stage");
  const canvas = document.getElementById("crop-canvas");
  const placeholderMsg = document.getElementById("placeholder-msg");
  const ctx = canvas.getContext("2d");

  let image = null; // HTMLImageElement
  let minScale = 1; // scale at which image just covers the frame
  let scale = 1; // current zoom, >= minScale
  let offsetX = 0; // image center offset from frame center, in frame-cm space
  let offsetY = 0;

  function getFrameCm() {
    const w = Math.max(1, parseFloat(frameWidthInput.value) || 1);
    const h = Math.max(1, parseFloat(frameHeightInput.value) || 1);
    return { w, h };
  }

  function getOrientation() {
    return document.querySelector('input[name="frame-orientation"]:checked').value;
  }

  function setFrameCm(w, h) {
    // Presets are defined in portrait terms (w <= h); swap for landscape.
    const orientation = getOrientation();
    const [finalW, finalH] = orientation === "landscape" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
    frameWidthInput.value = finalW;
    frameHeightInput.value = finalH;
  }

  function getPreviewSize() {
    const { w, h } = getFrameCm();
    const aspect = w / h;

    // Fit the frame's aspect ratio inside whatever space the crop-frame
    // wrapper actually has, so it genuinely shrinks on small viewports
    // instead of relying on a fixed pixel cap.
    const availW = Math.max(80, cropFrame.clientWidth || 480);
    const availH = Math.max(80, Math.min(window.innerHeight * 0.7, 480));

    let pxW, pxH;
    if (availW / availH > aspect) {
      pxH = availH;
      pxW = availH * aspect;
    } else {
      pxW = availW;
      pxH = availW / aspect;
    }
    return { pxW, pxH };
  }

  function layoutStage() {
    const { pxW, pxH } = getPreviewSize();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = pxW * dpr;
    canvas.height = pxH * dpr;
    canvas.style.width = pxW + "px";
    canvas.style.height = pxH + "px";
    cropStage.style.width = pxW + "px";
    cropStage.style.height = pxH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function computeMinScale() {
    if (!image) return 1;
    const { pxW, pxH } = getPreviewSize();
    // scale so the image covers the whole frame (cover fit)
    const scaleX = pxW / image.naturalWidth;
    const scaleY = pxH / image.naturalHeight;
    return Math.max(scaleX, scaleY);
  }

  function clampOffset() {
    if (!image) return;
    const { pxW, pxH } = getPreviewSize();
    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const maxOffsetX = Math.max(0, (drawW - pxW) / 2);
    const maxOffsetY = Math.max(0, (drawH - pxH) / 2);
    offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, offsetX));
    offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, offsetY));
  }

  function draw() {
    const { pxW, pxH } = getPreviewSize();
    ctx.clearRect(0, 0, pxW, pxH);
    if (!image) return;

    const drawW = image.naturalWidth * scale;
    const drawH = image.naturalHeight * scale;
    const x = pxW / 2 - drawW / 2 - offsetX;
    const y = pxH / 2 - drawH / 2 - offsetY;

    ctx.drawImage(image, x, y, drawW, drawH);
  }

  function updateSpecLine() {
    const { w, h } = getFrameCm();
    const pageKey = document.querySelector('input[name="page-size"]:checked').value;
    specLine.textContent = `${w.toFixed(1)}×${h.toFixed(1)}cm → ${pageKey.toUpperCase()} · 300dpi`;
  }

  function refresh() {
    layoutStage();
    if (image) {
      minScale = computeMinScale();
      scale = Math.max(scale, minScale);
      zoomSlider.min = "1";
      zoomSlider.max = "4";
      zoomSlider.value = String(scale / minScale);
      clampOffset();
    }
    updateSpecLine();
    draw();
  }

  function loadImage(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        image = img;
        minScale = computeMinScale();
        scale = minScale;
        offsetX = 0;
        offsetY = 0;
        zoomSlider.disabled = false;
        zoomSlider.value = "1";
        exportBtn.disabled = false;
        placeholderMsg.style.display = "none";
        refresh();
      };
      img.onerror = () => {
        setStatus("Could not load this image.", true);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function setStatus(text, isError) {
    statusMsg.textContent = text;
    statusMsg.style.color = isError ? "#d6453d" : "";
  }

  // --- Events ---

  frameWidthInput.addEventListener("change", refresh);
  frameHeightInput.addEventListener("change", refresh);

  document.querySelectorAll('input[name="page-size"]').forEach((input) => {
    input.addEventListener("change", updateSpecLine);
  });

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setFrameCm(parseFloat(btn.dataset.w), parseFloat(btn.dataset.h));
      refresh();
    });
  });

  orientationInputs.forEach((input) => {
    input.addEventListener("change", () => {
      const { w, h } = getFrameCm();
      setFrameCm(w, h);
      refresh();
    });
  });

  photoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (file) {
      fileDropLabel.textContent = file.name;
      loadImage(file);
    }
  });

  zoomSlider.addEventListener("input", () => {
    const factor = parseFloat(zoomSlider.value);
    scale = minScale * factor;
    clampOffset();
    draw();
  });

  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startOffsetX = 0;
  let startOffsetY = 0;

  function pointerDown(clientX, clientY) {
    if (!image) return;
    dragging = true;
    dragStartX = clientX;
    dragStartY = clientY;
    startOffsetX = offsetX;
    startOffsetY = offsetY;
    cropStage.classList.add("dragging");
  }

  function pointerMove(clientX, clientY) {
    if (!dragging) return;
    offsetX = startOffsetX - (clientX - dragStartX);
    offsetY = startOffsetY - (clientY - dragStartY);
    clampOffset();
    draw();
  }

  function pointerUp() {
    dragging = false;
    cropStage.classList.remove("dragging");
  }

  cropStage.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
  window.addEventListener("mousemove", (e) => pointerMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", pointerUp);

  cropStage.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length === 1) {
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    },
    { passive: true }
  );
  cropStage.addEventListener(
    "touchmove",
    (e) => {
      if (e.touches.length === 1) {
        pointerMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      }
    },
    { passive: false }
  );
  cropStage.addEventListener("touchend", pointerUp);

  cropStage.addEventListener(
    "wheel",
    (e) => {
      if (!image) return;
      e.preventDefault();
      const factor = parseFloat(zoomSlider.value) - e.deltaY * 0.001;
      const clamped = Math.min(4, Math.max(1, factor));
      zoomSlider.value = String(clamped);
      scale = minScale * clamped;
      clampOffset();
      draw();
    },
    { passive: false }
  );

  window.addEventListener("resize", refresh);

  // --- PDF export ---

  exportBtn.addEventListener("click", async () => {
    if (!image) return;
    try {
      exportBtn.disabled = true;
      setStatus("Generating PDF...");

      const { w: frameW, h: frameH } = getFrameCm();
      const pageKey = document.querySelector('input[name="page-size"]:checked').value;
      const page = PAGE_SIZES_CM[pageKey];

      if (frameW > page.w || frameH > page.h) {
        setStatus(
          `Frame (${frameW}×${frameH}cm) does not fit on ${pageKey.toUpperCase()} (${page.w}×${page.h}cm). Choose a bigger page or a smaller frame.`,
          true
        );
        exportBtn.disabled = false;
        return;
      }

      // Render the cropped photo at high resolution (300 DPI) for print quality.
      const dpi = 300;
      const outW = Math.round((frameW / 2.54) * dpi);
      const outH = Math.round((frameH / 2.54) * dpi);

      // Convert the preview-space crop (scale + offset, in preview px) into
      // frame-cm space first, then into output px using per-axis ratios derived
      // from the same frame-cm basis. Deriving a single ratio from rounded
      // outW/outH vs preview px would drift slightly between axes and leave
      // thin uncropped gaps at the output's edges.
      const outCanvas = document.createElement("canvas");
      outCanvas.width = outW;
      outCanvas.height = outH;
      const outCtx = outCanvas.getContext("2d");

      const { pxW: prevW } = getPreviewSize();
      const pxPerCmPreview = prevW / frameW;
      const pxPerCmOutputW = outW / frameW;
      const pxPerCmOutputH = outH / frameH;

      const drawWCm = (image.naturalWidth * scale) / pxPerCmPreview;
      const drawHCm = (image.naturalHeight * scale) / pxPerCmPreview;
      const cropOffsetXCm = offsetX / pxPerCmPreview;
      const cropOffsetYCm = offsetY / pxPerCmPreview;

      const drawW = drawWCm * pxPerCmOutputW;
      const drawH = drawHCm * pxPerCmOutputH;
      const x = outW / 2 - drawW / 2 - cropOffsetXCm * pxPerCmOutputW;
      const y = outH / 2 - drawH / 2 - cropOffsetYCm * pxPerCmOutputH;

      outCtx.drawImage(image, x, y, drawW, drawH);

      const imgData = outCanvas.toDataURL("image/jpeg", 0.95);

      const { jsPDF } = window.jspdf;
      const orientation = page.w > page.h ? "landscape" : "portrait";
      const doc = new jsPDF({
        orientation,
        unit: "cm",
        format: [page.w, page.h],
      });

      const offsetXCm = (page.w - frameW) / 2;
      const offsetYCm = (page.h - frameH) / 2;

      doc.addImage(imgData, "JPEG", offsetXCm, offsetYCm, frameW, frameH);
      doc.save("photo-frame.pdf");

      setStatus("PDF downloaded.");
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong generating the PDF.", true);
    } finally {
      exportBtn.disabled = false;
    }
  });

  refresh();
})();
