(() => {
  "use strict";

  const targets = [
    { name: "WISE 0855", ra: 133.795129, dec: -7.245147, pmra: -8123.7, pmdec: 673.2, pmSource: "Kirkpatrick et al. 2021", shortRa: "08h 55m", shortDec: "−07° 14′" },
    { name: "Barnard's Star", ra: 269.452075, dec: 4.693364, pmra: -801.551, pmdec: 10362.394, pmSource: "Gaia DR3", shortRa: "17h 57m", shortDec: "+04° 41′" },
    { name: "Epsilon Indi B", ra: 331.04375, dec: -56.7825, pmra: 3966.661, pmdec: -2536.192, pmSource: "Epsilon Indi A · Gaia DR3", shortRa: "22h 04m", shortDec: "−56° 46′" },
    { name: "RW Aurigae", ra: 76.956667, dec: 30.401528, pmra: 2.641, pmdec: -27.398, pmSource: "RW Aur A · Gaia DR3", variable: true, shortRa: "05h 07m", shortDec: "+30° 24′" },
    { name: "R Draconis", ra: 248.170833, dec: 66.753889, pmra: null, pmdec: null, pmSource: "Variable star; proper motion not assigned in this demo", variable: true, shortRa: "16h 32m", shortDec: "+66° 45′" }
  ];
  const demoYears = [0, .15, .3, .45, .6, .75, .9, 1];
  const canvas = document.querySelector("#sky-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const els = {
    ra: document.querySelector("#ra"), dec: document.querySelector("#dec"),
    form: document.querySelector("#coordinate-form"), fov: document.querySelector("#fov"),
    band: document.querySelector("#band"), targetList: document.querySelector("#target-list"),
    slider: document.querySelector("#timeline-slider"), play: document.querySelector("#play"),
    date: document.querySelector("#frame-date"), count: document.querySelector("#frame-count"),
    ticks: document.querySelector("#timeline-ticks"), modeButtons: [...document.querySelectorAll(".mode-button")],
    fileInput: document.querySelector("#image-files"), status: document.querySelector("#data-status"),
    empty: document.querySelector("#empty-state"), toast: document.querySelector("#toast"),
    assistantForm: document.querySelector("#assistant-form"),
    assistantInput: document.querySelector("#assistant-input"),
    assistantSubmit: document.querySelector("#assistant-submit"),
    assistantMessages: document.querySelector("#assistant-messages"),
    assistantStatus: document.querySelector("#assistant-status")
  };
  let mode = "blink";
  let frame = 0;
  let timer = null;
  let uploadedFrames = [];
  let remoteFrames = [];
  let requestId = 0;
  let toastTimer = null;
  let activeTarget = "WISE 0855";
  let dimensions = { width: canvas.width, height: canvas.height };
  let skySeed = 1;

  function seededRandom(seed) {
    let value = seed >>> 0;
    return () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  function hashCoordinates(ra, dec) {
    return (Math.floor((Number(ra) + 360) * 10000) ^ Math.floor((Number(dec) + 90) * 100000)) >>> 0;
  }

  function initBands() {
    for (let i = 1; i <= 6; i++) {
      const option = document.createElement("option");
      const detector = `D${i}`;
      option.value = detector;
      option.textContent = `SPHEREx-${detector}`;
      if (detector === "D3") option.selected = true;
      els.band.append(option);
    }
  }

  function initTargets() {
    for (const target of targets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "target-button";
      button.title = `${target.pmSource} · ${motionDescription(target)}`;
      button.innerHTML = `<span>${target.name}</span><span>${motionArrow(target)}</span>`;
      button.addEventListener("click", () => selectTarget(target));
      els.targetList.append(button);
    }
    updateTargetButtons();
  }

  function updateTargetButtons() {
    [...els.targetList.children].forEach((button, index) => {
      button.classList.toggle("active", targets[index].name === activeTarget);
    });
  }

  function selectTarget(target) {
    activeTarget = target.name;
    els.ra.value = target.ra;
    els.dec.value = target.dec;
    updateCoordinates();
    updateTargetButtons();
    fetchObservations();
  }

  function updateCoordinates() {
    const ra = Number(els.ra.value);
    const dec = Number(els.dec.value);
    document.querySelector("#canvas-coordinate").textContent = `RA ${ra.toFixed(4)}°   DEC ${dec < 0 ? "−" : "+"}${Math.abs(dec).toFixed(4)}°`;
    document.querySelector("#coordinate-label").textContent = `${ra.toFixed(4)}° · ${dec < 0 ? "−" : "+"}${Math.abs(dec).toFixed(4)}°`;
    document.querySelector("#object-name").textContent = activeTarget;
    document.querySelector("#motion-label").textContent = motionDescription(targets.find(target => target.name === activeTarget));
    document.querySelector("#scale-label").textContent = `${els.fov.value}°`;
    skySeed = hashCoordinates(ra, dec);
    const url = new URL(window.location.href);
    url.hash = `ra=${encodeURIComponent(ra)}&dec=${encodeURIComponent(dec)}&fov=${encodeURIComponent(els.fov.value)}&band=${encodeURIComponent(els.band.value)}`;
    history.replaceState(null, "", url);
  }

  function motionSpeed(target) {
    return Math.hypot(target.pmra, target.pmdec) / 1000;
  }

  function motionDescription(target) {
    if (!target || !Number.isFinite(target.pmra) || !Number.isFinite(target.pmdec)) {
      return "Proper motion not plotted · variable-brightness target";
    }
    const speed = motionSpeed(target);
    const direction = target.pmra > 0
      ? (target.pmdec > 0 ? "up-left" : "down-left")
      : (target.pmdec > 0 ? "up-right" : "down-right");
    const travelPixels = speed * demoTimelineDuration() *
      Math.min(canvas.width, canvas.height) / (Number(els.fov.value) * 3600);
    const speedText = `${speed.toFixed(2)}″/year${travelPixels < 1 ? " · <1 px over 1-year preview" : ""}`;
    return `${speedText} · ${direction} · ${target.pmSource}${target.variable ? " · variable" : ""}`;
  }

  function demoTimelineDuration() {
    return demoYears[demoYears.length - 1];
  }

  function demoElapsedYears(index) {
    return demoTimelineDuration() * index / Math.max(1, demoYears.length - 1);
  }

  function motionArrow(target) {
    if (!Number.isFinite(target.pmra) || !Number.isFinite(target.pmdec)) return "●";
    if (motionSpeed(target) < 0.1) return "≈";
    if (target.pmra > 0) return target.pmdec > 0 ? "↖" : "↙";
    return target.pmdec > 0 ? "↗" : "↘";
  }

  function loadUrlState() {
    const hash = new URLSearchParams(location.hash.slice(1));
    const params = new URLSearchParams(location.search);
    const ra = hash.get("ra") || params.get("ra");
    const dec = hash.get("dec") || params.get("dec");
    if (ra !== null && Number.isFinite(Number(ra)) && Number(ra) >= 0 && Number(ra) <= 360) els.ra.value = Number(ra);
    if (dec !== null && Number.isFinite(Number(dec)) && Number(dec) >= -90 && Number(dec) <= 90) els.dec.value = Number(dec);
    if (hash.has("fov") && ["0.02", "0.1", "0.2", "0.5"].includes(hash.get("fov"))) els.fov.value = hash.get("fov");
    if (hash.has("band") && /^D[1-6]$/.test(hash.get("band"))) els.band.value = hash.get("band");
    const matched = targets.find(t => Math.abs(t.ra - Number(els.ra.value)) < 0.0001 && Math.abs(t.dec - Number(els.dec.value)) < 0.0001);
    if (matched) activeTarget = matched.name;
  }

  function drawDemo(index, alpha = 1, imageCtx = ctx) {
    const w = canvas.width;
    const h = canvas.height;
    imageCtx.save();
    imageCtx.globalAlpha = alpha;
    imageCtx.fillStyle = "#050914";
    imageCtx.fillRect(0, 0, w, h);
    const gradient = imageCtx.createRadialGradient(w * .54, h * .5, 5, w * .54, h * .5, w * .62);
    gradient.addColorStop(0, "#111b31");
    gradient.addColorStop(.58, "#0b1222");
    gradient.addColorStop(1, "#040811");
    imageCtx.fillStyle = gradient;
    imageCtx.fillRect(0, 0, w, h);

    const rand = seededRandom(skySeed);
    const starCount = Math.max(130, Math.round(w * h / 4200));
    for (let i = 0; i < starCount; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const bright = Math.pow(rand(), 4);
      const radius = .35 + bright * 2.2;
      imageCtx.beginPath();
      imageCtx.arc(x, y, radius, 0, Math.PI * 2);
      imageCtx.fillStyle = bright > .62 ? `rgba(255,222,167,${.35 + bright * .6})` : `rgba(174,207,255,${.2 + rand() * .7})`;
      imageCtx.fill();
      if (bright > .89) {
        imageCtx.strokeStyle = `rgba(230,242,255,${bright * .38})`;
        imageCtx.lineWidth = .7;
        imageCtx.beginPath();
        imageCtx.moveTo(x - 7, y);
        imageCtx.lineTo(x + 7, y);
        imageCtx.moveTo(x, y - 7);
        imageCtx.lineTo(x, y + 7);
        imageCtx.stroke();
      }
    }

    imageCtx.strokeStyle = "rgba(102,224,220,.1)";
    imageCtx.lineWidth = 1;
    imageCtx.setLineDash([4, 8]);
    for (let x = w * .2; x < w; x += w * .2) {
      imageCtx.beginPath(); imageCtx.moveTo(x, 0); imageCtx.lineTo(x, h); imageCtx.stroke();
    }
    for (let y = h * .2; y < h; y += h * .2) {
      imageCtx.beginPath(); imageCtx.moveTo(0, y); imageCtx.lineTo(w, y); imageCtx.stroke();
    }
    imageCtx.setLineDash([]);

    const target = targets.find(item => item.name === activeTarget);
    const elapsedYears = demoElapsedYears(index);
    const pixelsPerArcsecond = Math.min(w, h) / (Number(els.fov.value) * 3600);
    const pmra = target && Number.isFinite(target.pmra) ? target.pmra : 0;
    const pmdec = target && Number.isFinite(target.pmdec) ? target.pmdec : 0;
    const x = w / 2 - pmra / 1000 * elapsedYears * pixelsPerArcsecond;
    const y = h / 2 - pmdec / 1000 * elapsedYears * pixelsPerArcsecond;
    imageCtx.strokeStyle = "rgba(97,232,224,.62)";
    imageCtx.lineWidth = 1.5;
    imageCtx.beginPath();
    imageCtx.moveTo(w / 2, h / 2);
    imageCtx.lineTo(x, y);
    imageCtx.stroke();
    const glowRadius = 16;
    const glow = imageCtx.createRadialGradient(x, y, 1, x, y, glowRadius);
    glow.addColorStop(0, "rgba(97,232,224,.8)");
    glow.addColorStop(.1, "rgba(97,232,224,.28)");
    glow.addColorStop(1, "rgba(97,232,224,0)");
    imageCtx.fillStyle = glow;
    imageCtx.beginPath(); imageCtx.arc(x, y, glowRadius, 0, Math.PI * 2); imageCtx.fill();
    imageCtx.beginPath(); imageCtx.arc(x, y, 3, 0, Math.PI * 2);
    imageCtx.fillStyle = "#a9fff4"; imageCtx.fill();
    imageCtx.strokeStyle = "rgba(113,246,233,.7)";
    imageCtx.setLineDash([5, 5]);
    imageCtx.beginPath(); imageCtx.arc(x, y, 11, 0, Math.PI * 2); imageCtx.stroke();
    imageCtx.setLineDash([]);
    imageCtx.restore();
  }

  function currentFrameCount() {
    return remoteFrames.length || uploadedFrames.length || demoYears.length;
  }

  async function queryObservations(ra, dec, size, detector, signal) {
    if (location.protocol === "file:") {
      throw new Error("Start start-server.cmd, then open http://127.0.0.1:8765 to query the archive.");
    }
    const params = new URLSearchParams({ ra, dec, size, detector });
    const response = await fetch(`/api/observations?${params}`, { signal });
    if (!response.ok) throw new Error(`The local archive proxy failed (HTTP ${response.status}).`);
    return response.json();
  }

  async function getRemoteFrame(index) {
    const item = remoteFrames[index];
    if (!item) return null;
    if (!item.imageData) {
      const response = await fetch(`/api/frame?url=${encodeURIComponent(item.uri)}`);
      if (!response.ok) throw new Error(`Image download failed (HTTP ${response.status}).`);
      item.imageData = parseFits(await response.arrayBuffer());
    }
    return item.imageData;
  }

  async function drawImageData(item, targetCtx = ctx, opacity = 1) {
    if (!item) return;
    targetCtx.save();
    targetCtx.globalAlpha = opacity;
    if (item.kind === "image") {
      targetCtx.drawImage(item.image, 0, 0, canvas.width, canvas.height);
    } else {
      const values = item.values;
      let min = Infinity, max = -Infinity;
      for (const value of values) {
        if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value); }
      }
      const range = max > min ? max - min : 1;
      const imageData = targetCtx.createImageData(item.width, item.height);
      for (let i = 0; i < values.length; i++) {
        const v = Number.isFinite(values[i]) ? Math.max(0, Math.min(1, (values[i] - min) / range)) : 0;
        const p = i * 4;
        imageData.data[p] = Math.round(14 + v * 225);
        imageData.data[p + 1] = Math.round(19 + v * 225);
        imageData.data[p + 2] = Math.round(31 + v * 220);
        imageData.data[p + 3] = 255;
      }
      const offscreen = document.createElement("canvas");
      offscreen.width = item.width;
      offscreen.height = item.height;
      offscreen.getContext("2d").putImageData(imageData, 0, 0);
      targetCtx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    }
    targetCtx.restore();
  }

  async function drawFrame(index, targetCtx = ctx, opacity = 1) {
    if (remoteFrames.length) {
      const item = await getRemoteFrame(index);
      return drawImageData(item, targetCtx, opacity);
    }
    if (uploadedFrames.length) return drawImageData(uploadedFrames[index], targetCtx, opacity);
    drawDemo(index, opacity, targetCtx);
  }

  async function fetchObservations() {
    const thisRequest = ++requestId;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000);
    const ra = Number(els.ra.value);
    const dec = Number(els.dec.value);
    const hasLocalSample = uploadedFrames.some(item => item.sample);
    const matchesLocalSample = Math.abs(ra - 133.795129) < 0.0001 &&
      Math.abs(dec + 7.245147) < 0.0001 && els.band.value === "D3" &&
      Math.abs(Number(els.fov.value) - 0.1) < 0.0001;
    if (hasLocalSample && !matchesLocalSample) uploadedFrames = [];
    remoteFrames = [];
    els.status.textContent = uploadedFrames.some(item => item.sample)
      ? "Real SPHEREx sample · searching archive…"
      : "Searching the SPHEREx archive…";
    await render();
    try {
      const observations = await queryObservations(ra, dec, Number(els.fov.value), els.band.value, controller.signal);
      if (thisRequest !== requestId) return;
      remoteFrames = observations;
      frame = 0;
      if (!observations.length) {
        if (uploadedFrames.some(item => item.sample)) {
          els.status.textContent = "Real SPHEREx sample · D3";
          showToast("The archive returned no results; showing the downloaded real SPHEREx sample.");
        } else {
          els.status.textContent = "No observations found";
          showToast("No SPHEREx images were found for these coordinates, field of view, and detector.");
        }
      } else {
        uploadedFrames = uploadedFrames.filter(item => !item.sample);
        dimensions = { width: canvas.width, height: canvas.height };
        els.status.textContent = `${observations.length} SPHEREx observations`;
        showToast(`Found ${observations.length} real SPHEREx observations; downloading the first image.`);
      }
      render();
    } catch (error) {
      if (thisRequest !== requestId) return;
      if (error.name === "AbortError") {
        els.status.textContent = uploadedFrames.some(item => item.sample) ? "Real SPHEREx sample · archive timed out" : "Archive request timed out";
        showToast("The IRSA query did not respond within 90 seconds.");
      } else if (location.protocol === "file:") {
        els.status.textContent = uploadedFrames.some(item => item.sample)
          ? "Real sample loaded · server required for archive"
          : "Local server required for archive";
        showToast("Run start-server.cmd to query the real archive.");
      } else {
        els.status.textContent = uploadedFrames.some(item => item.sample) ? "Real SPHEREx sample · archive unavailable" : "Archive unavailable";
        showToast(`Could not retrieve SPHEREx data: ${error.message}`);
        console.error(error);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async function render() {
    const count = currentFrameCount();
    frame = Math.min(frame, count - 1);
    const band = els.band.value;
    const realFrames = remoteFrames.length ? remoteFrames : uploadedFrames;
    document.querySelector("#band-label").textContent = remoteFrames.length
      ? `SPHEREx-${band}`
      : realFrames.length ? `DETECTOR ${band}` : "CATALOG PM";
    document.querySelector("#frame-caption").textContent = realFrames.length
      ? `${realFrames[frame].name} · ${band}`
      : "Catalog PM extrapolation · representative field";
    document.querySelector("#frame-dimensions").textContent = `${dimensions.width} × ${dimensions.height} px`;
    document.querySelector("#observation-count").textContent = count;
    document.querySelector("#frame-count-label").textContent = realFrames.length ? "observations" : "PM demo steps";
    els.slider.setAttribute("aria-label", realFrames.length ? "Observation timeline" : "Catalog motion extrapolation");
    els.date.textContent = realFrames.length
      ? realFrames[frame].date || realFrames[frame].name
      : `Catalog PM +${demoElapsedYears(frame).toFixed(2)}y`;
    els.count.textContent = `${frame + 1} / ${count}`;
    els.slider.max = String(count - 1);
    els.slider.value = String(frame);
    els.ticks.innerHTML = "";
    const tickCount = Math.min(count, 8);
    for (let i = 0; i < tickCount; i++) {
      const tick = document.createElement("span");
      const tickIndex = Math.round(i * (count - 1) / Math.max(1, tickCount - 1));
      tick.textContent = realFrames.length
      ? `${i + 1}`
      : `+${demoElapsedYears(tickIndex).toFixed(1)}y`;
      els.ticks.append(tick);
    }
    updateCoordinates();
    els.empty.hidden = true;
    document.querySelector(".demo-label").hidden = realFrames.length > 0;
    document.querySelector("#orientation-label").hidden = realFrames.length > 0;

    try {
      if (mode === "difference" && count > 1) {
        if (!realFrames.length) {
          drawDemo(frame);
        const previous = document.createElement("canvas");
        previous.width = canvas.width; previous.height = canvas.height;
        drawDemo(Math.max(0, frame - 1), 1, previous.getContext("2d"));
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const previousData = previous.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < currentData.data.length; i += 4) {
          const d = Math.min(255, Math.abs(currentData.data[i] - previousData.data[i]) * 3);
          currentData.data[i] = d * .4;
          currentData.data[i + 1] = d;
          currentData.data[i + 2] = d * 1.1;
        }
        ctx.putImageData(currentData, 0, 0);
        } else {
        await drawFrame(frame, ctx);
        const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const prevCanvas = document.createElement("canvas");
        prevCanvas.width = canvas.width; prevCanvas.height = canvas.height;
        await drawFrame(Math.max(0, frame - 1), prevCanvas.getContext("2d"));
        const prev = prevCanvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < current.data.length; i += 4) {
          const d = Math.min(255, (Math.abs(current.data[i] - prev.data[i]) + Math.abs(current.data[i + 1] - prev.data[i + 1]) + Math.abs(current.data[i + 2] - prev.data[i + 2])) * .8);
          current.data[i] = d * .35; current.data[i + 1] = d; current.data[i + 2] = d * 1.15;
        }
        ctx.putImageData(current, 0, 0);
        }
      } else if (mode === "overlay" && count > 1) {
        await drawFrame(Math.max(0, frame - 1), ctx);
        await drawFrame(frame, ctx, .58);
      } else if (realFrames.length) {
        await drawFrame(frame);
      } else {
        drawDemo(frame);
      }
    } catch (error) {
      els.status.textContent = "Image could not be loaded";
      console.error(error);
      ctx.fillStyle = "#080d18";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#d5deeb";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Could not load SPHEREx image", canvas.width / 2, canvas.height / 2);
      showToast(`Could not load SPHEREx image: ${error.message}`);
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    const labels = { blink: "Play through time", overlay: "Overlay", difference: "Frame difference" };
    els.modeButtons.forEach(button => {
      const active = button.dataset.mode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    document.querySelector("#mode-description").textContent = labels[mode];
    render();
  }

  function stepFrame(delta) {
    frame = (frame + delta + currentFrameCount()) % currentFrameCount();
    render();
  }

  function togglePlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      els.play.textContent = "▶";
      els.play.setAttribute("aria-label", "Play");
    } else {
      timer = setInterval(() => stepFrame(1), Number(document.querySelector("#speed").value));
      els.play.textContent = "Ⅱ";
      els.play.setAttribute("aria-label", "Pause");
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2800);
  }

  function appendAssistantMessage(role, text) {
    const article = document.createElement("article");
    article.className = `assistant-message ${role === "user" ? "assistant-user" : "assistant-reply"}`;
    const name = document.createElement("strong");
    name.textContent = role === "user" ? "You" : "Astro FAQ";
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    article.append(name, paragraph);
    els.assistantMessages.append(article);
    els.assistantMessages.scrollTop = els.assistantMessages.scrollHeight;
  }

  function normalizeFaqText(text) {
    return text.toLowerCase().replace(/\u0131/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ").trim();
  }

  function isTurkishQuestion(question) {
    const text = ` ${normalizeFaqText(question)} `;
    return [" nedir ", " ne ", " nasil ", " neden ", " niye ", " hangi ", " kac ",
      " ne zaman ", " veri ", " gozlem ", " hareket ", " yil ", " goster "]
      .some(hint => text.includes(hint));
  }

  function getFaqAnswer(question) {
    const text = ` ${normalizeFaqText(question)} `;
    const turkish = isTurkishQuestion(question);
    const entries = [
      {
        triggers: ["what is spherex", "what does spherex stand for", "spherex nedir", "spherex ne demek", "spherex ne"],
        en: "SPHEREx stands for Spectro-Photometer for the History of the Universe, Epoch of Reionization, and Ices Explorer. It maps the entire sky in infrared light from 0.75 to 5 microns across 102 spectral channels.",
        tr: "SPHEREx, Evrenin Tarihi, Yeniden İyonlaşma Dönemi ve Buzları Araştıran Spektro-Fotometre anlamına gelir. Tüm gökyüzünü 0,75–5 mikron aralığında, 102 kızılötesi spektral kanalla haritalar."
      },
      {
        triggers: ["when did spherex launch", "spherex launch date", "spherex launched", "spherex ne zaman f", "spherex 2025", "launch"],
        en: "SPHEREx launched on March 11, 2025. Its launch date is different from the dates of observations shown in the archive.",
        tr: "SPHEREx, 11 Mart 2025'te fırlatıldı. Fırlatma tarihi, arşivde gösterilen gözlem tarihlerinden farklıdır."
      },
      {
        triggers: ["what is the one year preview", "what is the 1 year preview", "catalog motion preview", "catalog pm preview", "one year catalog", "synthetic scene", "sentetik sahne", "preview"],
        en: "The one-year catalog-motion preview projects a target's catalog proper motion for illustration. It is not a sequence of SPHEREx observations; real SPHEREx frames are labeled with their recorded observation dates.",
        tr: "Bir yıllık katalog hareketi önizlemesi, hedefin katalog öz hareketini göstermek için yapılan bir canlandırmadır. SPHEREx gözlem dizisi değildir; gerçek SPHEREx görüntüleri kendi kayıtlı gözlem tarihleriyle gösterilir."
      },
      {
        triggers: ["A", "why do all targets move", "same direction", "not moving", "does not move", "hepsi ayni yon", "hareket etmiyor", "hepsi ayni yone"],
        en: "Each target has its own catalog proper-motion vector, so directions and speeds can differ. Very slow motion may be hard to see in a one-year preview; R Draconis has no proper motion assigned in this demo.",
        tr: "Her hedefin katalog öz hareket yönü ve hızı farklıdır. Çok yavaş hareket bir yıllık önizlemede zor görülebilir; bu demoda R Draconis için öz hareket değeri atanmamıştır."
      },
      {
        triggers: ["why no images", "no archive results", "representative field", "why is there no data", "veri yok", "goruntu yok", "arsivde sonuc", "neden bos"],
        en: "Archive coverage depends on the selected coordinates, detector, and available release. If no matching image is found, the viewer may show a representative field and catalog-motion preview instead of an archive image.",
        tr: "Arşiv kapsamı seçilen koordinata, dedektöre ve mevcut veri sürümüne bağlıdır. Uygun görüntü bulunamazsa arşiv görüntüsü yerine temsili bir gökyüzü alanı ve katalog hareketi önizlemesi gösterilebilir."
      },
      {
        triggers: ["what is proper motion", "proper motion", "star motion", "why does the target move", "oz hareket", "yildiz hareket", "hedef neden hareket"],
        en: "Proper motion is a star's apparent angular change in position across the sky over time, measured from astrometric data. The demo projects catalog values; it does not measure motion from the displayed SPHEREx image.",
        tr: "Öz hareket, bir yıldızın gökyüzündeki görünür açısal konumunun zamanla değişmesidir ve astrometrik verilerden ölçülür. Demodaki hareket katalog değerlerini canlandırır; gösterilen SPHEREx görüntüsünden hareket ölçümü yapılmaz."
      },
      {
        triggers: ["what are the detectors", "detector bands", "d1 d2 d3 d4 d5 d6", "what is d1", "dedektor", "bantlar"],
        en: "The six SPHEREx detector bands cover approximately: D1 0.75–1.09 µm, D2 1.10–1.62 µm, D3 1.63–2.41 µm, D4 2.42–3.82 µm, D5 3.83–4.41 µm, and D6 4.42–5.00 µm.",
        tr: "SPHEREx'in altı dedektör bandı yaklaşık olarak şu aralıkları kapsar: D1 0,75–1,09 µm, D2 1,10–1,62 µm, D3 1,63–2,41 µm, D4 2,42–3,82 µm, D5 3,83–4,41 µm ve D6 4,42–5,00 µm."
      },
      {
        triggers: ["what is fits", "fits file", "upload fits", "fits dosyasi"],
        en: "FITS is a standard file format for astronomical data. This app can display supported 2D FITS image files, as well as common PNG and JPEG images.",
        tr: "FITS, astronomi verileri için kullanılan standart bir dosya biçimidir. Uygulama desteklenen 2B FITS görüntülerini ve PNG/JPEG dosyalarını gösterebilir."
      },
      {
        triggers: ["is this a scientific measurement", "scientific measurement", "calibrated", "bilimsel olcum", "bilimsel analiz"],
        en: "This app is an educational visualization, not a calibrated scientific measurement tool. It does not perform WCS-based alignment or photometric calibration; use the official archive products for scientific analysis.",
        tr: "Bu uygulama eğitim amaçlı bir görselleştirmedir; kalibre edilmiş bilimsel ölçüm aracı değildir. WCS hizalaması veya fotometrik kalibrasyon yapmaz. Bilimsel analiz için resmi arşiv ürünlerini kullanın."
      }
    ];

    let bestMatch = null;
    for (const entry of entries) {
      const score = Math.max(...entry.triggers.map(trigger => {
        const normalizedTrigger = normalizeFaqText(trigger);
        return text.includes(` ${normalizedTrigger} `) ? normalizedTrigger.length : 0;
      }));
      if (score > 0 && (!bestMatch || score > bestMatch.score)) bestMatch = { entry, score };
    }

    const target = targets.find(item => item.name === activeTarget);
    const targetQuestion = [" selected target ", " current target ", " which target is selected ", " what target is selected "].some(phrase => text.includes(phrase)) ||
      [" hangi hedef secili ", " secilen hedef "].some(phrase => text.includes(phrase)) ||
      targets.some(item => text.includes(` ${normalizeFaqText(item.name)} `));
    if (targetQuestion) {
      const motion = motionDescription(target);
      return turkish
        ? `Seçili hedef: ${activeTarget}. ${motion}. Hareket değeri katalog bilgisidir; önizleme gerçek SPHEREx gözlemi değildir.`
        : `Selected target: ${activeTarget}. ${motion}. The motion value comes from catalog information; the preview is not a real SPHEREx observation.`;
    }

    if (bestMatch) return turkish ? bestMatch.entry.tr : bestMatch.entry.en;
    return turkish
      ? "Ben hızlı bir astronomi SSS yardımcısıyım; serbest sohbet edemem. Şunları sorabilirsin: SPHEREx nedir, ne zaman fırlatıldı, bir yıllık önizleme ne demek, öz hareket nedir veya seçili hedef hangisi?"
      : "I'm a quick astronomy FAQ helper, not a general chat AI. Try asking: What is SPHEREx? When did it launch? What does the one-year preview show? What is proper motion? Which target is selected?";
  }

  function askAssistant(event) {
    event.preventDefault();
    const question = els.assistantInput.value.trim();
    if (!question) return;

    appendAssistantMessage("user", question);
    els.assistantInput.value = "";
    appendAssistantMessage("assistant", getFaqAnswer(question));
    els.assistantInput.focus();
  }

  function checkAssistantAvailability() {
    els.assistantStatus.textContent = "Instant answers from the built-in astronomy FAQ. No AI model, API key, or extra model memory required.";
  }

  function parseFits(buffer) {
    const bytes = new Uint8Array(buffer);
    const decoder = new TextDecoder("ascii");
    const view = new DataView(buffer);
    let hduOffset = 0;
    let fallbackImage = null;
    while (hduOffset + 80 <= bytes.length) {
      const cards = {};
      let cursor = hduOffset;
      let endFound = false;A
      while (cursor + 80 <= bytes.length) {A
        const card = decoder.decode(bytes.subarray(cursor, cursor + 80));
        cursor += 80;
        const key = card.slice(0, 8).trim();
        if (key === "END") { endFound = true; break; }
        if (card[8] === "=") {
          const value = card.slice(10, 80).split("/")[0].trim();
          cards[key] = value.replace(/^'|'$/g, "").trim();
        }
      }
      if (!endFound) break;
      const dataOffset = Math.ceil(cursor / 2880) * 2880;
      const axes = Number(cards.NAXIS || 0);
      const bitpix = Number(cards.BITPIX);
      const bytesPerValue = Math.abs(bitpix) / 8;
      const pixelCount = axes ? Array.from({ length: axes }, (_, i) => Number(cards[`NAXIS${i + 1}`] || 0)).reduce((a, b) => a * b, 1) : 0;
      const dataBytes = (pixelCount + Number(cards.PCOUNT || 0)) * Number(cards.GCOUNT || 1) * bytesPerValue;
      const nextHduOffset = Math.ceil((dataOffset + dataBytes) / 2880) * 2880;
      const extName = (cards.EXTNAME || "").toUpperCase();
      const isImage = axes === 2 && Number(cards.NAXIS1) > 0 && Number(cards.NAXIS2) > 0;
      if (isImage && [8, 16, 32, -32, -64].includes(bitpix) && dataOffset + pixelCount * bytesPerValue <= bytes.byteLength) {
        const width = Number(cards.NAXIS1);
        const height = Number(cards.NAXIS2);
        const values = new Float32Array(pixelCount);
        const bscale = Number(cards.BSCALE || 1);
        const bzero = Number(cards.BZERO || 0);
        for (let i = 0, p = dataOffset; i < pixelCount; i++, p += bytesPerValue) {
          let value;
          if (bitpix === 8) value = view.getUint8(p);
          else if (bitpix === 16) value = view.getInt16(p, false);
          else if (bitpix === 32) value = view.getInt32(p, false);
          else if (bitpix === -32) value = view.getFloat32(p, false);
          else value = view.getFloat64(p, false);
          values[i] = value * bscale + bzero;
        }
        const image = {
          kind: "fits",
          width,
          height,
          values,
          date: cards["DATE-OBS"] || cards.DATE || "",
          detector: cards.DETECTOR || ""
        };
        if (extName === "IMAGE") return image;
        if (!fallbackImage) fallbackImage = image;
      }
      if (nextHduOffset <= hduOffset || nextHduOffset >= bytes.length) break;
      hduOffset = nextHduOffset;
    }
    if (fallbackImage) return fallbackImage;
    throw new Error("No 2D image HDU was found in the FITS file.");
  }

  async function loadFiles(fileList) {
    const files = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!files.length) return;
    const nextFrames = [];
    try {
      for (const file of files) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".fits") || lower.endsWith(".fit") || lower.endsWith(".fts")) {
          const fits = parseFits(await file.arrayBuffer());
          nextFrames.push({ ...fits, name: file.name });
        } else if (file.type.startsWith("image/")) {
          const image = await createImageBitmap(file);
          nextFrames.push({ kind: "image", image, name: file.name, width: image.width, height: image.height });
        } else {
          throw new Error(`${file.name}: choose a PNG, JPEG, or FITS file.`);
        }
      }
      uploadedFrames = nextFrames;
      remoteFrames = [];
      dimensions = { width: uploadedFrames[0].width, height: uploadedFrames[0].height };
      frame = 0;
      activeTarget = "Uploaded observations";
      els.status.textContent = `${uploadedFrames.length} local images`;
      document.querySelector(".demo-label").hidden = true;
      render();
      showToast(`${uploadedFrames.length} images loaded and sorted by time.`);
    } catch (error) {
      console.error(error);
      showToast(error.message || "Could not load images.");
    }
    els.fileInput.value = "";
  }

  async function loadSample() {
    if (location.protocol === "file:") return;
    if (Math.abs(Number(els.ra.value) - 133.795129) >= 0.0001 ||
        Math.abs(Number(els.dec.value) + 7.245147) >= 0.0001 ||
        els.band.value !== "D3" || Math.abs(Number(els.fov.value) - 0.1) >= 0.0001) return;
    try {
      const response = await fetch("/data/wise0855-d3-cutout.fits");
      if (!response.ok) throw new Error(`Sample FITS download failed (HTTP ${response.status}).`);
      const image = parseFits(await response.arrayBuffer());
      uploadedFrames = [{
        ...image,
        name: "WISE 0855 · SPHEREx DR1",
        date: image.date || "SPHEREx DR1",
        sample: true
      }];
      dimensions = { width: image.width, height: image.height };
      els.status.textContent = "Real SPHEREx sample · D3";
      render();
    } catch (error) {
      console.error(error);
      showToast(`Could not load the local SPHEREx sample: ${error.message}`);
    }
  }

  document.querySelector("#upload-trigger").addEventListener("click", () => els.fileInput.click());
  document.querySelector("#empty-upload").addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", event => loadFiles(event.target.files));
  els.form.addEventListener("submit", event => {
    event.preventDefault();
    if (!els.form.reportValidity()) return;
    activeTarget = "Custom coordinates";
    updateTargetButtons();
    fetchObservations();
  });
  els.modeButtons.forEach(button => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.assistantForm.addEventListener("submit", askAssistant);
  document.querySelectorAll("[data-faq-question]").forEach(button => {
    button.addEventListener("click", () => {
      els.assistantInput.value = button.dataset.faqQuestion;
      els.assistantForm.requestSubmit();
    });
  });
  els.slider.addEventListener("input", () => { frame = Number(els.slider.value); render(); });
  els.play.addEventListener("click", togglePlay);
  document.querySelector("#previous").addEventListener("click", () => stepFrame(-1));
  document.querySelector("#next").addEventListener("click", () => stepFrame(1));
  document.querySelector("#speed").addEventListener("change", () => {
    if (timer) { clearInterval(timer); timer = setInterval(() => stepFrame(1), Number(document.querySelector("#speed").value)); }
  });
  els.fov.addEventListener("change", fetchObservations);
  els.band.addEventListener("change", fetchObservations);
  document.querySelector("#download").addEventListener("click", () => {
    const link = document.createElement("a");
    link.download = `spherex-sky-${els.ra.value}-${els.dec.value}-frame-${frame + 1}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });
  window.addEventListener("resize", render);

  initBands();
  initTargets();
  loadUrlState();
  render();
  checkAssistantAvailability();
  loadSample().then(() => {
    if (!uploadedFrames.some(item => item.sample)) fetchObservations();
  });
})();
