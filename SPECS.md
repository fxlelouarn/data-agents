il existera une interface permettant de superviser les agents actifs (certains peuvent être désactivés via un switch sur la liste du tableau de bord). cette interface ressemblera à ce qui se trouve dans le projet milesrepublic. de manière générale, on tentera de suivre les pratiques de développement du projet milesrepublic même si on n'utilisera pas nécessairement nextjs comme plateforme. on pourra utiliser la librairie mui pro. le projet sera déployé sur Render.

## Agents

Typiquement, un agent aura un nom, une fréquence de run, des logs centralisés. Leur fonctionnement interne changera d'un agent à l'autre mais il devront tous répondre à une même logique : paramètres de départ permettant d'opérer, actions, output de résultat du run. Les agents interagiront typiquement avec la base de données Event-Edition-Race de la base de données de Miles Republic. Ils auront aussi leur propre base de données dans laquelle ils pourront stocker des informations. Ils devront toutefois tous interagir avec la base de données de l'application que nous décrivons pour les logs, les infos de run, leurs résultats, etc.

J'aurai plusieurs types d'agent. La liste suivante n'est pas exhaustive et te donne des exemples d'agents :

1) Agents d'extraction d'informations sur des événements à venir

Les agents seront écrits pour opérer avec la librairie playwright et tenterons, dans la mesure du possible, d'extraire les informations via de la recherche dom structurée. Il peut arriver que des agents utilisent des screenshots pour extraire des infos.

Tous les agents devront extraire des informations selon le même format : Nom de l'événement, adresse de l'événement, ville, site web, site instagram, site facebook, année de l'édition, statut de l'édition (calendarStatus), date de début des inscriptions, date de clôture des inscriptions, fuseau horaire. Les agents peuvent également extraire des Races de leur exploration, selon le format Race décrit ici : https://app.warp.dev/drive/notebook/Next-ke4tc02CYq8nPyEgErILtF . On est surtout intéressé par les distances, la date et l'heure de début de la course, le prix, le dénivelé éventuel, le nom.

2) Agents de comparaison 

Les données extraites par les agents d'extraction devront être comparées à ce qui existe dans la base de données de Miles Republic (Event-Edition-Race). 

Il faudra vérifier si l'événement extrait existe déjà dans la base (comparaison sur le nom, la ville, la date de l'édition notamment -- il faudra utiliser des algos de comparaison textuelle souples pour gérer les éventuels légers changements dans les noms). Si l'événement extrait existe déjà, il faudra permettre à un opérateur humain de comparer les informations trouvées par l'agent avec les informations déjà en base. L'opérateur pourra valider les différentes informations individuellement ou les valider en bloc. Voir la section "interfaces" plus loin.


Il peut arriver que des propositions ne permettent pas de déterminer si ce qui a été trouvé par l'agent est valable ou non. Dans ce cas, il faut que la proposition puisse être ignorée par l'opérateur. Les informations ignorées doivent être archivées. 

2) Agents validateurs

Il existera des opérateurs automatiques (des agents validateurs) qui pourront valider des résultats d'agents extracteurs/scrapers. Par exemple, il existera un agent validateur qui répèrera les propositions faites par les agents extracteurs opérant sur le site de la FFA (Fédération Française d'Athlétisme) et qui valideront les propositions les dates de début et de fin des courses et de l'édition, les distances des courses, les dénivelés automatiquement.


3) Agents d'extraction d'informations spécifiques

Certains agents auront pour objectif de travailler sur des champs particuliers. Par exemple, un agent aura pour mission de parcourir de le site de la FFA et d'extraire le nombre de participants des événements passés, pour remplir le champ Edition.registrantsNumber de l'édition passée.

4) Des agents de nettoyage des informations

Un agent pourra travailler sur les données de la base de données pour, par exemple, repérer et supprimer les doublons ou pour corriger les catégories de courses si elles sont mal renseignées.

5) Des agents de duplication

Lorsqu'une édition est terminée, un agent doit s'occuper de dupliquer l'édition pour l'année suivante, dans les jours qui suivent la fin de l'édition. Et il faut passer cette nouvelle édition en calendarStatus = TO_BE_CONFIRMED

## Interfaces

Tu peux utiliser la librairie MUI Pro pour laquelle nous avons une licence. Tu peux customiser la lib avec ce qui est fait dans le projet milesrepublic.

Il faudra une interface pour visualiser les agents actifs ou inactifs. Il faut pouvoir filtrer selon ce statut et aussi chercher un agent par son nom. Lorsque je clique sur un agent, j'arrive sur une page me permettant de connaître ses caractéristiques et surtout, de voir un log de ses activités. je peux aussi désactiver un agent, auquel cas il ne doit plus se lancer jusqu'à ce que je le réactive.

Un utilisateur pourra aussi déclencher manuellement le run d'un agent.

Il faudra aussi créer une interface qui permettra de visualiser les propositions des agents, par événement / édition. Le tableau des propositions permettra de voir quel événement et quelle édition est concernée (voire quelle(s) course(s)), la date de la proposition, le type de modification proposé (Changement de date, de dénivelé, de distance, de nom, etc. S'il y a plusieurs changements, il faudra résumer par Changements multiples et une bulle d'info permettra de détailler), la date actuelle de début de l'édition et son statut (calendarStatus). Il faut pouvoir filtrer sur le calendarStatus afin de pouvoir se concentrer sur les statuts TO_BE_CONFIRMED (À confirmer), qui sont ceux qui nous intéresent en priorité. Il faut également pouvoir trier par date prévue d'édition (la date de la proposition ou, à défaut, la date de l'édition même si non confirmée).

Lorsque je clique sur la proposition, il doit y avoir une page qui s'affiche qui me permette de visualiser la proposition et de la comparer aux informations existantes. De plus, je dois savoir quel est l'agent qui a fait la propisition et s'il y a d'autres propositions pour cette édition (si c'est le cas, il faut que je puisse voir ces autres propositions -- ouverture de l'autre proposition). Une petite icône s'affichera à côté d'un champ s'il y a plusieurs propositions pour ce champ. S'il y a plusieurs propositions, je dois pouvoir choisir parmi les propositions. Si plusieurs agents proposent la même valeur (une date par exemple), alors il faut indiquer le nombre d'agents ayant proposé cette valeur à côté de la valeur. Je peux aussi choisir d'entrer moi-même une valeur. Attention aux dates, elles sont toutes stockées en timestamp UTC dans la base de données.

Une proposition doit avoir aussi un justificatif, c'est-à-dire une image ou du html qui permette de justifier la proposition qui est faite. Par exemple, un agent qui regarde les snippets des résultats des requêtes Google doit pouvoir indiquer quels snippets (et les liens associés) ont permis de faire la proposition (la date peut apparaître dans un snippet) ; un agent qui checke le calendrier de la FFA doit avoir un lien vers la page qui lui a permis de faire les propositions de date, distance, etc. ; un agent qui check le calendrier d'un organisateur doit donner un lien vers la page. Les liens doivent être clicables et ouvrir le navigateur système, une image doit être affcihée, etc.

Chaque champ proposé peut être accepté ou non individuellement. Tout peut être accepté en bloc. Et puis on doit pouvoir archiver cette proposition lorsqu'on en a terminé. On peut aussi la laisser ouverte pour y revenir plus tard (on ferme la proposition).

Chaque champ proposé peut être éditable par l'utilisateur.

## Nouveaux événements

Les agents peuvent identifier des événements déjà existants mais également des événements qui ne se trouvent pas dans la base. Ce sont de nouveaux événements et doivent être identifiés comme tels. Ces nouveaux événements génèrent donc des propositions particulières, qui ne peuvent pas être comparées à ce qui existe. Par contre, il faut pouvoir choisir dans un moteur de recherche (qui se branchera sur le moteur meilisearch du projet milesrepublic) un événement avec lequel on voudra comparer le nouvel événement, afin de s'assurer qu'il n'existe pas un événement semblable que l'agent n'aurait pas repéré. Dans tous les cas, il faut permettre de créer un nouvel événement à partir de celui proposé. Et si un événement a été trouvé par l'utilisateur, qui considère qu'il s'agit du même, il faut rattacher la proposition à cet événement et donc repartir sur le scénario précédent (événement connu, avec comparaison des valeurs).

## Architcture

Pas de consigne particulière pour l'architecture si ce n'est que ça doit se déployer sur Render. 

