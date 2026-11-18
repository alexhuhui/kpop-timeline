/* Personal Kpop Timeline — interactive version.
 *
 * Reads settings.json, groups.csv, biases.csv and songs.csv (the same files the
 * notebook reads) and draws the chart as one SVG. The layout follows the
 * notebook's matplotlib drawing so the PNG and the page look the same.
 *
 * All CSV text goes into the page through textContent / d3 .text(), never as
 * HTML. Links are only used if they are https YouTube links.
 */
(function () {
  "use strict";

  // ---------- layout, in SVG units (the SVG scales to the screen width) ----------
  const W = 1600;
  const LEFT = 190;        // column for the group names
  const RIGHT_PAD = 40;
  const ROW = 82;          // distance between two groups
  const TOP = ROW * 0.75 + 22;  // space above the first bar for its song names (room for 3 stacked lines)
  const AXIS = 40;         // strip at the bottom for the year labels
  const BAR = 10;          // bar thickness
  const LINE = 14.5;       // line height of stacked song names
  const GAP_YEARS = 0.06;  // gap between two song names, in years (as in the notebook)
  const MAX_ZOOM = 8;

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const els = {
    chart: document.getElementById("chart"),
    status: document.getElementById("status"),
    card: document.getElementById("card"),
    cardKicker: document.getElementById("card-kicker"),
    cardTitle: document.getElementById("card-title"),
    cardBody: document.getElementById("card-body"),
    cardClose: document.getElementById("card-close"),
  };

  // ---------- small helpers (same maths as the notebook) ----------
  let NOW = "";

  function parseYm(date) {
    const d = date === "now" ? NOW : date;
    if (!/^\d{4}-\d{2}$/.test(d)) throw new Error("Bad date: " + date);
    return { y: +d.slice(0, 4), m: +d.slice(5, 7) };
  }
  function dateToNumber(date) {
    const { y, m } = parseYm(date);
    return y + (m - 1) / 12;
  }
  function countMonths(start, end) {
    const going = end === "now";
    const a = parseYm(start), b = parseYm(end);
    return (b.y - a.y) * 12 + (b.m - a.m) + (going ? 1 : 0);
  }
  function monthsToText(months) {
    const y = Math.floor(months / 12), m = months % 12;
    return ((y > 0 ? y + "y" : "") + (m > 0 ? " " + m + "m" : "")).trim();
  }
  const monthFmt = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" });
  function monthName(date) {
    const { y, m } = parseYm(date);
    return monthFmt.format(new Date(Date.UTC(y, m - 1, 1)));
  }
  function safeColour(c) {
    return /^#[0-9a-f]{6}$/i.test((c || "").trim()) ? c.trim() : "#777777";
  }
  function darker(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.round(v * 0.62);
    return "rgb(" + f(n >> 16) + "," + f((n >> 8) & 255) + "," + f(n & 255) + ")";
  }
  const YT_HOSTS = ["www.youtube.com", "youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"];
  function safeYouTube(raw) {
    if (!raw) return null;
    try {
      const u = new URL(raw.trim());
      return u.protocol === "https:" && YT_HOSTS.includes(u.hostname) ? u.href : null;
    } catch (e) {
      return null;
    }
  }
  const split = (s) => (s || "").split("|").map((t) => t.trim());

  // ---------- load ----------
  // d3.csv builds its row objects with `new Function`, which the page's CSP
  // forbids (no 'unsafe-eval'). csvParseRows does not, so map headers by hand.
  async function csv(url) {
    const [head, ...rows] = d3.csvParseRows(await d3.text(url));
    return rows.filter((r) => r.some((c) => c !== "")).map((r) =>
      Object.fromEntries(head.map((h, i) => [h, (r[i] || "").trim()])));
  }
  async function load() {
    const [settings, groups, biases, songs] = await Promise.all([
      d3.json("settings.json"),
      csv("groups.csv"),
      csv("biases.csv"),
      csv("songs.csv"),
    ]);
    // Wait for Inter, because song names are measured to stop them overlapping.
    if (document.fonts && document.fonts.load) {
      await Promise.all([
        document.fonts.load("400 12px Inter"),
        document.fonts.load("600 12.5px Inter"),
        document.fonts.load("800 18px Inter"),
      ]).catch(() => {});
    }
    return { settings, groups, biases, songs };
  }

  // ---------- header, stats, footer ----------
  function fillText(settings, groups, biases) {
    document.title = titleCase(settings.title);
    setText("title", settings.title);
    setText("subtitle", settings.subtitle);
    setText("source", settings.source);
    setText("note", settings.note);
    setText("author", settings.author);
    setText("date-line", settings.date_line);

    const all = new Set(), current = [];
    let longestName = "", longest = 0;
    biases.forEach((b) => {
      const names = split(b.members);
      names.forEach((n) => { all.add(n); if (b.end === "now") current.push(n); });
      if (names.length === 1 && b.months > longest) { longest = b.months; longestName = names[0]; }
    });
    const boxes = [
      [String(groups.length), "Groups and soloists"],
      [String(all.size), "Biases"],
      [monthsToText(longest), "Longest: " + longestName],
      [String(current.length), "Current bias: " + current.join(", ")],
    ];
    const dl = document.getElementById("stats");
    boxes.forEach(([value, label]) => {
      const div = document.createElement("div");
      const dt = document.createElement("dt");
      const dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      div.append(dt, dd);
      dl.append(div);
    });
  }
  function setText(id, text) { document.getElementById(id).textContent = text || ""; }
  function titleCase(s) { return (s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()); }

  // ---------- chart ----------
  function draw(data) {
    const { settings, groups, biases, songs } = data;
    const FIRST = +settings.first_year, LAST = +settings.last_year;
    const rowOf = new Map(groups.map((g, i) => [g.group, i]));
    const rowY = (i) => TOP + i * ROW;
    const plotBottom = rowY(groups.length - 1) + ROW * 0.65;
    const H = plotBottom + AXIS;
    const x = d3.scaleLinear().domain([FIRST, LAST + 1]).range([LEFT, W - RIGHT_PAD]);
    const yearsToUnits = (yrs) => x(FIRST + yrs) - x(FIRST);

    els.status.remove();
    const svg = d3.select(els.chart).append("svg")
      .attr("viewBox", [0, 0, W, H].join(" "))
      .attr("role", "group")
      .attr("aria-label", "Timeline from " + FIRST + " to " + settings.now + ". Each row is a group; bars are biases, dots are songs.");

    const plot = svg.append("g").attr("class", "plot");

    // year grid and NOW line
    const grid = plot.append("g").attr("aria-hidden", "true");
    for (let yr = FIRST; yr <= LAST + 1; yr++) {
      grid.append("line").attr("x1", x(yr)).attr("x2", x(yr)).attr("y1", 0).attr("y2", plotBottom)
        .attr("stroke", "#f0f0f0").attr("stroke-width", 1).attr("vector-effect", "non-scaling-stroke");
    }
    const nowX = x(dateToNumber(settings.now) + 1 / 12);
    grid.append("line").attr("x1", nowX).attr("x2", nowX).attr("y1", 0).attr("y2", plotBottom)
      .attr("stroke", "#bbbbbb").attr("stroke-width", 1.2).attr("stroke-dasharray", "5 4");
    grid.append("text").attr("class", "now-label").attr("x", nowX + 5).attr("y", plotBottom - 4).text("NOW");

    // ---- bias bars ----
    const barLayer = plot.append("g");
    biases.forEach((b) => {
      const y = rowY(rowOf.get(b.group));
      const start = dateToNumber(b.start);
      const end = dateToNumber(b.end) + (b.end === "now" ? 1 / 12 : 0);
      const names = split(b.members);
      const cols = split(b.colours).map(safeColour);
      const g = barLayer.append("g").attr("class", "bar")
        .attr("tabindex", 0).attr("role", "button")
        .attr("aria-label", names.join(" and ") + ", " + b.group + ", " + rangeText(b) + ", " + monthsToText(b.months));

      const hit = g.append("rect").attr("class", "hit");
      if (names.length === 1) {
        g.append("rect").attr("x", x(start)).attr("y", y - BAR / 2).attr("width", x(end) - x(start)).attr("height", BAR).attr("fill", cols[0]);
      } else {
        let s = start, i = 0;
        while (s < end) {
          const e = Math.min(s + 0.07, end);
          g.append("rect").attr("x", x(s)).attr("y", y - BAR / 2).attr("width", x(e) - x(s) + 0.3)
            .attr("height", BAR).attr("fill", cols[i % cols.length]);
          s += 0.07; i++;
        }
      }
      let right = x(end);
      names.forEach((name, i) => {
        const ny = y + ROW * 0.2 + i * ROW * 0.2;
        const t = g.append("text").attr("class", "member-name").attr("x", x(start)).attr("y", ny)
          .attr("dominant-baseline", "central").attr("fill", darker(cols[i] || cols[0])).text(name);
        if (i === names.length - 1) {
          const w = t.node().getComputedTextLength();
          const d = g.append("text").attr("class", "duration").attr("x", x(start) + w + yearsToUnits(0.03)).attr("y", ny)
            .attr("dominant-baseline", "central").text(monthsToText(b.months));
          right = Math.max(right, x(start) + w + yearsToUnits(0.03) + d.node().getComputedTextLength());
        }
      });
      const bottom = y + ROW * 0.2 + (names.length - 1) * ROW * 0.2 + 9;
      hit.attr("x", x(start) - 2).attr("y", y - BAR / 2 - 5).attr("width", right - x(start) + 4).attr("height", bottom - (y - BAR / 2 - 5)).attr("rx", 3);

      g.on("click", (ev) => openCard(ev.currentTarget, biasCard(b, names)));
      keyOpen(g, () => biasCard(b, names));
    });

    // ---- song points ----
    const pointLayer = plot.append("g");
    const byGroup = d3.group(songs, (s) => s.group);
    byGroup.forEach((list, groupName) => {
      if (!rowOf.has(groupName)) return;
      const y = rowY(rowOf.get(groupName));
      const sorted = list.slice().sort((a, b) => d3.ascending(a.date, b.date));
      const labelBottom = y - ROW * 0.3;

      // step 1: draw every name above its dot and measure it
      const items = sorted.map((s) => {
        const dotX = x(dateToNumber(s.date) + 1 / 24);
        const labels = split(s.label);
        const links = split(s.youtube);
        const songsHere = labels.map((l, i) => ({ title: l, url: safeYouTube(links[i]) }));
        const g = pointLayer.append("g").attr("class", "point").attr("tabindex", 0).attr("role", "button")
          .attr("aria-label", groupName + ", " + monthName(s.date) + ": " + labels.join(", ") +
            (songsHere.some((t) => t.url) ? ". Has a video." : "."));
        const hit = g.append("rect").attr("class", "hit");
        const line = g.append("line").attr("stroke", "#c4c4c4").attr("stroke-width", 1);
        const text = g.append("text").attr("class", "song-label" + (songsHere.some((t) => t.url) ? " has-link" : ""))
          .attr("text-anchor", "middle");
        labels.forEach((l, i) => {
          text.append("tspan").attr("x", dotX)
            .attr("y", labelBottom - 4 - (labels.length - 1 - i) * LINE).text(l);
        });
        const width = text.node().getBBox().width;
        return { s, g, hit, line, text, dotX, width, lines: labels.length, songsHere };
      });

      // step 2: left to right, push a name right if it would overlap the one before
      const gap = yearsToUnits(GAP_YEARS);
      let lastRight = -Infinity;
      items.forEach((it) => {
        let left = it.dotX - it.width / 2;
        if (left < lastRight + gap) left = lastRight + gap;
        it.left = left;
        lastRight = left + it.width;
      });
      // step 3: right to left, pull names back if they run off the chart
      let limit = x(LAST + 1.15);
      items.slice().reverse().forEach((it) => {
        if (it.left + it.width > limit) it.left = limit - it.width;
        limit = it.left - gap;
      });

      // step 4: final spot, leader line, dot, hit area
      const shownMembers = new Set();
      items.forEach((it) => {
        const mid = it.left + it.width / 2;
        it.text.selectAll("tspan").attr("x", mid);
        it.line.attr("x1", it.dotX).attr("y1", y - ROW * 0.07).attr("x2", mid).attr("y2", labelBottom + ROW * 0.02);
        const coloured = it.s.dot_member && it.s.dot_member.trim() !== "";
        const col = safeColour(it.s.dot_colour);
        it.g.append("circle").attr("class", "dot").attr("cx", it.dotX).attr("cy", y).attr("r", 5.2)
          .attr("fill", coloured ? col : "#fff").attr("stroke", coloured ? col : "#111").attr("stroke-width", coloured ? 0 : 2);
        if (coloured && !shownMembers.has(it.s.dot_member)) {
          shownMembers.add(it.s.dot_member);
          pointLayer.append("text").attr("class", "member-name").attr("x", it.dotX - yearsToUnits(0.04))
            .attr("y", y + ROW * 0.2).attr("dominant-baseline", "central").attr("fill", darker(col)).text(it.s.dot_member);
        }
        const top = labelBottom - 4 - it.lines * LINE - 2;
        const l = Math.min(it.left, it.dotX - 12) - 3;
        const r = Math.max(it.left + it.width, it.dotX + 12) + 3;
        it.hit.attr("x", l).attr("y", top).attr("width", r - l).attr("height", y + 12 - top).attr("rx", 4);

        const make = () => songCard(it.s, it.songsHere);
        it.g.on("click", (ev) => openCard(ev.currentTarget, make()));
        keyOpen(it.g, make);
      });
    });

    // ---- pinned layers: group names on the left, years at the bottom ----
    const namePanel = svg.append("g").attr("class", "names");
    const nameBg = namePanel.append("rect").attr("x", 0).attr("y", 0).attr("height", H).attr("fill", "#fff");
    const nameRows = groups.map((g, i) => {
      const n = namePanel.append("g");
      n.append("text").attr("class", "group-name").attr("x", 0).attr("y", -4).attr("dominant-baseline", "central").text(g.group);
      n.append("text").attr("class", "group-sub").attr("x", 0).attr("y", ROW * 0.22).attr("dominant-baseline", "central").text(g.subtitle);
      return { n, y: rowY(i) };
    });
    const axis = svg.append("g").attr("class", "axis").attr("aria-hidden", "true");
    const axisBg = axis.append("rect").attr("x", 0).attr("width", W).attr("fill", "#fff");
    const yearLabels = d3.range(FIRST, LAST + 1).map((yr) =>
      axis.append("text").attr("class", "year-label").attr("text-anchor", "middle").text(String(yr)).datum(yr + 0.5));

    // Names and years grow with the zoom, but less than the chart, so the name
    // column never covers the bars. On a phone they may grow a little more.
    function pinnedScale(k) {
      const screenScale = (svg.node().clientWidth || W) / W;
      return Math.min(k, Math.max(1.2, 0.6 / screenScale));
    }
    function placePinned(t) {
      const s = pinnedScale(t.k);
      nameBg.attr("width", (LEFT - 14) * s);
      nameRows.forEach(({ n, y }) => n.attr("transform", "translate(" + 16 * s + "," + t.applyY(y) + ") scale(" + s + ")"));
      const axisH = 30 * s;
      axisBg.attr("y", H - axisH).attr("height", axisH);
      yearLabels.forEach((lab) => lab.attr("transform", "translate(" + t.applyX(x(lab.datum())) + "," + (H - 11 * s) + ") scale(" + s + ")"));
      nameBg.raise(); nameRows.forEach(({ n }) => n.raise());
    }

    // ---- zoom ----
    const zoom = d3.zoom()
      .scaleExtent([1, MAX_ZOOM])
      .extent([[0, 0], [W, H]])
      .translateExtent([[0, 0], [W, H]])
      // A plain mouse wheel scrolls the page; Ctrl/Cmd + wheel (and trackpad pinch) zooms.
      .filter((ev) => (ev.type === "wheel" ? ev.ctrlKey || ev.metaKey : !ev.ctrlKey && !ev.button))
      .on("zoom", (ev) => {
        plot.attr("transform", ev.transform);
        placePinned(ev.transform);
        if (ev.sourceEvent) closeCard(false);
      });
    svg.call(zoom).on("dblclick.zoom", null);
    placePinned(d3.zoomIdentity);

    const dur = reduceMotion ? 0 : 250;
    document.getElementById("zoom-in").addEventListener("click", () => svg.transition().duration(dur).call(zoom.scaleBy, 1.6));
    document.getElementById("zoom-out").addEventListener("click", () => svg.transition().duration(dur).call(zoom.scaleBy, 1 / 1.6));
    document.getElementById("zoom-reset").addEventListener("click", () => svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity));

    // Keyboard users: when a point is focused while zoomed in, move it into view.
    svg.on("focusin", (ev) => {
      const node = ev.target.closest && ev.target.closest(".point, .bar");
      if (!node) return;
      const t = d3.zoomTransform(svg.node());
      if (t.k === 1) return;
      const b = node.getBBox();
      const cx = t.applyX(b.x + b.width / 2), cy = t.applyY(b.y + b.height / 2);
      if (cx < LEFT * pinnedScale(t.k) || cx > W || cy < 0 || cy > H - 30) {
        svg.call(zoom.translateTo, b.x + b.width / 2, b.y + b.height / 2);
      }
    });

    function rangeText(b) {
      return b.end === "now" ? "since " + monthName(b.start) : monthName(b.start) + " to " + monthName(b.end);
    }
    function biasCard(b, names) {
      return {
        kicker: b.group,
        title: names.join(" & "),
        build(body) {
          const p = document.createElement("p");
          p.className = "card__meta";
          p.textContent = (b.end === "now" ? "Since " + monthName(b.start) + " (current bias)" : monthName(b.start) + " to " + monthName(b.end)) +
            " · " + monthsToText(b.months);
          body.append(p);
        },
      };
    }
    function songCard(s, list) {
      return {
        kicker: s.group + " · " + monthName(s.date),
        title: list.length === 1 ? list[0].title : list.length + " songs",
        build(body) {
          list.forEach((song) => {
            const row = document.createElement("div");
            row.className = "card__row";
            const name = document.createElement("span");
            name.className = "card__song";
            name.textContent = list.length === 1 ? "" : song.title;
            if (song.url) {
              const a = document.createElement("a");
              a.className = "watch";
              a.href = song.url;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.textContent = "Watch on YouTube ▶";
              a.setAttribute("aria-label", "Watch " + song.title + " on YouTube (opens a new tab)");
              row.append(name, a);
            } else {
              const n = document.createElement("span");
              n.className = "no-video";
              n.textContent = "No video for this one";
              row.append(name, n);
            }
            body.append(row);
          });
          if (s.dot_member) {
            const p = document.createElement("p");
            p.className = "card__meta";
            p.textContent = s.dot_member + " song";
            body.append(p);
          }
        },
      };
    }
  }

  // ---------- popup card ----------
  let opener = null;
  function keyOpen(g, make) {
    g.on("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openCard(ev.currentTarget, make());
      }
    });
  }
  function openCard(target, content) {
    opener = target;
    els.cardKicker.textContent = content.kicker;
    els.cardTitle.textContent = content.title;
    els.cardBody.replaceChildren();
    content.build(els.cardBody);
    els.card.hidden = false;

    // Place it under (or above) the thing that was tapped, kept on screen.
    const r = target.getBoundingClientRect();
    const c = els.card.getBoundingClientRect();
    const margin = 12;
    let left = r.left + r.width / 2 - c.width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - c.width - margin));
    let top = r.bottom + 8;
    if (top + c.height > window.innerHeight - margin) top = r.top - c.height - 8;
    top = Math.max(margin, top);
    els.card.style.left = left + "px";
    els.card.style.top = top + "px";
    els.cardTitle.focus({ preventScroll: true });
  }
  function closeCard(restoreFocus) {
    if (els.card.hidden) return;
    els.card.hidden = true;
    if (restoreFocus && opener && opener.focus) opener.focus({ preventScroll: true });
  }
  els.cardClose.addEventListener("click", () => closeCard(true));
  document.addEventListener("keydown", (ev) => { if (ev.key === "Escape") closeCard(true); });
  document.addEventListener("pointerdown", (ev) => {
    if (els.card.hidden) return;
    if (els.card.contains(ev.target)) return;
    if (ev.target.closest && ev.target.closest(".point, .bar")) return;
    closeCard(false);
  });
  window.addEventListener("resize", () => closeCard(false));

  // ---------- list view ----------
  function buildList(groups, biases, songs) {
    const body = document.getElementById("list-body");
    const songTable = table("Songs", ["When", "Group", "Song", "Video"]);
    songs.slice().sort((a, b) => d3.ascending(a.date, b.date)).forEach((s) => {
      const links = split(s.youtube);
      split(s.label).forEach((label, i) => {
        const url = safeYouTube(links[i]);
        const tr = songTable.tbody.insertRow();
        cell(tr, monthName(s.date));
        cell(tr, s.group);
        cell(tr, label);
        const td = tr.insertCell();
        if (url) {
          const a = document.createElement("a");
          a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer";
          a.textContent = "Watch";
          a.setAttribute("aria-label", "Watch " + label + " on YouTube (opens a new tab)");
          td.append(a);
        } else {
          td.textContent = "—";
        }
      });
    });
    const biasTable = table("Biases", ["Member", "Group", "From", "To", "How long"]);
    biases.forEach((b) => {
      const tr = biasTable.tbody.insertRow();
      cell(tr, split(b.members).join(" & "));
      cell(tr, b.group);
      cell(tr, monthName(b.start));
      cell(tr, b.end === "now" ? "now" : monthName(b.end));
      cell(tr, monthsToText(b.months));
    });
    body.append(songTable.wrap, biasTable.wrap);
  }
  function table(captionText, heads) {
    const wrap = document.createElement("div");
    wrap.className = "table-scroll";
    const el = document.createElement("table");
    wrap.append(el);
    el.createCaption().textContent = captionText;
    const tr = el.createTHead().insertRow();
    heads.forEach((h) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = h; tr.append(th); });
    return { wrap, tbody: el.createTBody() };
  }
  function cell(tr, text) { tr.insertCell().textContent = text; }

  // ---------- start ----------
  load().then((data) => {
    NOW = data.settings.now;
    data.biases.forEach((b) => { b.months = countMonths(b.start, b.end); });
    fillText(data.settings, data.groups, data.biases);
    draw(data);
    buildList(data.groups, data.biases, data.songs);
  }).catch((err) => {
    console.error(err);
    els.status.textContent = location.protocol === "file:"
      ? "The timeline can't load from a file on disk. Run “python -m http.server” in this folder and open http://localhost:8000."
      : "The timeline couldn't load. Please refresh the page.";
  });
})();
