/* HOLM Energy Cards — https://github.com/kaaribou/holm-energy-cards — licence MIT — v1.0.0
 * Bilan énergétique, consommation par appareil, production & consommation, chauffage & climatisation,
 * énergie par année (barres) et totaux annuels (frise). Un seul fichier, six cartes.
 */

/* ===================== holm-energy-sources-card ===================== */
// holm-energy-sources-card — bilan des sources d'énergie, synchronisé avec le sélecteur de date (energy-date-selection)
// type: custom:holm-energy-sources-card
// title: Bilan énergétique
// collection_key: energy            (optionnel, si plusieurs sélecteurs de date)
// items:
//   - type: solar | import | export
//     entity: sensor.xxx            (kWh, total_increasing)
//     name: Production solaire      (libellé libre)
//     cost_entity: sensor.xxx_cost  (statistique de coût/compensation, optionnel)
//     price: input_number.xxx       (sinon : prix × kWh, optionnel)
//     color: "#d9921c"   icon: mdi:solar-power
// Facture (optionnel) :
// subscription: input_number.abonnement      subscription_period: month | year   (proratisé à la période)
// taxes_import: [input_number.cspe, input_number.tcfe]   (€/kWh appliqués aux kWh achetés)
// tax_export: input_number.taxe_revente                  (€/kWh déduits des kWh revendus)
// self_price: sensor.tarif_actuel   (valeur du kWh autoconsommé ; défaut = prix moyen d'achat de la période)
(() => {
const fr = (v, d = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const DEF = {
  solar: { color: "#e3a21a", icon: "mdi:solar-power-variant", label: "Production" },
  import: { color: "#4a90d9", icon: "mdi:transmission-tower-import", label: "Achat réseau" },
  export: { color: "#9b6fd6", icon: "mdi:transmission-tower-export", label: "Revente" },
};
class HolmEnergySourcesCard extends HTMLElement {
  setConfig(c) {
    if (!c || !Array.isArray(c.items) || !c.items.length) throw new Error("holm-energy-sources-card : 'items' est requis");
    this._c = { title: "Bilan énergétique", show_frame: true, ...c };
    this._range = null; this._data = null;
    if (this.shadowRoot) this._render();
    if (this._hass) this._subscribe();
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (first || !this._unsub) this._subscribe();
  }
  connectedCallback() { if (this._hass) this._subscribe(); }
  disconnectedCallback() { this._unsub?.(); this._unsub = null; clearTimeout(this._retry); clearInterval(this._tick); }
  _subscribe() {
    if (this._unsub || !this._hass) return;
    // HA récent : un sélecteur par tableau de bord (_energy_<panelUrl>), sinon _energy
    const keys = this._c.collection_key ? ["_" + this._c.collection_key]
      : [...new Set([this._hass.panelUrl ? "_energy_" + this._hass.panelUrl : null, "_energy"].filter(Boolean))];
    const idx = keys.findIndex((k) => typeof this._hass.connection?.[k]?.subscribe === "function");
    const coll = idx >= 0 ? this._hass.connection[keys[idx]] : null;
    if (coll) {
      this._linked = true;
      if (idx > 0) {
        // lié au sélecteur générique : on continue de chercher celui du tableau de bord pendant 15 s
        let n = 0;
        const chk = () => {
          if (typeof this._hass.connection?.[keys[0]]?.subscribe === "function") { this._unsub?.(); this._unsub = null; this._subscribe(); }
          else if (++n < 15) this._retry = setTimeout(chk, 1000);
        };
        clearTimeout(this._retry); this._retry = setTimeout(chk, 1000);
      }
      this._unsub = coll.subscribe((d) => { this._range = { start: new Date(d.start), end: d.end ? new Date(d.end) : null }; this._load(); });
    } else {
      // pas de sélecteur de date sur la page : aujourd'hui, et on réessaie de s'y connecter
      this._linked = false;
      if (!this._range) { const n = new Date(); this._range = { start: new Date(n.getFullYear(), n.getMonth(), n.getDate()), end: null }; this._load(); }
      clearTimeout(this._retry); this._retry = setTimeout(() => this._subscribe(), 2000);
    }
    clearInterval(this._tick);
    this._tick = setInterval(() => { if (!this._range?.end || this._range.end > new Date()) this._load(); }, 300000);
  }
  _num(x) { if (x === undefined || x === null || x === "") return NaN; if (typeof x === "number") return x; const s = this._hass?.states[x]; return s ? parseFloat(s.state) : parseFloat(x); }
  async _load() {
    if (!this._hass || !this._range) return;
    const { start } = this._range, end = this._range.end || new Date();
    const span = (end - start) / 86400000;
    const period = span <= 2 ? "hour" : span <= 62 ? "day" : "month";
    const ids = [...new Set(this._c.items.flatMap((i) => [i.entity, i.cost_entity]).filter(Boolean))];
    try {
      const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
        statistic_ids: ids, period, types: ["change"], units: { energy: "kWh" } });
      const sum = (id) => (r[id] || []).reduce((a, s) => a + (Number(s.change) || 0), 0);
      this._data = this._c.items.map((i) => {
        const kwh = sum(i.entity);
        let eur = NaN;
        if (i.cost_entity) eur = sum(i.cost_entity);
        else { const p = this._num(i.price); if (!isNaN(p)) eur = kwh * p; }
        return { ...i, kwh, eur };
      });
      this._err = null;
    } catch (e) { this._err = e?.message || String(e); }
    this._render();
  }
  _periodLabel() {
    if (!this._range) return "";
    const s = this._range.start, e = this._range.end || new Date();
    const o = { day: "numeric", month: "short" };
    const days = Math.round((e - s) / 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (days <= 1 && s.getTime() === today.getTime()) return "Aujourd'hui";
    if (days <= 1) return s.toLocaleDateString("fr-FR", { weekday: "long", ...o });
    const eIncl = new Date(e.getTime() - 1);
    return `${s.toLocaleDateString("fr-FR", o)} → ${eIncl.toLocaleDateString("fr-FR", { ...o, year: s.getFullYear() !== eIncl.getFullYear() ? "numeric" : undefined })}`;
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c, d = this._data || [];
    const by = (t) => d.filter((x) => x.type === t);
    const tot = (t, k) => by(t).reduce((a, x) => a + (isNaN(x[k]) ? 0 : x[k]), 0);
    const prod = tot("solar", "kwh"), imp = tot("import", "kwh"), exp = tot("export", "kwh");
    const cImp = tot("import", "eur"), cExp = tot("export", "eur");
    const self = Math.max(0, prod - exp), conso = self + imp;
    const autoC = prod > 0 ? (self / prod) * 100 : NaN, autoS = conso > 0 ? (self / conso) * 100 : NaN;
    // Facture estimée
    const rs = this._range?.start, re = this._range?.end || (rs ? new Date(rs.getTime() + 86400000) : null);
    const days = rs && re ? Math.max(0, (re - rs) / 86400000) : 0;
    const subV = this._num(c.subscription);
    const sub = isNaN(subV) ? 0 : (c.subscription_period === "year" ? subV / 365 : (subV * 12) / 365) * days;
    const taxRate = (Array.isArray(c.taxes_import) ? c.taxes_import : c.taxes_import ? [c.taxes_import] : []).reduce((a, e) => a + (this._num(e) || 0), 0);
    const taxImp = taxRate * imp;
    const taxExp = (this._num(c.tax_export) || 0) * exp;
    const hasBill = !isNaN(subV) || taxRate > 0 || taxExp > 0;
    const net = cImp + sub + taxImp - (cExp - taxExp);
    const avgBuy = imp > 0 ? cImp / imp : NaN;
    const selfPrice = !isNaN(this._num(c.self_price)) ? this._num(c.self_price) : avgBuy;
    const selfEur = isNaN(selfPrice) ? NaN : self * selfPrice;
    const kpi = (icon, color, label, val, sub) => `<div class="kpi"><div class="ic" style="--c:${color}"><ha-icon icon="${icon}"></ha-icon></div>
      <div class="kl">${label}</div><div class="kv">${val}</div>${sub ? `<div class="ks">${sub}</div>` : ""}</div>`;
    const ring = (pct, color, label) => {
      const p = isNaN(pct) ? 0 : Math.max(0, Math.min(100, pct)), C = 2 * Math.PI * 22;
      return `<div class="ring"><svg viewBox="0 0 56 56"><circle cx="28" cy="28" r="22" class="rt"/><circle cx="28" cy="28" r="22" class="rv" style="stroke:${color};stroke-dasharray:${(p / 100) * C} ${C}"/></svg>
        <div class="rp">${isNaN(pct) ? "—" : fr(pct, 0) + "%"}</div><div class="rl">${label}</div></div>`;
    };
    const group = (t, title, extra = "") => {
      const rows = by(t); if (!rows.length) return "";
      const max = Math.max(...rows.map((x) => Math.abs(x.kwh)), 0.001);
      return `<div class="grp"><div class="gt">${title}</div>${rows.map((x) => {
        const col = x.color || DEF[t].color;
        const name = x.name || this._hass?.states[x.entity]?.attributes.friendly_name || x.entity;
        return `<div class="row" data-e="${x.entity}"><div class="ic sm" style="--c:${col}"><ha-icon icon="${x.icon || DEF[t].icon}"></ha-icon></div>
          <div class="nm"><div class="n">${name}</div><div class="bar"><i style="width:${(Math.abs(x.kwh) / max) * 100}%;background:${col}"></i></div></div>
          <div class="v">${fr(x.kwh, 2)} <small>kWh</small></div>
          <div class="e ${t === "export" ? "pos" : ""}">${isNaN(x.eur) ? "" : (t === "export" ? "+" : "") + fr(x.eur, 2) + " €"}</div></div>`;
      }).join("")}${extra}</div>`;
    };
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { padding:14px 16px 12px; box-sizing:border-box; height:100%; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .tt { font-size:16px; font-weight:600; color:var(--primary-text-color); }
      .pd { font-size:12px; color:var(--secondary-text-color); display:flex; align-items:center; gap:4px; }
      .pd ha-icon { --mdc-icon-size:14px; }
      .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .kpi { background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border-radius:14px; padding:10px; text-align:center; }
      .ic { width:34px; height:34px; border-radius:50%; margin:0 auto 6px; display:flex; align-items:center; justify-content:center;
            background:color-mix(in srgb, var(--c) 22%, transparent); color:var(--c); }
      .ic ha-icon { --mdc-icon-size:20px; }
      .ic.sm { width:30px; height:30px; margin:0; flex:none; } .ic.sm ha-icon { --mdc-icon-size:17px; }
      .kl { font-size:11px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.4px; }
      .kv { font-size:18px; font-weight:600; color:var(--primary-text-color); margin-top:2px; white-space:nowrap; }
      .kv small, .v small { font-size:.62em; font-weight:500; color:var(--secondary-text-color); }
      .ks { font-size:12px; color:var(--secondary-text-color); margin-top:1px; }
      .mid { display:grid; grid-template-columns:1fr auto auto; gap:12px; align-items:center; margin:14px 0 6px; padding:10px 12px;
             border-radius:14px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .bl .l { font-size:11px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.4px; }
      .bl .b { font-size:24px; font-weight:700; }
      .bl .b.gain { color:#1fce8a; } .bl .b.cost { color:var(--primary-text-color); }
      .bl .s { font-size:11px; color:var(--secondary-text-color); }
      .ring { position:relative; width:64px; text-align:center; }
      .ring svg { width:56px; height:56px; transform:rotate(-90deg); }
      .rt { fill:none; stroke:color-mix(in srgb, var(--primary-text-color) 12%, transparent); stroke-width:6; }
      .rv { fill:none; stroke-width:6; stroke-linecap:round; transition:stroke-dasharray .8s ease; }
      .rp { position:absolute; top:0; left:0; right:0; height:56px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; color:var(--primary-text-color); }
      .rl { font-size:10px; color:var(--secondary-text-color); line-height:1.1; }
      .grp { margin-top:10px; }
      .gt { font-size:11px; font-weight:700; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.6px; margin:0 0 4px 2px; }
      .row { display:grid; grid-template-columns:auto 1fr auto 64px; align-items:center; gap:10px; padding:7px 4px; border-radius:10px; cursor:pointer; }
      .row:hover { background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .n { font-size:14px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .bar { height:4px; border-radius:2px; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); margin-top:5px; overflow:hidden; }
      .bar i { display:block; height:100%; border-radius:2px; transition:width .8s ease; }
      .v { font-size:14px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; text-align:right; font-variant-numeric:tabular-nums; }
      .e { font-size:13px; color:var(--secondary-text-color); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
      .e.pos { color:#1fce8a; }
      .err { color:var(--error-color); font-size:12px; }
      .row.sub { padding-left:18px; }
      .bill { padding:8px 10px 6px; border-radius:14px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .bl2 { display:flex; justify-content:space-between; font-size:13px; color:var(--secondary-text-color); padding:3px 2px; }
      .bl2 b { color:var(--primary-text-color); font-weight:600; font-variant-numeric:tabular-nums; }
      .bl2 b.pos { color:#1fce8a; } .bl2 small { font-size:11px; opacity:.8; }
      .bl2.tot { border-top:1px solid var(--divider-color); margin-top:4px; padding-top:6px; font-size:15px; color:var(--primary-text-color); font-weight:600; }
      .bl2.tot b { font-size:16px; }
      @media (max-width:420px) { .kv { font-size:15px; } .bl .b { font-size:20px; } }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      <div class="hd"><div class="tt">${c.title || ""}</div>
        <div class="pd" title="${this._linked ? "Suit le sélecteur de date" : "Aucun sélecteur de date trouvé : aujourd'hui"}"><ha-icon icon="${this._linked ? "mdi:calendar-sync" : "mdi:calendar-today"}"></ha-icon>${this._periodLabel()}</div></div>
      ${this._err ? `<div class="err">Erreur : ${this._err}</div>` : ""}
      <div class="kpis">
        ${kpi(DEF.solar.icon, DEF.solar.color, "Production", `${fr(prod, 1)} <small>kWh</small>`, "")}
        ${kpi(DEF.import.icon, DEF.import.color, "Achat réseau", `${fr(imp, 1)} <small>kWh</small>`, `${fr(cImp, 2)} €`)}
        ${kpi(DEF.export.icon, DEF.export.color, "Revente", `${fr(exp, 1)} <small>kWh</small>`, `+${fr(cExp, 2)} €`)}
      </div>
      <div class="mid">
        <div class="bl"><div class="l">${net <= 0 ? "Gain net" : hasBill ? "Facture estimée" : "Coût net"}</div><div class="b ${net <= 0 ? "gain" : "cost"}">${fr(Math.abs(net), 2)} €</div>
          <div class="s">Conso totale ${fr(conso, 1)} kWh</div></div>
        ${ring(autoC, DEF.solar.color, "Auto-<br>consommation")}
        ${ring(autoS, "#1fce8a", "Auto-<br>suffisance")}
      </div>
      ${group("solar", "Production", by("solar").length ? `<div class="row sub"><div class="ic sm" style="--c:#1fce8a"><ha-icon icon="mdi:home-lightning-bolt"></ha-icon></div>
          <div class="nm"><div class="n">${c.self_name || "Consommée sur place"}</div><div class="bar"><i style="width:${prod > 0 ? (self / prod) * 100 : 0}%;background:#1fce8a"></i></div></div>
          <div class="v">${fr(self, 2)} <small>kWh</small></div><div class="e pos" title="Économie : kWh non achetés au réseau">${isNaN(selfEur) ? "" : fr(selfEur, 2) + " €"}</div></div>` : "")}
      ${group("import", "Réseau — achat")}${group("export", "Réseau — revente")}
      ${hasBill ? `<div class="grp bill"><div class="gt">Facture estimée</div>
        <div class="bl2"><span>Énergie achetée</span><b>${fr(cImp, 2)} €</b></div>
        ${!isNaN(subV) ? `<div class="bl2"><span>Abonnement <small>(${fr(Math.round(days), 0)} j)</small></span><b>${fr(sub, 2)} €</b></div>` : ""}
        ${taxRate > 0 ? `<div class="bl2"><span>Taxes <small>(${fr(taxRate, 4)} €/kWh)</small></span><b>${fr(taxImp, 2)} €</b></div>` : ""}
        <div class="bl2"><span>Revente</span><b class="pos">−${fr(cExp, 2)} €</b></div>
        ${taxExp > 0 ? `<div class="bl2"><span>Taxe sur revente</span><b>${fr(taxExp, 2)} €</b></div>` : ""}
        <div class="bl2 tot"><span>Total</span><b>${net < 0 ? "−" : ""}${fr(Math.abs(net), 2)} €</b></div></div>` : ""}
    </ha-card>`;
    this.shadowRoot.querySelectorAll(".row").forEach((r) => r.addEventListener("click", () => {
      const ev = new Event("hass-more-info", { bubbles: true, composed: true }); ev.detail = { entityId: r.dataset.e }; this.dispatchEvent(ev);
    }));
  }
  static getConfigElement() { return document.createElement("holm-energy-sources-card-editor"); }
  static getStubConfig() { return { title: "Bilan énergétique", items: [{ type: "solar", entity: "" }] }; }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

// ---------------- Éditeur visuel ----------------
const L = { subscription: "Abonnement (€)", subscription_period: "Montant de l'abonnement", taxes_import: "Taxes sur les kWh achetés (€/kWh)",
  tax_export: "Taxe sur les kWh revendus (€/kWh)", self_price: "Valeur du kWh autoconsommé (vide = prix moyen d'achat)", self_name: "Libellé de l'autoconsommation",
  title: "Titre", collection_key: "Clé du sélecteur de date (vide = défaut)", show_frame: "Afficher le cadre de la carte",
  type: "Type", entity: "Entité énergie (kWh)", name: "Libellé", cost_entity: "Statistique de coût / compensation (€)", price: "Ou prix unitaire (€/kWh)", icon: "Icône", color: "Couleur" };
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (a) => Array.isArray(a) ? "#" + a.map((v) => Number(v).toString(16).padStart(2, "0")).join("") : a;
const GEN = [
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [ { name: "collection_key", selector: { text: {} } }, { name: "show_frame", selector: { boolean: {} } } ] },
  { type: "expandable", title: "Facture : abonnement et taxes", icon: "mdi:receipt-text", flatten: true, schema: [
    { type: "grid", name: "", schema: [
      { name: "subscription", selector: { entity: { domain: ["input_number", "sensor", "number"] } } },
      { name: "subscription_period", selector: { select: { mode: "dropdown", options: [{ value: "month", label: "par mois" }, { value: "year", label: "par an" }] } } },
    ] },
    { name: "taxes_import", selector: { entity: { multiple: true, domain: ["input_number", "sensor", "number"] } } },
    { name: "tax_export", selector: { entity: { domain: ["input_number", "sensor", "number"] } } },
  ] },
  { type: "expandable", title: "Autoconsommation", icon: "mdi:home-lightning-bolt", flatten: true, schema: [
    { type: "grid", name: "", schema: [
      { name: "self_name", selector: { text: {} } },
      { name: "self_price", selector: { entity: { domain: ["input_number", "sensor", "number"] } } },
    ] },
  ] },
];
const ITEM = [
  { type: "grid", name: "", schema: [
    { name: "type", required: true, selector: { select: { mode: "dropdown", options: [{ value: "solar", label: "Production solaire" }, { value: "import", label: "Achat réseau" }, { value: "export", label: "Revente réseau" }] } } },
    { name: "name", selector: { text: {} } },
  ] },
  { name: "entity", required: true, selector: { entity: { domain: ["sensor"] } } },
  { type: "grid", name: "", schema: [
    { name: "cost_entity", selector: { entity: { domain: ["sensor"] } } },
    { name: "price", selector: { entity: { domain: ["sensor", "input_number", "number"] } } },
    { name: "icon", selector: { icon: {} } },
    { name: "color", selector: { color_rgb: {} } },
  ] },
];
class HolmEnergySourcesCardEditor extends HTMLElement {
  setConfig(c) {
    const j = JSON.stringify(c);
    this._config = JSON.parse(j);
    if (j === this._last && this._built) return; // écho de notre propre modification : on ne reconstruit pas (garde le focus)
    this._build();
  }
  set hass(h) {
    this._hass = h;
    if (!this._built) this._build(); else this.querySelectorAll("ha-form").forEach((f) => (f.hass = h));
  }
  _emit() { this._last = JSON.stringify(this._config); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: JSON.parse(this._last) }, bubbles: true, composed: true })); }
  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass; f.schema = schema; f.data = data; f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }
  _build() {
    if (!this._hass || !this._config) return;
    this._built = true;
    const c = this._config; c.items = c.items || [];
    this.innerHTML = `<style>.it{border:1px solid var(--divider-color);border-radius:12px;padding:8px 12px 4px;margin:10px 0}
      .ih{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:4px}
      .ih span{display:flex;gap:4px} button{cursor:pointer;background:none;border:1px solid var(--divider-color);color:var(--primary-text-color);border-radius:8px;padding:4px 8px}
      .add{width:100%;padding:8px;margin-top:4px}</style><div class="gen"></div><div class="items"></div><button class="add">+ Ajouter une source</button>`;
    this.querySelector(".gen").appendChild(this._form(GEN, { show_frame: true, subscription_period: "month", ...c }, (v) => {
      Object.assign(this._config, v);
      for (const k of ["collection_key", "subscription", "tax_export", "self_price", "self_name"]) if (!v[k]) delete this._config[k];
      if (!v.taxes_import || !v.taxes_import.length) delete this._config.taxes_import;
      if (!this._config.subscription) delete this._config.subscription_period;
      if (v.show_frame !== false) delete this._config.show_frame; this._emit();
    }));
    const box = this.querySelector(".items");
    c.items.forEach((it, i) => {
      const wrap = document.createElement("div"); wrap.className = "it";
      wrap.innerHTML = `<div class="ih">Source ${i + 1}<span><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></span></div>`;
      const data = { ...it, color: hex2rgb(it.color) };
      if (typeof data.price === "number") delete data.price;
      wrap.appendChild(this._form(ITEM, data, (v) => {
        const out = {};
        for (const [k, val] of Object.entries(v)) { if (val === "" || val === undefined || val === null) continue; out[k] = k === "color" ? rgb2hex(val) : val; }
        if (typeof it.price === "number" && !out.price) out.price = it.price;
        this._config.items[i] = out; this._emit();
      }));
      wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const a = b.dataset.a, arr = this._config.items;
        if (a === "del") arr.splice(i, 1);
        if (a === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        if (a === "down" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        this._emit(); this._build();
      }));
      box.appendChild(wrap);
    });
    this.querySelector(".add").addEventListener("click", () => { this._config.items.push({ type: "import", entity: "" }); this._emit(); this._build(); });
  }
}
if (!customElements.get("holm-energy-sources-card-editor")) customElements.define("holm-energy-sources-card-editor", HolmEnergySourcesCardEditor);
if (!customElements.get("holm-energy-sources-card")) customElements.define("holm-energy-sources-card", HolmEnergySourcesCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-energy-sources-card", name: "HOLM – Bilan énergétique", description: "Sources d'énergie avec coûts, autoconsommation et autosuffisance, synchronisé au sélecteur de date", preview: false });
})();

/* ===================== holm-energy-devices-card ===================== */
// holm-energy-devices-card — consommation et coût par appareil, synchronisé avec le sélecteur de date (energy-date-selection)
// Les appareils sont lus automatiquement dans Paramètres > Tableaux de bord > Énergie (consommation individuelle).
// type: custom:holm-energy-devices-card
// title: Consommation par appareil
// cost_mode: real | grid | fixed
//   real  = coût réel : prix réseau (HC/HP) de chaque heure, solaire gratuit (part solaire déduite)
//   grid  = comme si tout venait du réseau (prix HC/HP de chaque heure)
//   fixed = prix fixe (price)
// price: input_number.xxx | 0.2          (mode fixed)
// taxes_import: [input_number.cspe, ...]   (€/kWh ajoutés au prix réseau)
// top: 10                (nombre d'appareils affichés avant « Voir tout »)
// hide_zero: true   show_unmeasured: true   show_sparkline: true   show_frame: true
// sort: kwh | eur | name
// exclude: [sensor.xxx]
// devices:               (optionnel : liste manuelle, sinon appareils du tableau de bord Énergie)
//   - entity: sensor.xxx_energy   name: Libellé   icon: mdi:xxx   color: "#hex"   power: sensor.xxx_power
(() => {
const fr = (v, d = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const PAL = ["#0abfbf", "#e3a21a", "#4a90d9", "#e2702a", "#9b6fd6", "#1fce8a", "#e05a8a", "#6fc3ff", "#c9b458", "#7b8cff", "#58c48f", "#d9774b"];
const UNM = "#7a8a94";
const ICONS = [
  [/chauffe.?eau|ballon/i, "mdi:water-boiler"], [/clim/i, "mdi:snowflake"], [/chauffage|radiateur/i, "mdi:radiator"],
  [/s[eè]che.?serviette/i, "mdi:heating-coil"], [/volet/i, "mdi:window-shutter"], [/frigo|r[ée]frig/i, "mdi:fridge-outline"],
  [/lave.?linge/i, "mdi:washing-machine"], [/lave.?vais/i, "mdi:dishwasher"], [/s[eè]che.?linge/i, "mdi:tumble-dryer"],
  [/tv|t[ée]l[ée]/i, "mdi:television"], [/spa/i, "mdi:hot-tub"], [/vid[ée]oproj/i, "mdi:projector"], [/robot|tondeuse/i, "mdi:robot-mower"],
  [/friteuse/i, "mdi:pot-steam"], [/serre/i, "mdi:greenhouse"], [/d[ée]shumid/i, "mdi:air-humidifier"], [/local tech|serveur|nas/i, "mdi:server"],
  [/multiprise/i, "mdi:power-plug-outline"], [/vmc|ventil/i, "mdi:fan"], [/bureau/i, "mdi:desk"], [/cuisson|four|plaque/i, "mdi:stove"], [/prise/i, "mdi:power-socket-eu"],
];
const iconFor = (n) => (ICONS.find(([r]) => r.test(n)) || [0, "mdi:flash"])[1];

class HolmEnergyDevicesCard extends HTMLElement {
  setConfig(c) {
    this._c = { title: "Consommation par appareil", cost_mode: "real", top: 10, hide_zero: true, show_unmeasured: true, show_sparkline: true, sort: "kwh", show_frame: true, ...c };
    this._sort = this._c.sort; this._all = false;
    if (this.shadowRoot) this._render();
    if (this._hass) { this._prefs = null; this._subscribe(); }
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (first || !this._unsub) this._subscribe();
  }
  connectedCallback() { if (this._hass) this._subscribe(); }
  disconnectedCallback() { this._unsub?.(); this._unsub = null; clearTimeout(this._retry); clearInterval(this._tick); }
  _subscribe() {
    if (this._unsub || !this._hass) return;
    const keys = this._c.collection_key ? ["_" + this._c.collection_key]
      : [...new Set([this._hass.panelUrl ? "_energy_" + this._hass.panelUrl : null, "_energy"].filter(Boolean))];
    const idx = keys.findIndex((k) => typeof this._hass.connection?.[k]?.subscribe === "function");
    const coll = idx >= 0 ? this._hass.connection[keys[idx]] : null;
    if (coll) {
      this._linked = true;
      if (idx > 0) {
        let n = 0;
        const chk = () => {
          if (typeof this._hass.connection?.[keys[0]]?.subscribe === "function") { this._unsub?.(); this._unsub = null; this._subscribe(); }
          else if (++n < 15) this._retry = setTimeout(chk, 1000);
        };
        clearTimeout(this._retry); this._retry = setTimeout(chk, 1000);
      }
      this._unsub = coll.subscribe((d) => { this._range = { start: new Date(d.start), end: d.end ? new Date(d.end) : null }; this._load(); });
    } else {
      this._linked = false;
      if (!this._range) { const n = new Date(); this._range = { start: new Date(n.getFullYear(), n.getMonth(), n.getDate()), end: null }; this._load(); }
      clearTimeout(this._retry); this._retry = setTimeout(() => this._subscribe(), 2000);
    }
    clearInterval(this._tick);
    this._tick = setInterval(() => { if (!this._range?.end || this._range.end > new Date()) this._load(); }, 300000);
  }
  _num(x) { if (x === undefined || x === null || x === "") return NaN; if (typeof x === "number") return x; const s = this._hass?.states[x]; return s ? parseFloat(s.state) : parseFloat(x); }
  async _getPrefs() {
    if (!this._prefs) { try { this._prefs = await this._hass.callWS({ type: "energy/get_prefs" }); } catch (e) { this._prefs = { energy_sources: [], device_consumption: [] }; } }
    return this._prefs;
  }
  async _load() {
    if (!this._hass || !this._range) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    const c = this._c, prefs = await this._getPrefs();
    const excl = new Set(c.exclude || []);
    const devs = (Array.isArray(c.devices) && c.devices.length
      ? c.devices.map((d) => (typeof d === "string" ? { entity: d } : d))
      : (prefs.device_consumption || []).map((d) => ({ entity: d.stat_consumption, name: d.name, power: d.stat_rate })))
      .filter((d) => d.entity && !excl.has(d.entity));
    // sources (pour le prix réel et le « non mesuré »)
    const grids = [], solars = [], exports = [];
    for (const s of prefs.energy_sources || []) {
      if (s.type === "solar" && s.stat_energy_from) solars.push(s.stat_energy_from);
      if (s.type === "battery") { if (s.stat_energy_from) solars.push(s.stat_energy_from); if (s.stat_energy_to) exports.push(s.stat_energy_to); }
      if (s.type === "grid") {
        const flows = s.flow_from ? s.flow_from : s.stat_energy_from ? [s] : [];
        for (const f of flows) grids.push({ id: f.stat_energy_from, cost: f.stat_cost, price: f.entity_energy_price || f.number_energy_price });
        for (const t of s.flow_to || (s.stat_energy_to ? [{ stat_energy_to: s.stat_energy_to }] : [])) exports.push(t.stat_energy_to);
      }
    }
    const { start } = this._range, end = this._range.end || new Date();
    const span = (end - start) / 86400000;
    const period = span <= 3 ? "hour" : span <= 93 ? "day" : "month";
    const ids = [...new Set([...devs.map((d) => d.entity), ...grids.map((g) => g.id), ...grids.map((g) => g.cost), ...solars, ...exports].filter(Boolean))];
    try {
      const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
        statistic_ids: ids, period, types: ["change"], units: { energy: "kWh" } });
      if (seq !== this._seq) return;
      const slots = new Set();
      const ser = (id) => { const m = new Map(); for (const s of r[id] || []) { const t = +new Date(s.start); slots.add(t); m.set(t, (m.get(t) || 0) + (Number(s.change) || 0)); } return m; };
      const devS = devs.map((d) => ser(d.entity));
      const gS = grids.map((g) => ({ kwh: ser(g.id), cost: g.cost ? ser(g.cost) : null, price: g.price }));
      const solS = solars.map(ser), expS = exports.map(ser);
      const T = [...slots].sort((a, b) => a - b);
      const tax = (Array.isArray(c.taxes_import) ? c.taxes_import : c.taxes_import ? [c.taxes_import] : []).reduce((a, e) => a + (this._num(e) || 0), 0);
      const fixed = this._num(c.price);
      // prix par créneau
      const price = new Map(), home = new Map();
      let impTot = 0, costTot = 0;
      for (const t of T) {
        let imp = 0, cost = 0;
        for (const g of gS) {
          const k = g.kwh.get(t) || 0; imp += k;
          cost += g.cost ? g.cost.get(t) || 0 : k * (this._num(g.price) || 0);
        }
        cost += imp * tax; impTot += imp; costTot += cost;
        const sol = solS.reduce((a, m) => a + (m.get(t) || 0), 0), ex = expS.reduce((a, m) => a + (m.get(t) || 0), 0);
        const cons = Math.max(0, imp + sol - ex);
        home.set(t, cons);
        let p;
        if (c.cost_mode === "fixed") p = isNaN(fixed) ? 0 : fixed;
        else if (c.cost_mode === "grid") p = imp > 0 ? cost / imp : NaN;
        else p = cons > 0 ? cost / cons : NaN;
        price.set(t, p);
      }
      const avg = impTot > 0 ? costTot / impTot : 0; // secours quand un créneau n'a pas d'achat réseau (mode grid)
      for (const t of T) if (isNaN(price.get(t))) price.set(t, c.cost_mode === "grid" ? avg : 0);
      const rows = devs.map((d, i) => {
        const m = devS[i];
        let kwh = 0, eur = 0; const spark = [];
        for (const t of T) { const v = Math.max(0, m.get(t) || 0); kwh += v; eur += v * price.get(t); spark.push(v); }
        const name = d.name || this._hass.states[d.entity]?.attributes.friendly_name || d.entity;
        return { ...d, name, kwh, eur, spark, icon: d.icon || iconFor(name) };
      });
      const homeTot = [...home.values()].reduce((a, v) => a + v, 0);
      let unk = 0, unkEur = 0; const unkSpark = [];
      for (const t of T) {
        const s = rows.reduce((a, x, j) => a + Math.max(0, devS[j].get(t) || 0), 0);
        const v = Math.max(0, (home.get(t) || 0) - s); unk += v; unkEur += v * price.get(t); unkSpark.push(v);
      }
      // couleurs stables : par rang de consommation
      [...rows].sort((a, b) => b.kwh - a.kwh).forEach((x, i) => { if (!x.color) x.color = PAL[i % PAL.length]; });
      this._data = { rows, homeTot, unk, unkEur, unkSpark, period, n: T.length, hasHome: gS.length > 0, solarShare: homeTot > 0 ? 1 - Math.min(1, impTot / homeTot) : NaN };
      this._err = null;
    } catch (e) { if (seq === this._seq) this._err = e?.message || String(e); }
    this._render();
  }
  _periodLabel() {
    if (!this._range) return "";
    const s = this._range.start, e = this._range.end || new Date();
    const o = { day: "numeric", month: "short" };
    const days = Math.round((e - s) / 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (days <= 1 && s.getTime() === today.getTime()) return "Aujourd'hui";
    if (days <= 1) return s.toLocaleDateString("fr-FR", { weekday: "long", ...o });
    const eIncl = new Date(e.getTime() - 1);
    return `${s.toLocaleDateString("fr-FR", o)} → ${eIncl.toLocaleDateString("fr-FR", { ...o, year: s.getFullYear() !== eIncl.getFullYear() ? "numeric" : undefined })}`;
  }
  _spark(vals, color) {
    if (!vals || vals.length < 3) return "";
    const max = Math.max(...vals, 1e-9), w = 72, h = 22, n = vals.length, bw = w / n;
    return `<svg class="sp" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${vals.map((v, i) => {
      const bh = v > 0 ? Math.max(1, (v / max) * h) : 0;
      return bh ? `<rect x="${(i * bw + bw * 0.12).toFixed(2)}" y="${(h - bh).toFixed(2)}" width="${(bw * 0.76).toFixed(2)}" height="${bh.toFixed(2)}" rx="${Math.min(1.5, bw * 0.3).toFixed(2)}" fill="${color}"/>` : "";
    }).join("")}</svg>`;
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c, d = this._data;
    let body = `<div class="empty">Chargement…</div>`;
    if (d) {
      let rows = d.rows.slice();
      const zero = rows.filter((x) => x.kwh < 0.0005).length;
      if (c.hide_zero !== false) rows = rows.filter((x) => x.kwh >= 0.0005);
      const cmp = { kwh: (a, b) => b.kwh - a.kwh, eur: (a, b) => b.eur - a.eur, name: (a, b) => a.name.localeCompare(b.name, "fr") }[this._sort] || ((a, b) => b.kwh - a.kwh);
      rows.sort(cmp);
      const devKwh = d.rows.reduce((a, x) => a + x.kwh, 0), devEur = d.rows.reduce((a, x) => a + x.eur, 0);
      const showUnk = c.show_unmeasured !== false && d.hasHome && d.unk > 0.0005;
      const total = devKwh + (showUnk ? d.unk : 0), totEur = devEur + (showUnk ? d.unkEur : 0);
      const cover = d.homeTot > 0 ? Math.min(100, (devKwh / d.homeTot) * 100) : NaN;
      const top = Math.max(1, Number(c.top) || 10);
      const vis = this._all ? rows : rows.slice(0, top);
      const max = Math.max(...rows.map((x) => this._sort === "eur" ? x.eur : x.kwh), showUnk ? (this._sort === "eur" ? d.unkEur : d.unk) : 0, 1e-9);
      // barre de répartition : 6 premiers + autres + non mesuré
      const byK = [...d.rows].sort((a, b) => b.kwh - a.kwh).filter((x) => x.kwh > 0);
      const seg = byK.slice(0, 6).map((x) => ({ n: x.name, v: x.kwh, c: x.color }));
      const rest = byK.slice(6).reduce((a, x) => a + x.kwh, 0);
      if (rest > 0) seg.push({ n: `Autres (${byK.length - 6})`, v: rest, c: "color-mix(in srgb, var(--primary-text-color) 35%, transparent)" });
      if (showUnk) seg.push({ n: "Non mesuré", v: d.unk, c: UNM, dash: true });
      const pct = (v) => (total > 0 ? (v / total) * 100 : 0);
      const row = (x, unk = false) => {
        const val = this._sort === "eur" ? x.eur : x.kwh;
        return `<div class="row ${unk ? "unk" : ""}" ${unk ? "" : `data-e="${x.power || x.entity}"`}>
          <div class="ic" style="--c:${x.color}"><ha-icon icon="${x.icon}"></ha-icon></div>
          <div class="nm"><div class="n">${x.name}</div>
            <div class="bar"><i style="width:${(Math.max(0, val) / max) * 100}%;background:${x.color}"></i></div></div>
          ${c.show_sparkline !== false ? `<div class="spw">${this._spark(x.spark, x.color)}</div>` : ""}
          <div class="v">${fr(x.kwh, x.kwh < 10 ? 2 : 1)} <small>kWh</small><div class="p">${fr(pct(x.kwh), 1)} %</div></div>
          <div class="e">${fr(x.eur, 2)} €</div></div>`;
      };
      body = `
      <div class="kpis">
        <div class="kpi"><div class="kl">Consommation</div><div class="kv">${fr(total, 1)} <small>kWh</small></div>
          <div class="ks">${d.hasHome ? `maison ${fr(d.homeTot, 1)} kWh` : `${d.rows.length} appareils`}</div></div>
        <div class="kpi"><div class="kl">Coût</div><div class="kv">${fr(totEur, 2)} <small>€</small></div>
          <div class="ks">${{ real: "solaire déduit", grid: "prix réseau", fixed: "prix fixe" }[c.cost_mode] || ""}</div></div>
        <div class="kpi"><div class="kl">Mesuré</div><div class="kv">${isNaN(cover) ? "—" : fr(cover, 0) + " <small>%</small>"}</div>
          <div class="ks">${isNaN(d.solarShare) ? "" : `solaire ${fr(d.solarShare * 100, 0)} %`}</div></div>
      </div>
      ${seg.length ? `<div class="stack">${seg.map((s) => `<i title="${s.n} : ${fr(pct(s.v), 1)} %" class="${s.dash ? "dash" : ""}" style="flex:${s.v};background:${s.c}"></i>`).join("")}</div>
      <div class="leg">${seg.map((s) => `<span><b class="${s.dash ? "dash" : ""}" style="background:${s.c}"></b>${s.n} <em>${fr(pct(s.v), 0)} %</em></span>`).join("")}</div>` : ""}
      <div class="tools"><div class="seg">${[["kwh", "kWh"], ["eur", "€"], ["name", "A→Z"]].map(([k, l]) => `<button data-s="${k}" class="${this._sort === k ? "on" : ""}">${l}</button>`).join("")}</div>
        <div class="cnt">${rows.length} appareil${rows.length > 1 ? "s" : ""}${zero && c.hide_zero !== false ? ` · ${zero} à 0` : ""}</div></div>
      <div class="list">${vis.map((x) => row(x)).join("")}
        ${showUnk && (this._all || rows.length <= top) ? row({ name: "Non mesuré", kwh: d.unk, eur: d.unkEur, spark: d.unkSpark, color: UNM, icon: "mdi:help-circle-outline" }, true) : ""}</div>
      ${rows.length > top ? `<button class="more">${this._all ? "Réduire" : `Voir tous les appareils (${rows.length})`}</button>` : ""}`;
    }
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { display:block; padding:14px 16px 12px; box-sizing:border-box; height:100%; container-type:inline-size; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .tt { font-size:16px; font-weight:600; color:var(--primary-text-color); }
      .pd { font-size:12px; color:var(--secondary-text-color); display:flex; align-items:center; gap:4px; white-space:nowrap; }
      .pd ha-icon { --mdc-icon-size:14px; }
      .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .kpi { background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border-radius:14px; padding:10px; text-align:center; }
      .kl { font-size:11px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.4px; }
      .kv { font-size:20px; font-weight:600; color:var(--primary-text-color); margin-top:2px; white-space:nowrap; font-variant-numeric:tabular-nums; }
      .kv small, .v small { font-size:.62em; font-weight:500; color:var(--secondary-text-color); }
      .ks { font-size:12px; color:var(--secondary-text-color); margin-top:1px; }
      .stack { display:flex; gap:2px; height:12px; border-radius:6px; overflow:hidden; margin:14px 0 8px; }
      .stack i { display:block; min-width:2px; transition:flex .8s ease; }
      .dash { background-image:repeating-linear-gradient(45deg, transparent 0 3px, rgba(0,0,0,.25) 3px 6px) !important; }
      .leg { display:flex; flex-wrap:wrap; gap:4px 12px; font-size:12px; color:var(--secondary-text-color); }
      .leg span { display:flex; align-items:center; gap:5px; white-space:nowrap; }
      .leg b { width:9px; height:9px; border-radius:3px; display:inline-block; }
      .leg em { font-style:normal; color:var(--primary-text-color); font-weight:600; }
      .tools { display:flex; align-items:center; justify-content:space-between; margin:14px 0 4px; gap:8px; }
      .seg { display:flex; background:color-mix(in srgb, var(--primary-text-color) 6%, transparent); border-radius:10px; padding:2px; }
      .seg button { border:none; background:none; color:var(--secondary-text-color); font:inherit; font-size:12px; padding:4px 12px; border-radius:8px; cursor:pointer; }
      .seg button.on { background:color-mix(in srgb, var(--primary-color, #0abfbf) 25%, transparent); color:var(--primary-text-color); font-weight:600; }
      .cnt { font-size:12px; color:var(--secondary-text-color); }
      .list { display:grid; grid-template-columns:1fr; column-gap:22px; }
      @container (min-width: 820px) { .list { grid-template-columns:1fr 1fr; } }
      .row { display:grid; grid-template-columns:auto minmax(0,1fr) auto 76px 62px; align-items:center; gap:10px; padding:7px 4px; border-radius:10px; cursor:pointer;
             border-bottom:1px solid color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .row:hover { background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .row.unk { cursor:default; opacity:.85; }
      .ic { width:32px; height:32px; border-radius:50%; flex:none; display:flex; align-items:center; justify-content:center;
            background:color-mix(in srgb, var(--c) 20%, transparent); color:var(--c); }
      .ic ha-icon { --mdc-icon-size:18px; }
      .n { font-size:14px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .bar { height:4px; border-radius:2px; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); margin-top:5px; overflow:hidden; }
      .bar i { display:block; height:100%; border-radius:2px; transition:width .8s ease; }
      .spw { width:72px; height:22px; } .sp { width:72px; height:22px; display:block; opacity:.85; }
      .v { font-size:14px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; text-align:right; font-variant-numeric:tabular-nums; line-height:1.15; }
      .p { font-size:11px; font-weight:400; color:var(--secondary-text-color); }
      .e { font-size:14px; color:var(--primary-text-color); text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
      .more { width:100%; margin-top:8px; padding:8px; border-radius:10px; cursor:pointer; font:inherit; font-size:13px;
              background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border:none; color:var(--primary-text-color); }
      .more:hover { background:color-mix(in srgb, var(--primary-text-color) 9%, transparent); }
      .empty { color:var(--secondary-text-color); font-size:13px; padding:12px 0; }
      .err { color:var(--error-color); font-size:12px; }
      @container (max-width: 440px) { .spw { display:none; } .row { grid-template-columns:auto minmax(0,1fr) 72px 56px; gap:8px; } .kv { font-size:16px; } }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      <div class="hd"><div class="tt">${c.title || ""}</div>
        <div class="pd" title="${this._linked ? "Suit le sélecteur de date" : "Aucun sélecteur de date trouvé : aujourd'hui"}"><ha-icon icon="${this._linked ? "mdi:calendar-sync" : "mdi:calendar-today"}"></ha-icon>${this._periodLabel()}</div></div>
      ${this._err ? `<div class="err">Erreur : ${this._err}</div>` : ""}
      ${body}
    </ha-card>`;
    const sr = this.shadowRoot;
    sr.querySelectorAll(".row[data-e]").forEach((r) => r.addEventListener("click", () => {
      const ev = new Event("hass-more-info", { bubbles: true, composed: true }); ev.detail = { entityId: r.dataset.e }; this.dispatchEvent(ev);
    }));
    sr.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { this._sort = b.dataset.s; this._render(); }));
    sr.querySelector(".more")?.addEventListener("click", () => { this._all = !this._all; this._render(); });
  }
  static getConfigElement() { return document.createElement("holm-energy-devices-card-editor"); }
  static getStubConfig() { return { title: "Consommation par appareil" }; }
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

// ---------------- Éditeur visuel ----------------
const L = { title: "Titre", collection_key: "Clé du sélecteur de date (vide = défaut)", show_frame: "Afficher le cadre de la carte",
  cost_mode: "Calcul du coût", price: "Prix fixe (€/kWh)", taxes_import: "Taxes ajoutées au prix réseau (€/kWh)",
  top: "Appareils affichés avant « Voir tout »", sort: "Tri par défaut", hide_zero: "Masquer les appareils à 0",
  show_unmeasured: "Afficher le « Non mesuré »", show_sparkline: "Afficher les mini-graphes", exclude: "Appareils à exclure",
  entity: "Entité énergie (kWh)", name: "Libellé", icon: "Icône", color: "Couleur", power: "Entité puissance (clic)" };
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (a) => Array.isArray(a) ? "#" + a.map((v) => Number(v).toString(16).padStart(2, "0")).join("") : a;
const PRICE_DOM = ["input_number", "sensor", "number"];
const GEN = [
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [ { name: "collection_key", selector: { text: {} } }, { name: "show_frame", selector: { boolean: {} } } ] },
  { type: "expandable", title: "Coût", icon: "mdi:currency-eur", flatten: true, schema: [
    { name: "cost_mode", selector: { select: { mode: "dropdown", options: [
      { value: "real", label: "Coût réel : prix HC/HP de chaque heure, solaire gratuit" },
      { value: "grid", label: "Prix réseau : comme si tout venait du réseau" },
      { value: "fixed", label: "Prix fixe" }] } } },
    { name: "price", selector: { entity: { domain: PRICE_DOM } } },
    { name: "taxes_import", selector: { entity: { multiple: true, domain: PRICE_DOM } } },
  ] },
  { type: "expandable", title: "Affichage", icon: "mdi:format-list-bulleted", flatten: true, schema: [
    { type: "grid", name: "", schema: [
      { name: "top", selector: { number: { min: 1, max: 100, mode: "box" } } },
      { name: "sort", selector: { select: { mode: "dropdown", options: [{ value: "kwh", label: "kWh" }, { value: "eur", label: "€" }, { value: "name", label: "Nom" }] } } },
      { name: "hide_zero", selector: { boolean: {} } },
      { name: "show_unmeasured", selector: { boolean: {} } },
      { name: "show_sparkline", selector: { boolean: {} } },
    ] },
    { name: "exclude", selector: { entity: { multiple: true, domain: ["sensor"] } } },
  ] },
];
const DEV = [
  { name: "entity", required: true, selector: { entity: { domain: ["sensor"] } } },
  { type: "grid", name: "", schema: [
    { name: "name", selector: { text: {} } },
    { name: "power", selector: { entity: { domain: ["sensor"] } } },
    { name: "icon", selector: { icon: {} } },
    { name: "color", selector: { color_rgb: {} } },
  ] },
];
const DEFAULTS = { cost_mode: "real", top: 10, sort: "kwh", hide_zero: true, show_unmeasured: true, show_sparkline: true, show_frame: true };
class HolmEnergyDevicesCardEditor extends HTMLElement {
  setConfig(c) {
    const j = JSON.stringify(c);
    this._config = JSON.parse(j);
    if (j === this._last && this._built) return;
    this._build();
  }
  set hass(h) {
    this._hass = h;
    if (!this._built) this._build(); else this.querySelectorAll("ha-form").forEach((f) => (f.hass = h));
  }
  _emit() { this._last = JSON.stringify(this._config); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: JSON.parse(this._last) }, bubbles: true, composed: true })); }
  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass; f.schema = schema; f.data = data; f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }
  _build() {
    if (!this._hass || !this._config) return;
    this._built = true;
    const c = this._config;
    const devs = Array.isArray(c.devices) ? c.devices : [];
    this.innerHTML = `<style>.it{border:1px solid var(--divider-color);border-radius:12px;padding:8px 12px 4px;margin:10px 0}
      .ih{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:4px}
      .ih span{display:flex;gap:4px} button{cursor:pointer;background:none;border:1px solid var(--divider-color);color:var(--primary-text-color);border-radius:8px;padding:4px 8px}
      .add{width:100%;padding:8px;margin-top:4px} .hint{font-size:12px;color:var(--secondary-text-color);margin:14px 0 4px;line-height:1.4}</style>
      <div class="gen"></div>
      <div class="hint"><b>Appareils</b> — vide : les appareils du tableau de bord Énergie sont utilisés automatiquement. Ajoute des appareils ici pour choisir ta propre liste (libellés, icônes, couleurs).</div>
      <div class="items"></div><button class="add">+ Ajouter un appareil</button>`;
    this.querySelector(".gen").appendChild(this._form(GEN, { ...DEFAULTS, ...c }, (v) => {
      Object.assign(this._config, v);
      for (const k of ["collection_key", "price"]) if (!v[k]) delete this._config[k];
      for (const k of ["taxes_import", "exclude"]) if (!v[k] || !v[k].length) delete this._config[k];
      for (const [k, dv] of Object.entries(DEFAULTS)) if (this._config[k] === dv) delete this._config[k];
      this._emit();
    }));
    const box = this.querySelector(".items");
    devs.forEach((it0, i) => {
      const it = typeof it0 === "string" ? { entity: it0 } : it0;
      const wrap = document.createElement("div"); wrap.className = "it";
      wrap.innerHTML = `<div class="ih">Appareil ${i + 1}<span><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></span></div>`;
      wrap.appendChild(this._form(DEV, { ...it, color: hex2rgb(it.color) }, (v) => {
        const out = {};
        for (const [k, val] of Object.entries(v)) { if (val === "" || val === undefined || val === null) continue; out[k] = k === "color" ? rgb2hex(val) : val; }
        this._config.devices[i] = out; this._emit();
      }));
      wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const a = b.dataset.a, arr = this._config.devices;
        if (a === "del") arr.splice(i, 1);
        if (a === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        if (a === "down" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        if (!arr.length) delete this._config.devices;
        this._emit(); this._build();
      }));
      box.appendChild(wrap);
    });
    this.querySelector(".add").addEventListener("click", () => { (this._config.devices = this._config.devices || []).push({ entity: "" }); this._emit(); this._build(); });
  }
}
if (!customElements.get("holm-energy-devices-card-editor")) customElements.define("holm-energy-devices-card-editor", HolmEnergyDevicesCardEditor);
if (!customElements.get("holm-energy-devices-card")) customElements.define("holm-energy-devices-card", HolmEnergyDevicesCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-energy-devices-card", name: "HOLM – Consommation par appareil", description: "kWh, coût et part de chaque appareil du tableau de bord Énergie, synchronisé au sélecteur de date", preview: false });
})();

/* ===================== holm-solar-chart-card ===================== */
// holm-solar-chart-card — un seul graphique, deux vues : Énergie (barres par heure/jour) et Puissance (courbe)
// Synchronisé avec le sélecteur de date (energy-date-selection). Sources lues dans le tableau de bord Énergie.
// type: custom:holm-solar-chart-card
// title: Production & consommation
// mode: energy | power          show_tabs: true       show_forecast: true
// solar_power: sensor.puissance_solaire              (défaut : puissance solaire du tableau Énergie)
// grid_power: sensor.puissance_reseau                 (défaut : puissance réseau du tableau Énergie)
// solar_color / self_color / export_color / grid_colors: ["#4a90d9", "#e2702a"] / power_grid_color
(() => {
const fr = (v, d = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const W_ = (w) => (Math.abs(w) >= 1000 ? `${fr(w / 1000, 2)} <small>kW</small>` : `${fr(w, 0)} <small>W</small>`);
const DEF = { solar_color: "#e3a21a", self_color: "#1fce8a", export_color: "#9b6fd6", grid_colors: ["#4a90d9", "#e2702a", "#e05a8a", "#6fc3ff"], power_grid_color: "#4a90d9" };
const hhmm = (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

class HolmSolarChartCard extends HTMLElement {
  setConfig(c) {
    this._c = { title: "Production & consommation", mode: "energy", show_tabs: true, show_forecast: true, show_frame: true, ...c };
    this._mode = this._c.mode;
    if (this.shadowRoot) this._render();
    if (this._hass) { this._pf = null; this._subscribe(); }
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (first || !this._unsub) this._subscribe();
  }
  connectedCallback() {
    if (this._hass) this._subscribe();
    if (!this._ro) this._ro = new ResizeObserver(() => { const w = this.clientWidth; if (w && Math.abs(w - (this._w || 0)) > 4) { this._w = w; this._render(); } });
    this._ro.observe(this);
  }
  disconnectedCallback() { this._unsub?.(); this._unsub = null; clearTimeout(this._retry); clearInterval(this._tick); this._ro?.disconnect(); }
  _subscribe() {
    if (this._unsub || !this._hass) return;
    const keys = this._c.collection_key ? ["_" + this._c.collection_key]
      : [...new Set([this._hass.panelUrl ? "_energy_" + this._hass.panelUrl : null, "_energy"].filter(Boolean))];
    const idx = keys.findIndex((k) => typeof this._hass.connection?.[k]?.subscribe === "function");
    const coll = idx >= 0 ? this._hass.connection[keys[idx]] : null;
    if (coll) {
      this._linked = true;
      if (idx > 0) {
        let n = 0;
        const chk = () => {
          if (typeof this._hass.connection?.[keys[0]]?.subscribe === "function") { this._unsub?.(); this._unsub = null; this._subscribe(); }
          else if (++n < 15) this._retry = setTimeout(chk, 1000);
        };
        clearTimeout(this._retry); this._retry = setTimeout(chk, 1000);
      }
      this._unsub = coll.subscribe((d) => { this._range = { start: new Date(d.start), end: d.end ? new Date(d.end) : null }; this._load(); });
    } else {
      this._linked = false;
      if (!this._range) { const n = new Date(); this._range = { start: new Date(n.getFullYear(), n.getMonth(), n.getDate()), end: null }; this._load(); }
      clearTimeout(this._retry); this._retry = setTimeout(() => this._subscribe(), 2000);
    }
    clearInterval(this._tick);
    this._tick = setInterval(() => { if (!this._range?.end || this._range.end > new Date()) this._load(); }, 300000);
  }
  async _prefs() {
    if (!this._pf) { try { this._pf = await this._hass.callWS({ type: "energy/get_prefs" }); } catch (e) { this._pf = { energy_sources: [] }; } }
    return this._pf;
  }
  _src(p) {
    const s = { solar: [], grids: [], exports: [], solarRate: null, gridRate: null, fc: [] };
    for (const x of p.energy_sources || []) {
      if (x.type === "solar") { if (x.stat_energy_from) s.solar.push(x.stat_energy_from); if (x.stat_rate && !s.solarRate) s.solarRate = x.stat_rate; s.fc.push(...(x.config_entry_solar_forecast || [])); }
      if (x.type === "grid") {
        for (const f of x.flow_from || (x.stat_energy_from ? [x] : [])) s.grids.push(f.stat_energy_from);
        for (const t of x.flow_to || (x.stat_energy_to ? [x] : [])) s.exports.push(t.stat_energy_to);
        const r = x.power_config?.stat_rate || x.stat_rate; if (r && !s.gridRate) s.gridRate = r;
      }
    }
    return s;
  }
  _slots(start, end, period) {
    const out = [], d = new Date(start), stepMin = { "5minute": 5 }[period];
    for (let i = 0; i < 800 && d < end; i++) {
      out.push(+d);
      if (stepMin) d.setMinutes(d.getMinutes() + stepMin); else if (period === "hour") d.setHours(d.getHours() + 1);
      else if (period === "day") d.setDate(d.getDate() + 1); else d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  async _forecast(ids, period) {
    if (!this._c.show_forecast || !ids.length) return null;
    try {
      const r = await this._hass.callWS({ type: "energy/solar_forecast" });
      const m = new Map();
      for (const id of ids) for (const [k, wh] of Object.entries(r?.[id]?.wh_hours || {})) {
        const d = new Date(k);
        if (period === "day" || period === "month") { d.setHours(0, 0, 0, 0); if (period === "month") d.setDate(1); } else d.setMinutes(0, 0, 0);
        m.set(+d, (m.get(+d) || 0) + wh / 1000);
      }
      return m.size ? m : null;
    } catch (e) { return null; }
  }
  async _load() {
    if (!this._hass || !this._range) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    const c = this._c, src = this._src(await this._prefs());
    const start = this._range.start, end = this._range.end || new Date();
    const fullEnd = this._range.end || (() => { const e = new Date(start); e.setDate(e.getDate() + Math.max(1, Math.round((Date.now() - start) / 86400000))); return e; })();
    const span = (fullEnd - start) / 86400000;
    try {
      if (this._mode === "power") {
        const period = span <= 2 ? "5minute" : span <= 14 ? "hour" : "day";
        const sId = c.solar_power || src.solarRate, gId = c.grid_power || src.gridRate;
        const ids = [sId, gId].filter(Boolean);
        const r = ids.length ? await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
          statistic_ids: ids, period, types: ["mean", "max"], units: { power: "W" } }) : {};
        const T = this._slots(start, fullEnd, period);
        const pick = (id, k) => { const m = new Map((r[id] || []).map((s) => [+new Date(s.start), s[k]])); return T.map((t) => (m.has(t) ? Number(m.get(t)) : null)); };
        const sM = sId ? pick(sId, "mean") : [], sX = sId ? pick(sId, "max") : [], gM = gId ? pick(gId, "mean") : [];
        // point « maintenant » pour une courbe à jour
        const live = !this._range.end || this._range.end > new Date();
        const now = { s: sId ? parseFloat(this._hass.states[sId]?.state) : NaN, g: gId ? parseFloat(this._hass.states[gId]?.state) : NaN };
        const fc = await this._forecast(src.fc, "hour");
        if (seq !== this._seq) return;
        this._data = { mode: "power", period, T, sM, sX, gM, sId, gId, fc, live, now };
      } else {
        const period = span <= 3 ? "hour" : span <= 93 ? "day" : "month";
        const ids = [...new Set([...src.solar, ...src.grids, ...src.exports])];
        const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
          statistic_ids: ids, period, types: ["change"], units: { energy: "kWh" } });
        const T = this._slots(start, fullEnd, period);
        const ser = (id) => { const m = new Map(); for (const s of r[id] || []) { const t = +new Date(s.start); m.set(t, (m.get(t) || 0) + Math.max(0, Number(s.change) || 0)); } return T.map((t) => m.get(t) || 0); };
        const sum = (arrs) => T.map((_, i) => arrs.reduce((a, x) => a + x[i], 0));
        const sol = sum(src.solar.map(ser)), exp = sum(src.exports.map(ser));
        const grids = src.grids.map((id, i) => ({ id, name: this._gridName(id, i, src.grids.length), v: ser(id) }));
        const self = T.map((_, i) => Math.max(0, sol[i] - exp[i]));
        const fcM = await this._forecast(src.fc, period);
        const fc = fcM ? T.map((t) => fcM.get(t) ?? null) : null;
        if (seq !== this._seq) return;
        this._data = { mode: "energy", period, T, sol, exp, self, grids, fc };
      }
      this._err = null;
    } catch (e) { if (seq === this._seq) this._err = e?.message || String(e); }
    this._render();
  }
  _gridName(id, i, n) {
    const f = (this._c.grid_names || [])[i]; if (f) return f;
    if (/_hc|creuse/i.test(id)) return "Réseau HC";
    if (/_hp|pleine/i.test(id)) return "Réseau HP";
    return n > 1 ? `Réseau ${i + 1}` : "Réseau";
  }
  _periodLabel() {
    if (!this._range) return "";
    const s = this._range.start, e = this._range.end || new Date();
    const o = { day: "numeric", month: "short" };
    const days = Math.round((e - s) / 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (days <= 1 && s.getTime() === today.getTime()) return "Aujourd'hui";
    if (days <= 1) return s.toLocaleDateString("fr-FR", { weekday: "long", ...o });
    const eIncl = new Date(e.getTime() - 1);
    return `${s.toLocaleDateString("fr-FR", o)} → ${eIncl.toLocaleDateString("fr-FR", { ...o, year: s.getFullYear() !== eIncl.getFullYear() ? "numeric" : undefined })}`;
  }
  _tlab(t, period, long) {
    const d = new Date(t);
    if (period === "5minute" || period === "hour") return long ? `${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })} ${hhmm(t)}` : `${d.getHours()}h`;
    if (period === "day") return long ? d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short" }) : String(d.getDate());
    return d.toLocaleDateString("fr-FR", { month: long ? "long" : "short", year: long ? "numeric" : undefined });
  }
  // échelle « ronde » : 4 graduations maximum, pas de 1 / 2 / 2,5 / 5 × 10^n
  _nice(max) { if (max <= 0) return 1; const raw = (max * 1.02) / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); const st = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw); return st * Math.ceil((max * 1.02) / st); }
  _step(top) { const raw = top / 4, p = Math.pow(10, Math.floor(Math.log10(raw))); const st = [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= raw - 1e-9); return st; }
  _dec(st) { return st >= 1 ? 0 : st >= 0.1 ? (Math.round(st * 10) === st * 10 ? 1 : 2) : 2; }
  _axisX(T, period, x, H, bw) {
    const days = (T[T.length - 1] - T[0]) / 86400000;
    let out = "";
    if (period === "5minute" || (period === "hour" && days < 1.5)) {
      T.forEach((t, i) => { const d = new Date(t); if (d.getMinutes() === 0 && d.getHours() % (this._w < 420 ? 4 : 3) === 0) out += `<text x="${x(i) + (period === "hour" ? bw / 2 : 0)}" y="${H - 4}" class="ax" text-anchor="middle">${d.getHours()}h</text>`; });
    } else if (period === "hour") {
      T.forEach((t, i) => { const d = new Date(t); if (d.getHours() === 0) out += `<line x1="${x(i)}" x2="${x(i)}" y1="4" y2="${H - 16}" class="gl"/><text x="${x(i) + 3}" y="${H - 4}" class="ax">${d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })}</text>`; });
    } else {
      const step = Math.ceil(T.length / Math.max(4, Math.floor((this._w || 400) / 42)));
      T.forEach((t, i) => { if (i % step === 0) out += `<text x="${x(i) + bw / 2}" y="${H - 4}" class="ax" text-anchor="middle">${this._tlab(t, period)}</text>`; });
    }
    return out;
  }
  _energy(d, col) {
    const Wd = Math.max(280, (this._w || 400) - 32), H = 210, pl = 34, pr = 6, pt = 8, pb = 20;
    const n = d.T.length, iw = Wd - pl - pr, bw = iw / n;
    const up = d.T.map((_, i) => d.self[i] + d.grids.reduce((a, g) => a + g.v[i], 0));
    const upMax = Math.max(...up, ...(d.fc || []).map((v) => v || 0), 0.01), dnMax = Math.max(...d.exp, 0);
    const nUp = this._nice(upMax), nDn = dnMax > 0 ? this._nice(dnMax) : 0;
    const ih = H - pt - pb, y0 = pt + ih * (nUp / (nUp + nDn)), k = (ih) / (nUp + nDn);
    const x = (i) => pl + i * bw;
    let g = "";
    const st = this._step(nUp), dc = this._dec(st);
    for (let v = 0; v <= nUp + 1e-9; v += st) { const y = y0 - v * k; g += `<line x1="${pl}" x2="${Wd - pr}" y1="${y}" y2="${y}" class="gl ${v === 0 ? "z" : ""}"/><text x="${pl - 5}" y="${y + 3}" class="ax" text-anchor="end">${fr(v, dc)}</text>`; }
    for (let v = st; v <= nDn + 1e-9; v += st) { const y = y0 + v * k; g += `<line x1="${pl}" x2="${Wd - pr}" y1="${y}" y2="${y}" class="gl"/><text x="${pl - 5}" y="${y + 3}" class="ax" text-anchor="end">−${fr(v, dc)}</text>`; }
    const now = Date.now(), r = Math.min(3, bw * 0.25), w = Math.max(1, bw * 0.7), off = (bw - w) / 2;
    d.T.forEach((t, i) => {
      let yy = y0;
      const seg = [[d.self[i], col.self], ...d.grids.map((gg, j) => [gg.v[i], col.grids[j % col.grids.length]])];
      const tot = seg.reduce((a, s) => a + s[0], 0);
      let top = true;
      for (let s = seg.length - 1; s >= 0; s--) if (seg[s][0] > 0) { seg[s].top = top; top = false; }
      for (const s of seg) {
        if (s[0] <= 0) continue;
        const h = s[0] * k; yy -= h;
        g += s.top ? `<path d="M${x(i) + off},${yy + h} v${-(h - Math.min(r, h))} q0,${-Math.min(r, h)} ${Math.min(r, h)},${-Math.min(r, h)} h${w - 2 * Math.min(r, h)} q${Math.min(r, h)},0 ${Math.min(r, h)},${Math.min(r, h)} v${h - Math.min(r, h)} z" fill="${s[1]}"/>`
          : `<rect x="${x(i) + off}" y="${yy}" width="${w}" height="${h}" fill="${s[1]}"/>`;
      }
      if (d.exp[i] > 0) { const h = d.exp[i] * k; g += `<path d="M${x(i) + off},${y0} v${h - Math.min(r, h)} q0,${Math.min(r, h)} ${Math.min(r, h)},${Math.min(r, h)} h${w - 2 * Math.min(r, h)} q${Math.min(r, h)},0 ${Math.min(r, h)},${-Math.min(r, h)} v${-(h - Math.min(r, h))} z" fill="${col.exp}"/>`; }
      if (d.fc && d.fc[i] > 0) { const yf = y0 - d.fc[i] * k; g += `<line x1="${x(i) + off - 1}" x2="${x(i) + off + w + 1}" y1="${yf}" y2="${yf}" class="fc"/>`; }
      if (t > now && !tot) g += `<rect x="${x(i) + off}" y="${y0 - 1}" width="${w}" height="2" class="fut"/>`;
    });
    g += this._axisX(d.T, d.period, x, H, bw);
    this._tip = { n, x0: pl, bw, h: H, html: (i) => {
      const rows = [[col.self, "Solaire consommé", d.self[i]], ...d.grids.map((gg, j) => [col.grids[j % col.grids.length], gg.name, gg.v[i]]), [col.exp, "Revendu", d.exp[i]]];
      return `<b>${this._tlab(d.T[i], d.period, true)}</b>${rows.map(([cc, l, v]) => `<div><i style="background:${cc}"></i>${l}<span>${fr(v, 2)} kWh</span></div>`).join("")}
        <div class="tt2"><i style="background:${col.solar}"></i>Production<span>${fr(d.sol[i], 2)} kWh</span></div>${d.fc && d.fc[i] != null ? `<div><i class="fcd"></i>Prévision<span>${fr(d.fc[i], 2)} kWh</span></div>` : ""}`;
    } };
    return `<svg width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}">${g}<rect class="hov" x="0" y="0" width="0" height="${H - pb}"/></svg>`;
  }
  _power(d, col) {
    const Wd = Math.max(280, (this._w || 400) - 32), H = 210, pl = 40, pr = 6, pt = 10, pb = 20;
    const n = d.T.length, iw = Wd - pl - pr;
    const fcW = d.fc ? d.T.map((t) => { const h = new Date(t); h.setMinutes(0, 0, 0); const v = d.fc.get(+h); return v == null ? null : v * 1000; }) : null;
    const max = Math.max(...d.sX.map((v) => v || 0), ...d.sM.map((v) => v || 0), ...d.gM.map((v) => v || 0), ...(fcW || []).map((v) => v || 0), 10);
    const minRaw = Math.min(0, ...d.gM.map((v) => v || 0)); // injection réseau = valeurs négatives
    const nm = this._nice(max), stp = this._step(nm), lo = minRaw < 0 ? -stp * Math.ceil(-minRaw * 1.02 / stp) : 0;
    const ih = H - pt - pb, y = (v) => pt + ih - ((v - lo) / (nm - lo)) * ih;
    const x = (i) => pl + (n > 1 ? (i / (n - 1)) * iw : 0);
    let g = `<defs><linearGradient id="gs" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col.solar}" stop-opacity=".55"/><stop offset="1" stop-color="${col.solar}" stop-opacity=".02"/></linearGradient></defs>`;
    const lab = (v) => (Math.abs(v) >= 1000 ? fr(v / 1000, v % 1000 ? 1 : 0) + "k" : fr(v, 0));
    for (let v = lo; v <= nm + 1e-9; v += stp) { v = Math.round(v); g += `<line x1="${pl}" x2="${Wd - pr}" y1="${y(v)}" y2="${y(v)}" class="gl ${v === 0 ? "z" : ""}"/><text x="${pl - 5}" y="${y(v) + 3}" class="ax" text-anchor="end">${v < 0 ? "−" + lab(-v) : lab(v)}</text>`; }
    const path = (arr) => { let p = "", on = false; arr.forEach((v, i) => { if (v == null) { on = false; return; } p += `${on ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; on = true; }); return p; };
    const area = (arr) => { let p = "", seg = []; const flush = () => { if (seg.length > 1) p += `M${x(seg[0]).toFixed(1)},${y(0)}` + seg.map((i) => `L${x(i).toFixed(1)},${y(arr[i]).toFixed(1)}`).join("") + `L${x(seg[seg.length - 1]).toFixed(1)},${y(0)}Z`; seg = []; };
      arr.forEach((v, i) => { if (v == null) flush(); else seg.push(i); }); flush(); return p; };
    if (fcW) g += `<path d="${path(fcW)}" class="fcl"/>`;
    if (d.sId) {
      if (d.period !== "5minute") g += `<path d="${path(d.sX)}" fill="none" stroke="${col.solar}" stroke-width="1" stroke-opacity=".45" stroke-dasharray="2 2"/>`;
      g += `<path d="${area(d.sM)}" fill="url(#gs)"/><path d="${path(d.sM)}" fill="none" stroke="${col.solar}" stroke-width="2" stroke-linejoin="round"/>`;
    }
    if (d.gId) {
      // au-dessus de 0 : soutirage (bleu) ; en dessous : injection (couleur revente)
      const z = y(0);
      g += `<clipPath id="cpu"><rect x="0" y="0" width="${Wd}" height="${z}"/></clipPath><clipPath id="cpd"><rect x="0" y="${z}" width="${Wd}" height="${H - z}"/></clipPath>
        <path d="${path(d.gM)}" fill="none" stroke="${col.pgrid}" stroke-width="1.6" stroke-linejoin="round" stroke-opacity=".9" clip-path="url(#cpu)"/>`;
      if (lo < 0) g += `<path d="${area(d.gM)}" fill="${col.exp}" fill-opacity=".18" clip-path="url(#cpd)"/><path d="${path(d.gM)}" fill="none" stroke="${col.exp}" stroke-width="1.6" stroke-linejoin="round" clip-path="url(#cpd)"/>`;
    }
    // pic de production
    let pk = -1; d.sX.forEach((v, i) => { if (v != null && (pk < 0 || v > d.sX[pk])) pk = i; });
    if (pk >= 0 && d.sX[pk] > 0) {
      const px = x(pk), py = y(d.sX[pk]), anchor = px > Wd - 80 ? "end" : px < pl + 40 ? "start" : "middle";
      g += `<circle cx="${px}" cy="${py}" r="3.5" fill="${col.solar}" stroke="var(--card-background-color,#111)" stroke-width="1.5"/>
        <text x="${px}" y="${Math.max(10, py - 7)}" class="pk" text-anchor="${anchor}">${d.sX[pk] >= 1000 ? fr(d.sX[pk] / 1000, 2) + " kW" : fr(d.sX[pk], 0) + " W"} · ${hhmm(d.T[pk])}</text>`;
    }
    // point actuel
    if (d.live) {
      let li = -1; d.sM.forEach((v, i) => { if (v != null) li = i; });
      if (li >= 0 && !isNaN(d.now.s)) g += `<circle cx="${x(li)}" cy="${y(Math.max(0, d.now.s))}" r="4" fill="${col.solar}" class="pulse"/>`;
    }
    g += this._axisX(d.T, d.period, x, H, 0);
    this._tip = { n, x0: pl, bw: n > 1 ? iw / (n - 1) : iw, h: H, pt: true, html: (i) => `<b>${this._tlab(d.T[i], d.period, true)}</b>
      ${d.sId ? `<div><i style="background:${col.solar}"></i>Production<span>${d.sM[i] == null ? "—" : W_(d.sM[i])}</span></div>` : ""}
      ${d.sId && d.period !== "5minute" && d.sX[i] != null ? `<div><i style="background:${col.solar};opacity:.5"></i>Maxi<span>${W_(d.sX[i])}</span></div>` : ""}
      ${d.gId ? `<div><i style="background:${d.gM[i] < 0 ? col.exp : col.pgrid}"></i>${d.gM[i] < 0 ? "Injection réseau" : "Soutirage réseau"}<span>${d.gM[i] == null ? "—" : W_(Math.abs(d.gM[i]))}</span></div>` : ""}
      ${fcW && fcW[i] != null ? `<div><i class="fcd"></i>Prévision<span>${W_(fcW[i])}</span></div>` : ""}` };
    return `<svg width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}">${g}<line class="hovl" x1="0" x2="0" y1="${pt}" y2="${H - pb}"/></svg>`;
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c, d = this._data;
    const col = { solar: c.solar_color || DEF.solar_color, self: c.self_color || DEF.self_color, exp: c.export_color || DEF.export_color,
      grids: c.grid_colors?.length ? c.grid_colors : DEF.grid_colors, pgrid: c.power_grid_color || DEF.power_grid_color };
    let chips = "", chart = `<div class="empty">Chargement…</div>`;
    this._tip = null;
    if (d && d.mode === this._mode) {
      const chip = (color, label, val, dash) => `<div class="chip"><i class="${dash ? "fcd" : ""}" style="${dash ? "" : `background:${color}`}"></i><div><div class="cl">${label}</div><div class="cv">${val}</div></div></div>`;
      if (d.mode === "energy") {
        const S = (a) => a.reduce((x, v) => x + v, 0);
        const prod = S(d.sol), self = S(d.self), exp = S(d.exp);
        chips = chip(col.self, "Solaire consommé", `${fr(self, 1)} <small>kWh</small>`)
          + d.grids.map((gg, j) => chip(col.grids[j % col.grids.length], gg.name, `${fr(S(gg.v), 1)} <small>kWh</small>`)).join("")
          + chip(col.exp, "Revendu", `${fr(exp, 1)} <small>kWh</small>`)
          + (d.fc ? chip("", "Prévision", `${fr(S(d.fc.map((v) => v || 0)), 1)} <small>kWh</small>`, true) : "");
        chips = `<div class="prod"><span style="color:${col.solar}">☀</span> Production <b>${fr(prod, 1)} kWh</b>${prod > 0 ? ` · autoconsommée à <b>${fr((self / prod) * 100, 0)} %</b>` : ""}</div><div class="chips">${chips}</div>`;
        chart = this._energy(d, col);
      } else {
        let pk = null; d.sX.forEach((v, i) => { if (v != null && (pk == null || v > d.sX[pk])) pk = i; });
        chips = `<div class="chips">${d.sId ? chip(col.solar, d.live ? "Production actuelle" : "Production moy.", d.live && !isNaN(d.now.s) ? W_(d.now.s) : W_(d.sM.filter((v) => v != null).reduce((a, v, _, arr) => a + v / arr.length, 0))) : ""}
          ${pk != null ? chip(col.solar, "Pic", `${W_(d.sX[pk])} <small>à ${hhmm(d.T[pk])}</small>`) : ""}
          ${d.gId ? (d.live && !isNaN(d.now.g) ? chip(d.now.g < 0 ? col.exp : col.pgrid, d.now.g < 0 ? "Injection actuelle" : "Réseau actuel", W_(Math.abs(d.now.g)))
            : chip(col.pgrid, "Réseau moy.", W_(d.gM.filter((v) => v != null).reduce((a, v, _, arr) => a + v / arr.length, 0)))) : ""}
          ${d.fc ? chip("", "Courbe prévue", "<small>pointillés</small>", true) : ""}</div>`;
        chart = this._power(d, col);
      }
    }
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { display:block; padding:14px 16px 12px; box-sizing:border-box; height:100%; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .hd { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
      .tt { font-size:16px; font-weight:600; color:var(--primary-text-color); }
      .rt { display:flex; align-items:center; gap:10px; }
      .pd { font-size:12px; color:var(--secondary-text-color); display:flex; align-items:center; gap:4px; white-space:nowrap; }
      .pd ha-icon { --mdc-icon-size:14px; }
      .seg { display:flex; background:color-mix(in srgb, var(--primary-text-color) 6%, transparent); border-radius:10px; padding:2px; }
      .seg button { border:none; background:none; color:var(--secondary-text-color); font:inherit; font-size:12px; padding:4px 10px; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:4px; }
      .seg button ha-icon { --mdc-icon-size:15px; }
      .seg button.on { background:color-mix(in srgb, var(--primary-color, #0abfbf) 25%, transparent); color:var(--primary-text-color); font-weight:600; }
      .prod { font-size:12px; color:var(--secondary-text-color); margin:2px 0 8px; } .prod b { color:var(--primary-text-color); font-weight:600; }
      .chips { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px; }
      .chip { display:flex; align-items:center; gap:7px; padding:5px 10px 5px 8px; border-radius:10px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .chip > i { width:10px; height:10px; border-radius:3px; flex:none; }
      .fcd { background:none !important; border:1.5px dashed var(--primary-text-color); opacity:.6; box-sizing:border-box; width:10px; height:10px; border-radius:3px; display:inline-block; }
      .cl { font-size:10px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.3px; white-space:nowrap; }
      .cv { font-size:14px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; font-variant-numeric:tabular-nums; }
      .cv small { font-size:.72em; font-weight:500; color:var(--secondary-text-color); }
      .cw { position:relative; }
      svg { display:block; overflow:visible; }
      .gl { stroke:color-mix(in srgb, var(--primary-text-color) 8%, transparent); stroke-width:1; }
      .gl.z { stroke:color-mix(in srgb, var(--primary-text-color) 22%, transparent); }
      .ax { fill:var(--secondary-text-color); font-size:10px; }
      .fc { stroke:var(--primary-text-color); stroke-opacity:.55; stroke-width:1.5; stroke-dasharray:3 2; }
      .fcl { fill:none; stroke:var(--primary-text-color); stroke-opacity:.45; stroke-width:1.4; stroke-dasharray:4 3; }
      .fut { fill:color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
      .pk { fill:var(--primary-text-color); font-size:10.5px; font-weight:600; }
      .pulse { animation:pl 2s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
      @keyframes pl { 0%,100% { opacity:1; } 50% { opacity:.35; } }
      .hov { fill:color-mix(in srgb, var(--primary-text-color) 7%, transparent); pointer-events:none; }
      .hovl { stroke:color-mix(in srgb, var(--primary-text-color) 35%, transparent); stroke-width:1; pointer-events:none; opacity:0; }
      .tip { position:absolute; top:4px; pointer-events:none; z-index:2; min-width:170px; padding:8px 10px; border-radius:10px; font-size:12px; color:var(--primary-text-color);
             background:color-mix(in srgb, var(--card-background-color, #0f1720) 92%, transparent); border:1px solid var(--divider-color); box-shadow:0 6px 18px rgba(0,0,0,.35);
             backdrop-filter:blur(6px); display:none; }
      .tip b { display:block; margin-bottom:4px; font-weight:600; text-transform:capitalize; }
      .tip div { display:flex; align-items:center; gap:6px; line-height:1.6; } .tip div span { margin-left:auto; padding-left:10px; font-variant-numeric:tabular-nums; font-weight:600; }
      .tip i { width:8px; height:8px; border-radius:2px; display:inline-block; } .tip .tt2 { border-top:1px solid var(--divider-color); margin-top:3px; padding-top:3px; }
      .tip small { font-size:.8em; color:var(--secondary-text-color); }
      .empty { color:var(--secondary-text-color); font-size:13px; padding:40px 0; text-align:center; }
      .err { color:var(--error-color); font-size:12px; }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      <div class="hd"><div class="tt">${c.title || ""}</div>
        <div class="rt">
          <div class="pd" title="${this._linked ? "Suit le sélecteur de date" : "Aucun sélecteur de date trouvé : aujourd'hui"}"><ha-icon icon="${this._linked ? "mdi:calendar-sync" : "mdi:calendar-today"}"></ha-icon>${this._periodLabel()}</div>
          ${c.show_tabs !== false ? `<div class="seg">${[["energy", "mdi:chart-bar", "Énergie"], ["power", "mdi:chart-bell-curve", "Puissance"]].map(([k, ic, l]) => `<button data-m="${k}" class="${this._mode === k ? "on" : ""}"><ha-icon icon="${ic}"></ha-icon>${l}</button>`).join("")}</div>` : ""}
        </div></div>
      ${this._err ? `<div class="err">Erreur : ${this._err}</div>` : ""}
      ${chips}
      <div class="cw">${chart}<div class="tip"></div></div>
    </ha-card>`;
    const sr = this.shadowRoot;
    sr.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { if (this._mode === b.dataset.m) return; this._mode = b.dataset.m; this._data = null; this._render(); this._load(); }));
    const svg = sr.querySelector(".cw svg"), tip = sr.querySelector(".tip");
    if (svg && this._tip) {
      const T = this._tip, hov = svg.querySelector(".hov"), hl = svg.querySelector(".hovl");
      const move = (ev) => {
        const rc = svg.getBoundingClientRect(), px = ev.clientX - rc.left;
        let i = T.pt ? Math.round((px - T.x0) / T.bw) : Math.floor((px - T.x0) / T.bw);
        if (i < 0 || i >= T.n) { tip.style.display = "none"; if (hov) hov.setAttribute("width", 0); if (hl) hl.style.opacity = 0; return; }
        if (hov) { hov.setAttribute("x", T.x0 + i * T.bw); hov.setAttribute("width", T.bw); }
        if (hl) { const xx = T.x0 + i * T.bw; hl.setAttribute("x1", xx); hl.setAttribute("x2", xx); hl.style.opacity = 1; }
        tip.innerHTML = T.html(i); tip.style.display = "block";
        const tw = tip.offsetWidth, cx = T.x0 + (i + (T.pt ? 0 : 0.5)) * T.bw;
        tip.style.left = `${cx + 14 + tw > rc.width ? Math.max(0, cx - tw - 14) : cx + 14}px`;
      };
      svg.addEventListener("pointermove", move); svg.addEventListener("pointerdown", move);
      svg.addEventListener("pointerleave", () => { tip.style.display = "none"; if (hov) hov.setAttribute("width", 0); if (hl) hl.style.opacity = 0; });
    }
  }
  static getConfigElement() { return document.createElement("holm-solar-chart-card-editor"); }
  static getStubConfig() { return { title: "Production & consommation" }; }
  getCardSize() { return 6; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

// ---------------- Éditeur visuel ----------------
const L = { title: "Titre", collection_key: "Clé du sélecteur de date (vide = défaut)", show_frame: "Afficher le cadre de la carte", mode: "Vue par défaut",
  show_tabs: "Afficher les onglets Énergie / Puissance", show_forecast: "Afficher la prévision solaire", solar_power: "Puissance solaire (vide = tableau Énergie)",
  grid_power: "Puissance réseau (vide = tableau Énergie)", solar_color: "Couleur production", self_color: "Couleur solaire consommé", export_color: "Couleur revente",
  grid_color_1: "Couleur réseau 1 (HC)", grid_color_2: "Couleur réseau 2 (HP)", power_grid_color: "Couleur courbe réseau" };
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (a) => Array.isArray(a) ? "#" + a.map((v) => Number(v).toString(16).padStart(2, "0")).join("") : a;
const SCHEMA = [
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [
    { name: "mode", selector: { select: { mode: "dropdown", options: [{ value: "energy", label: "Énergie (barres)" }, { value: "power", label: "Puissance (courbe)" }] } } },
    { name: "collection_key", selector: { text: {} } },
    { name: "show_tabs", selector: { boolean: {} } }, { name: "show_forecast", selector: { boolean: {} } }, { name: "show_frame", selector: { boolean: {} } },
  ] },
  { type: "expandable", title: "Capteurs de puissance", icon: "mdi:flash", flatten: true, schema: [
    { name: "solar_power", selector: { entity: { domain: ["sensor"] } } },
    { name: "grid_power", selector: { entity: { domain: ["sensor"] } } },
  ] },
  { type: "expandable", title: "Couleurs", icon: "mdi:palette", flatten: true, schema: [
    { type: "grid", name: "", schema: ["solar_color", "self_color", "export_color", "grid_color_1", "grid_color_2", "power_grid_color"].map((n) => ({ name: n, selector: { color_rgb: {} } })) },
  ] },
];
const DEFAULTS = { mode: "energy", show_tabs: true, show_forecast: true, show_frame: true };
class HolmSolarChartCardEditor extends HTMLElement {
  setConfig(c) {
    const j = JSON.stringify(c);
    this._config = JSON.parse(j);
    if (j === this._last && this._built) return;
    this._build();
  }
  set hass(h) { this._hass = h; if (!this._built) this._build(); else if (this._f) this._f.hass = h; }
  _build() {
    if (!this._hass || !this._config) return;
    this._built = true;
    const c = this._config, gc = c.grid_colors || DEF.grid_colors;
    const data = { ...DEFAULTS, ...c, solar_color: hex2rgb(c.solar_color || DEF.solar_color), self_color: hex2rgb(c.self_color || DEF.self_color),
      export_color: hex2rgb(c.export_color || DEF.export_color), grid_color_1: hex2rgb(gc[0]), grid_color_2: hex2rgb(gc[1]), power_grid_color: hex2rgb(c.power_grid_color || DEF.power_grid_color) };
    this.innerHTML = "";
    const f = (this._f = document.createElement("ha-form"));
    f.hass = this._hass; f.schema = SCHEMA; f.data = data; f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value, o = { ...this._config };
      for (const k of ["title", "mode", "collection_key", "show_tabs", "show_forecast", "show_frame", "solar_power", "grid_power"]) { if (v[k] === "" || v[k] === undefined) delete o[k]; else o[k] = v[k]; }
      for (const k of ["solar_color", "self_color", "export_color", "power_grid_color"]) { const h = rgb2hex(v[k]); if (!h || h === DEF[k]) delete o[k]; else o[k] = h; }
      const g1 = rgb2hex(v.grid_color_1) || DEF.grid_colors[0], g2 = rgb2hex(v.grid_color_2) || DEF.grid_colors[1];
      if (g1 === DEF.grid_colors[0] && g2 === DEF.grid_colors[1]) delete o.grid_colors; else o.grid_colors = [g1, g2];
      for (const [k, dv] of Object.entries(DEFAULTS)) if (o[k] === dv) delete o[k];
      this._config = o; this._last = JSON.stringify(o);
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: o }, bubbles: true, composed: true }));
    });
    this.appendChild(f);
  }
}
if (!customElements.get("holm-solar-chart-card-editor")) customElements.define("holm-solar-chart-card-editor", HolmSolarChartCardEditor);
if (!customElements.get("holm-solar-chart-card")) customElements.define("holm-solar-chart-card", HolmSolarChartCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-solar-chart-card", name: "HOLM – Production & consommation", description: "Graphique énergie (barres) et puissance (courbe) du solaire et du réseau, synchronisé au sélecteur de date", preview: false });
})();

/* ===================== holm-climate-energy-card ===================== */
// holm-climate-energy-card — chauffage & climatisation par pièce, en un seul coup d'œil
// Synchronisé avec le sélecteur de date (energy-date-selection).
// type: custom:holm-climate-energy-card
// title: Chauffage & climatisation
// cost_mode: real | grid | fixed      (voir holm-energy-devices-card)   price: …   taxes_import: [...]
// compare: true            (évolution vs période précédente)
// view: bars | heatmap     (graphique affiché par défaut)
// heat_color: "#e2702a"   cool_color: "#4aa8e0"
// rooms:
//   - name: Séjour   icon: mdi:sofa
//     heating: sensor.sejour_climatecontrol_heating_daily_electrical_consumption
//     cooling: sensor.sejour_climatecontrol_cooling_daily_electrical_consumption
(() => {
const fr = (v, d = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
const HEAT = "#e2702a", COOL = "#4aa8e0";

class HolmClimateEnergyCard extends HTMLElement {
  setConfig(c) {
    if (!c || !Array.isArray(c.rooms) || !c.rooms.length) throw new Error("holm-climate-energy-card : 'rooms' est requis");
    this._c = { title: "Chauffage & climatisation", cost_mode: "real", compare: true, view: "bars", show_frame: true, ...c };
    this._view = this._c.view; this._sel = null;
    if (this.shadowRoot) this._render();
    if (this._hass) this._subscribe();
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (first || !this._unsub) this._subscribe();
  }
  connectedCallback() { if (this._hass) this._subscribe(); }
  disconnectedCallback() { this._unsub?.(); this._unsub = null; clearTimeout(this._retry); clearInterval(this._tick); }
  _subscribe() {
    if (this._unsub || !this._hass) return;
    const keys = this._c.collection_key ? ["_" + this._c.collection_key]
      : [...new Set([this._hass.panelUrl ? "_energy_" + this._hass.panelUrl : null, "_energy"].filter(Boolean))];
    const idx = keys.findIndex((k) => typeof this._hass.connection?.[k]?.subscribe === "function");
    const coll = idx >= 0 ? this._hass.connection[keys[idx]] : null;
    if (coll) {
      this._linked = true;
      if (idx > 0) {
        let n = 0;
        const chk = () => {
          if (typeof this._hass.connection?.[keys[0]]?.subscribe === "function") { this._unsub?.(); this._unsub = null; this._subscribe(); }
          else if (++n < 15) this._retry = setTimeout(chk, 1000);
        };
        clearTimeout(this._retry); this._retry = setTimeout(chk, 1000);
      }
      this._unsub = coll.subscribe((d) => { this._range = { start: new Date(d.start), end: d.end ? new Date(d.end) : null }; this._load(); });
    } else {
      this._linked = false;
      if (!this._range) { const n = new Date(); this._range = { start: new Date(n.getFullYear(), n.getMonth(), n.getDate()), end: null }; this._load(); }
      clearTimeout(this._retry); this._retry = setTimeout(() => this._subscribe(), 2000);
    }
    clearInterval(this._tick);
    this._tick = setInterval(() => { if (!this._range?.end || this._range.end > new Date()) this._load(); }, 300000);
  }
  _num(x) { if (x === undefined || x === null || x === "") return NaN; if (typeof x === "number") return x; const s = this._hass?.states[x]; return s ? parseFloat(s.state) : parseFloat(x); }
  async _prefs() {
    if (!this._pf) { try { this._pf = await this._hass.callWS({ type: "energy/get_prefs" }); } catch (e) { this._pf = { energy_sources: [] }; } }
    return this._pf;
  }
  // récupère les séries + prix par créneau pour [start, end[
  async _fetch(start, end, period, roomIds) {
    const c = this._c, prefs = await this._prefs();
    const grids = [], solars = [], exports = [];
    if (c.cost_mode !== "fixed") for (const s of prefs.energy_sources || []) {
      if (s.type === "solar" && s.stat_energy_from) solars.push(s.stat_energy_from);
      if (s.type === "battery") { if (s.stat_energy_from) solars.push(s.stat_energy_from); if (s.stat_energy_to) exports.push(s.stat_energy_to); }
      if (s.type === "grid") {
        for (const f of s.flow_from || (s.stat_energy_from ? [s] : [])) grids.push({ id: f.stat_energy_from, cost: f.stat_cost, price: f.entity_energy_price || f.number_energy_price });
        for (const t of s.flow_to || (s.stat_energy_to ? [s] : [])) exports.push(t.stat_energy_to);
      }
    }
    const ids = [...new Set([...roomIds, ...grids.map((g) => g.id), ...grids.map((g) => g.cost), ...solars, ...exports].filter(Boolean))];
    const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), end_time: end.toISOString(),
      statistic_ids: ids, period, types: ["change"], units: { energy: "kWh" } });
    const ser = (id) => { const m = new Map(); for (const s of r[id] || []) { const t = +new Date(s.start); m.set(t, (m.get(t) || 0) + Math.max(0, Number(s.change) || 0)); } return m; };
    const tax = (Array.isArray(c.taxes_import) ? c.taxes_import : c.taxes_import ? [c.taxes_import] : []).reduce((a, e) => a + (this._num(e) || 0), 0);
    const gS = grids.map((g) => ({ kwh: ser(g.id), cost: g.cost ? ser(g.cost) : null, price: g.price }));
    const solS = solars.map(ser), expS = exports.map(ser);
    const price = (t) => {
      if (c.cost_mode === "fixed") { const p = this._num(c.price); return isNaN(p) ? 0 : p; }
      let imp = 0, cost = 0;
      for (const g of gS) { const k = g.kwh.get(t) || 0; imp += k; cost += g.cost ? g.cost.get(t) || 0 : k * (this._num(g.price) || 0); }
      cost += imp * tax;
      if (c.cost_mode === "grid") return imp > 0 ? cost / imp : this._avg || 0;
      const sol = solS.reduce((a, m) => a + (m.get(t) || 0), 0), ex = expS.reduce((a, m) => a + (m.get(t) || 0), 0);
      const cons = imp + sol - ex;
      return cons > 0 ? cost / cons : 0;
    };
    if (c.cost_mode === "grid") { // prix moyen de secours pour les créneaux sans achat
      let i = 0, k = 0; for (const g of gS) for (const [t, v] of g.kwh) { i += v; k += g.cost ? g.cost.get(t) || 0 : v * (this._num(g.price) || 0); }
      this._avg = i > 0 ? k / i + tax : 0;
    }
    return { ser, price };
  }
  _slots(start, end, period) {
    const out = [], d = new Date(start);
    for (let i = 0; i < 400 && d < end; i++) {
      out.push(+d);
      if (period === "hour") d.setHours(d.getHours() + 1); else if (period === "day") d.setDate(d.getDate() + 1); else d.setMonth(d.getMonth() + 1);
    }
    return out;
  }
  async _load() {
    if (!this._hass || !this._range) return;
    const seq = (this._seq = (this._seq || 0) + 1);
    const c = this._c;
    const start = this._range.start, end = this._range.end || new Date();
    const fullEnd = this._range.end || (() => { const e = new Date(start); e.setDate(e.getDate() + Math.max(1, Math.round((Date.now() - start) / 86400000))); return e; })();
    const span = (fullEnd - start) / 86400000;
    const period = span <= 3 ? "hour" : span <= 93 ? "day" : "month";
    const ids = c.rooms.flatMap((r) => [r.heating, r.cooling]).filter(Boolean);
    try {
      const cur = await this._fetch(start, end, period, ids);
      const T = this._slots(start, fullEnd, period);
      const rooms = c.rooms.map((rm) => {
        const h = rm.heating ? cur.ser(rm.heating) : new Map(), k = rm.cooling ? cur.ser(rm.cooling) : new Map();
        let hk = 0, ck = 0, eur = 0; const hs = [], cs = [];
        for (const t of T) { const a = h.get(t) || 0, b = k.get(t) || 0; hk += a; ck += b; hs.push(a); cs.push(b); eur += (a + b) * cur.price(t); }
        return { ...rm, name: rm.name || this._hass.states[rm.heating || rm.cooling]?.attributes.friendly_name || "Pièce", hk, ck, kwh: hk + ck, eur, hs, cs };
      });
      // période précédente (même durée, juste avant)
      if (c.compare !== false) {
        const len = fullEnd - start, pS = new Date(start - len), pE = new Date(start - len + (end - start));
        try {
          const prev = await this._fetch(pS, pE, period, ids);
          rooms.forEach((rm) => {
            const s = (id) => (id ? [...prev.ser(id).values()].reduce((a, v) => a + v, 0) : 0);
            rm.prev = s(rm.heating) + s(rm.cooling);
          });
        } catch (e) { /* comparaison facultative */ }
      }
      if (seq !== this._seq) return;
      this._data = { rooms, T, period };
      this._err = null;
    } catch (e) { if (seq === this._seq) this._err = e?.message || String(e); }
    this._render();
  }
  _periodLabel() {
    if (!this._range) return "";
    const s = this._range.start, e = this._range.end || new Date();
    const o = { day: "numeric", month: "short" };
    const days = Math.round((e - s) / 86400000);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (days <= 1 && s.getTime() === today.getTime()) return "Aujourd'hui";
    if (days <= 1) return s.toLocaleDateString("fr-FR", { weekday: "long", ...o });
    const eIncl = new Date(e.getTime() - 1);
    return `${s.toLocaleDateString("fr-FR", o)} → ${eIncl.toLocaleDateString("fr-FR", { ...o, year: s.getFullYear() !== eIncl.getFullYear() ? "numeric" : undefined })}`;
  }
  _tlab(t, period, short) {
    const d = new Date(t);
    if (period === "hour") return d.getHours() + "h";
    if (period === "day") return short ? String(d.getDate()) : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("fr-FR", { month: short ? "narrow" : "long", year: short ? undefined : "numeric" });
  }
  _bars(d, rooms, hc, cc) {
    const n = d.T.length; if (!n) return "";
    const H = [], C = [];
    for (let i = 0; i < n; i++) { H.push(rooms.reduce((a, r) => a + r.hs[i], 0)); C.push(rooms.reduce((a, r) => a + r.cs[i], 0)); }
    const max = Math.max(...H.map((v, i) => v + C[i]), 1e-6);
    const nice = (() => { const p = Math.pow(10, Math.floor(Math.log10(max))); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((v) => v >= max) || max; })();
    const W = 600, Ht = 170, pl = 30, pb = 18, iw = W - pl - 4, ih = Ht - pb - 6, bw = iw / n;
    const step = Math.ceil(n / (d.period === "hour" ? 12 : 16));
    let g = "";
    for (let k = 0; k <= 4; k++) { const y = 6 + ih - (k / 4) * ih; g += `<line x1="${pl}" x2="${W - 4}" y1="${y}" y2="${y}" class="gl"/><text x="${pl - 4}" y="${y + 3}" class="ax" text-anchor="end">${fr((nice * k) / 4, nice < 4 ? 1 : 0)}</text>`; }
    const now = Date.now();
    d.T.forEach((t, i) => {
      const x = pl + i * bw + bw * 0.14, w = Math.max(1, bw * 0.72);
      const hh = (H[i] / nice) * ih, ch = (C[i] / nice) * ih;
      const tip = `${this._tlab(t, d.period)} — chauffage ${fr(H[i], 2)} kWh · clim ${fr(C[i], 2)} kWh`;
      g += `<g class="b"><title>${tip}</title><rect x="${pl + i * bw}" y="6" width="${bw}" height="${ih}" fill="transparent"/>`;
      if (hh > 0) g += `<rect x="${x}" y="${6 + ih - hh}" width="${w}" height="${hh}" rx="${Math.min(3, w / 3)}" fill="${hc}"/>`;
      if (ch > 0) g += `<rect x="${x}" y="${6 + ih - hh - ch}" width="${w}" height="${ch}" rx="${Math.min(3, w / 3)}" fill="${cc}"/>`;
      if (t > now) g += `<rect x="${x}" y="${6 + ih - 2}" width="${w}" height="2" class="fut"/>`;
      g += `</g>`;
      if (i % step === 0) g += `<text x="${pl + i * bw + bw / 2}" y="${Ht - 4}" class="ax" text-anchor="middle">${this._tlab(t, d.period, true)}</text>`;
    });
    return `<svg class="chart" viewBox="0 0 ${W} ${Ht}" preserveAspectRatio="none">${g}</svg>`;
  }
  _heat(d, rooms, hc, cc) {
    const n = d.T.length; if (!n) return "";
    const max = Math.max(...rooms.flatMap((r) => r.hs.map((v, i) => v + r.cs[i])), 1e-6);
    const step = Math.ceil(n / (d.period === "hour" ? 12 : 16));
    return `<div class="hm" style="--n:${n}">${rooms.map((r) => `<div class="hr"><div class="hn">${r.name}</div><div class="hc">${r.hs.map((v, i) => {
      const tot = v + r.cs[i], col = r.cs[i] > v ? cc : hc, a = tot > 0 ? 0.18 + 0.82 * Math.sqrt(tot / max) : 0;
      return `<i title="${r.name} · ${this._tlab(d.T[i], d.period)} : ${fr(tot, 2)} kWh" style="background:${tot > 0 ? `color-mix(in srgb, ${col} ${Math.round(a * 100)}%, transparent)` : ""}"></i>`;
    }).join("")}</div></div>`).join("")}
      <div class="hr ax2"><div class="hn"></div><div class="hc">${d.T.map((t, i) => `<span>${i % step === 0 ? this._tlab(t, d.period, true) : ""}</span>`).join("")}</div></div></div>`;
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c, d = this._data;
    const hc = c.heat_color || HEAT, cc = c.cool_color || COOL;
    let body = `<div class="empty">Chargement…</div>`;
    if (d) {
      const R = d.rooms;
      const tH = R.reduce((a, r) => a + r.hk, 0), tC = R.reduce((a, r) => a + r.ck, 0), tE = R.reduce((a, r) => a + r.eur, 0);
      const hasPrev = R.some((r) => r.prev !== undefined), tP = R.reduce((a, r) => a + (r.prev || 0), 0);
      const delta = (now, prev) => {
        if (prev === undefined || (prev < 0.05 && now < 0.05)) return "";
        if (prev < 0.05) return `<span class="dl up">nouveau</span>`;
        const p = ((now - prev) / prev) * 100;
        return `<span class="dl ${p > 0 ? "up" : "dn"}">${p > 0 ? "▲" : "▼"} ${fr(Math.abs(p), 0)} %</span>`;
      };
      const max = Math.max(...R.map((r) => r.kwh), 1e-6);
      const sel = this._sel !== null ? R[this._sel] : null;
      const tiles = R.map((r, i) => {
        const inten = r.kwh / max, dom = r.ck > r.hk ? cc : hc;
        return `<div class="tile ${this._sel === i ? "on" : ""} ${r.kwh < 0.005 ? "off" : ""}" data-i="${i}" style="--t:${dom};--a:${Math.round(8 + inten * 30)}%">
          <div class="th"><ha-icon icon="${r.icon || (r.ck > r.hk ? "mdi:snowflake" : "mdi:radiator")}"></ha-icon><span>${r.name}</span></div>
          <div class="tv">${fr(r.kwh, r.kwh < 10 ? 2 : 1)} <small>kWh</small></div>
          <div class="te">${fr(r.eur, 2)} € ${delta(r.kwh, r.prev)}</div>
          <div class="sb">${r.kwh > 0 ? `<i style="flex:${r.hk};background:${hc}"></i><i style="flex:${r.ck};background:${cc}"></i>` : ""}</div></div>`;
      }).join("");
      const shown = sel ? [sel] : R;
      body = `
      <div class="kpis">
        <div class="kpi" style="--c:${hc}"><ha-icon icon="mdi:radiator"></ha-icon><div><div class="kl">Chauffage</div><div class="kv">${fr(tH, 1)} <small>kWh</small></div></div></div>
        <div class="kpi" style="--c:${cc}"><ha-icon icon="mdi:snowflake"></ha-icon><div><div class="kl">Climatisation</div><div class="kv">${fr(tC, 1)} <small>kWh</small></div></div></div>
        <div class="kpi" style="--c:#1fce8a"><ha-icon icon="mdi:currency-eur"></ha-icon><div><div class="kl">Coût</div><div class="kv">${fr(tE, 2)} <small>€</small></div>
          ${hasPrev ? `<div class="ks">${delta(tH + tC, tP) || "="} <span>vs période préc.</span></div>` : ""}</div></div>
      </div>
      <div class="tiles">${tiles}</div>
      <div class="ch">
        <div class="chh"><div class="cht">${sel ? sel.name : "Toute la maison"}${sel ? ` <button class="clr" title="Revenir à toute la maison">✕</button>` : ""}</div>
          <div class="lg"><span><b style="background:${hc}"></b>Chauffage</span><span><b style="background:${cc}"></b>Clim</span></div>
          <div class="seg">${[["bars", "mdi:chart-bar"], ["heatmap", "mdi:view-grid"]].map(([k, ic]) => `<button data-v="${k}" class="${this._view === k ? "on" : ""}" title="${k === "bars" ? "Barres" : "Carte de chaleur"}"><ha-icon icon="${ic}"></ha-icon></button>`).join("")}</div></div>
        ${this._view === "heatmap" ? this._heat(d, shown, hc, cc) : this._bars(d, shown, hc, cc)}
      </div>`;
    }
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { display:block; padding:14px 16px 14px; box-sizing:border-box; height:100%; container-type:inline-size; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .hd { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:12px; }
      .tt { font-size:16px; font-weight:600; color:var(--primary-text-color); }
      .pd { font-size:12px; color:var(--secondary-text-color); display:flex; align-items:center; gap:4px; white-space:nowrap; }
      .pd ha-icon { --mdc-icon-size:14px; }
      .kpis { display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
      .kpi { display:flex; align-items:center; gap:10px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); border-radius:14px; padding:10px 12px; }
      .kpi > ha-icon { --mdc-icon-size:20px; color:var(--c); background:color-mix(in srgb, var(--c) 20%, transparent); border-radius:50%; padding:7px; flex:none; }
      .kl { font-size:11px; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.4px; }
      .kv { font-size:20px; font-weight:600; color:var(--primary-text-color); white-space:nowrap; font-variant-numeric:tabular-nums; }
      .kv small, .tv small { font-size:.6em; font-weight:500; color:var(--secondary-text-color); }
      .ks { font-size:11px; color:var(--secondary-text-color); white-space:nowrap; }
      .tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:8px; margin:12px 0; }
      .tile { position:relative; border-radius:14px; padding:10px 12px 12px; cursor:pointer; overflow:hidden; transition:transform .15s, box-shadow .15s;
              background:linear-gradient(145deg, color-mix(in srgb, var(--t) var(--a), transparent), color-mix(in srgb, var(--primary-text-color) 4%, transparent));
              border:1px solid color-mix(in srgb, var(--t) 22%, transparent); }
      .tile:hover { transform:translateY(-1px); }
      .tile.on { box-shadow:0 0 0 2px var(--t), 0 0 18px color-mix(in srgb, var(--t) 45%, transparent); }
      .tile.off { opacity:.45; }
      .th { display:flex; align-items:center; gap:6px; font-size:13px; color:var(--primary-text-color); white-space:nowrap; overflow:hidden; }
      .th span { overflow:hidden; text-overflow:ellipsis; }
      .th ha-icon { --mdc-icon-size:17px; color:var(--t); flex:none; }
      .tv { font-size:22px; font-weight:700; color:var(--primary-text-color); margin-top:6px; font-variant-numeric:tabular-nums; }
      .te { font-size:12px; color:var(--secondary-text-color); display:flex; align-items:center; gap:6px; font-variant-numeric:tabular-nums; }
      .dl { font-size:11px; font-weight:600; } .dl.up { color:#f06478; } .dl.dn { color:#1fce8a; }
      .sb { display:flex; gap:2px; height:4px; border-radius:2px; overflow:hidden; margin-top:8px; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); }
      .sb i { display:block; min-width:0; }
      .ch { border-radius:14px; padding:10px 12px 8px; background:color-mix(in srgb, var(--primary-text-color) 4%, transparent); }
      .chh { display:flex; align-items:center; gap:12px; margin-bottom:6px; }
      .cht { font-size:14px; font-weight:600; color:var(--primary-text-color); display:flex; align-items:center; gap:6px; flex:1; min-width:0; }
      .clr { border:none; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); color:var(--primary-text-color); border-radius:50%; width:20px; height:20px; font-size:11px; cursor:pointer; padding:0; }
      .lg { display:flex; gap:10px; font-size:12px; color:var(--secondary-text-color); }
      .lg span { display:flex; align-items:center; gap:4px; } .lg b { width:9px; height:9px; border-radius:3px; display:inline-block; }
      .seg { display:flex; background:color-mix(in srgb, var(--primary-text-color) 6%, transparent); border-radius:9px; padding:2px; }
      .seg button { border:none; background:none; color:var(--secondary-text-color); padding:3px 7px; border-radius:7px; cursor:pointer; display:flex; }
      .seg button ha-icon { --mdc-icon-size:16px; }
      .seg button.on { background:color-mix(in srgb, var(--primary-color, #0abfbf) 25%, transparent); color:var(--primary-text-color); }
      .chart { width:100%; height:190px; display:block; }
      .gl { stroke:color-mix(in srgb, var(--primary-text-color) 8%, transparent); stroke-width:1; vector-effect:non-scaling-stroke; }
      .ax { fill:var(--secondary-text-color); font-size:10px; }
      .fut { fill:color-mix(in srgb, var(--primary-text-color) 12%, transparent); }
      .b:hover rect:first-child { fill:color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
      .hm { display:flex; flex-direction:column; gap:3px; padding:4px 0; }
      .hr { display:grid; grid-template-columns:110px 1fr; align-items:center; gap:8px; }
      .hn { font-size:12px; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; text-align:right; }
      .hc { display:grid; grid-template-columns:repeat(var(--n), 1fr); gap:2px; }
      .hc i { display:block; height:18px; border-radius:3px; background:color-mix(in srgb, var(--primary-text-color) 5%, transparent); }
      .ax2 .hc span { font-size:10px; color:var(--secondary-text-color); white-space:nowrap; overflow:visible; }
      .empty { color:var(--secondary-text-color); font-size:13px; padding:12px 0; }
      .err { color:var(--error-color); font-size:12px; }
      @container (max-width: 520px) { .kpis { grid-template-columns:1fr 1fr; } .kpis .kpi:last-child { grid-column:span 2; } .lg { display:none; } .hr { grid-template-columns:78px 1fr; } .tiles { grid-template-columns:repeat(2, 1fr); } }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      <div class="hd"><div class="tt">${c.title || ""}</div>
        <div class="pd" title="${this._linked ? "Suit le sélecteur de date" : "Aucun sélecteur de date trouvé : aujourd'hui"}"><ha-icon icon="${this._linked ? "mdi:calendar-sync" : "mdi:calendar-today"}"></ha-icon>${this._periodLabel()}</div></div>
      ${this._err ? `<div class="err">Erreur : ${this._err}</div>` : ""}
      ${body}
    </ha-card>`;
    const sr = this.shadowRoot;
    sr.querySelectorAll(".tile").forEach((t) => t.addEventListener("click", () => { const i = +t.dataset.i; this._sel = this._sel === i ? null : i; this._render(); }));
    sr.querySelector(".clr")?.addEventListener("click", () => { this._sel = null; this._render(); });
    sr.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => { this._view = b.dataset.v; this._render(); }));
  }
  static getConfigElement() { return document.createElement("holm-climate-energy-card-editor"); }
  static getStubConfig() { return { title: "Chauffage & climatisation", rooms: [{ name: "Séjour", heating: "", cooling: "" }] }; }
  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 6 }; }
}

// ---------------- Éditeur visuel ----------------
const L = { title: "Titre", collection_key: "Clé du sélecteur de date (vide = défaut)", show_frame: "Afficher le cadre de la carte",
  cost_mode: "Calcul du coût", price: "Prix fixe (€/kWh)", taxes_import: "Taxes ajoutées au prix réseau (€/kWh)",
  compare: "Comparer à la période précédente", view: "Graphique par défaut", heat_color: "Couleur chauffage", cool_color: "Couleur climatisation",
  name: "Nom de la pièce", icon: "Icône", heating: "Énergie chauffage (kWh)", cooling: "Énergie climatisation (kWh)" };
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (a) => Array.isArray(a) ? "#" + a.map((v) => Number(v).toString(16).padStart(2, "0")).join("") : a;
const PD = ["input_number", "sensor", "number"];
const GEN = [
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [ { name: "collection_key", selector: { text: {} } }, { name: "show_frame", selector: { boolean: {} } } ] },
  { type: "expandable", title: "Affichage", icon: "mdi:palette", flatten: true, schema: [
    { type: "grid", name: "", schema: [
      { name: "view", selector: { select: { mode: "dropdown", options: [{ value: "bars", label: "Barres" }, { value: "heatmap", label: "Carte de chaleur" }] } } },
      { name: "compare", selector: { boolean: {} } },
      { name: "heat_color", selector: { color_rgb: {} } },
      { name: "cool_color", selector: { color_rgb: {} } },
    ] },
  ] },
  { type: "expandable", title: "Coût", icon: "mdi:currency-eur", flatten: true, schema: [
    { name: "cost_mode", selector: { select: { mode: "dropdown", options: [
      { value: "real", label: "Coût réel : prix HC/HP de chaque heure, solaire gratuit" },
      { value: "grid", label: "Prix réseau : comme si tout venait du réseau" },
      { value: "fixed", label: "Prix fixe" }] } } },
    { name: "price", selector: { entity: { domain: PD } } },
    { name: "taxes_import", selector: { entity: { multiple: true, domain: PD } } },
  ] },
];
const ROOM = [
  { type: "grid", name: "", schema: [ { name: "name", selector: { text: {} } }, { name: "icon", selector: { icon: {} } } ] },
  { name: "heating", selector: { entity: { domain: ["sensor"] } } },
  { name: "cooling", selector: { entity: { domain: ["sensor"] } } },
];
const DEFAULTS = { cost_mode: "real", compare: true, view: "bars", show_frame: true };
class HolmClimateEnergyCardEditor extends HTMLElement {
  setConfig(c) {
    const j = JSON.stringify(c);
    this._config = JSON.parse(j);
    if (j === this._last && this._built) return;
    this._build();
  }
  set hass(h) {
    this._hass = h;
    if (!this._built) this._build(); else this.querySelectorAll("ha-form").forEach((f) => (f.hass = h));
  }
  _emit() { this._last = JSON.stringify(this._config); this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: JSON.parse(this._last) }, bubbles: true, composed: true })); }
  _form(schema, data, onChange) {
    const f = document.createElement("ha-form");
    f.hass = this._hass; f.schema = schema; f.data = data; f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => { ev.stopPropagation(); onChange(ev.detail.value); });
    return f;
  }
  _build() {
    if (!this._hass || !this._config) return;
    this._built = true;
    const c = this._config; c.rooms = c.rooms || [];
    this.innerHTML = `<style>.it{border:1px solid var(--divider-color);border-radius:12px;padding:8px 12px 4px;margin:10px 0}
      .ih{display:flex;align-items:center;justify-content:space-between;font-weight:600;margin-bottom:4px}
      .ih span{display:flex;gap:4px} button{cursor:pointer;background:none;border:1px solid var(--divider-color);color:var(--primary-text-color);border-radius:8px;padding:4px 8px}
      .add{width:100%;padding:8px;margin-top:4px}</style><div class="gen"></div><div class="items"></div><button class="add">+ Ajouter une pièce</button>`;
    const data = { ...DEFAULTS, ...c, heat_color: hex2rgb(c.heat_color || HEAT), cool_color: hex2rgb(c.cool_color || COOL) };
    this.querySelector(".gen").appendChild(this._form(GEN, data, (v) => {
      Object.assign(this._config, v);
      this._config.heat_color = rgb2hex(v.heat_color); this._config.cool_color = rgb2hex(v.cool_color);
      if (this._config.heat_color === HEAT || !v.heat_color) delete this._config.heat_color;
      if (this._config.cool_color === COOL || !v.cool_color) delete this._config.cool_color;
      for (const k of ["collection_key", "price"]) if (!v[k]) delete this._config[k];
      if (!v.taxes_import || !v.taxes_import.length) delete this._config.taxes_import;
      for (const [k, dv] of Object.entries(DEFAULTS)) if (this._config[k] === dv) delete this._config[k];
      this._emit();
    }));
    const box = this.querySelector(".items");
    c.rooms.forEach((it, i) => {
      const wrap = document.createElement("div"); wrap.className = "it";
      wrap.innerHTML = `<div class="ih">${it.name || "Pièce " + (i + 1)}<span><button data-a="up">▲</button><button data-a="down">▼</button><button data-a="del">✕</button></span></div>`;
      wrap.appendChild(this._form(ROOM, { ...it }, (v) => {
        const out = {};
        for (const [k, val] of Object.entries(v)) { if (val === "" || val === undefined || val === null) continue; out[k] = val; }
        this._config.rooms[i] = out; this._emit();
      }));
      wrap.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        const a = b.dataset.a, arr = this._config.rooms;
        if (a === "del") arr.splice(i, 1);
        if (a === "up" && i > 0) [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
        if (a === "down" && i < arr.length - 1) [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
        this._emit(); this._build();
      }));
      box.appendChild(wrap);
    });
    this.querySelector(".add").addEventListener("click", () => { this._config.rooms.push({ name: "" }); this._emit(); this._build(); });
  }
}
if (!customElements.get("holm-climate-energy-card-editor")) customElements.define("holm-climate-energy-card-editor", HolmClimateEnergyCardEditor);
if (!customElements.get("holm-climate-energy-card")) customElements.define("holm-climate-energy-card", HolmClimateEnergyCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-climate-energy-card", name: "HOLM – Chauffage & climatisation", description: "Consommation et coût du chauffage et de la clim par pièce, en tuiles + un seul graphique, synchronisé au sélecteur de date", preview: false });
})();

/* ===================== holm-year-bars-card ===================== */
// holm-year-bars-card — énergie par année en barres, avec comparaison « à date » et projection de l'année en cours
// type: custom:holm-year-bars-card
// entity: sensor.production_solaire    (statistique kWh, total ou total_increasing)
// title: Énergie annuelle
// start_year: 2024          (ou years: 3)
// unit: auto | kWh | MWh    color: "#0ABFBF"    show_projection: true    show_frame: true
(() => {
const fr = (v, d = 1) => Number(v).toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

class HolmYearBarsCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity) throw new Error("holm-year-bars-card : 'entity' est requis");
    this._c = { title: "Énergie annuelle", unit: "auto", color: "#0ABFBF", show_projection: true, show_frame: true, ...c };
    this._data = null;
    if (this.shadowRoot) this._render();
    if (this._hass) this._load();
  }
  set hass(h) {
    const first = !this._hass; this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (first) this._load();
  }
  connectedCallback() {
    if (!this._ro) this._ro = new ResizeObserver(() => { const w = this.clientWidth; if (w && Math.abs(w - (this._w || 0)) > 4) { this._w = w; this._render(); } });
    this._ro.observe(this);
    clearInterval(this._tk); this._tk = setInterval(() => this._load(), 30 * 60000);
  }
  disconnectedCallback() { this._ro?.disconnect(); clearInterval(this._tk); }
  async _load() {
    if (!this._hass) return;
    const c = this._c, now = new Date(), y1 = now.getFullYear();
    const y0 = c.start_year ? Number(c.start_year) : y1 - Math.max(1, Number(c.years) || 3) + 1;
    try {
      const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(y0, 0, 1).toISOString(), end_time: now.toISOString(),
        statistic_ids: [c.entity], period: "day", types: ["change"], units: { energy: "kWh" } });
      const rows = (r[c.entity] || []).map((s) => ({ d: new Date(s.start), v: Math.max(0, Number(s.change) || 0) }));
      const doy = (d) => Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(d.getFullYear(), 0, 1)) / 86400000);
      const today = doy(now);
      const years = [];
      for (let y = y0; y <= y1; y++) {
        const ys = rows.filter((x) => x.d.getFullYear() === y);
        const tot = ys.reduce((a, x) => a + x.v, 0);
        const ytd = ys.filter((x) => doy(x.d) <= today).reduce((a, x) => a + x.v, 0); // même période (1er jan → aujourd'hui)
        years.push({ y, tot, ytd, days: ys.length, cur: y === y1 });
      }
      // projection de l'année en cours : profil saisonnier des années complètes précédentes
      const cur = years[years.length - 1], full = years.filter((x) => !x.cur && x.ytd > 0 && x.tot > 0);
      if (cur && full.length) {
        const ratio = full.reduce((a, x) => a + x.tot, 0) / full.reduce((a, x) => a + x.ytd, 0);
        cur.proj = cur.tot * ratio;
      }
      this._data = years; this._err = null;
    } catch (e) { this._err = e?.message || String(e); }
    this._render();
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c, Y = this._data;
    let body = `<div class="empty">Chargement…</div>`;
    if (Y && Y.length) {
      const maxRaw = Math.max(...Y.map((x) => Math.max(x.tot, c.show_projection !== false && x.proj ? x.proj : 0)), 0.001);
      const mwh = c.unit === "MWh" || (c.unit === "auto" && maxRaw >= 1000), k = mwh ? 0.001 : 1, U = mwh ? "MWh" : "kWh";
      const dec = mwh ? 2 : maxRaw < 100 ? 1 : 0;
      const Wd = Math.max(280, (this._w || 400) - 32), H = 230, pt = 26, pb = 46, pl = 8, pr = 8;
      const n = Y.length, slot = (Wd - pl - pr) / n, bw = Math.min(90, slot * 0.52), ih = H - pt - pb;
      const top = maxRaw * 1.08, y = (v) => pt + ih - (v / top) * ih;
      const col = c.color;
      let g = `<defs><linearGradient id="yb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}"/><stop offset="1" stop-color="${col}" stop-opacity=".55"/></linearGradient>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${col}" fill-opacity=".08"/><line x1="0" y1="0" x2="0" y2="6" stroke="${col}" stroke-opacity=".45" stroke-width="2"/></pattern></defs>`;
      g += `<line x1="${pl}" x2="${Wd - pr}" y1="${y(0)}" y2="${y(0)}" class="base"/>`;
      Y.forEach((b, i) => {
        const cx = pl + slot * (i + 0.5), x = cx - bw / 2, r = Math.min(8, bw / 5);
        const prev = Y[i - 1];
        const yt = y(b.tot);
        if (b.cur && c.show_projection !== false && b.proj > b.tot) {
          const yp = y(b.proj);
          g += `<path d="M${x},${yt} V${yp + r} Q${x},${yp} ${x + r},${yp} H${x + bw - r} Q${x + bw},${yp} ${x + bw},${yp + r} V${yt} Z" fill="url(#hatch)" stroke="${col}" stroke-opacity=".6" stroke-dasharray="4 3"/>
            <text x="${cx}" y="${yp - 7}" class="pj" text-anchor="middle">≈ ${fr(b.proj * k, dec)} ${U}</text>`;
        }
        if (b.tot > 0) g += `<path d="M${x},${y(0)} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + bw - r} Q${x + bw},${yt} ${x + bw},${yt + r} V${y(0)} Z" fill="url(#yb)" class="bar" style="animation-delay:${i * 90}ms"/>`;
        const lblY = b.cur && c.show_projection !== false && b.proj > b.tot ? Math.max(yt + 18, y(b.proj) + 22) : yt - 8;
        const inside = b.cur && c.show_projection !== false && b.proj > b.tot;
        g += `<text x="${cx}" y="${inside ? Math.min(y(0) - 8, yt + 18) : lblY}" class="val ${inside ? "in" : ""}" text-anchor="middle">${fr(b.tot * k, dec)}<tspan class="u"> ${U}</tspan></text>`;
        g += `<text x="${cx}" y="${H - pb + 18}" class="yr ${b.cur ? "cur" : ""}" text-anchor="middle">${b.y}</text>`;
        // évolution
        let d = "";
        if (prev && b.cur && prev.ytd > 0) { const p = ((b.tot - prev.ytd) / prev.ytd) * 100; d = `<tspan class="${p >= 0 ? "up" : "dn"}">${p >= 0 ? "▲" : "▼"} ${fr(Math.abs(p), 0)} %</tspan><tspan class="dm"> à date</tspan>`; }
        else if (prev && prev.tot > 0 && b.tot > 0) { const p = ((b.tot - prev.tot) / prev.tot) * 100; d = `<tspan class="${p >= 0 ? "up" : "dn"}">${p >= 0 ? "▲" : "▼"} ${fr(Math.abs(p), 0)} %</tspan>`; }
        else if (!prev && b.days < 360 && !b.cur) d = `<tspan class="dm">année partielle</tspan>`;
        if (d) g += `<text x="${cx}" y="${H - pb + 34}" class="dl" text-anchor="middle">${d}</text>`;
      });
      const cur = Y[Y.length - 1], prev = Y[Y.length - 2];
      body = `<svg width="${Wd}" height="${H}" viewBox="0 0 ${Wd} ${H}">${g}</svg>
        ${prev ? `<div class="ft"><span><i style="background:${col}"></i>${cur.y} à date : <b>${fr(cur.tot * k, dec)} ${U}</b></span>
          <span><i class="gh"></i>${prev.y} même période : <b>${fr(prev.ytd * k, dec)} ${U}</b></span>
          ${c.show_projection !== false && cur.proj ? `<span><i class="hz" style="--c:${col}"></i>Projection fin ${cur.y} : <b>${fr(cur.proj * k, dec)} ${U}</b></span>` : ""}</div>` : ""}`;
    }
    this.shadowRoot.innerHTML = `
    <style>
      :host { display:block; }
      ha-card { display:block; padding:14px 16px 12px; box-sizing:border-box; height:100%; }
      ha-card.noframe { background:none !important; box-shadow:none !important; border:none !important; backdrop-filter:none !important; -webkit-backdrop-filter:none !important; }
      ha-card.noframe::before, ha-card.noframe::after { content:none !important; display:none !important; }
      .tt { font-size:16px; font-weight:600; color:var(--primary-text-color); margin-bottom:6px; }
      svg { display:block; overflow:visible; }
      .base { stroke:color-mix(in srgb, var(--primary-text-color) 22%, transparent); stroke-width:1; }
      .bar { transform-box:fill-box; transform-origin:bottom; animation:grow .9s cubic-bezier(.2,.8,.2,1) both; }
      @keyframes grow { from { transform:scaleY(0); } to { transform:scaleY(1); } }
      @media (prefers-reduced-motion: reduce) { .bar { animation:none; } }
      .val { fill:var(--primary-text-color); font-size:15px; font-weight:700; font-variant-numeric:tabular-nums; }
      .val.in { fill:#fff; } .val .u { font-size:10px; font-weight:500; fill-opacity:.7; }
      .pj { fill:var(--secondary-text-color); font-size:11px; font-weight:600; }
      .yr { fill:var(--secondary-text-color); font-size:13px; font-weight:600; } .yr.cur { fill:var(--primary-text-color); }
      .dl { font-size:11px; font-weight:600; } .up { fill:#1fce8a; } .dn { fill:#f06478; } .dm { fill:var(--secondary-text-color); font-weight:400; }
      .ft { display:flex; flex-wrap:wrap; gap:4px 16px; font-size:12px; color:var(--secondary-text-color); margin-top:4px; }
      .ft span { display:flex; align-items:center; gap:6px; } .ft b { color:var(--primary-text-color); font-weight:600; }
      .ft i { width:10px; height:10px; border-radius:3px; display:inline-block; }
      .ft i.gh { background:color-mix(in srgb, var(--primary-text-color) 30%, transparent); }
      .ft i.hz { border:1.5px dashed var(--c); box-sizing:border-box; }
      .empty { color:var(--secondary-text-color); font-size:13px; padding:40px 0; text-align:center; }
      .err { color:var(--error-color); font-size:12px; }
    </style>
    <ha-card class="${c.show_frame === false ? "noframe" : ""}">
      ${c.title ? `<div class="tt">${c.title}</div>` : ""}
      ${this._err ? `<div class="err">Erreur : ${this._err}</div>` : ""}
      ${body}
    </ha-card>`;
  }
  static getConfigElement() { return document.createElement("holm-year-bars-card-editor"); }
  static getStubConfig() { return { entity: "", title: "Énergie annuelle" }; }
  getCardSize() { return 5; }
  getGridOptions() { return { columns: 12, rows: "auto", min_columns: 4 }; }
}

const L = { entity: "Énergie (kWh)", title: "Titre", start_year: "Première année", years: "Ou nombre d'années", unit: "Unité", color: "Couleur",
  show_projection: "Afficher la projection de l'année en cours", show_frame: "Afficher le cadre de la carte" };
const hex2rgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ""); if (!m) return undefined; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgb2hex = (a) => Array.isArray(a) ? "#" + a.map((v) => Number(v).toString(16).padStart(2, "0")).join("") : a;
const SCHEMA = [
  { name: "entity", required: true, selector: { entity: { domain: ["sensor"] } } },
  { name: "title", selector: { text: {} } },
  { type: "grid", name: "", schema: [
    { name: "start_year", selector: { number: { min: 2000, max: 2100, mode: "box" } } },
    { name: "years", selector: { number: { min: 1, max: 15, mode: "box" } } },
    { name: "unit", selector: { select: { mode: "dropdown", options: [{ value: "auto", label: "Automatique" }, { value: "kWh", label: "kWh" }, { value: "MWh", label: "MWh" }] } } },
    { name: "color", selector: { color_rgb: {} } },
    { name: "show_projection", selector: { boolean: {} } },
    { name: "show_frame", selector: { boolean: {} } },
  ] },
];
const DEF = { unit: "auto", show_projection: true, show_frame: true };
class HolmYearBarsCardEditor extends HTMLElement {
  setConfig(c) { const j = JSON.stringify(c); this._config = JSON.parse(j); if (j === this._last && this._f) return; this._build(); }
  set hass(h) { this._hass = h; if (!this._f) this._build(); else this._f.hass = h; }
  _build() {
    if (!this._hass || !this._config) return;
    this.innerHTML = "";
    const f = (this._f = document.createElement("ha-form"));
    f.hass = this._hass; f.schema = SCHEMA; f.data = { ...DEF, ...this._config, color: hex2rgb(this._config.color || "#0ABFBF") };
    f.computeLabel = (s) => L[s.name] || s.name;
    f.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const o = { ...this._config };
      for (const [k, v] of Object.entries(ev.detail.value)) {
        const val = k === "color" ? rgb2hex(v) : v;
        if (val === "" || val === undefined || val === null || DEF[k] === val || (k === "color" && String(val).toLowerCase() === "#0abfbf")) delete o[k]; else o[k] = val;
      }
      this._config = o; this._last = JSON.stringify(o);
      this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: o }, bubbles: true, composed: true }));
    });
    this.appendChild(f);
  }
}
if (!customElements.get("holm-year-bars-card-editor")) customElements.define("holm-year-bars-card-editor", HolmYearBarsCardEditor);
if (!customElements.get("holm-year-bars-card")) customElements.define("holm-year-bars-card", HolmYearBarsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-year-bars-card", name: "HOLM – Énergie par année", description: "Barres annuelles avec comparaison à date et projection de l'année en cours", preview: false });
})();

/* ===================== holm-energy-years-card ===================== */
(() => {
// holm-energy-years-card — totaux annuels d'une statistique d'énergie (sans helper)
class HolmEnergyYearsCard extends HTMLElement {
  setConfig(c) {
    if (!c || !c.entity) throw new Error("holm-energy-years-card : 'entity' est requis");
    this._c = { title: "Période", label: "Énergie", color: "var(--primary-color)", start_year: 2000, ...c };
    this._fetched = 0;
    if (this.shadowRoot) this._render();
  }
  set hass(h) {
    this._hass = h;
    if (!this.shadowRoot) { this.attachShadow({ mode: "open" }); this._render(); }
    if (Date.now() - this._fetched > 3600000) { this._fetched = Date.now(); this._load(); }
  }
  async _load() {
    try {
      const start = new Date(this._c.start_year, 0, 1);
      const r = await this._hass.callWS({
        type: "recorder/statistics_during_period",
        start_time: start.toISOString(),
        statistic_ids: [this._c.entity],
        period: "year",
        types: ["change"],
        units: { energy: "kWh" },
      });
      this._rows = (r[this._c.entity] || [])
        .map((s) => ({ year: new Date(s.start).getFullYear(), v: Number(s.change) || 0 }))
        .filter((x) => x.v > 0)
        .sort((a, b) => b.year - a.year);
      this._err = null;
    } catch (e) {
      this._err = e && e.message ? e.message : String(e);
      this._fetched = 0;
    }
    this._render();
  }
  _fmt(v) {
    if (v >= 1000) return (v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " MWh";
    return Math.round(v).toLocaleString("fr-FR") + " kWh";
  }
  _render() {
    if (!this.shadowRoot || !this._c) return;
    const c = this._c;
    const rows = this._rows || [];
    const total = rows.reduce((a, r) => a + r.v, 0);
    const items = [{ k: "Total", v: total, main: true }, ...rows.map((r) => ({ k: String(r.year), v: r.v }))];
    const body = this._err
      ? `<div class="msg">Erreur : ${this._err}</div>`
      : !this._rows
      ? `<div class="msg">Chargement…</div>`
      : items.map((i) => `
        <div class="row${i.main ? " main" : ""}">
          <div class="k">${i.k}</div>
          <div class="dot"></div>
          <div class="v"><span class="l">${c.label} :</span> ${this._fmt(i.v)}</div>
        </div>`).join("");
    this.shadowRoot.innerHTML = `
      <style>
        :host { --acc: ${c.color}; }
        ha-card { padding: 0 0 12px; overflow: hidden; }
        .hdr { padding: 14px 16px 10px; font-size: 13px; font-weight: 700; letter-spacing: .6px;
               text-transform: uppercase; color: var(--primary-text-color);
               border-bottom: 1px solid var(--divider-color); }
        .tl { position: relative; padding: 8px 16px 0; }
        .tl::before { content: ""; position: absolute; top: 30px; bottom: 30px; left: calc(16px + 58px + 9px);
                      width: 3px; border-radius: 2px; background: var(--acc); opacity: .85; }
        .row { position: relative; display: grid; grid-template-columns: 58px 21px 1fr; align-items: center;
               column-gap: 10px; min-height: 60px; }
        .k { font-size: 13px; font-weight: 700; color: var(--secondary-text-color); }
        .dot { width: 13px; height: 13px; border-radius: 50%; justify-self: center; z-index: 1;
               border: 3px solid var(--acc); background: var(--card-background-color, #111); box-sizing: border-box; }
        .main .dot { width: 17px; height: 17px; background: var(--acc);
                     box-shadow: 0 0 0 6px color-mix(in srgb, var(--acc) 25%, transparent); }
        .v { font-size: 14px; font-weight: 600; color: var(--primary-text-color); white-space: nowrap; }
        .main .v, .main .k { color: var(--primary-text-color); font-size: 15px; }
        .l { font-weight: 500; color: var(--secondary-text-color); }
        .msg { padding: 16px; color: var(--secondary-text-color); }
      </style>
      <ha-card>
        <div class="hdr">${c.title}</div>
        <div class="tl">${body}</div>
      </ha-card>`;
  }
  getCardSize() { return 4; }
  getGridOptions() { return { columns: 12, rows: "auto", min_rows: 3 }; }
}
if (!customElements.get("holm-energy-years-card")) customElements.define("holm-energy-years-card", HolmEnergyYearsCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: "holm-energy-years-card", name: "HOLM – Totaux annuels", description: "Totaux annuels d'une statistique d'énergie, en frise verticale" });
})();

console.info("%c HOLM-ENERGY-CARDS %c 1.0.0 ", "background:#e3a21a;color:#111;border-radius:3px 0 0 3px", "background:#123;color:#fff;border-radius:0 3px 3px 0");
