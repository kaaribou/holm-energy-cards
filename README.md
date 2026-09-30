# ⚡ HOLM Energy Cards

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
![Version](https://img.shields.io/github/v/release/kaaribou/holm-energy-cards)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2025.1%2B-03a9f4)

**Six cartes pour comprendre votre énergie : ce que vous produisez, achetez et revendez, ce que coûte chaque appareil, le chauffage pièce par pièce, et l'évolution année après année.**

HOLM Energy Cards s'appuie sur le **tableau de bord Énergie** de Home Assistant : sources, appareils et prix sont repris automatiquement. Les cartes suivent le **sélecteur de date** du tableau Énergie (jour, semaine, mois, année), comme les cartes officielles.

> ✨ **Un seul fichier, six cartes**, toutes réglables dans l'éditeur visuel (sauf les Totaux annuels, en YAML).

| Carte | Type | Ce qu'elle montre |
|---|---|---|
| [Bilan énergétique](#-bilan-énergétique) | `custom:holm-energy-sources-card` | Production, achat, revente, autoconsommation, autosuffisance, facture estimée |
| [Consommation par appareil](#-consommation-par-appareil) | `custom:holm-energy-devices-card` | kWh, coût et part de chaque appareil, avec le « non mesuré » |
| [Production & consommation](#-production--consommation) | `custom:holm-solar-chart-card` | Graphique énergie (barres) et puissance (courbe) du solaire et du réseau |
| [Chauffage & climatisation](#-chauffage--climatisation) | `custom:holm-climate-energy-card` | Chauffage et clim par pièce, coût, évolution, graphique ou calendrier |
| [Énergie par année](#-énergie-par-année) | `custom:holm-year-bars-card` | Barres annuelles, comparaison « à date » et projection de l'année |
| [Totaux annuels](#-totaux-annuels) | `custom:holm-energy-years-card` | Total et années d'une statistique, en frise verticale |

---

## Installation

### Avec HACS (recommandé)

1. HACS → menu ⋮ → **Dépôts personnalisés**.
2. Ajoutez `https://github.com/kaaribou/holm-energy-cards`, catégorie **Tableau de bord** (*Dashboard / Plugin*).
3. Recherchez la carte → **Télécharger**.
4. Rechargez la page (Ctrl + F5).

### Manuellement

1. Copiez `dist/holm-energy-cards.js` dans `config/www/community/holm-energy-cards/`.
2. **Paramètres → Tableaux de bord → ⋮ → Ressources → Ajouter** : `/local/community/holm-energy-cards/holm-energy-cards.js`, type **Module JavaScript**.
3. Rechargez la page.

> [!NOTE]
> Une seule ressource charge les six cartes. Elles apparaissent ensuite dans le sélecteur de cartes (« HOLM – … »).

---

## 📊 Bilan énergétique

![Bilan énergétique](docs/images/bilan.png)

- Production solaire, achats réseau (plusieurs tarifs, ex. heures pleines / creuses) et revente, avec leur coût.
- **Autoconsommation** et **autosuffisance** en anneaux, part consommée sur place et sa valeur.
- **Facture estimée** : énergie achetée + abonnement (proratisé à la période) + taxes − revente.

```yaml
type: custom:holm-energy-sources-card
title: Bilan énergétique
items:
  - type: solar
    entity: sensor.production_solaire
    name: Production solaire
  - type: import
    entity: sensor.linky_hp
    name: Achat heures pleines
    price: sensor.prix_hp            # ou cost_entity: statistique de coût
  - type: import
    entity: sensor.linky_hc
    name: Achat heures creuses
    price: sensor.prix_hc
  - type: export
    entity: sensor.linky_injection
    name: Revente
    price: 0.04
subscription: input_number.abonnement
subscription_period: month
```

| Option | Description | Par défaut |
|---|---|---|
| `items` | Sources : `type` (`solar`, `import`, `export`), `entity` (kWh), `name`, `cost_entity` ou `price`, `color`, `icon` (**obligatoire**) | — |
| `subscription`, `subscription_period` | Abonnement (nombre ou entité) et sa période (`month` / `year`) | — |
| `taxes_import` | Taxes ajoutées aux kWh achetés (€/kWh, nombre ou entités) | — |
| `tax_export` | Taxe déduite des kWh revendus (€/kWh) | — |
| `self_price` | Valeur du kWh autoconsommé | prix moyen d'achat |
| `self_name` | Libellé de l'autoconsommation | `Consommée sur place` |

## 🔌 Consommation par appareil

![Consommation par appareil](docs/images/appareils.png)

- Les appareils sont lus dans **Paramètres → Tableaux de bord → Énergie → Consommation individuelle** (ou listés à la main).
- kWh, part et **coût** de chaque appareil, mini-graphe, tri par kWh, € ou nom, « Voir tout ».
- **Non mesuré** : ce que consomme la maison en dehors des appareils suivis.
- Coût **réel** (prix réseau de chaque heure, solaire gratuit), **réseau** (comme si tout venait du réseau) ou **fixe**.

```yaml
type: custom:holm-energy-devices-card
title: Consommation par appareil
cost_mode: real
top: 8
```

| Option | Description | Par défaut |
|---|---|---|
| `cost_mode` | `real`, `grid` ou `fixed` | `real` |
| `price` | Prix fixe (mode `fixed`), nombre ou entité | — |
| `taxes_import` | Taxes ajoutées au prix réseau (€/kWh) | — |
| `top` | Appareils affichés avant « Voir tout » | `10` |
| `sort` | `kwh`, `eur` ou `name` | `kwh` |
| `hide_zero`, `show_unmeasured`, `show_sparkline` | Masquer les appareils à 0, afficher le non mesuré, les mini-graphes | `true` |
| `exclude` | Appareils à ignorer | — |
| `devices` | Liste manuelle : `entity`, `name`, `icon`, `color`, `power` | appareils du tableau Énergie |

## ☀️ Production & consommation

![Production & consommation](docs/images/production.png)

- Vue **Énergie** : barres par heure (ou par jour) du solaire consommé, du réseau par tarif et de la revente.
- Vue **Puissance** : courbes de production et de consommation, avec la **prévision solaire** si elle est configurée dans le tableau Énergie.
- Taux d'autoconsommation de la période.

```yaml
type: custom:holm-solar-chart-card
title: Production & consommation
mode: energy
```

| Option | Description | Par défaut |
|---|---|---|
| `mode` | Vue par défaut : `energy` ou `power` | `energy` |
| `show_tabs`, `show_forecast` | Onglets Énergie / Puissance, prévision solaire | `true` |
| `solar_power`, `grid_power` | Capteurs de puissance | ceux du tableau Énergie |
| `solar_color`, `self_color`, `export_color`, `grid_colors`, `power_grid_color` | Couleurs | — |

## 🌡️ Chauffage & climatisation

![Chauffage & climatisation](docs/images/chauffage.png)

- Totaux chauffage et clim, **coût** et évolution par rapport à la période précédente.
- Une tuile par pièce avec la répartition chauffage / clim.
- Graphique **barres** de toute la maison, ou **calendrier** (carte de chaleur).

```yaml
type: custom:holm-climate-energy-card
title: Chauffage & climatisation
rooms:
  - name: Séjour
    icon: mdi:sofa
    heating: sensor.sejour_chauffage_energie
    cooling: sensor.sejour_clim_energie
  - name: Salle de bain
    icon: mdi:shower
    heating: sensor.seche_serviette_energie
```

| Option | Description | Par défaut |
|---|---|---|
| `rooms` | Pièces : `name`, `icon`, `heating`, `cooling` (kWh) (**obligatoire**) | — |
| `cost_mode`, `price`, `taxes_import` | Calcul du coût (voir Consommation par appareil) | `real` |
| `compare` | Comparer à la période précédente | `true` |
| `view` | `bars` ou `heatmap` | `bars` |
| `heat_color`, `cool_color` | Couleurs | orange / bleu |

## 📅 Énergie par année

![Énergie par année](docs/images/annees.png)

- Une barre par année, l'évolution d'une année sur l'autre.
- Année en cours comparée **à date** à la même période de l'an dernier, et **projection** de fin d'année.
- Utilise les statistiques long terme : aucun helper à créer.

```yaml
type: custom:holm-year-bars-card
entity: sensor.production_solaire
title: Production solaire annuelle
start_year: 2022
color: "#e3a21a"
```

| Option | Description | Par défaut |
|---|---|---|
| `entity` | Statistique d'énergie en kWh (**obligatoire**) | — |
| `start_year` ou `years` | Première année, ou nombre d'années affichées | toutes |
| `unit` | `auto`, `kWh` ou `MWh` | `auto` |
| `color` | Couleur des barres | `#0ABFBF` |
| `show_projection` | Projection de l'année en cours | `true` |

## 🧾 Totaux annuels

![Totaux annuels](docs/images/totaux.png)

Une frise verticale : le total depuis le début, puis chaque année. À configurer en YAML.

```yaml
type: custom:holm-energy-years-card
entity: sensor.production_solaire
title: Période
label: Production
```

| Option | Description | Par défaut |
|---|---|---|
| `entity` | Statistique d'énergie (**obligatoire**) | — |
| `title`, `label` | Titre et libellé des valeurs | `Période`, `Énergie` |
| `color` | Couleur de la frise | couleur du thème |
| `start_year` | Première année prise en compte | `2000` |

Toutes les cartes acceptent aussi `show_frame: false` (sans cadre) et, pour celles qui suivent le sélecteur de date, `collection_key` si le tableau de bord en contient plusieurs.

---

## FAQ

| Problème | Solution |
|---|---|
| Une carte reste sur « aujourd'hui » | Ajoutez une carte **Sélecteur de date énergie** (`energy-date-selection`) dans la même vue. |
| Pas d'appareils ou de sources | Configurez d'abord le **tableau de bord Énergie** de Home Assistant. |
| Les coûts sont à 0 | Indiquez un prix (entité ou nombre) pour vos sources réseau, dans le tableau Énergie ou dans la carte. |
| La nouvelle version ne s'affiche pas | Videz le cache (Ctrl + F5). |

---

## Un petit merci ?

La carte vous plaît ? Vous pouvez m'offrir une bière 🍺

[![Offrez-moi une bière](https://img.shields.io/badge/Offrez--moi_une_bi%C3%A8re-PayPal-0070ba?logo=paypal&logoColor=white)](https://paypal.me/kaaribou)

---

## Licence

Code : licence **MIT** — © kaaribou. Voir le [CHANGELOG](CHANGELOG.md).

Fait partie de la collection **HOLM** : [Carburant HOLM](https://github.com/kaaribou/carburant-holm) · [HOLM Navbar Card](https://github.com/kaaribou/holm-navbar-card) · [HOLM Music Card](https://github.com/kaaribou/holm-music-card) · [HOLM Sentinel Card](https://github.com/kaaribou/holm-sentinel-card).
