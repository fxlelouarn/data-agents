# Réflexions sur le Proposal Editor

Le Proposal Editor, en mode groupé, ne fonctionne pas parfaitement dans l'état actuel lorsque plusieurs propositions concernent une Edition. On essaie de fusionner l'ensemble des propositions champ par champ, avec des selects pour les différentes valeurs trouvées, avec des scores en fonction des scores de chaque agent ayant trouvé cette date et du nombre d'agents concernés. Lorsqu'on choisit une valeur, ça peut avoir des impacts sur d'autres valeurs, ce n'est pas très maintenable.

Lorsqu'on a fini de choisir les valeurs ou de les éditer (car l'utilisateur peut également modifier des champs), alors un output est généré qui sera transformé en ProposalApplication, qui sera ensuite mis en oeuvre. La génération de l'output doit prendre en compte les valeurs retenues : je peux retenir la valeur proposée par l'agent A pour le champ C1, la valeur retenue par l'agent B pour le champ C2 et la valeur modifiée par l'utilisateur pour le champ C3. A priori, ça ne fonctionne pas parfaitement puisqu'on me rapporte des erreurs sur les mises à jour : comme il y a plusieurs propositions par champ, parfois un champ prend une valeur qui n'a pas été validée par l'utilisateur et qui était (peut-être) non visibles dans l'interface.

On a plusieurs options :
- Continuer avec cette idée de fusion des propositions, champ par champ, pour créer un output qui générera une ProposalApplication qui fonctionne bien. Mon idée initiale, c'était de créer une Working Proposal qui contiendrait la proposition sur laquelle travaille l'utilisateur mais je pense que le code est parti un peu dans tous les sens et que ça ne fonctionne pas aussi bien que je le souhaite.
- Revoir le système en permettant de visualiser les différentes propositions (onglets ?) et d'en choisir une que l'on modifiera manuellement (éventuellement) et que l'on validera (on discard les autres pour ne pas avoir de confusion)

Peut-être y a-t-il encore d'autres possibilités que je n'imagine pas. Il faudrait regarder des exemples d'interfaces qui permettent de choisir parmi plusieurs valeurs.

Réfléchissons à ça ensemble.
