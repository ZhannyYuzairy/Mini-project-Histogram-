const imageInput = document.getElementById('imageInput');
const pickBtn = document.getElementById('pickBtn');
const processBtn = document.getElementById('processBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const fileName = document.getElementById('fileName');
const statusBox = document.getElementById('statusBox');
const modeInfoBox = document.getElementById('modeInfoBox');
const emphasis = document.getElementById('emphasis');
const emphasisValue = document.getElementById('emphasisValue');
const meanStat = document.getElementById('meanStat');
const rangeStat = document.getElementById('rangeStat');
const modeStat = document.getElementById('modeStat');
const styleStat = document.getElementById('styleStat');
const histDescription = document.getElementById('histDescription');
const inputHistLabel = document.getElementById('inputHistLabel');
const targetHistLabel = document.getElementById('targetHistLabel');
const resultHistLabel = document.getElementById('resultHistLabel');

const originalCanvas = document.getElementById('originalCanvas');
const resultCanvas = document.getElementById('resultCanvas');
const inputHistCanvas = document.getElementById('inputHist');
const targetHistCanvas = document.getElementById('targetHist');
const resultHistCanvas = document.getElementById('resultHist');

let currentImageURL = null;
let processedDataURL = null;
let currentStyle = 'cinematic';
let currentMode = 'grayscale';

pickBtn.addEventListener('click', () => imageInput.click());

emphasis.addEventListener('input', () => {
  emphasisValue.textContent = Number(emphasis.value).toFixed(2);
});

function updateModeTexts() {
  if (currentMode === 'rgb') {
    modeInfoBox.textContent = 'Mode aktif: RGB per-channel. Histogram specification dilakukan terpisah untuk kanal R, G, dan B.';
    histDescription.textContent = 'Histogram input, target, dan hasil ditampilkan sebagai overlay kanal R/G/B untuk menunjukkan perubahan distribusi tiap kanal.';
    inputHistLabel.textContent = 'Histogram Input (RGB)';
    targetHistLabel.textContent = 'Histogram Target (RGB)';
    resultHistLabel.textContent = 'Histogram Hasil (RGB)';
  } else {
    modeInfoBox.textContent = 'Mode aktif: Grayscale. Specification dilakukan terhadap intensitas abu-abu.';
    histDescription.textContent = 'Histogram input, target, dan hasil ditampilkan berdampingan agar perubahan distribusi lebih mudah dianalisis.';
    inputHistLabel.textContent = 'Histogram Input';
    targetHistLabel.textContent = 'Histogram Target';
    resultHistLabel.textContent = 'Histogram Hasil';
  }
}

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentMode = btn.dataset.mode;
    updateModeTexts();
    statusBox.textContent = `Mode diganti ke "${currentMode}". Klik Proses Histogram untuk menjalankan ulang.`;
  });
});

document.querySelectorAll('.style-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.style-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
  });
});

imageInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  fileName.textContent = file.name;
  currentImageURL = URL.createObjectURL(file);
  processedDataURL = null;
  statusBox.textContent = 'Gambar berhasil dimuat. Klik tombol Proses Histogram untuk menjalankan histogram specification.';
});

function computeHistogram(values) {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < values.length; i++) hist[values[i]]++;
  return hist;
}

function computeCDF(hist) {
  const total = hist.reduce((a, b) => a + b, 0) || 1;
  const cdf = new Array(256).fill(0);
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += hist[i];
    cdf[i] = sum / total;
  }
  return cdf;
}

function buildTargetHistogram(style, strength) {
  const normalizedStrength = Math.max(0.7, Math.min(2.3, strength));
  const amp = 0.75 + normalizedStrength * 0.95;
  const shape = 1 / normalizedStrength;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    let value = 1;
    if (style === 'bright') {
      value = Math.pow(x, 0.65 * shape) * (210 * amp) + 5;
    } else if (style === 'dark') {
      value = Math.pow(1 - x, 0.65 * shape) * (210 * amp) + 5;
    } else if (style === 'contrast') {
      const bowl = Math.pow(x, 0.45 * shape) + Math.pow(1 - x, 0.45 * shape);
      value = bowl * (120 * amp) + 5;
    } else if (style === 'midtone') {
      const sigma = 0.22 / normalizedStrength;
      const g = Math.exp(-Math.pow((x - 0.5) / sigma, 2));
      value = g * (250 * amp) + 4;
    } else {
      const left = Math.exp(-Math.pow((x - 0.22) / 0.12, 2));
      const right = Math.exp(-Math.pow((x - 0.78) / 0.14, 2));
      value = (left * 140 + right * 220) * amp + 4;
    }
    hist[i] = Math.max(1, Math.round(value));
  }
  return hist;
}

function buildMapping(inputCDF, targetCDF) {
  const mapping = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) {
    let bestJ = 0;
    let bestDiff = Infinity;
    for (let j = 0; j < 256; j++) {
      const diff = Math.abs(inputCDF[i] - targetCDF[j]);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestJ = j;
      }
    }
    mapping[i] = bestJ;
  }
  return mapping;
}

function drawHistogram(canvas, hist, topColor, bottomColor) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, width, height);
  const maxVal = Math.max(...hist, 1);
  for (let i = 0; i < 256; i++) {
    const x = (i / 256) * width;
    const barW = width / 256;
    const barH = (hist[i] / maxVal) * (height - 22);
    const grad = ctx.createLinearGradient(0, height - barH, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.fillRect(x, height - barH, Math.max(1, barW), barH);
  }
}

function drawRGBHistogram(canvas, channels) {
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#07111f';
  ctx.fillRect(0, 0, width, height);

  const maxVal = Math.max(
    ...channels.r,
    ...channels.g,
    ...channels.b,
    1
  );

  for (let i = 0; i < 256; i++) {
    const x = (i / 256) * width;
    const barW = Math.max(1, width / 256);
    const rH = (channels.r[i] / maxVal) * (height - 20);
    const gH = (channels.g[i] / maxVal) * (height - 20);
    const bH = (channels.b[i] / maxVal) * (height - 20);

    ctx.fillStyle = 'rgba(255, 99, 132, 0.38)';
    ctx.fillRect(x, height - rH, barW, rH);
    ctx.fillStyle = 'rgba(80, 255, 160, 0.38)';
    ctx.fillRect(x, height - gH, barW, gH);
    ctx.fillStyle = 'rgba(120, 180, 255, 0.38)';
    ctx.fillRect(x, height - bH, barW, bH);
  }
}

function toGrayscaleChannels(data) {
  const gray = new Uint8ClampedArray(data.length / 4);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  return gray;
}

function extractRGBChannels(data) {
  const length = data.length / 4;
  const r = new Uint8ClampedArray(length);
  const g = new Uint8ClampedArray(length);
  const b = new Uint8ClampedArray(length);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    r[p] = data[i];
    g[p] = data[i + 1];
    b[p] = data[i + 2];
  }
  return { r, g, b };
}

function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, min: 0, max: 0 };
  }
  let sum = 0;
  let min = values[0];
  let max = values[0];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    sum += v;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const mean = sum / values.length;
  return { mean, min, max };
}

function formatMode(mode) {
  return mode === 'rgb' ? 'RGB Per-Channel' : 'Grayscale';
}

function processGrayscale(imageData, width, height) {
  const gray = toGrayscaleChannels(imageData.data);
  const inputHist = computeHistogram(gray);
  const targetHist = buildTargetHistogram(currentStyle, parseFloat(emphasis.value));
  const inputCDF = computeCDF(inputHist);
  const targetCDF = computeCDF(targetHist);
  const mapping = buildMapping(inputCDF, targetCDF);

  const resultImage = new ImageData(width, height);
  const outGray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < resultImage.data.length; i += 4, p++) {
    const mapped = mapping[gray[p]];
    outGray[p] = mapped;
    resultImage.data[i] = mapped;
    resultImage.data[i + 1] = mapped;
    resultImage.data[i + 2] = mapped;
    resultImage.data[i + 3] = 255;
  }

  return {
    displayOriginal: (() => {
      const img = new ImageData(width, height);
      for (let i = 0, p = 0; i < img.data.length; i += 4, p++) {
        img.data[i] = gray[p];
        img.data[i + 1] = gray[p];
        img.data[i + 2] = gray[p];
        img.data[i + 3] = 255;
      }
      return img;
    })(),
    resultImage,
    chart: {
      input: inputHist,
      target: targetHist,
      result: computeHistogram(outGray),
      type: 'gray'
    },
    stats: {
      before: calculateStats(gray),
      after: calculateStats(outGray)
    }
  };
}

function processRGB(imageData, width, height) {
  const channelsIn = extractRGBChannels(imageData.data);
  const targetHist = buildTargetHistogram(currentStyle, parseFloat(emphasis.value));
  const targetCDF = computeCDF(targetHist);

  const histInR = computeHistogram(channelsIn.r);
  const histInG = computeHistogram(channelsIn.g);
  const histInB = computeHistogram(channelsIn.b);

  const mapR = buildMapping(computeCDF(histInR), targetCDF);
  const mapG = buildMapping(computeCDF(histInG), targetCDF);
  const mapB = buildMapping(computeCDF(histInB), targetCDF);

  const resultImage = new ImageData(width, height);
  const outR = new Uint8ClampedArray(width * height);
  const outG = new Uint8ClampedArray(width * height);
  const outB = new Uint8ClampedArray(width * height);

  for (let i = 0, p = 0; i < resultImage.data.length; i += 4, p++) {
    const nr = mapR[channelsIn.r[p]];
    const ng = mapG[channelsIn.g[p]];
    const nb = mapB[channelsIn.b[p]];

    outR[p] = nr;
    outG[p] = ng;
    outB[p] = nb;
    resultImage.data[i] = nr;
    resultImage.data[i + 1] = ng;
    resultImage.data[i + 2] = nb;
    resultImage.data[i + 3] = 255;
  }

  return {
    displayOriginal: imageData,
    resultImage,
    chart: {
      input: { r: histInR, g: histInG, b: histInB },
      target: { r: targetHist, g: targetHist, b: targetHist },
      result: { r: computeHistogram(outR), g: computeHistogram(outG), b: computeHistogram(outB) },
      type: 'rgb'
    },
    stats: {
      before: calculateStats(toGrayscaleChannels(imageData.data)),
      after: calculateStats(toGrayscaleChannels(resultImage.data))
    }
  };
}

function renderCharts(chart) {
  if (chart.type === 'rgb') {
    drawRGBHistogram(inputHistCanvas, chart.input);
    drawRGBHistogram(targetHistCanvas, chart.target);
    drawRGBHistogram(resultHistCanvas, chart.result);
  } else {
    drawHistogram(inputHistCanvas, chart.input, '#a78bfa', '#7c3aed');
    drawHistogram(targetHistCanvas, chart.target, '#f9a8d4', '#ec4899');
    drawHistogram(resultHistCanvas, chart.result, '#67e8f9', '#06b6d4');
  }
}

processBtn.addEventListener('click', () => {
  if (!currentImageURL) {
    statusBox.textContent = 'Silakan pilih gambar terlebih dahulu.';
    return;
  }

  const img = new Image();
  img.onload = function () {
    try {
      const width = img.width;
      const height = img.height;
      originalCanvas.width = width;
      originalCanvas.height = height;
      resultCanvas.width = width;
      resultCanvas.height = height;

      const octx = originalCanvas.getContext('2d');
      const rctx = resultCanvas.getContext('2d');
      octx.drawImage(img, 0, 0);
      const sourceData = octx.getImageData(0, 0, width, height);

      const result = currentMode === 'rgb'
        ? processRGB(sourceData, width, height)
        : processGrayscale(sourceData, width, height);

      octx.putImageData(result.displayOriginal, 0, 0);
      rctx.putImageData(result.resultImage, 0, 0);
      processedDataURL = resultCanvas.toDataURL('image/png');

      renderCharts(result.chart);

      meanStat.textContent = `${result.stats.before.mean.toFixed(2)} -> ${result.stats.after.mean.toFixed(2)}`;
      rangeStat.textContent = `${result.stats.before.min}-${result.stats.before.max} -> ${result.stats.after.min}-${result.stats.after.max}`;
      modeStat.textContent = formatMode(currentMode);
      styleStat.textContent = currentStyle;
      statusBox.textContent = `Histogram specification selesai pada mode ${formatMode(currentMode)} dengan style "${currentStyle}".`;
    } catch (error) {
      processedDataURL = null;
      statusBox.textContent = `Proses gagal: ${error.message}`;
      console.error('Histogram process error:', error);
    }
  };
  img.onerror = function () {
    statusBox.textContent = 'Gagal memuat gambar. Coba pilih file gambar lain.';
  };
  img.src = currentImageURL;
});

downloadBtn.addEventListener('click', () => {
  if (!processedDataURL) {
    statusBox.textContent = 'Belum ada hasil untuk di-download.';
    return;
  }
  const link = document.createElement('a');
  link.href = processedDataURL;
  link.download = 'hasil_histogram_specification.png';
  link.click();
});

resetBtn.addEventListener('click', () => {
  currentImageURL = null;
  processedDataURL = null;
  imageInput.value = '';
  fileName.textContent = 'Belum ada gambar dipilih';
  statusBox.textContent = 'Unggah citra grayscale atau citra berwarna untuk memulai eksperimen.';
  meanStat.textContent = '-';
  rangeStat.textContent = '-';
  modeStat.textContent = '-';
  styleStat.textContent = '-';
  [originalCanvas, resultCanvas, inputHistCanvas, targetHistCanvas, resultHistCanvas].forEach(canvas => {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });
});

updateModeTexts();
