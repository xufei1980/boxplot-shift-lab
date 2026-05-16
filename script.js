const svg = document.querySelector("#chart");
const groupASlider = document.querySelector("#groupASlider");
const shiftSlider = document.querySelector("#shiftSlider");
const checkButton = document.querySelector("#checkButton");
const resetButton = document.querySelector("#resetButton");
const statusLabel = document.querySelector("#statusLabel");
const statusText = document.querySelector("#statusText");
const overlapValue = document.querySelector("#overlapValue");
const medianShiftValue = document.querySelector("#medianShiftValue");
const shapeValue = document.querySelector("#shapeValue");

const SVG_NS = "http://www.w3.org/2000/svg";
const statOrder = ["min", "q1", "median", "q3", "max"];
const statLabels = { min: "min", q1: "Q1", median: "median", q3: "Q3", max: "max" };
const chart = {
  width: 980,
  height: 660,
  left: 118,
  right: 54,
  top: 48,
  bottom: 74,
  xMin: 0,
  xMax: 100,
};

const kgDomain = { min: 1.5, max: 4.5 };
const kiwiStats = {
  a: {
    label: "F",
    min: 1.644,
    q1: 2.622,
    median: 2.9015,
    mean: 2.9144,
    q3: 3.192,
    max: 4.143,
    sd: 0.40355,
    num: 364,
  },
  b: {
    label: "M",
    min: 1.57,
    q1: 2.069,
    median: 2.246,
    mean: 2.2551,
    q3: 2.429,
    max: 2.953,
    sd: 0.2747,
    num: 336,
  },
};

function kgToValue(kg) {
  return ((kg - kgDomain.min) / (kgDomain.max - kgDomain.min)) * 100;
}

function valueToKg(value) {
  return kgDomain.min + (value / 100) * (kgDomain.max - kgDomain.min);
}

const initialGroups = {
  a: {
    min: kgToValue(kiwiStats.a.min),
    q1: kgToValue(kiwiStats.a.q1),
    median: kgToValue(kiwiStats.a.median),
    q3: kgToValue(kiwiStats.a.q3),
    max: kgToValue(kiwiStats.a.max),
  },
  b: {
    min: kgToValue(kiwiStats.b.min),
    q1: kgToValue(kiwiStats.b.q1),
    median: kgToValue(kiwiStats.b.median),
    q3: kgToValue(kiwiStats.b.q3),
    max: kgToValue(kiwiStats.b.max),
  },
};

let groups = cloneGroups(initialGroups);
let dragState = null;
let resultVisible = false;

function cloneGroups(source) {
  return {
    a: { ...source.a },
    b: { ...source.b },
  };
}

function xScale(value) {
  const span = chart.width - chart.left - chart.right;
  return chart.left + ((value - chart.xMin) / (chart.xMax - chart.xMin)) * span;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pointerValue(event) {
  const bounds = svg.getBoundingClientRect();
  const relativeX = (event.clientX - bounds.left) / bounds.width;
  const svgX = relativeX * chart.width;
  const span = chart.width - chart.left - chart.right;
  return chart.xMin + ((svgX - chart.left) / span) * (chart.xMax - chart.xMin);
}

function el(tag, attrs = {}, parent = svg) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  parent.appendChild(node);
  return node;
}

function shapeOf(stats) {
  const leftTail = stats.median - stats.min;
  const rightTail = stats.max - stats.median;
  const diff = rightTail - leftTail;
  if (Math.abs(diff) < 7) return "roughly symmetric";
  return diff > 0 ? "right skew" : "left skew";
}

function comparisonStats(a, b) {
  const overlap = Math.max(0, Math.min(a.q3, b.q3) - Math.max(a.q1, b.q1));
  const smallerIqr = Math.min(a.q3 - a.q1, b.q3 - b.q1);
  const overlapPct = smallerIqr > 0 ? Math.round((overlap / smallerIqr) * 100) : 0;
  const medianShift = b.median - a.median;
  const isShift = overlapPct < 25 || Math.abs(medianShift) >= 18;
  return { overlap, overlapPct, medianShift, isShift };
}

function densityPath(stats, yBase, height) {
  const points = [];
  const shape = shapeOf(stats);
  const leftWidth = Math.max(stats.median - stats.min, 4);
  const rightWidth = Math.max(stats.max - stats.median, 4);
  const sigmaLeft = Math.max(leftWidth * 0.5, shape === "left skew" ? leftWidth * 0.68 : 6);
  const sigmaRight = Math.max(rightWidth * 0.5, shape === "right skew" ? rightWidth * 0.68 : 6);
  const peak = shape === "left skew"
    ? stats.q3
    : shape === "right skew"
      ? stats.q1
      : stats.median;

  for (let value = stats.min; value <= stats.max; value += 1.2) {
    const sigma = value < peak ? sigmaLeft : sigmaRight;
    const d = Math.exp(-((value - peak) ** 2) / (2 * sigma ** 2));
    points.push([xScale(value), yBase - d * height]);
  }
  const start = `M ${xScale(stats.min)} ${yBase}`;
  const curve = points.map(([x, y]) => `L ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const end = `L ${xScale(stats.max)} ${yBase} Z`;
  return `${start} ${curve} ${end}`;
}

function interpolatedQuantile(stats, p) {
  const anchors = [
    [0, stats.min],
    [0.25, stats.q1],
    [0.5, stats.median],
    [0.75, stats.q3],
    [1, stats.max],
  ];
  for (let index = 0; index < anchors.length - 1; index += 1) {
    const [p0, v0] = anchors[index];
    const [p1, v1] = anchors[index + 1];
    if (p >= p0 && p <= p1) {
      const t = (p - p0) / (p1 - p0);
      const eased = t * t * (3 - 2 * t);
      return v0 + (v1 - v0) * eased;
    }
  }
  return stats.max;
}

function drawDotPlot(stats, yBase, maxRows = 12) {
  const binWidth = 1.4;
  const dotGap = 8;
  const dotRadius = 3.8;
  const dotTotal = 132;
  const bins = new Map();

  for (let index = 0; index < dotTotal; index += 1) {
    const p = (index + 0.5) / dotTotal;
    const wave = Math.sin(index * 2.399) * 0.35;
    const value = clamp(
      interpolatedQuantile(stats, p) + wave,
      stats.min,
      stats.max,
    );
    const bin = Math.round(value / binWidth) * binWidth;
    const count = bins.get(bin) || 0;
    if (count < maxRows) {
      bins.set(bin, count + 1);
      el("circle", {
        cx: xScale(bin),
        cy: yBase - count * dotGap,
        r: dotRadius,
        class: "dot",
      });
    }
  }
}

function drawAxis() {
  for (let value = 0; value <= 100; value += 10) {
    const x = xScale(value);
    el("line", {
      x1: x,
      x2: x,
      y1: chart.top,
      y2: chart.height - chart.bottom,
      class: "grid-line",
    });
  }
  drawXAxis(326, 350, "Group A value");
  drawXAxis(chart.height - chart.bottom, chart.height - 36, "Group B value");
}

function drawXAxis(axisY, labelY, axisLabel) {
  for (let value = 0; value <= 100; value += 10) {
    const x = xScale(value);
    el("line", {
      x1: x,
      x2: x,
      y1: axisY - 5,
      y2: axisY + 5,
      class: "axis-strong",
    });
    el("text", {
      x,
      y: labelY,
      "text-anchor": "middle",
      class: "tick-label",
    }).textContent = value;
  }
  el("line", {
    x1: chart.left,
    x2: chart.width - chart.right,
    y1: axisY,
    y2: axisY,
    class: "axis-strong",
  });
  el("text", {
    x: chart.width - chart.right,
    y: labelY + 22,
    "text-anchor": "end",
    class: "annotation",
  }).textContent = axisLabel;
}

function drawBox(stats, y, classSuffix, groupName) {
  const boxHeight = 52;
  const q1 = xScale(stats.q1);
  const q3 = xScale(stats.q3);
  const median = xScale(stats.median);
  const min = xScale(stats.min);
  const max = xScale(stats.max);
  const group = el("g", {
    class: "draggable-group",
    "data-group": groupName,
    role: "slider",
    tabindex: "0",
  });

  el("line", { x1: min, x2: max, y1: y, y2: y, class: `whisker-${classSuffix}` }, group);
  el("line", { x1: min, x2: min, y1: y - 17, y2: y + 17, class: `whisker-${classSuffix}` }, group);
  el("line", { x1: max, x2: max, y1: y - 17, y2: y + 17, class: `whisker-${classSuffix}` }, group);
  el("rect", {
    x: q1,
    y: y - boxHeight / 2,
    width: Math.max(q3 - q1, 2),
    height: boxHeight,
    class: `box box-${classSuffix}`,
  }, group);
  el("line", {
    x1: median,
    x2: median,
    y1: y - boxHeight / 2 - 6,
    y2: y + boxHeight / 2 + 6,
    class: `median-${classSuffix}`,
  }, group);

  group.addEventListener("pointerdown", startGroupDrag);

  statOrder.forEach((stat, index) => {
    const x = xScale(stats[stat]);
    const handleY = stat === "q1" || stat === "q3" ? y - boxHeight / 2 : y;
    const radius = stat === "median" ? 8 : 6;
    const handle = el("circle", {
      cx: x,
      cy: handleY,
      r: radius,
      class: `stat-handle stat-handle-${classSuffix}`,
      "data-group": groupName,
      "data-stat": stat,
    }, group);
    handle.addEventListener("pointerdown", startStatDrag);

    el("text", {
      x,
      y: index % 2 === 0 ? y + 45 : y - 42,
      class: "handle-label",
    }, group).textContent = statLabels[stat];
  });
}

function formatKg(value) {
  return Number(value.toFixed(4)).toString();
}

function drawStatsText(groupName, y) {
  const source = kiwiStats[groupName];
  const stats = groups[groupName];
  const meanDelta = valueToKg(stats.median) - source.median;
  const lines = [
    `min: ${formatKg(valueToKg(stats.min))}`,
    `lq: ${formatKg(valueToKg(stats.q1))}`,
    `med: ${formatKg(valueToKg(stats.median))}`,
    `mean: ${formatKg(source.mean + meanDelta)}`,
    `uq: ${formatKg(valueToKg(stats.q3))}`,
    `max: ${formatKg(valueToKg(stats.max))}`,
    `sd: ${formatKg(source.sd)}`,
    `num: ${source.num}`,
  ];
  lines.forEach((line, index) => {
    el("text", {
      x: 18,
      y: y + index * 16,
      class: "stats-text",
    }).textContent = line;
  });
}

function drawOverlap(a, b) {
  const left = Math.max(a.q1, b.q1);
  const right = Math.min(a.q3, b.q3);
  if (right > left) {
    el("rect", {
      x: xScale(left),
      y: 318,
      width: xScale(right) - xScale(left),
      height: 74,
      class: "overlap-band",
    });
    el("text", {
      x: (xScale(left) + xScale(right)) / 2,
      y: 310,
      "text-anchor": "middle",
      class: "annotation",
    }).textContent = "shared IQR";
  }
}

function drawShiftBand(a, b) {
  const left = Math.min(a.median, b.median);
  const right = Math.max(a.median, b.median);
  if (right <= left) return;
  el("rect", {
    x: xScale(left),
    y: 318,
    width: xScale(right) - xScale(left),
    height: 74,
    class: "shift-band",
  });
  el("text", {
    x: (xScale(left) + xScale(right)) / 2,
    y: 310,
    "text-anchor": "middle",
    class: "annotation",
  }).textContent = "median gap";
}

function drawShiftArrow(a, b) {
  const y = 418;
  const ax = xScale(a.median);
  const bx = xScale(b.median);
  el("path", {
    d: `M ${ax} ${y} L ${bx} ${y}`,
    class: "shift-arrow",
    "marker-end": "url(#arrowHead)",
  });
  el("text", {
    x: (ax + bx) / 2,
    y: y + 28,
    "text-anchor": "middle",
    class: "annotation",
  }).textContent = "median shift";
}

function addDefs() {
  const defs = el("defs");
  const marker = el("marker", {
    id: "arrowHead",
    markerWidth: 10,
    markerHeight: 10,
    refX: 7,
    refY: 3,
    orient: "auto",
    markerUnits: "strokeWidth",
  }, defs);
  el("path", { d: "M 0 0 L 7 3 L 0 6 Z", fill: "#9a6500" }, marker);
}

function updateLabels(a, b) {
  const { overlapPct, medianShift, isShift } = comparisonStats(a, b);

  statusLabel.classList.toggle("shift", resultVisible && isShift);
  statusLabel.classList.toggle("pending", !resultVisible);
  if (resultVisible) {
    statusLabel.textContent = isShift ? "Shift" : "Overlap";
    statusText.textContent = isShift
      ? "The median gap is large enough that the middle 50% is mostly separated."
      : "The two middle-50% boxes share a visible range.";
    overlapValue.textContent = `${overlapPct}%`;
    medianShiftValue.textContent = `${medianShift > 0 ? "+" : ""}${medianShift.toFixed(0)}`;
  } else {
    statusLabel.textContent = "Ready";
    statusText.textContent = "Adjust the boxplots, then check the relationship.";
    overlapValue.textContent = "--";
    medianShiftValue.textContent = "--";
  }
  shapeValue.textContent = `A: ${shapeOf(a)} | B: ${shapeOf(b)}`;
}

function syncPositionSliders() {
  groupASlider.value = clamp(
    Math.round(groups.a.median - initialGroups.a.median),
    Number(groupASlider.min),
    Number(groupASlider.max),
  );
  shiftSlider.value = clamp(
    Math.round(groups.b.median - initialGroups.b.median),
    Number(shiftSlider.min),
    Number(shiftSlider.max),
  );
}

function render() {
  svg.innerHTML = "";
  addDefs();
  drawAxis();

  const a = groups.a;
  const b = groups.b;
  el("path", { d: densityPath(a, 176, 92), class: "density-a" });
  el("path", { d: densityPath(b, 486, 92), class: "density-b" });
  drawDotPlot(a, 226);
  drawDotPlot(b, 536);
  drawStatsText("a", 126);
  drawStatsText("b", 436);
  if (resultVisible) {
    if (comparisonStats(a, b).isShift) {
      drawShiftBand(a, b);
    } else {
      drawOverlap(a, b);
    }
  }
  drawBox(a, 246, "a", "a");
  drawBox(b, 556, "b", "b");
  if (resultVisible) {
    drawShiftArrow(a, b);
  }

  el("text", { x: chart.left, y: 124, class: "group-label" }).textContent =
    "Group A (F): drag box or handles";
  el("text", { x: chart.left, y: 434, class: "group-label" }).textContent =
    "Group B (M): drag box or handles";
  el("text", { x: chart.width - 58, y: 150, class: "gender-label" }).textContent =
    kiwiStats.a.label;
  el("text", { x: chart.width - 58, y: 460, class: "gender-label" }).textContent =
    kiwiStats.b.label;
  updateLabels(a, b);
}

function shiftGroup(groupName, delta) {
  const next = { ...groups[groupName] };
  statOrder.forEach((stat) => {
    next[stat] += delta;
  });
  const leftOverflow = chart.xMin - next.min;
  const rightOverflow = chart.xMax - next.max;
  const correction = leftOverflow > 0 ? leftOverflow : rightOverflow < 0 ? rightOverflow : 0;
  statOrder.forEach((stat) => {
    groups[groupName][stat] = next[stat] + correction;
  });
}

function statBounds(groupName, stat) {
  const stats = groups[groupName];
  const gap = stat === "median" ? 1 : 2;
  const index = statOrder.indexOf(stat);
  const lower = index === 0 ? chart.xMin : stats[statOrder[index - 1]] + gap;
  const upper = index === statOrder.length - 1 ? chart.xMax : stats[statOrder[index + 1]] - gap;
  return [lower, upper];
}

function startGroupDrag(event) {
  if (event.target.classList.contains("stat-handle")) return;
  const groupName = event.currentTarget.dataset.group;
  dragState = {
    type: "group",
    groupName,
    startValue: pointerValue(event),
    startStats: { ...groups[groupName] },
  };
  svg.setPointerCapture(event.pointerId);
}

function startStatDrag(event) {
  event.stopPropagation();
  const groupName = event.currentTarget.dataset.group;
  const stat = event.currentTarget.dataset.stat;
  dragState = {
    type: "stat",
    groupName,
    stat,
  };
  svg.setPointerCapture(event.pointerId);
}

function moveDrag(event) {
  if (!dragState) return;
  resultVisible = false;
  if (dragState.type === "group") {
    const delta = pointerValue(event) - dragState.startValue;
    groups[dragState.groupName] = { ...dragState.startStats };
    shiftGroup(dragState.groupName, delta);
  } else {
    const [lower, upper] = statBounds(dragState.groupName, dragState.stat);
    groups[dragState.groupName][dragState.stat] = clamp(pointerValue(event), lower, upper);
  }
  syncPositionSliders();
  render();
}

function endDrag(event) {
  if (!dragState) return;
  dragState = null;
  if (svg.hasPointerCapture(event.pointerId)) {
    svg.releasePointerCapture(event.pointerId);
  }
}

function moveGroupFromSlider(groupName, slider, initialMedian) {
  resultVisible = false;
  const targetMedian = initialMedian + Number(slider.value);
  shiftGroup(groupName, targetMedian - groups[groupName].median);
  render();
}

checkButton.addEventListener("click", () => {
  resultVisible = true;
  render();
});
groupASlider.addEventListener("input", () => {
  moveGroupFromSlider("a", groupASlider, initialGroups.a.median);
});
shiftSlider.addEventListener("input", () => {
  moveGroupFromSlider("b", shiftSlider, initialGroups.b.median);
});
resetButton.addEventListener("click", () => {
  groups = cloneGroups(initialGroups);
  resultVisible = false;
  syncPositionSliders();
  render();
});
svg.addEventListener("pointermove", moveDrag);
svg.addEventListener("pointerup", endDrag);
svg.addEventListener("pointercancel", endDrag);

syncPositionSliders();
render();
