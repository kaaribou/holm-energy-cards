# ⚡ HOLM Energy Cards

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz/)
![Version](https://img.shields.io/github/v/release/kaaribou/holm-energy-cards)
![Home Assistant](https://img.shields.io/badge/Home%20Assistant-2025.1%2B-03a9f4)

🇫🇷 Français · [🇬🇧 English](README.en.md)

**Six cartes pour comprendre votre énergie : ce que vous produisez, achetez et revendez, ce que coûte chaque appareil, le chauffage pièce par pièce, et l'évolution année après année.**

HOLM Energy Cards s'appuie sur le **tableau de bord Énergie** de Home Assistant : sources, appareils et prix sont repris automatiquement. Les cartes suivent le **sélecteur de date** du tableau Énergie (jour, semaine, mois, année), comme les cartes officielles.

> ✨ **Un seul fichier, six cartes**, toutes réglables dans l'éditeur visuel (sauf les Totaux annuels, en YAML).

| Carte | Type | Ce qu'elle montre |
|---|---|---|
| [Bilan énergétique](#-bilan-énergétique) | `custom:holm-energy-sources-card` | Production, achat, revente, autoconsommation, autosuffisance, facture estimée |
| [Consommation par appareil](#-consommation-par-appareil) | `custom:holm-energy-devices-card` | kWh, coût et part de chaque appareil, avec le « non mesuré » et un graphique par appareil |
| [Production & consommation](#-production--consommation) | `custom:holm-solar-chart-card` | Graphique énergie (barres) et puissance (courbe) du solaire et du réseau |
| [Chauffage & climatisation](#-chauffage--climatisation) | `custom:holm-climate-energy-card` | Chauffage et clim par pièce, coût, évolution, graphique ou calendrier |
| [Énergie par année](#-énergie-par-année) | `custom:holm-year-bars-card` | Barres annuelles, comparaison « à date » et projection de l'année |
| [Totaux annuels](#-totaux-annuels) | `custom:holm-energy-years-card` | Total et années d'une statistique, en frise verticale |

### 🆕 Nouveautés de la 1.4.0

Merci à Lheriss pour ces trois idées. Rien ne change pour une installation existante en euros, avec un compteur réseau classique et un chauffage électrique.

- 💱 **La devise de Home Assistant** (#6) : les montants s'affichent dans la devise réglée dans Paramètres → Système → Général (« 2,30 CHF », « 2,30 $ »…), avec une icône adaptée. Option `currency` pour en imposer une. Voir [Devise](#-devise).
- 🔁 **Puissance réseau inversée ou en deux capteurs** (#7) : dans *Production & consommation*, la vue Puissance reprend tous les réglages de puissance réseau du tableau Énergie (capteur normal, inversé ou deux capteurs), à partir des capteurs d'origine et de tout leur historique. Nouvelles options `grid_power_invert`, `grid_power_import` et `grid_power_export`. Voir [Puissance réseau](#puissance-réseau).
- 🔥 **Chauffage non électrique** (#8) : dans *Chauffage & climatisation*, le coût d'un chauffage aux pellets, au gaz ou au fioul vient de sa source gaz du tableau Énergie, ou des nouvelles options de pièce `cost_entity` et `price`. La tuile Climatisation se masque toute seule quand aucune pièce n'a de climatisation (option `show_cooling`). Voir [Coût d'un chauffage non électrique](#coût-dun-chauffage-non-électrique).

### Nouveautés de la 1.3.0

- 🌍 **Les six cartes parlent 8 langues** : français, anglais, allemand, espagnol, italien, néerlandais, portugais et polonais, éditeurs et graphiques compris. Elles suivent la langue de votre profil Home Assistant (anglais si votre langue n'est pas traduite) ; l'option `language`, disponible sur chaque carte, permet d'en imposer une. Les nombres et les dates suivent aussi la langue.
- Les titres par défaut (« Bilan énergétique », « Consommation par appareil »…) sont traduits eux aussi, même enregistrés dans la configuration.

### Nouveautés de la 1.2.2

**🧾 Abonnement et taxes lus dans [HOLM HP/HC](https://github.com/kaaribou/holm-tarif).** Si l'intégration HOLM HP/HC est installée, *Bilan énergétique*, *Consommation par appareil* et *Chauffage & climatisation* y lisent automatiquement l'abonnement mensuel, la CSPE / accise, la TCFE et la taxe sur la revente. Plus besoin de les renseigner dans chaque carte. Les valeurs indiquées dans une carte restent prioritaires, et `holm_tarif: false` désactive la lecture automatique.

**🩹 Plus d'erreur à l'ajout d'une carte.** Une carte tout juste ajoutée (entité pas encore choisie) ou un tableau Énergie pas encore configuré affichaient `Erreur : length of value must be at least 1 at 'statistic_ids'`. La carte affiche maintenant simplement quoi faire.

### Nouveautés de la 1.2.1

**💶 Coûts justes avec Tempo et les prix qui changent.** Les cartes reprennent maintenant les **coûts enregistrés par Home Assistant** pour chaque source du tableau Énergie, calculés heure par heure au prix du moment, comme le tableau Énergie officiel. Avant, quand une source avait une entité de prix, la carte appliquait le prix **actuel** à tout l'historique : avec Tempo (bleu, blanc, rouge) ou après un changement de tarif, les coûts passés étaient faux. Concerne *Consommation par appareil*, *Chauffage & climatisation* et *Bilan énergétique*.

### Nouveautés de la 1.2.0

**🕒 Vue « Dans le temps ».** *Consommation par appareil* peut maintenant afficher tous les appareils dans **un même graphique** : barres empilées par heure, par jour ou par mois, avec **l'icône de l'appareil qui consomme le plus** au-dessus de chaque barre. On voit d'un coup d'œil **qui consomme et quand**.

![Dans le temps](docs/images/dans-le-temps.png)

- survol (ou toucher) d'une barre : détail par appareil ;
- légende cliquable pour masquer ou réafficher un appareil ;
- options `view: timeline` et `timeline_devices` (nombre d'appareils détaillés, les autres sont regroupés).

**💶 Coût juste dans le graphique d'un appareil.** Le coût du graphique (24 h, 7 j, 30 j, 12 mois ou dates au choix) est maintenant recalculé **heure par heure au prix réel** sur la période du graphique, au lieu de reprendre le prix moyen de la période affichée par la carte. Le coût de chaque barre s'affiche au survol. La carte calcule aussi à l'heure jusqu'à 31 jours.

### Nouveautés de la 1.1.0

**📈 Un graphique pour chaque appareil.** Dans *Consommation par appareil*, un toucher sur un appareil ouvre son graphique :

- périodes **24 h · 7 j · 30 j · 12 mois** ou **dates au choix** (du… au…) ;
- **barres de consommation** par heure, par jour ou par mois, et la **courbe de puissance** par-dessus sur 24 h si l'appareil a un capteur de puissance ;
- chiffres clés de la période : **total**, **coût estimé**, **moyenne** et **pic** (avec sa date) ;
- survol (ou toucher) d'une barre pour voir sa valeur ; bouton ⓘ pour la fenêtre d'informations de Home Assistant.

Les données viennent des statistiques long terme de Home Assistant (celles du tableau Énergie) : c'est rapide et ça remonte aussi loin que votre historique.

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
| `language` | Langue : `fr`, `en`, `de`, `es`, `it`, `nl`, `pt`, `pl` | celle du profil |
| `items` | Sources : `type` (`solar`, `import`, `export`), `entity` (kWh), `name`, `cost_entity` ou `price`, `color`, `icon` (**obligatoire**) | — |
| `subscription`, `subscription_period` | Abonnement (nombre ou entité) et sa période (`month` / `year`) | HOLM HP/HC si installée |
| `taxes_import` | Taxes ajoutées aux kWh achetés (€/kWh, nombre ou entités) | HOLM HP/HC si installée |
| `tax_export` | Taxe déduite des kWh revendus (€/kWh) | HOLM HP/HC si installée |
| `holm_tarif` | `false` : ne pas lire l'abonnement et les taxes dans HOLM HP/HC | `true` |
| `self_price` | Valeur du kWh autoconsommé | prix moyen d'achat |
| `self_name` | Libellé de l'autoconsommation | `Consommée sur place` |

## 🔌 Consommation par appareil

![Consommation par appareil](docs/images/appareils.png)

- Les appareils sont lus dans **Paramètres → Tableaux de bord → Énergie → Consommation individuelle** (ou listés à la main).
- kWh, part et **coût** de chaque appareil, mini-graphe, tri par kWh, € ou nom, « Voir tout ».
- **Non mesuré** : ce que consomme la maison en dehors des appareils suivis.
- Coût **réel** (prix réseau de chaque heure, solaire gratuit), **réseau** (comme si tout venait du réseau) ou **fixe**.
- **Graphique par appareil** : un toucher sur un appareil ouvre sa consommation sur 24 h, 7 j, 30 j, 12 mois ou les dates de votre choix, avec total, coût, moyenne et pic. Le coût est recalculé heure par heure au prix réel sur la période du graphique.
- **Vue « Dans le temps »** (`view: timeline`) : tous les appareils empilés dans un même graphique, avec l'icône de celui qui consomme le plus au-dessus de chaque barre.

```yaml
type: custom:holm-energy-devices-card
title: Consommation par appareil
cost_mode: real
top: 8
```

| Option | Description | Par défaut |
|---|---|---|
| `view` | `list` (liste des appareils) ou `timeline` (« Dans le temps ») | `list` |
| `timeline_devices` | Appareils détaillés dans la vue « Dans le temps » (les autres sont regroupés) | `8` |
| `cost_mode` | `real`, `grid` ou `fixed` | `real` |
| `price` | Prix fixe (mode `fixed`), nombre ou entité | — |
| `taxes_import` | Taxes ajoutées au prix réseau (€/kWh) | HOLM HP/HC si installée |
| `holm_tarif` | `false` : ne pas lire les taxes dans HOLM HP/HC | `true` |
| `top` | Appareils affichés avant « Voir tout » | `10` |
| `sort` | `kwh`, `eur` ou `name` | `kwh` |
| `hide_zero`, `show_unmeasured`, `show_sparkline` | Masquer les appareils à 0, afficher le non mesuré, les mini-graphes | `true` |
| `exclude` | Appareils à ignorer | — |
| `devices` | Liste manuelle : `entity`, `name`, `icon`, `color`, `power` (le capteur de puissance ajoute la courbe au graphique) | appareils du tableau Énergie |

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
| `grid_power_invert` | `true` si votre capteur `grid_power` est **négatif à l'achat** et positif à la revente | `false` |
| `grid_power_import`, `grid_power_export` | Deux capteurs positifs séparés, achat et revente, à la place de `grid_power` | — |
| `solar_color`, `self_color`, `export_color`, `grid_colors`, `power_grid_color` | Couleurs | — |

### Puissance réseau

La vue **Puissance** trace la puissance réseau **au-dessus de l'axe quand vous achetez** et **en dessous quand vous revendez**. Sans option, la carte reprend le réglage de puissance du réseau du tableau Énergie, quelle que soit sa forme :

- **un capteur standard**, positif à l'achat et négatif à la revente : utilisé tel quel ;
- **un capteur inversé**, négatif à l'achat (c'est le cas du compteur SolarEdge M1, par exemple) : son signe est inversé ;
- **deux capteurs séparés**, achat et revente, tous deux positifs : la carte calcule achat − revente.

Dans les deux derniers cas, Home Assistant crée un capteur intermédiaire qui démarre sans historique. La carte lit directement **vos capteurs d'origine**, avec tout leur historique.

Pour choisir vous-même :

```yaml
# capteur négatif à l'achat
grid_power: sensor.solaredge_m1_ac_power
grid_power_invert: true

# ou deux capteurs positifs
grid_power_import: sensor.puissance_achat
grid_power_export: sensor.puissance_revente
```

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
| `rooms` | Pièces : `name`, `icon`, `heating`, `cooling` (kWh) (**obligatoire**), et pour un chauffage non électrique `cost_entity` ou `price` (voir ci-dessous) | — |
| `cost_mode`, `price`, `taxes_import` | Calcul du coût (voir Consommation par appareil) | `real` |
| `compare` | Comparer à la période précédente | `true` |
| `view` | `bars` ou `heatmap` | `bars` |
| `heat_color`, `cool_color` | Couleurs | orange / bleu |
| `show_cooling` | Tuile Climatisation : `true` (toujours), `false` (jamais) ; sans option, masquée quand aucune pièce n'a de `cooling` | automatique |

### Coût d'un chauffage non électrique

Par défaut, le chauffage et la climatisation sont comptés **au prix de l'électricité** (voir [D'où viennent les prix ?](#-doù-viennent-les-prix-)). Pour une chaudière à pellets, au gaz ou au fioul, ce prix est faux. Le coût du **chauffage** d'une pièce est pris, dans cet ordre :

1. `cost_entity` : une **statistique de coût** (en €, qui ne fait que monter, comme celle d'une source du tableau Énergie). La carte en reprend la hausse sur la période ;
2. `price` : un **prix du kWh** de chauffage, en nombre ou depuis une entité ;
3. sinon, si l'entité `heating` est déclarée comme **source gaz dans le tableau Énergie**, le coût de cette source : sa statistique de coût, le coût que Home Assistant enregistre pour elle, ou son prix ;
4. sinon, le prix de l'électricité, comme avant.

La climatisation reste toujours comptée au prix de l'électricité.

```yaml
rooms:
  - name: Maison
    icon: mdi:fire
    heating: sensor.pellets_energie            # source gaz du tableau Énergie : rien d'autre à faire
  - name: Atelier
    icon: mdi:fire
    heating: sensor.poele_energie
    cost_entity: sensor.poele_cout_total       # ou : price: 0.085
```

L'entité `heating` doit être en **kWh**. Une source gaz du tableau Énergie mesurée en m³ ne convient pas : il faut un capteur converti en kWh.

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

Toutes les cartes acceptent aussi `language` (`fr`, `en`, `de`, `es`, `it`, `nl`, `pt`, `pl` ; par défaut celle du profil), `show_frame: false` (sans cadre) et, pour celles qui suivent le sélecteur de date, `collection_key` si le tableau de bord en contient plusieurs.

## 💱 Devise

Les montants s'affichent dans la **devise de Home Assistant** (Paramètres → Système → Général → Devise) : « 2,30 € », « 2,30 CHF », « 2,30 $ »… L'icône des coûts suit la devise quand il en existe une (€, $, £…), sinon c'est un billet. La carte n'effectue **aucune conversion** : les montants viennent de vos capteurs et de vos prix, qui sont déjà dans votre devise.

Pour imposer une devise sur une carte : `currency: CHF` (code à 3 lettres).

## 💶 D'où viennent les prix ?

Les cartes ne lisent pas vos utility meters ni de tarif à elles : elles reprennent les **sources réseau du tableau Énergie** (Paramètres → Tableaux de bord → Énergie), dans cet ordre :

1. la **statistique de coût** de la source, si vous en avez indiqué une (« entité qui suit le coût total ») ;
2. sinon, le **coût que Home Assistant enregistre** pour la source quand elle a un prix (entité ou nombre) : `sensor.<source>_cost` et `sensor.<revente>_compensation`. Il est calculé heure par heure au prix du moment, donc juste avec Tempo, les heures pleines / creuses ou un changement de tarif ;
3. pour les heures plus anciennes que ce coût enregistré, le prix actuel × kWh.

*Consommation par appareil* et *Chauffage & climatisation* en déduisent un prix du kWh pour chaque heure, appliqué aux kWh de chaque appareil :

- `cost_mode: real` : coût réseau de l'heure ÷ consommation de la maison. Le solaire est gratuit, ce qui fait baisser le prix moyen ;
- `cost_mode: grid` : coût réseau de l'heure ÷ kWh achetés, comme si tout venait du réseau. C'est le mode à choisir pour comparer avec des compteurs par tarif ;
- `cost_mode: fixed` : le prix `price`.

Les **taxes** (CSPE / accise, TCFE) et, dans *Bilan énergétique*, l'**abonnement** et la **taxe sur la revente** viennent des options de la carte ou, à défaut, de [HOLM HP/HC](https://github.com/kaaribou/holm-tarif) si elle est installée.

Dans *Bilan énergétique*, chaque source utilise `cost_entity`, sinon le coût enregistré par Home Assistant pour son entité, sinon `price`. Un `price` fixe (nombre) reste prioritaire sur le coût enregistré.

---

## FAQ

| Problème | Solution |
|---|---|
| Une carte reste sur « aujourd'hui » | Ajoutez une carte **Sélecteur de date énergie** (`energy-date-selection`) dans la même vue. |
| Pas d'appareils ou de sources, ou « Choisissez une entité… » | Choisissez les entités dans l'éditeur de la carte, ou configurez d'abord le **tableau de bord Énergie** de Home Assistant. |
| Les coûts sont à 0 | Indiquez un prix (entité ou nombre) pour vos sources réseau, dans le tableau Énergie ou dans la carte. |
| Les coûts ne correspondent pas à mes compteurs HP / HC | Voir [D'où viennent les prix ?](#-doù-viennent-les-prix-) : en mode `real`, le solaire est compté gratuit ; essayez `cost_mode: grid`. |
| Pas de courbe de puissance dans le graphique d'un appareil | Associez un capteur de puissance à l'appareil (tableau Énergie, ou `power` dans `devices`). |
| La nouvelle version ne s'affiche pas | Videz le cache (Ctrl + F5). |

---

## Un petit merci ?

La carte vous plaît ? Vous pouvez m'offrir une bière 🍺

[![Offrez-moi une bière](https://img.shields.io/badge/Offrez--moi_une_bi%C3%A8re-PayPal-0070ba?logo=paypal&logoColor=white)](https://paypal.me/kaaribou)

---

## Licence

Code : licence **MIT** — © kaaribou. Voir le [CHANGELOG](CHANGELOG.md).

Fait partie de **HOLM — Home Orchestration & Living Management** : la gestion et l'orchestration intelligente de la maison.

Les autres projets : [Volets HOLM](https://github.com/kaaribou/volets-holm) · [Climat HOLM](https://github.com/kaaribou/climat-holm) · [Carburant HOLM](https://github.com/kaaribou/carburant-holm) · [Commandes à la maison HOLM](https://github.com/kaaribou/commandes-holm) · [HOLM Navbar Card](https://github.com/kaaribou/holm-navbar-card) · [HOLM Climate Card](https://github.com/kaaribou/climate-card-holm) · [HOLM Music Card](https://github.com/kaaribou/holm-music-card) · [HOLM Sentinel Card](https://github.com/kaaribou/holm-sentinel-card) · [HOLM Security Card](https://github.com/kaaribou/holm-security-card) · [HOLM Recordings Card](https://github.com/kaaribou/holm-recordings-card) · [HOLM Covers Card](https://github.com/kaaribou/holm-covers-card) · [HOLM Power Flow Card](https://github.com/kaaribou/holm-power-flow-card) · [HOLM Radiator Card](https://github.com/kaaribou/holm-radiator-card) · [HOLM Floor Card](https://github.com/kaaribou/holm-floor-card) · [HOLM Smoke Card](https://github.com/kaaribou/holm-smoke-card) · [HOLM BG Card](https://github.com/kaaribou/holm-bg-card).
