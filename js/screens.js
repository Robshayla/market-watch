/* Full-screen earnings slides. Sample Q2 figures are preview-only and tagged. */
(function (root) {
  "use strict";

  var SAMPLE_Q2 = {
    ready: true,
    sample: true,
    title: "Bayer Q2 2026 Results",
    badge: "SAMPLE — Q2 2026",
    source: "Source: Bayer Q2 2026 Half-Year report, Aug 4, 2026",
    footnote: "Layout preview for Q3 · cpa = currency & portfolio adj.",
    group: {
      name: "Total Bayer",
      sales: "€10.87bn",
      salesCpa: "+2.2%",
      ebitda: "€2.14bn",
      ebitdaChange: "+1.9%",
      margin: "19.7%",
      coreEps: "€0.95",
      coreEpsChange: "−16.7%",
      guidance: "FY26 guidance confirmed: sales €44.7–46.7bn, core EPS €4.20–4.70",
    },
    divisions: [
      {
        name: "Crop Science",
        tone: "crop",
        sales: "€4.91bn",
        salesCpa: "+3.5%",
        ebitda: "€902m",
        ebitdaChange: "+30.2%",
        bullets: ["Soy & cotton up on dicamba return"],
      },
      {
        name: "Pharma",
        tone: "pharma",
        sales: "€4.46bn",
        salesCpa: "+0.8%",
        ebitda: "€1.06bn",
        ebitdaChange: "−3.6%",
        bullets: ["Nubeqa +64%", "Kerendia +83%"],
      },
      {
        name: "Consumer Health",
        tone: "consumer",
        sales: "€1.45bn",
        salesCpa: "+1.5%",
        ebitda: "€319m",
        ebitdaChange: "−3.6%",
        bullets: ["Digestive Health +9.4%"],
      },
    ],
  };

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function toneOf(change) {
    var value = String(change || "").trim();
    if (!value || value === "—" || value === "-") return "flat";
    if (/^[-−]/.test(value)) return "down";
    if (value.charAt(0) === "+") return "up";
    return "flat";
  }

  function bulletList(items) {
    var list = el("ul", "div-bullets");
    var count = 0;
    for (var i = 0; i < (items || []).length && count < 2; i++) {
      var line = String(items[i] || "").trim();
      if (!line) continue;
      var li = el("li");
      var dot = el("i");
      var span = el("span", "", line);
      li.appendChild(dot);
      li.appendChild(span);
      list.appendChild(li);
      count += 1;
    }
    return list;
  }

  function verdictTone(verdict) {
    var raw = String(verdict || "").toLowerCase();
    if (raw.indexOf("miss") >= 0) return "miss";
    if (raw.indexOf("line") >= 0) return "line";
    return "beat";
  }

  function verdictLabel(verdict) {
    var tone = verdictTone(verdict);
    if (tone === "miss") return "Miss";
    if (tone === "line") return "In line";
    return "Beat";
  }

  function highlightList(items) {
    var list = el("ul", "div-highlights");
    var count = 0;
    for (var i = 0; i < (items || []).length && count < 2; i++) {
      var line = String(items[i] || "").trim();
      if (!line) continue;
      list.appendChild(el("li", "", line));
      count += 1;
    }
    return count ? list : null;
  }

  function regionBlock(region) {
    if (!region || !region.lines) return null;
    var box = el("div", "div-region");
    box.appendChild(el("h4", "", region.title || "U.S. / North America"));
    var shown = 0;
    for (var i = 0; i < region.lines.length && shown < 2; i++) {
      var line = String(region.lines[i] || "").trim();
      if (!line) continue;
      box.appendChild(el("p", "", line));
      shown += 1;
    }
    return shown ? box : null;
  }

  function renderGlance(glance) {
    var box = el("section", "glance");
    var head = el("div", "glance-head");
    head.appendChild(el("div", "glance-title", glance.title || "Quarter at a glance"));
    if (glance.source) head.appendChild(el("div", "glance-source", glance.source));
    box.appendChild(head);
    var row = el("div", "glance-row");
    var badges = glance.badges || [];
    for (var i = 0; i < badges.length && i < 4; i++) {
      var item = badges[i];
      var badge = el("div", "glance-badge is-" + verdictTone(item.tone === "miss" ? "miss" : item.tone === "line" ? "line" : "beat"));
      badge.appendChild(el("b", "", item.kicker || ""));
      if (item.value) badge.appendChild(el("strong", "", item.value));
      if (item.text) badge.appendChild(el("span", "", item.text));
      row.appendChild(badge);
    }
    box.appendChild(row);
    var news = glance.goodNews || [];
    if (news.length) {
      var line = el("div", "good-news");
      line.appendChild(el("b", "", "Good news"));
      for (var n = 0; n < news.length && n < 2; n++) {
        if (n) line.appendChild(el("span", "good-news-dot", "·"));
        line.appendChild(el("span", "", news[n]));
      }
      box.appendChild(line);
    }
    return box;
  }

  function divisionCard(div, tone, featured) {
    var card = el("article", "div-card tone-" + tone + (featured ? " is-total" : ""));
    card.appendChild(el("div", "div-accent"));
    var nameRow = el("div", "div-name");
    nameRow.appendChild(el("h3", "", String(div.name || "").toUpperCase()));
    if (div.verdict) nameRow.appendChild(el("div", "div-verdict is-" + verdictTone(div.verdict), verdictLabel(div.verdict)));
    card.appendChild(nameRow);
    var sales = el("div", "div-sales");
    sales.appendChild(el("b", "", div.sales));
    sales.appendChild(document.createTextNode(" sales"));
    card.appendChild(sales);
    var cpa = el("div", "div-cpa " + toneOf(div.salesCpa));
    cpa.appendChild(el("b", "", div.salesCpa));
    cpa.appendChild(document.createTextNode(" cpa"));
    if (div.salesRep) cpa.appendChild(el("span", "div-rep", div.salesRep));
    card.appendChild(cpa);
    var ebitda = el("div", "div-line");
    ebitda.appendChild(el("i"));
    var ebitdaText = "EBITDA bsi " + div.ebitda + ", " + div.ebitdaChange;
    ebitda.appendChild(el("span", "", ebitdaText));
    card.appendChild(ebitda);
    if (div.margin) {
      var rawMargin = String(div.margin);
      var marginLine = rawMargin.indexOf("margin") >= 0 ? rawMargin : rawMargin.indexOf("%") >= 0 ? rawMargin + " margin" : rawMargin + "% margin";
      card.appendChild(el("div", "div-margin", "(" + marginLine + ")"));
    }
    if (div.coreEps) {
      var eps = el("div", "div-line");
      eps.appendChild(el("i"));
      eps.appendChild(el("span", "", "Core EPS " + div.coreEps + " (" + div.coreEpsChange + ")"));
      card.appendChild(eps);
    }
    if (div.guidance) {
      var guide = el("div", "div-line");
      guide.appendChild(el("i"));
      guide.appendChild(el("span", "", div.guidance));
      card.appendChild(guide);
    }
    var highlights = highlightList(div.highlights);
    if (highlights) card.appendChild(highlights);
    if (div.bullets) card.appendChild(bulletList(div.bullets));
    var region = regionBlock(div.region);
    if (region) card.appendChild(region);
    if (div.note) card.appendChild(el("p", "div-note", div.note));
    return card;
  }

  function signedPct(value) {
    if (value == null || !isFinite(value)) return "—";
    var body = Math.abs(value).toFixed(1) + "%";
    if (value > 0) return "+" + body;
    if (value < 0) return "−" + body;
    return body;
  }

  function signedMoney(value, currency) {
    if (value == null || !isFinite(value)) return "—";
    var body = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var sign = value > 0 ? "+" : value < 0 ? "−" : "";
    return sign + (currency === "EUR" ? "€" : currency === "USD" ? "$" : "") + body;
  }

  function money(value, currency, digits) {
    if (value == null || !isFinite(Number(value))) return "—";
    var body = Number(value).toLocaleString("en-US", {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    if (currency === "EUR") return "€" + body;
    if (currency === "USD") return "$" + body;
    return body;
  }

  function chart(values) {
    var nums = [];
    for (var i = 0; i < (values || []).length; i++) {
      var n = Number(values[i]);
      if (isFinite(n)) nums.push(n);
    }
    if (nums.length < 2) return null;
    var min = nums[0];
    var max = nums[0];
    for (var j = 1; j < nums.length; j++) {
      if (nums[j] < min) min = nums[j];
      if (nums[j] > max) max = nums[j];
    }
    if (max - min < 1e-9) {
      min -= 1;
      max += 1;
    }
    var width = 640;
    var height = 220;
    var coords = [];
    for (var k = 0; k < nums.length; k++) {
      var x = (k / (nums.length - 1)) * width;
      var y = height - ((nums[k] - min) / (max - min)) * (height - 24) - 8;
      coords.push(x.toFixed(1) + "," + y.toFixed(1));
    }
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("preserveAspectRatio", "none");
    var line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    line.setAttribute("points", coords.join(" "));
    line.setAttribute("fill", "none");
    line.setAttribute("stroke", "#3DDC84");
    line.setAttribute("stroke-width", "4");
    line.setAttribute("stroke-linejoin", "round");
    line.setAttribute("stroke-linecap", "round");
    line.setAttribute("vector-effect", "non-scaling-stroke");
    var base = document.createElementNS("http://www.w3.org/2000/svg", "line");
    base.setAttribute("x1", "0");
    base.setAttribute("x2", String(width));
    base.setAttribute("y1", String(height - 6));
    base.setAttribute("y2", String(height - 6));
    base.setAttribute("stroke", "rgba(255,255,255,0.18)");
    svg.appendChild(base);
    svg.appendChild(line);
    return svg;
  }

  function renderResults(host, doc, reaction) {
    host.replaceChildren();
    var header = el("div", "slide-head");
    var brand = el("div", "slide-brand");
    var mark = el("img", "slide-mark");
    mark.src = "assets/bayer-cross.svg";
    mark.alt = "";
    brand.appendChild(mark);
    brand.appendChild(el("h2", "", doc.title || "Bayer results"));
    header.appendChild(brand);
    if (doc.badge) header.appendChild(el("div", "slide-badge", doc.badge));
    host.appendChild(header);
    host.classList.toggle("has-glance", !!(doc.glance && doc.glance.badges && doc.glance.badges.length));
    if (doc.glance && doc.glance.badges && doc.glance.badges.length) host.appendChild(renderGlance(doc.glance));

    var grid = el("div", "div-grid");
    var group = Object.assign({ tone: "total" }, doc.group);
    grid.appendChild(divisionCard(group, "total", true));
    var tones = ["crop", "pharma", "consumer"];
    for (var i = 0; i < (doc.divisions || []).length && i < 3; i++) {
      grid.appendChild(divisionCard(doc.divisions[i], doc.divisions[i].tone || tones[i], false));
    }
    host.appendChild(grid);

    var strip = el("div", "react-strip");
    strip.appendChild(el("b", "", "STOCK REACTION"));
    var bits = el("span", "react-bits");
    bits.appendChild(el("span", "", "BAYN " + (reaction.baynSince || "—") + " since release"));
    bits.appendChild(el("span", "dot", "·"));
    bits.appendChild(el("span", "", "ADR " + (reaction.adrSince || "—")));
    bits.appendChild(el("span", "dot", "·"));
    bits.appendChild(el("span", "", "DAX " + (reaction.daxSince || "—")));
    strip.appendChild(bits);
    if (doc.sample) strip.appendChild(el("em", "", "SAMPLE"));
    host.appendChild(strip);

    var foot = el("p", "slide-source");
    foot.textContent = (doc.source || "") + (doc.footnote ? " · " + doc.footnote : "");
    host.appendChild(foot);
  }

  function renderReaction(host, model) {
    host.replaceChildren();
    var header = el("div", "slide-head");
    var brand = el("div", "slide-brand");
    var mark = el("img", "slide-mark");
    mark.src = "assets/bayer-cross.svg";
    mark.alt = "";
    brand.appendChild(mark);
    brand.appendChild(el("h2", "", "Bayer Q3 results — stock reaction"));
    header.appendChild(brand);
    header.appendChild(el("div", "slide-badge" + (model.preview ? " is-preview" : ""), model.preview ? "PREVIEW" : "LIVE"));
    host.appendChild(header);

    var top = el("div", "rx-top");
    var hero = el("article", "rx-hero");
    hero.appendChild(el("div", "rx-kicker", "BAYN (Xetra) since " + (model.refLabel || "release")));
    var pct = el("div", "rx-pct " + toneOf(model.baynSince), model.baynSince || "—");
    hero.appendChild(pct);
    if (model.status) hero.appendChild(el("div", "rx-vs", model.status));
    var priceRow = el("div", "rx-price");
    priceRow.appendChild(el("b", "", model.price || "—"));
    if (model.euroChange) priceRow.appendChild(el("span", toneOf(model.euroChange), model.euroChange));
    hero.appendChild(priceRow);
    var versus = "vs DAX " + (model.daxSince || "—");
    if (model.versus) versus += "  ·  " + model.versus;
    hero.appendChild(el("div", "rx-vs", versus));
    top.appendChild(hero);

    var chartCard = el("article", "rx-chart");
    chartCard.appendChild(el("div", "rx-kicker", model.chartCaption || "Intraday since open"));
    var plot = el("div", "rx-plot");
    var drawn = chart(model.sparkline);
    if (drawn) plot.appendChild(drawn);
    else plot.appendChild(el("p", "", "No intraday session to chart"));
    chartCard.appendChild(plot);
    chartCard.appendChild(el("div", "rx-note", model.chartNote || ""));
    top.appendChild(chartCard);
    host.appendChild(top);

    var tiles = el("div", "rx-tiles");
    tiles.appendChild(mini("BAYRY (ADR)", model.adrSince));
    tiles.appendChild(mini("DAX", model.daxSince));
    var media = el("article", "rx-mini rx-media");
    media.appendChild(el("div", "rx-kicker", "Media update"));
    media.appendChild(el("div", "rx-media-time", model.mediaTime || "—"));
    tiles.appendChild(media);
    host.appendChild(tiles);

    host.appendChild(el("p", "slide-source", "Prices ~15 min delayed" + (model.preview ? " · Preview uses the live feed, not sample prices" : "")));
  }

  function mini(label, value) {
    var card = el("article", "rx-mini");
    card.appendChild(el("div", "rx-kicker", label));
    card.appendChild(el("div", "rx-mini-pct " + toneOf(value), value || "—"));
    return card;
  }

  var CONSUMER_SPOTLIGHT = {
    title: "Consumer Health",
    badge: "9 MONTHS 2026",
    sales: "+2.4%",
    salesLabel: "sales, first 9 months 2026",
    margin: "22.9%",
    marginLabel: "EBITDA margin",
    marginNote: "YTD",
    image: "assets/triana.jpg",
    imageAlt: "Consumer Health year-to-date and third-quarter results, Road to Billions",
    source: "Sales growth is currency and portfolio adjusted. EBITDA margin before special items. Quotes from public LinkedIn posts.",
    quotes: [
      {
        name: "Julio Triana",
        photo: "assets/julio-triana.jpg",
        text: "Through the first nine months of the year, we've delivered 2.4% growth, with continued momentum in Dermatology and Digestive Health, led by brands like Bepanthen and MiraLAX.",
        href: "https://www.linkedin.com/feed/update/urn:li:activity:7523287427504029697/",
        caption: "LinkedIn",
      },
      {
        name: "Trevor Thrun",
        photo: "assets/trevor-thrun.jpg",
        text: "As we move into the final quarter, we remain focused on disciplined execution, earning the trust of the consumers who rely on our brands, and serving our customers well.",
        href: "https://www.linkedin.com/feed/update/urn:li:activity:7523428840027811840/",
        caption: "LinkedIn",
      },
    ],
  };

  function initialsNode(name) {
    var parts = String(name || "").trim().split(/\s+/);
    var letters = "";
    if (parts[0]) letters += parts[0].charAt(0);
    if (parts.length > 1) letters += parts[parts.length - 1].charAt(0);
    return el("div", "ch-initials", letters.toUpperCase());
  }

  function avatarFor(item) {
    var wrap = el("div", "ch-avatar-wrap");
    if (!item.photo) {
      wrap.appendChild(initialsNode(item.name));
      return wrap;
    }
    var img = el("img", "ch-avatar");
    img.src = item.photo;
    img.alt = "";
    img.addEventListener("error", function () {
      wrap.replaceChildren(initialsNode(item.name));
    });
    wrap.appendChild(img);
    return wrap;
  }

  function renderConsumer(host, doc) {
    var model = doc || CONSUMER_SPOTLIGHT;
    host.replaceChildren();
    var header = el("div", "slide-head");
    var brand = el("div", "slide-brand");
    var mark = el("img", "slide-mark");
    mark.src = "assets/bayer-cross.svg";
    mark.alt = "";
    brand.appendChild(mark);
    brand.appendChild(el("h2", "", model.title || "Consumer Health"));
    header.appendChild(brand);
    if (model.badge) header.appendChild(el("div", "slide-badge", model.badge));
    host.appendChild(header);

    var body = el("div", "ch-body");
    var visual = el("div", "ch-visual");
    var photo = el("img", "ch-photo");
    photo.src = model.image || "assets/triana.jpg";
    photo.alt = model.imageAlt || "";
    visual.appendChild(photo);
    body.appendChild(visual);

    var main = el("div", "ch-main");
    var lead = el("div", "ch-lead");
    lead.appendChild(el("div", "ch-pct up", model.sales || ""));
    lead.appendChild(el("div", "ch-sales", model.salesLabel || ""));
    var margin = el("div", "ch-margin");
    margin.appendChild(el("span", "", model.marginLabel || "EBITDA margin"));
    margin.appendChild(el("b", "", model.margin || ""));
    if (model.marginNote) margin.appendChild(el("span", "ch-margin-note", model.marginNote));
    lead.appendChild(margin);
    main.appendChild(lead);

    var quotes = el("div", "ch-quotes");
    var items = model.quotes || [];
    for (var i = 0; i < items.length && i < 2; i++) {
      var item = items[i];
      var card = el("article", "ch-quote");
      var who = el("div", "ch-who");
      who.appendChild(avatarFor(item));
      var id = el("div", "ch-id");
      id.appendChild(el("h3", "", item.name || ""));
      who.appendChild(id);
      card.appendChild(who);
      var quote = el("blockquote");
      quote.textContent = item.text || "";
      card.appendChild(quote);
      if (item.href) {
        var link = el("a", "ch-link", item.caption || "LinkedIn");
        link.href = item.href;
        link.target = "_blank";
        link.rel = "noopener";
        card.appendChild(link);
      }
      quotes.appendChild(card);
    }
    main.appendChild(quotes);
    body.appendChild(main);
    host.appendChild(body);

    host.appendChild(el("p", "slide-source", model.source || ""));
  }

  function renderMirafiber(host, offer) {
    var deal = offer && offer.products && offer.products.length ? offer : {
      priceLabel: "Walmart.com price as of Nov 13, 2026",
      url: "https://www.walmart.com/browse/health-and-medicine/all-fiber-supplements/miralax/976760_1396434_2586366_3328070/YnJhbmQ6TWlyYUxBWAieie",
      products: [
        { name: "MiraFIBER Gummies", detail: "Prebiotic fiber, 8g, mixed fruit, 72 ct", price: "$15.97", unit: "22.2¢ each" },
        { name: "MiraFIBER Metabolism", detail: "Prebiotic fiber + metabolism support, 8g, 72 ct", price: "$15.97", unit: "22.2¢ each" }
      ]
    };
    host.replaceChildren();
    var header = el("div", "slide-head");
    var brand = el("div", "slide-brand");
    var mark = el("img", "slide-mark");
    mark.src = "assets/bayer-cross.svg";
    mark.alt = "";
    brand.appendChild(mark);
    brand.appendChild(el("h2", "", "MiraFIBER"));
    header.appendChild(brand);
    header.appendChild(el("div", "slide-badge", "CONSUMER HEALTH"));
    host.appendChild(header);

    var body = el("div", "mf-body");
    var visual = el("div", "mf-visual");
    var photo = el("img", "mf-photo");
    photo.src = "assets/mirafiber-hero.jpg";
    photo.alt = "MiraFIBER gummies and MiraLAX. From the gut experts at MiraLAX.";
    visual.appendChild(photo);
    body.appendChild(visual);

    var copy = el("div", "mf-copy");
    copy.appendChild(el("h3", "mf-headline", "The “Fiber Gap” is real."));
    var stats = el("div", "mf-stats");
    [["~20%", "of people worldwide meet daily fiber targets"], ["7%", "of Americans get the daily minimum"]].forEach(function (pair) {
      var cell = el("div", "mf-stat");
      cell.appendChild(el("b", "", pair[0]));
      cell.appendChild(el("span", "", pair[1]));
      stats.appendChild(cell);
    });
    copy.appendChild(stats);
    copy.appendChild(el("p", "mf-line", "#TeamBayer developed MiraFIBER Daily Prebiotic Fiber Gummies and MiraFIBER Metabolism Support Gummies so adding fiber is easier."));
    copy.appendChild(el("p", "mf-line mf-glp", "With GLP-1 medications changing eating habits, fiber matters more than ever."));

    var buy = el("section", "mf-buy");
    buy.appendChild(el("h3", "mf-buy-title", "Buy it at Walmart"));
    var row = el("div", "mf-row");
    var products = el("div", "mf-products");
    for (var i = 0; i < deal.products.length && i < 2; i++) {
      var item = deal.products[i];
      var card = el("article", "mf-product");
      card.appendChild(el("div", "mf-product-name", item.name || ""));
      card.appendChild(el("div", "mf-product-detail", item.detail || ""));
      card.appendChild(el("div", "mf-price", item.price || ""));
      if (item.unit) card.appendChild(el("div", "mf-unit", item.unit));
      products.appendChild(card);
    }
    row.appendChild(products);
    var qrWrap = el("div", "mf-qr-wrap");
    var qr = el("img", "mf-qr");
    qr.src = "assets/mirafiber-walmart-qr.svg";
    qr.alt = "QR code linking to MiraFIBER at Walmart";
    qrWrap.appendChild(qr);
    qrWrap.appendChild(el("div", "mf-qr-label", "Scan to shop"));
    row.appendChild(qrWrap);
    buy.appendChild(row);
    buy.appendChild(el("p", "mf-price-note", deal.priceLabel || "Walmart.com price as of Nov 13, 2026"));
    copy.appendChild(buy);
    body.appendChild(copy);
    host.appendChild(body);
    host.appendChild(el("p", "slide-source", "Source: Bayer Consumer Health on LinkedIn"));
  }

  root.MarketScreens = {
    sampleQ2: SAMPLE_Q2,
    consumerSpotlight: CONSUMER_SPOTLIGHT,
    renderResults: renderResults,
    renderReaction: renderReaction,
    renderConsumer: renderConsumer,
    renderMirafiber: renderMirafiber,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
