# Changelog

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
