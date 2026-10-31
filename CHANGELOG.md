# Changelog

## 1.2.2
- **Abonnement et taxes lus dans HOLM HP/HC** (#4) : si l'intégration [HOLM HP/HC](https://github.com/kaaribou/holm-tarif) est installée, *Bilan énergétique* y lit l'abonnement mensuel, la CSPE / accise, la TCFE et la taxe sur la revente ; *Consommation par appareil* et *Chauffage & climatisation* y lisent la CSPE et la TCFE. Les valeurs renseignées dans une carte restent prioritaires ; `holm_tarif: false` désactive la lecture automatique.
- **Plus d'erreur `statistic_ids` à l'ajout d'une carte** (#5) : une carte sans entité choisie, ou un tableau Énergie pas encore configuré, n'interroge plus les statistiques et affiche « Choisissez une entité dans l'éditeur de la carte, ou configurez d'abord le tableau Énergie de Home Assistant. »

## 1.2.1
- **Coûts justes avec Tempo et les prix variables** : quand une source du tableau Énergie a une entité de prix, les cartes utilisent maintenant le coût que Home Assistant enregistre heure par heure pour cette source (`sensor.<source>_cost`, `sensor.<revente>_compensation`), comme le tableau Énergie officiel. Avant, le prix actuel était appliqué à tout l'historique : avec Tempo ou après un changement de tarif, les coûts passés étaient faux. Concerne *Consommation par appareil*, *Chauffage & climatisation* et *Bilan énergétique*.
- Pour les heures antérieures au coût enregistré, le prix actuel × kWh sert de secours.
- *Bilan énergétique* : un `price` fixe (nombre) indiqué dans la carte reste prioritaire.
- README : nouvelle section « D'où viennent les prix ? ».

## 1.2.0
- **Consommation par appareil — coût corrigé dans le graphique d'un appareil** : le coût est recalculé heure par heure au prix réel sur la période du graphique (24 h, 7 j, 30 j, 12 mois ou dates au choix). Avant, il reprenait le prix moyen de la période affichée par la carte, ce qui pouvait donner un coût très faux sur 12 mois. Coût de chaque barre au survol.
- La carte calcule le coût à l'heure jusqu'à 31 jours (au jour au-delà).
- **Nouvelle vue « Dans le temps »** (`view: timeline`) : tous les appareils empilés dans un même graphique par heure, jour ou mois, icône de l'appareil dominant au-dessus de chaque barre, détail au survol, légende cliquable.
- Nouvelles options `view` et `timeline_devices`.

## 1.1.1
- **iPhone / iPad : la page ne remonte plus toute seule.** Quand les cartes Bilan énergétique, Consommation par appareil, Production & consommation et Chauffage & climatisation se redessinaient (changement de période, de tri ou d'appareil, nouvelles données), la page pouvait remonter d'un coup sur iOS (Safari et application Home Assistant). Chaque carte garde maintenant sa hauteur pendant qu'elle se redessine, et la position de défilement est conservée.

## 1.1.0
- **Consommation par appareil — graphique par appareil** (#2) : un toucher sur un appareil ouvre son graphique (24 h, 7 j, 30 j, 12 mois ou dates au choix) : barres de consommation, courbe de puissance sur 24 h, total, coût estimé, moyenne et pic.
- Icône automatique pour la VMC / ventilation.

## 1.0.0
- Première version publique, six cartes dans un seul fichier : Bilan énergétique, Consommation par appareil, Production & consommation, Chauffage & climatisation, Énergie par année, Totaux annuels.
