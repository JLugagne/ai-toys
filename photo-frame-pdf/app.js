(function () {
  "use strict";

  const PAGE_SIZES_CM = {
    a4: { w: 21, h: 29.7 },
    letter: { w: 21.59, h: 27.94 },
  };
  const ITEM_GAP_CM = 0.3; // minimum spacing between packed photos, for cutting clearance
  const MAX_ZOOM_FACTOR = 4;

  const pageSizeInputs = document.querySelectorAll('input[name="page-size"]');
  const photoList = document.getElementById("photo-list");
  const addPhotoBtn = document.getElementById("add-photo-btn");
  const photoInput = document.getElementById("photo-input");
  const exportBtn = document.getElementById("export-btn");
  const statusMsg = document.getElementById("status-msg");
  const specLine = document.getElementById("spec-line");
  const pagesPreview = document.getElementById("pages-preview");
  const placeholderMsg = document.getElementById("placeholder-msg");
  const photoItemTemplate = document.getElementById("photo-item-template");

  let nextId = 1;
  const photos = []; // { id, image, els: {...}, frameW, frameH, bleedMm, scale, minScale, zoomFactor, offsetX, offsetY }

  function getPageSize() {
    const key = document.querySelector('input[name="page-size"]:checked').value;
    return { key, ...PAGE_SIZES_CM[key] };
  }

  function getBleedCm(photo) {
    return Math.max(0, photo.bleedMm) / 10;
  }

  function getBleedSizeCm(photo) {
    const bleed = getBleedCm(photo);
    return { w: photo.frameW + 2 * bleed, h: photo.frameH + 2 * bleed };
  }

  // --- Per-photo crop preview (small fixed-size canvas per item) ---

  const CROP_PREVIEW_PX = 96;

  function getCropPreviewSize(photo) {
    const aspect = photo.frameW / photo.frameH;
    let pxW, pxH;
    if (aspect >= 1) {
      pxW = CROP_PREVIEW_PX;
      pxH = CROP_PREVIEW_PX / aspect;
    } else {
      pxH = CROP_PREVIEW_PX;
      pxW = CROP_PREVIEW_PX * aspect;
    }
    return { pxW, pxH };
  }

  function getBleedPreviewSize(photo) {
    const { pxW, pxH } = getCropPreviewSize(photo);
    const bleed = getBleedCm(photo);
    return {
      pxW: pxW * ((photo.frameW + 2 * bleed) / photo.frameW),
      pxH: pxH * ((photo.frameH + 2 * bleed) / photo.frameH),
    };
  }

  function computeMinScale(photo) {
    if (!photo.image) return 1;
    const { pxW, pxH } = getBleedPreviewSize(photo);
    const scaleX = pxW / photo.image.naturalWidth;
    const scaleY = pxH / photo.image.naturalHeight;
    return Math.max(scaleX, scaleY);
  }

  function clampOffset(photo) {
    if (!photo.image) return;
    const { pxW, pxH } = getBleedPreviewSize(photo);
    const drawW = photo.image.naturalWidth * photo.scale;
    const drawH = photo.image.naturalHeight * photo.scale;
    const maxOffsetX = Math.max(0, (drawW - pxW) / 2);
    const maxOffsetY = Math.max(0, (drawH - pxH) / 2);
    photo.offsetX = Math.min(maxOffsetX, Math.max(-maxOffsetX, photo.offsetX));
    photo.offsetY = Math.min(maxOffsetY, Math.max(-maxOffsetY, photo.offsetY));
  }

  function layoutCropStage(photo) {
    const { pxW, pxH } = getCropPreviewSize(photo);
    const dpr = window.devicePixelRatio || 1;
    const canvas = photo.els.canvas;
    canvas.width = pxW * dpr;
    canvas.height = pxH * dpr;
    canvas.style.width = pxW + "px";
    canvas.style.height = pxH + "px";
    photo.els.cropStage.style.width = pxW + "px";
    photo.els.cropStage.style.height = pxH + "px";
    photo.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawCrop(photo) {
    const { pxW, pxH } = getCropPreviewSize(photo);
    const ctx = photo.ctx;
    ctx.clearRect(0, 0, pxW, pxH);
    if (!photo.image) return;
    const drawW = photo.image.naturalWidth * photo.scale;
    const drawH = photo.image.naturalHeight * photo.scale;
    const x = pxW / 2 - drawW / 2 - photo.offsetX;
    const y = pxH / 2 - drawH / 2 - photo.offsetY;
    ctx.drawImage(photo.image, x, y, drawW, drawH);
  }

  function refreshPhotoCrop(photo) {
    layoutCropStage(photo);
    if (photo.image) {
      photo.minScale = computeMinScale(photo);
      photo.scale = photo.minScale * photo.zoomFactor;
      clampOffset(photo);
    }
    drawCrop(photo);
  }

  // --- Orientation / frame size helpers ---

  function getOrientation(photo) {
    return photo.els.orientationInputs.find((i) => i.checked).value;
  }

  function setFrameCm(photo, w, h) {
    const orientation = getOrientation(photo);
    const [finalW, finalH] =
      orientation === "landscape" ? [Math.max(w, h), Math.min(w, h)] : [Math.min(w, h), Math.max(w, h)];
    photo.frameW = finalW;
    photo.frameH = finalH;
    photo.els.widthInput.value = finalW;
    photo.els.heightInput.value = finalH;
  }

  // --- Status / spec line ---

  function setStatus(text, isError) {
    statusMsg.textContent = text;
    statusMsg.style.color = isError ? "#d6453d" : "";
  }

  function updateSpecLine() {
    const page = getPageSize();
    const count = photos.length;
    specLine.textContent = `${count} photo${count === 1 ? "" : "s"} → ${page.key.toUpperCase()} · 300dpi`;
  }

  // --- Photo item creation / removal ---

  function createPhotoItem() {
    const fragment = photoItemTemplate.content.cloneNode(true);
    const li = fragment.querySelector(".photo-item");
    const cropStage = li.querySelector(".crop-stage");
    const canvas = li.querySelector(".crop-canvas");
    const widthInput = li.querySelector(".frame-width");
    const heightInput = li.querySelector(".frame-height");
    const orientationInputs = Array.from(li.querySelectorAll('input[name="orientation"]'));
    const bleedInput = li.querySelector(".bleed-margin");
    const presetButtons = Array.from(li.querySelectorAll(".presets button"));
    const removeBtn = li.querySelector(".remove-photo-btn");

    // Radio `name` attributes must be unique per item so multiple items'
    // orientation groups don't fight each other.
    const groupSuffix = String(nextId);
    orientationInputs.forEach((input) => (input.name = "orientation-" + groupSuffix));

    const photo = {
      id: nextId++,
      image: null,
      frameW: parseFloat(widthInput.value),
      frameH: parseFloat(heightInput.value),
      bleedMm: parseFloat(bleedInput.value),
      scale: 1,
      minScale: 1,
      zoomFactor: 1,
      offsetX: 0,
      offsetY: 0,
      els: { li, cropStage, canvas, widthInput, heightInput, orientationInputs, bleedInput, removeBtn },
      ctx: canvas.getContext("2d"),
    };

    photos.push(photo);
    photoList.appendChild(li);

    widthInput.addEventListener("change", () => {
      photo.frameW = Math.max(1, parseFloat(widthInput.value) || 1);
      widthInput.value = photo.frameW;
      refreshPhotoCrop(photo);
      renderPagesPreview();
    });
    heightInput.addEventListener("change", () => {
      photo.frameH = Math.max(1, parseFloat(heightInput.value) || 1);
      heightInput.value = photo.frameH;
      refreshPhotoCrop(photo);
      renderPagesPreview();
    });
    bleedInput.addEventListener("change", () => {
      photo.bleedMm = Math.max(0, parseFloat(bleedInput.value) || 0);
      bleedInput.value = photo.bleedMm;
      refreshPhotoCrop(photo);
      renderPagesPreview();
    });
    orientationInputs.forEach((input) => {
      input.addEventListener("change", () => {
        setFrameCm(photo, photo.frameW, photo.frameH);
        refreshPhotoCrop(photo);
        renderPagesPreview();
      });
    });
    presetButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setFrameCm(photo, parseFloat(btn.dataset.w), parseFloat(btn.dataset.h));
        refreshPhotoCrop(photo);
        renderPagesPreview();
      });
    });
    removeBtn.addEventListener("click", () => {
      removePhotoItem(photo);
    });

    setupCropInteraction(photo);
    refreshPhotoCrop(photo);
    return photo;
  }

  function removePhotoItem(photo) {
    const idx = photos.indexOf(photo);
    if (idx === -1) return;
    photos.splice(idx, 1);
    photo.els.li.remove();
    updateSpecLine();
    renderPagesPreview();
    updateExportAvailability();
  }

  function updateExportAvailability() {
    const ready = photos.length > 0 && photos.every((p) => p.image);
    exportBtn.disabled = !ready;
    placeholderMsg.style.display = photos.length > 0 ? "none" : "";
  }

  function loadImageIntoPhoto(photo, file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        photo.image = img;
        photo.minScale = computeMinScale(photo);
        photo.scale = photo.minScale;
        photo.zoomFactor = 1;
        photo.offsetX = 0;
        photo.offsetY = 0;
        refreshPhotoCrop(photo);
        updateExportAvailability();
        renderPagesPreview();
      };
      img.onerror = () => {
        setStatus("Could not load this image.", true);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // --- Adding a photo: click "Add a photo" -> file picker -> new item ---

  addPhotoBtn.addEventListener("click", () => {
    photoInput.click();
  });

  photoInput.addEventListener("change", (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const photo = createPhotoItem();
    loadImageIntoPhoto(photo, file);
    photoInput.value = "";
    updateSpecLine();
  });

  pageSizeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      updateSpecLine();
      renderPagesPreview();
    });
  });

  // --- Per-photo drag / pinch / scroll crop interaction ---

  function setupCropInteraction(photo) {
    const stage = photo.els.cropStage;
    let dragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startOffsetX = 0;
    let startOffsetY = 0;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    function applyZoomFactor(clamped) {
      photo.zoomFactor = clamped;
      photo.scale = photo.minScale * clamped;
      clampOffset(photo);
      drawCrop(photo);
    }

    function pointerDown(clientX, clientY) {
      if (!photo.image) return;
      dragging = true;
      dragStartX = clientX;
      dragStartY = clientY;
      startOffsetX = photo.offsetX;
      startOffsetY = photo.offsetY;
      stage.classList.add("dragging");
    }

    function pointerMove(clientX, clientY) {
      if (!dragging) return;
      photo.offsetX = startOffsetX - (clientX - dragStartX);
      photo.offsetY = startOffsetY - (clientY - dragStartY);
      clampOffset(photo);
      drawCrop(photo);
    }

    function pointerUp() {
      dragging = false;
      stage.classList.remove("dragging");
    }

    function touchDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    stage.addEventListener("mousedown", (e) => pointerDown(e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => pointerMove(e.clientX, e.clientY));
    window.addEventListener("mouseup", pointerUp);

    stage.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          pointerDown(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
          dragging = false;
          stage.classList.remove("dragging");
          pinchStartDist = touchDistance(e.touches);
          pinchStartZoom = photo.zoomFactor;
        }
      },
      { passive: true }
    );
    stage.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 2 && photo.image) {
          e.preventDefault();
          const dist = touchDistance(e.touches);
          if (pinchStartDist > 0) {
            const factor = pinchStartZoom * (dist / pinchStartDist);
            applyZoomFactor(Math.min(MAX_ZOOM_FACTOR, Math.max(1, factor)));
          }
        } else if (e.touches.length === 1) {
          pointerMove(e.touches[0].clientX, e.touches[0].clientY);
          e.preventDefault();
        }
      },
      { passive: false }
    );
    stage.addEventListener("touchend", (e) => {
      pointerUp();
      if (e.touches.length === 1) {
        pointerDown(e.touches[0].clientX, e.touches[0].clientY);
      } else {
        pinchStartDist = 0;
      }
    });

    stage.addEventListener(
      "wheel",
      (e) => {
        if (!photo.image) return;
        e.preventDefault();
        const factor = photo.zoomFactor - e.deltaY * 0.001;
        applyZoomFactor(Math.min(MAX_ZOOM_FACTOR, Math.max(1, factor)));
      },
      { passive: false }
    );
  }

  // --- Bin packing (MaxRects, best-area-fit, no rotation) ---

  function packPhotos(items, pageW, pageH, gap) {
    const sorted = [...items]
      .map((it) => ({ ...it, pw: it.w + gap, ph: it.h + gap }))
      .sort((a, b) => b.h - a.h || b.w - a.w);

    const pages = [];
    let page = null;
    let freeRects = null;

    function newPage() {
      page = { items: [], w: pageW, h: pageH };
      pages.push(page);
      freeRects = [{ x: 0, y: 0, w: pageW + gap, h: pageH + gap }];
    }

    function rectsOverlap(a, b) {
      return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    }

    function splitFreeRectAgainstPlaced(freeRect, placed) {
      if (!rectsOverlap(freeRect, placed)) return [freeRect];
      const result = [];
      if (placed.x > freeRect.x) {
        result.push({ x: freeRect.x, y: freeRect.y, w: placed.x - freeRect.x, h: freeRect.h });
      }
      if (placed.x + placed.w < freeRect.x + freeRect.w) {
        result.push({
          x: placed.x + placed.w,
          y: freeRect.y,
          w: freeRect.x + freeRect.w - (placed.x + placed.w),
          h: freeRect.h,
        });
      }
      if (placed.y > freeRect.y) {
        result.push({ x: freeRect.x, y: freeRect.y, w: freeRect.w, h: placed.y - freeRect.y });
      }
      if (placed.y + placed.h < freeRect.y + freeRect.h) {
        result.push({
          x: freeRect.x,
          y: placed.y + placed.h,
          w: freeRect.w,
          h: freeRect.y + freeRect.h - (placed.y + placed.h),
        });
      }
      return result;
    }

    function isContained(a, b) {
      return (
        a.x >= b.x - 1e-9 &&
        a.y >= b.y - 1e-9 &&
        a.x + a.w <= b.x + b.w + 1e-9 &&
        a.y + a.h <= b.y + b.h + 1e-9
      );
    }

    function pruneContained(rects) {
      const keep = [];
      for (let i = 0; i < rects.length; i++) {
        let contained = false;
        for (let j = 0; j < rects.length; j++) {
          if (i === j) continue;
          if (isContained(rects[i], rects[j])) {
            const same =
              Math.abs(rects[i].x - rects[j].x) < 1e-9 &&
              Math.abs(rects[i].y - rects[j].y) < 1e-9 &&
              Math.abs(rects[i].w - rects[j].w) < 1e-9 &&
              Math.abs(rects[i].h - rects[j].h) < 1e-9;
            if (same && i < j) continue;
            contained = true;
            break;
          }
        }
        if (!contained) keep.push(rects[i]);
      }
      return keep;
    }

    function tryPlaceOnPage(item) {
      let bestIdx = -1;
      let bestArea = Infinity;
      for (let i = 0; i < freeRects.length; i++) {
        const r = freeRects[i];
        if (item.pw <= r.w + 1e-9 && item.ph <= r.h + 1e-9) {
          const area = r.w * r.h;
          if (area < bestArea) {
            bestArea = area;
            bestIdx = i;
          }
        }
      }
      if (bestIdx === -1) return false;

      const chosen = freeRects[bestIdx];
      const placedFootprint = { x: chosen.x, y: chosen.y, w: item.pw, h: item.ph };
      page.items.push({ id: item.id, x: placedFootprint.x, y: placedFootprint.y, w: item.w, h: item.h });

      const nextFreeRects = [];
      for (const r of freeRects) {
        nextFreeRects.push(...splitFreeRectAgainstPlaced(r, placedFootprint));
      }
      freeRects = pruneContained(nextFreeRects);
      return true;
    }

    newPage();
    for (const item of sorted) {
      if (item.w > pageW || item.h > pageH) {
        throw new Error(`item-too-large:${item.id}`);
      }
      if (!tryPlaceOnPage(item)) {
        newPage();
        if (!tryPlaceOnPage(item)) {
          throw new Error(`item-unplaceable:${item.id}`);
        }
      }
    }

    return pages;
  }

  function computePackedPages() {
    const page = getPageSize();
    const items = photos.map((p) => {
      const { w, h } = getBleedSizeCm(p);
      return { id: p.id, w, h };
    });
    const packedPages = packPhotos(items, page.w, page.h, ITEM_GAP_CM);
    return { page, packedPages };
  }

  // --- Page layout preview ---

  function renderPagesPreview() {
    pagesPreview.querySelectorAll(".page-sheet").forEach((el) => el.remove());

    if (photos.length === 0) {
      placeholderMsg.style.display = "";
      return;
    }

    let packedPages;
    let page;
    try {
      ({ page, packedPages } = computePackedPages());
    } catch (err) {
      setStatus("One of your photos (with its safety margin) is larger than the page.", true);
      return;
    }
    setStatus("");
    placeholderMsg.style.display = "none";

    const byId = new Map(photos.map((p) => [p.id, p]));

    // Scale each page sheet to fit the available preview width, so it stays
    // responsive on narrow viewports instead of using a fixed px-per-cm.
    const availW = Math.max(200, pagesPreview.clientWidth || 480);
    const maxPxPerCm = 11;
    const pxPerCm = Math.min(maxPxPerCm, availW / page.w);

    packedPages.forEach((pkPage, pageIdx) => {
      const sheet = document.createElement("div");
      sheet.className = "page-sheet";
      sheet.style.width = page.w * pxPerCm + "px";
      sheet.style.height = page.h * pxPerCm + "px";

      pkPage.items.forEach((it) => {
        const photo = byId.get(it.id);
        const el = document.createElement("div");
        el.className = "packed-item";
        el.style.left = it.x * pxPerCm + "px";
        el.style.top = it.y * pxPerCm + "px";
        el.style.width = it.w * pxPerCm + "px";
        el.style.height = it.h * pxPerCm + "px";
        if (photo && photo.image) {
          el.style.backgroundImage = `url(${photo.image.src})`;
        }
        sheet.appendChild(el);
      });

      const label = document.createElement("span");
      label.className = "page-label";
      label.textContent = `Page ${pageIdx + 1} / ${packedPages.length}`;
      sheet.appendChild(label);

      pagesPreview.appendChild(sheet);
    });
  }

  // --- PDF export ---

  function renderPhotoToCanvas(photo) {
    const { w: bleedW, h: bleedH } = getBleedSizeCm(photo);
    const dpi = 300;
    const outW = Math.round((bleedW / 2.54) * dpi);
    const outH = Math.round((bleedH / 2.54) * dpi);

    const outCanvas = document.createElement("canvas");
    outCanvas.width = outW;
    outCanvas.height = outH;
    const outCtx = outCanvas.getContext("2d");

    const { pxW: prevW } = getCropPreviewSize(photo);
    const pxPerCmPreview = prevW / photo.frameW;
    const pxPerCmOutputW = outW / bleedW;
    const pxPerCmOutputH = outH / bleedH;

    const drawWCm = (photo.image.naturalWidth * photo.scale) / pxPerCmPreview;
    const drawHCm = (photo.image.naturalHeight * photo.scale) / pxPerCmPreview;
    const cropOffsetXCm = photo.offsetX / pxPerCmPreview;
    const cropOffsetYCm = photo.offsetY / pxPerCmPreview;

    const drawW = drawWCm * pxPerCmOutputW;
    const drawH = drawHCm * pxPerCmOutputH;
    const x = outW / 2 - drawW / 2 - cropOffsetXCm * pxPerCmOutputW;
    const y = outH / 2 - drawH / 2 - cropOffsetYCm * pxPerCmOutputH;

    outCtx.drawImage(photo.image, x, y, drawW, drawH);
    return outCanvas.toDataURL("image/jpeg", 0.95);
  }

  exportBtn.addEventListener("click", async () => {
    if (photos.length === 0 || !photos.every((p) => p.image)) return;
    try {
      exportBtn.disabled = true;
      setStatus("Generating PDF...");

      let page, packedPages;
      try {
        ({ page, packedPages } = computePackedPages());
      } catch (err) {
        setStatus("One of your photos (with its safety margin) is larger than the page. Reduce its size or safety margin.", true);
        exportBtn.disabled = false;
        return;
      }

      const byId = new Map(photos.map((p) => [p.id, p]));
      const orientation = page.w > page.h ? "landscape" : "portrait";
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation, unit: "cm", format: [page.w, page.h] });

      packedPages.forEach((pkPage, pageIdx) => {
        if (pageIdx > 0) doc.addPage([page.w, page.h], orientation);
        pkPage.items.forEach((it) => {
          const photo = byId.get(it.id);
          const imgData = renderPhotoToCanvas(photo);
          doc.addImage(imgData, "JPEG", it.x, it.y, it.w, it.h);
        });
      });

      doc.save("photo-frames.pdf");
      setStatus(`PDF downloaded (${packedPages.length} page${packedPages.length === 1 ? "" : "s"}).`);
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong generating the PDF.", true);
    } finally {
      exportBtn.disabled = photos.length === 0 || !photos.every((p) => p.image);
    }
  });

  window.addEventListener("resize", () => {
    photos.forEach(refreshPhotoCrop);
    renderPagesPreview();
  });

  updateSpecLine();
  updateExportAvailability();
})();
