import type { Article } from "./types";
export const articles: Article[] = [
  {
    slug: "importer-voiture-moins-3-ans-algerie",
    topic: "vehicules",
    title: "Importer une voiture de moins de 3 ans en Algérie : par où commencer ?",
    description:
      "Âge, résidence, motorisation, documents, transport et budget : les vérifications à faire avant d'acheter une voiture pour l'Algérie.",
    answer:
      "Commencez par confirmer votre régime d'importation auprès des douanes, puis l'âge à la déclaration, la motorisation, la conformité et le coût total. Le billet de ferry ne prouve pas que le véhicule est importable.",
    sections: [
      {
        id: "regime",
        title: "1. Choisir le bon régime",
        paragraphs: [
          "Le décret 23-74 encadre les acquisitions d'occasion par les particuliers résidents pour leur usage personnel. Un séjour touristique avec retour du véhicule et un changement de résidence sont des démarches distinctes. Présentez votre situation réelle au bureau des douanes avant de verser un acompte.",
          "La question à poser est précise : « Je réside dans ce pays, je veux garder ce véhicule en Algérie, sous quel régime puis-je le déclarer ? » Conservez la réponse, sa date et la référence du service contacté.",
        ],
      },
      {
        id: "ordre",
        title: "2. Vérifier dans le bon ordre",
        paragraphs: [
          "Le texte de 2023 retient l'âge entre la première mise en circulation et la souscription de la déclaration de mise à la consommation. Il vise notamment l'essence, l'électrique et l'hybride essence/électrique. La fréquence prévue est d'une acquisition tous les trois ans. Ces repères doivent être confrontés aux règles applicables à votre opération.",
        ],
        bullets: [
          "Demander la date exacte de première mise en circulation et les documents du véhicule avant de se déplacer.",
          "Faire confirmer le régime, la version moteur et les conditions fiscales actuelles par les douanes.",
          "Faire contrôler l'état du véhicule et la concordance de son numéro de série avec les pièces.",
          "Comparer le coût complet avec celui d'un véhicule déjà disponible en Algérie, à état et garantie comparables.",
        ],
      },
      {
        id: "achat",
        title: "3. Acheter avec une marge de temps",
        paragraphs: [
          "Une voiture très proche de son troisième anniversaire laisse peu de place à un retard de vente, de transport ou de dossier. Simulez la date de déclaration envisagée, puis un scénario décalé de plusieurs semaines. Une marge de planning est un choix pratique, pas une dérogation réglementaire.",
          "Avant le paiement, clarifiez aussi qui assure le véhicule, qui le conduit jusqu'au port, qui conserve les originaux et qui accomplit les formalités. Un intermédiaire qui promet une admission « garantie » doit pouvoir expliquer exactement sur quels documents il s'appuie.",
        ],
      },
    ],
    sources: ["decree", "customs"],
    related: [
      "documents-importation-voiture-algerie",
      "calcul-age-voiture-importation",
      "budget-importation-voiture-algerie",
    ],
    faq: [
      {
        q: "L'achat en Europe garantit-il l'importation ?",
        a: "Non. Le pays d'achat ne remplace pas les conditions du régime douanier, les contrôles du véhicule et le dossier requis.",
      },
      {
        q: "Le simulateur BledWay confirme-t-il mon éligibilité ?",
        a: "Non. Il calcule un âge ou un budget à partir de vos entrées. L'admission du véhicule appartient aux autorités compétentes.",
      },
    ],
    tool: "age-vehicule",
  },
  {
    slug: "documents-importation-voiture-algerie",
    topic: "vehicules",
    title: "Documents pour importer une voiture en Algérie : préparer un dossier cohérent",
    description:
      "Une méthode pour préparer identité, résidence, immatriculation, preuve d'achat, état du véhicule et expertise, puis vérifier le dossier avec les douanes.",
    answer:
      "Le décret 23-74 cite notamment l'identité, la résidence, l'immatriculation étrangère, la preuve de propriété, un justificatif récent de bon état et une expertise de conformité. Demandez au bureau compétent la liste actualisée adaptée à votre dossier.",
    sections: [
      {
        id: "pieces",
        title: "Les familles de pièces à réunir",
        paragraphs: [
          "L'article 8 du décret de 2023 constitue un point de départ documentaire. Un scan aide à préparer le dossier mais ne dispense pas d'apporter les pièces demandées sous la forme exigée par l'administration.",
        ],
        table: {
          headers: ["Famille", "Contrôle à préparer"],
          rows: [
            [
              "Identité et résidence",
              "Identité de l'importateur et justificatif de résidence cohérents.",
            ],
            ["Véhicule", "Immatriculation étrangère et numéro de série concordants."],
            ["Acquisition", "Facture et/ou contrat établissant le transfert de propriété."],
            ["État", "Document de bon état datant de moins de trois mois selon le texte de 2023."],
            ["Conformité", "Rapport de l'expert agréé par le ministère chargé des mines."],
          ],
        },
      },
      {
        id: "coherence",
        title: "Contrôler les correspondances avant le paiement",
        paragraphs: [
          "Placez côte à côte les pièces du vendeur, le contrat et les papiers du véhicule. Relevez les différences de nom, d'adresse, de numéro de série ou de date. Demandez leur correction avant de réserver un déplacement difficile à modifier.",
          "Un dossier numérisé devrait être lisible, classé et nommé simplement. Par exemple : identité, résidence, immatriculation, acquisition, état, transport. Partagez seulement les pièces nécessaires avec un interlocuteur identifié ; évitez de publier votre carte grise dans un groupe public.",
        ],
      },
      {
        id: "transport",
        title: "Distinguer douane et embarquement",
        paragraphs: [
          "Le transporteur vérifie ses propres conditions d'embarquement. Préparez séparément le billet, l'identité des passagers, les dimensions déclarées du véhicule et les pièces qu'il demande. Un dossier douanier complet ne remplace pas la réservation d'une place garage.",
          "Avant de partir, faites un dernier point avec le bureau douanier sur les traductions, les originaux et les étapes à effectuer après l'arrivée. Ajoutez ces réponses à votre dossier avec leur date. Cette méthode évite de transformer une liste trouvée en ligne en certitude administrative.",
        ],
      },
    ],
    sources: ["decree", "customs", "identity"],
    related: ["importer-voiture-moins-3-ans-algerie", "budget-importation-voiture-algerie"],
    faq: [
      {
        q: "Cette liste est-elle exhaustive ?",
        a: "Non. Il faut faire confirmer les pièces, leur forme et leur validité selon votre régime et les instructions en vigueur.",
      },
      {
        q: "Le certificat de conformité du constructeur suffit-il ?",
        a: "Ne le supposez pas : demandez quelles expertises et pièces sont exigées pour votre véhicule et votre régime.",
      },
    ],
  },
  {
    slug: "calcul-age-voiture-importation",
    topic: "vehicules",
    title: "Voiture de moins de trois ans : quelle date faut-il comparer ?",
    description:
      "Comprendre la première mise en circulation, la date de déclaration et la marge à garder avant l'importation d'une voiture en Algérie.",
    answer:
      "Le texte de 2023 compare la première mise en circulation à la déclaration de mise à la consommation, et non à l'achat ou à la réservation du ferry. Calculez avec la date administrative envisagée, puis vérifiez votre cas avec les douanes.",
    sections: [
      {
        id: "dates",
        title: "Trois dates, trois rôles différents",
        paragraphs: [
          "La date de fabrication, la date du contrat d'achat et la première mise en circulation ne sont pas interchangeables. Commencez par lire la date portée sur le document d'immatriculation. Une annonce commerciale indiquant seulement « modèle 2024 » ne suffit pas à faire le calcul.",
          "Le décret parle d'un âge ne dépassant pas trois ans. Comme les offres et les guides emploient souvent « moins de trois ans », le jour exact du troisième anniversaire mérite une confirmation administrative. Notre outil l'affiche comme une situation limite et ne rend pas de décision d'admission.",
        ],
      },
      {
        id: "exemple",
        title: "Un exemple de planning",
        paragraphs: [
          "Prenons une première mise en circulation au 15 novembre 2023. Une déclaration envisagée le 1er novembre 2026 précède le troisième anniversaire. Une déclaration le 20 novembre 2026 le dépasse. Une réservation de bateau faite en octobre ne change pas cette comparaison.",
          "Ces dates sont un exemple de calcul, pas une recommandation d'achat. Refaites-le avec vos pièces réelles et avec une seconde date plus tardive, pour voir si votre marge dépend d'un déroulement parfait du voyage.",
        ],
      },
      {
        id: "marge",
        title: "Anticiper les délais sans inventer une règle",
        paragraphs: [
          "Faites une petite frise : obtention des pièces, prise en charge du véhicule, trajet routier, traversée, arrivée, déclaration. Notez qui est responsable de chaque étape et ce qui peut la retarder. Le planning vous sert à poser les bonnes questions, pas à créer un délai garanti.",
          "Pour une première mise en circulation au 29 février, l'outil retient le dernier jour de février dans l'année du troisième anniversaire si elle n'est pas bissextile. Cette convention de calendrier est explicitée dans le résultat et doit être confirmée si votre dossier se situe à la limite.",
        ],
      },
    ],
    sources: ["decree", "customs"],
    related: ["importer-voiture-moins-3-ans-algerie", "documents-importation-voiture-algerie"],
    faq: [
      {
        q: "La date d'achat peut-elle servir de référence ?",
        a: "Elle prouve l'acquisition, mais ne remplace pas la première mise en circulation pour le calcul décrit par le décret de 2023.",
      },
      {
        q: "Peut-on réserver très près de l'anniversaire ?",
        a: "C'est un risque de planning. Un report ou un dossier retardé peut changer le résultat du calcul d'âge.",
      },
    ],
    tool: "age-vehicule",
  },
  {
    slug: "budget-importation-voiture-algerie",
    topic: "vehicules",
    title: "Budget d'importation d'une voiture : calculer le coût rendu en Algérie",
    description:
      "Additionner achat, transport, frais, droits et taxes confirmés, puis comparer avec le marché local sans confondre prix d'annonce et coût final.",
    answer:
      "Le coût complet additionne achat, acheminement, traversée ou fret, frais annexes, droits et taxes, puis une réserve choisie. Tant que la fiscalité n'est pas confirmée, présentez un sous-total et un montant restant à chiffrer.",
    sections: [
      {
        id: "postes",
        title: "Construire un budget poste par poste",
        paragraphs: [
          "Le prix de l'annonce n'est que la première ligne. Distinguez les dépenses certaines, les devis obtenus et les montants encore inconnus. Gardez la devise originale et la date de chaque montant : un prix en euros et une taxe en dinars ne s'additionnent pas directement.",
        ],
        table: {
          headers: ["Poste", "Justificatif à chercher"],
          rows: [
            ["Achat et paiement", "Offre écrite, contrat, frais bancaires éventuels."],
            [
              "Acheminement et transport",
              "Route, billet avec véhicule ou devis de fret, assurance adaptée.",
            ],
            ["Formalités et frais locaux", "Devis détaillés, prestations incluses et exclusions."],
            ["Fiscalité", "Simulation ou confirmation des douanes pour le véhicule exact."],
            ["Imprévus", "Réserve personnelle clairement séparée des taxes."],
          ],
        },
      },
      {
        id: "taxes",
        title: "Saisir une fiscalité confirmée",
        paragraphs: [
          "BledWay ne transforme pas un pourcentage générique trouvé sur internet en barème officiel. Le calculateur demande le montant des droits et taxes en DZD et le taux de conversion que vous choisissez. Il affiche les hypothèses, sans récupérer de taux de change ni certifier une estimation douanière.",
          "Si la ligne des taxes est vide, le résultat reste incomplet. Un zéro saisi explicitement est une hypothèse de votre part : il faut pouvoir le justifier. Faites aussi confirmer les frais de stationnement, de manutention ou d'intervention qui pourraient s'ajouter.",
        ],
      },
      {
        id: "decision",
        title: "Comparer deux solutions à périmètre égal",
        paragraphs: [
          "Comparez le coût rendu avec une offre locale de même version, de kilométrage comparable et avec un niveau de garantie proche. Ajoutez votre temps de déplacement et le coût d'une éventuelle immobilisation. Une différence de prix faible peut disparaître dès le premier imprévu.",
          "Conservez deux budgets datés : le scénario avec les devis actuels et un scénario moins favorable. Le simulateur peut être recalculé sans compte ; aucune donnée du formulaire n'est envoyée à BledWay par cet outil.",
        ],
      },
    ],
    sources: ["customs"],
    related: ["importer-voiture-moins-3-ans-algerie", "documents-importation-voiture-algerie"],
    faq: [
      {
        q: "Le calculateur donne-t-il des taxes officielles ?",
        a: "Non. Vous fournissez le montant confirmé des droits et taxes et votre taux de conversion.",
      },
      {
        q: "Puis-je laisser les taxes vides ?",
        a: "Oui, mais seul le sous-total connu sera affiché, avec la mention explicite que le budget est incomplet.",
      },
    ],
    tool: "budget-importation",
  },
  {
    slug: "voiture-vacances-admission-temporaire",
    topic: "vehicules",
    title: "Partir en Algérie avec sa voiture : vacances, importation ou changement de résidence ?",
    description:
      "Trois projets à distinguer avant de préparer les documents, l'assurance et le transport de votre voiture vers l'Algérie.",
    answer:
      "Venir en vacances avec un véhicule destiné à repartir, importer définitivement une voiture et transférer sa résidence sont trois situations différentes. Commencez par identifier votre projet avec les douanes et, si nécessaire, votre consulat.",
    sections: [
      {
        id: "projet",
        title: "Décrire ce qui se passera après le voyage",
        paragraphs: [
          "Votre voiture repart-elle avec vous ? Voulez-vous la conserver durablement en Algérie ? Changez-vous réellement de résidence ? Ces questions sont plus utiles qu'une recherche de « meilleure exonération ». Le bon dossier découle de votre situation, et non de l'avantage fiscal espéré.",
          "Le décret de 2023 distingue les véhicules introduits pour un séjour touristique de son dispositif d'acquisition par des résidents. Il ne suffit donc pas d'entrer avec une voiture pendant les vacances pour la faire basculer automatiquement dans le régime des véhicules récents.",
        ],
      },
      {
        id: "verification",
        title: "Préparer une demande claire",
        paragraphs: [
          "Contactez les services compétents en décrivant votre résidence, le propriétaire du véhicule, la personne qui le conduira, l'objectif du séjour et le devenir de la voiture. Demandez les documents, délais, règles de sortie et éventuelles restrictions de conduite ou de cession.",
        ],
        bullets: [
          "Vérifier le régime douanier avant de réserver un billet difficile à modifier.",
          "Obtenir de l'assureur une confirmation écrite de la couverture pour le pays, les conducteurs et la période.",
          "Contrôler les consignes du transporteur si le conducteur n'est pas le titulaire des documents.",
          "Conserver les pièces d'entrée et de sortie avec le dossier du véhicule.",
        ],
      },
      {
        id: "retour",
        title: "Ne pas oublier le retour",
        paragraphs: [
          "Une bonne préparation porte aussi sur la sortie du territoire : conducteur, papiers, date prévue et éventuel changement de programme. Demandez comment signaler une immobilisation ou une difficulté de retour au service compétent.",
          "Pour un changement de résidence, utilisez les informations de votre consulat et des douanes propres à cette démarche. BledWay ne transpose pas une condition de ce régime à l'importation ordinaire d'un véhicule de moins de trois ans.",
        ],
      },
    ],
    sources: ["decree", "customs", "identity"],
    related: ["voyage-algerie-voiture-checklist", "importer-voiture-moins-3-ans-algerie"],
    faq: [
      {
        q: "Puis-je appliquer une règle du changement de résidence à mes vacances ?",
        a: "Ne le supposez pas. Les régimes, les bénéficiaires et les pièces peuvent différer.",
      },
      {
        q: "La compagnie maritime décide-t-elle du régime douanier ?",
        a: "Non. Elle fixe les conditions de transport ; les autorités compétentes déterminent les formalités douanières.",
      },
    ],
  },
  {
    slug: "voyage-algerie-voiture-checklist",
    topic: "voyage",
    title: "Voyager en Algérie en ferry avec sa voiture : la checklist utile",
    description:
      "Préparer le billet, les passagers, la voiture, les bagages de cabine et l'arrivée au port avec une liste organisée avant le départ.",
    answer:
      "Préparez quatre dossiers séparés : passagers, véhicule, réservation et arrivée au port. Mesurez le véhicule équipé, vérifiez le billet, puis gardez un sac de traversée et les originaux accessibles avant d'entrer dans le garage.",
    sections: [
      {
        id: "reservation",
        title: "Avant de payer le billet",
        paragraphs: [
          "Comparez les départs disponibles à vos dates et le trajet routier pour atteindre le port. Dans chaque offre, relevez les passagers, la voiture, l'installation à bord et les conditions de modification. Un prix pour un piéton ne permet pas de comparer le coût d'une famille avec voiture.",
          "Mesurez la hauteur totale avec coffre de toit, galerie ou chargement et la longueur avec les accessoires déclarables. Faites confirmer la catégorie par le transporteur si votre configuration est particulière. Gardez les dimensions avec votre réservation.",
        ],
      },
      {
        id: "dossiers",
        title: "Une vérification la veille",
        paragraphs: [
          "Relisez les noms et dates sur les pièces puis sur le billet. Demandez à chaque voyageur de confirmer qu'il a ses propres documents. Pour le véhicule, contrôlez séparément le droit de le conduire, l'assurance et les formalités douanières correspondant à votre projet.",
        ],
        bullets: [
          "Billet et consignes de présentation téléchargés, disponibles hors connexion.",
          "Papiers des passagers et de la voiture regroupés dans une pochette accessible.",
          "Adresse de la bonne entrée portuaire enregistrée avec une solution de secours.",
          "Sac de traversée : médicaments habituels, change, chargeurs, eau et affaires des enfants.",
          "Coordonnées de la compagnie et de votre hébergement enregistrées.",
        ],
      },
      {
        id: "garage",
        title: "Pendant l'embarquement et à l'arrivée",
        paragraphs: [
          "Suivez les agents et la signalisation de votre départ. Avant de quitter le garage, repérez le pont, l'escalier et la zone où se trouve la voiture. Demandez à l'équipage les règles d'accès pendant la traversée et emportez ce dont vous aurez besoin.",
          "À l'arrivée, prévoyez de rester disponible pour les consignes de débarquement et les contrôles. L'heure annoncée d'arrivée du navire n'est pas l'heure garantie à laquelle vous sortirez du port. Pour la suite du voyage, préférez une organisation souple.",
        ],
      },
    ],
    sources: ["identity", "boarding", "customs"],
    related: [
      "embarquement-marseille-algerie",
      "cabine-ou-fauteuil-ferry",
      "voiture-vacances-admission-temporaire",
    ],
    faq: [
      {
        q: "Faut-il déclarer le coffre de toit ?",
        a: "Déclarez les dimensions du véhicule équipé selon les règles du transporteur et faites confirmer sa catégorie avant de payer.",
      },
      {
        q: "Puis-je laisser tout dans la voiture ?",
        a: "Prévoyez un sac de traversée et demandez les règles d'accès au garage. Les documents et affaires indispensables doivent rester avec vous.",
      },
    ],
    tool: "budget-voyage",
  },
  {
    slug: "cabine-ou-fauteuil-ferry",
    topic: "voyage",
    title: "Cabine ou fauteuil pour l'Algérie : comment choisir sans regret ?",
    description:
      "Comparer intimité, repos, sanitaires, bagages et budget pour choisir une cabine ou un fauteuil sur une traversée en ferry.",
    answer:
      "Comparez le supplément total avec vos besoins de repos : nombre de voyageurs, traversée de nuit, enfants, sanitaires et intimité. Lisez la catégorie exacte : une cabine intérieure, extérieure ou équipée d'un lavabo ne promet pas les mêmes prestations.",
    sections: [
      {
        id: "comparaison",
        title: "Comparer une installation réelle",
        paragraphs: [
          "Ne vous contentez pas du mot « cabine ». Vérifiez le nombre de couchages, l'occupation privative ou partagée, les sanitaires et les accès. Une photo générique d'un navire ne confirme pas la catégorie vendue sur votre départ.",
        ],
        table: {
          headers: ["Critère", "Question à poser"],
          rows: [
            ["Repos", "Avez-vous besoin de dormir avant de reprendre la route ?"],
            ["Sanitaires", "Douche et WC privés, lavabo seul, ou installations communes ?"],
            ["Famille", "Tous les membres peuvent-ils être logés ensemble ?"],
            ["Mobilité", "L'installation et son accès répondent-ils aux besoins du voyageur ?"],
            ["Budget", "Quel supplément pour tout le groupe et pour les deux sens ?"],
          ],
        },
      },
      {
        id: "choix",
        title: "Décider avec un coût par groupe",
        paragraphs: [
          "Demandez un devis avec exactement les mêmes passagers et le même véhicule, puis changez seulement l'installation. La différence mesure le véritable coût du choix. Faites ce calcul sur l'aller et sur le retour : la disponibilité peut varier.",
          "Pour un groupe, diviser le supplément par le nombre de personnes peut aider à décider. Ce calcul reste un partage de budget ; il ne signifie pas que la compagnie vend la cabine à ce prix par personne.",
        ],
      },
      {
        id: "navire",
        title: "Recontrôler si le navire change",
        paragraphs: [
          "Les fiches officielles du Jean Nicoli et du Danielle Casanova présentent des catégories d'installations différentes. Une substitution de navire peut changer le cadre du voyage ; demandez alors à la compagnie de confirmer votre installation et les options proposées.",
          "Si vous avez des besoins de mobilité, un animal ou du matériel particulier, posez la question avant le paiement. La bonne installation est celle qui correspond au voyageur réel, et pas seulement au prix le plus bas affiché.",
        ],
      },
    ],
    sources: ["nicoli", "casanova"],
    related: ["ferry-algerie-enfants-famille", "voyage-algerie-voiture-checklist"],
    faq: [
      {
        q: "Une cabine comprend-elle toujours une douche privée ?",
        a: "Non. Il faut lire la catégorie précise et les équipements annoncés sur le billet ou le devis.",
      },
      {
        q: "La photo garantit-elle la cabine obtenue ?",
        a: "Non. Demandez la catégorie et l'occupation réservées ; les photos de présentation peuvent être indicatives.",
      },
    ],
    tool: "budget-voyage",
  },
  {
    slug: "ferry-algerie-enfants-famille",
    topic: "voyage",
    title: "Ferry vers l'Algérie avec des enfants : organiser le voyage en famille",
    description:
      "Répartir les documents, préparer les affaires de traversée et choisir une installation adaptée pour voyager avec des enfants vers l'Algérie.",
    answer:
      "Préparez les documents pour chaque enfant, vérifiez les exigences selon les accompagnants et anticipez sommeil, repas et déplacements à bord. Une cabine ou un équipement bébé doit être confirmé dans la réservation.",
    sections: [
      {
        id: "avant",
        title: "Avant de réserver : penser par enfant",
        paragraphs: [
          "Faites la vérification documentaire pour chaque mineur selon sa nationalité, sa situation et les adultes qui l'accompagnent. Demandez aux autorités et au transporteur ce qui est nécessaire. Le document d'un parent ne remplace pas automatiquement celui de l'enfant.",
          "Choisissez l'installation avec les besoins de sommeil du groupe. Demandez les possibilités et conditions pour un lit bébé, la poussette et les couchages. Vérifiez aussi comment demander de l'assistance pour éviter de découvrir un accès inadapté le jour du départ.",
        ],
      },
      {
        id: "sac",
        title: "Préparer un sac pour toute la traversée",
        paragraphs: [
          "Le sac familial doit couvrir le voyage et un éventuel délai supplémentaire. Répartissez les objets indispensables entre les adultes, avec une pochette de documents facilement repérable.",
        ],
        bullets: [
          "Un change accessible par enfant et de quoi se réchauffer.",
          "Repas et boissons adaptés aux besoins habituels, dans les limites du transporteur.",
          "Médicaments usuels et documents nécessaires conservés avec les adultes.",
          "Une activité calme utilisable sans réseau, des écouteurs adaptés et des chargeurs.",
          "Le numéro du pont garage et un point de rendez-vous familial à bord.",
        ],
      },
      {
        id: "arrivee",
        title: "Prévoir une suite de voyage souple",
        paragraphs: [
          "Évitez de faire dépendre une longue route après le port d'un débarquement sans attente. Répartissez la conduite si cela est possible et ajoutez au budget une solution de repos. Le calcul du trajet doit intégrer le confort du groupe, pas seulement la durée annoncée en mer.",
          "Les équipements familiaux publiés par une compagnie ne sont pas identiques sur tous les navires. Contrôlez le bateau et l'installation affectés à votre réservation, puis réservez les services qui doivent l'être.",
        ],
      },
    ],
    sources: ["children", "identity"],
    related: ["cabine-ou-fauteuil-ferry", "voyage-algerie-voiture-checklist"],
    faq: [
      {
        q: "Le lit bébé est-il automatique ?",
        a: "Ne le supposez pas. Vérifiez s'il existe sur le navire, s'il faut le réserver et si votre cabine permet son installation.",
      },
      {
        q: "Peut-on se fier à une liste générique de papiers pour mineurs ?",
        a: "Non. Les exigences dépendent notamment de la situation de l'enfant, de sa nationalité et des accompagnants.",
      },
    ],
  },
  {
    slug: "ferry-algerie-animaux",
    topic: "voyage",
    title: "Prendre le ferry pour l'Algérie avec un animal : vérifier l'aller et le retour",
    description:
      "Séparer les règles du transporteur, les formalités d'entrée en Algérie et celles du retour pour organiser une traversée avec un animal.",
    answer:
      "Vérifiez trois choses avant de payer : l'accueil de l'animal sur le navire, les formalités sanitaires d'entrée en Algérie et les conditions du retour. L'accord de la compagnie ne remplace pas les exigences des autorités.",
    sections: [
      {
        id: "trois",
        title: "Trois interlocuteurs à consulter",
        paragraphs: [
          "Le transporteur explique où l'animal peut rester et comment réserver. Le vétérinaire vous aide à préparer les documents sanitaires. Les autorités du pays de destination et du pays de retour fixent les exigences d'entrée. Faites ces vérifications assez tôt pour respecter les délais éventuels.",
          "Présentez l'espèce, l'identification, le pays de départ, les étapes du voyage et la date de retour. Demandez une réponse adaptée à ce trajet, plutôt qu'une simple confirmation que l'animal possède un document de voyage.",
        ],
      },
      {
        id: "bord",
        title: "Réserver les bonnes conditions à bord",
        paragraphs: [
          "Chenil, cabine acceptant un animal ou autre installation : les possibilités dépendent de la compagnie et du navire. Demandez les règles d'accès, de promenade, de laisse, de muselière ou de caisse applicables à votre animal. Faites préciser le supplément et la disponibilité.",
          "Prévoyez une étiquette de contact, de l'eau, la nourriture habituelle, les accessoires de nettoyage et les documents requis. Vérifiez que le propriétaire ou la personne responsable figurant au dossier peut présenter les pièces lors des contrôles.",
        ],
      },
      {
        id: "retour",
        title: "Préparer le retour avant le départ",
        paragraphs: [
          "La difficulté se découvre parfois au retour : une formalité supplémentaire ne peut pas toujours être accomplie au dernier moment. Faites établir un calendrier par le professionnel ou l'autorité compétente avant d'acheter l'aller-retour.",
          "Ne choisissez pas de traitement ou de sédation à partir d'un conseil de forum. Pour le bien-être de l'animal pendant la traversée, adressez-vous à votre vétérinaire. BledWay aide à organiser les questions et le voyage, sans prescrire de démarche médicale.",
        ],
      },
    ],
    sources: ["animals", "identity"],
    related: ["voyage-algerie-voiture-checklist", "cabine-ou-fauteuil-ferry"],
    faq: [
      {
        q: "Un billet pour mon animal suffit-il ?",
        a: "Non. Le billet couvre le transport ; les documents sanitaires et les conditions d'entrée et de retour doivent être vérifiés séparément.",
      },
      {
        q: "Puis-je organiser le retour après l'arrivée ?",
        a: "Il vaut mieux vérifier avant le départ, car certaines démarches peuvent demander des délais.",
      },
    ],
  },
  {
    slug: "prix-billet-ferry-algerie",
    topic: "voyage",
    title: "Prix du ferry vers l'Algérie : comparer le vrai budget du voyage",
    description:
      "Une grille pour comparer deux devis de ferry et intégrer la route, le véhicule, la cabine et les conditions de modification.",
    answer:
      "Comparez deux devis établis au même moment, pour les mêmes dates, voyageurs, véhicule et installation. Ajoutez la route, les péages et les nuits éventuelles : le billet le moins cher ne donne pas toujours le voyage le moins coûteux.",
    sections: [
      {
        id: "devis",
        title: "Comparer à périmètre constant",
        paragraphs: [
          "Un tarif d'appel peut concerner un autre nombre de personnes, une autre période ou une installation différente. Notez la date du devis et ses conditions. Seule l'offre encore disponible chez la compagnie peut être réservée à son prix affiché.",
        ],
        table: {
          headers: ["À comparer", "À garder identique"],
          rows: [
            ["Passagers", "Nombre, âge et éventuels critères de tarif."],
            ["Véhicule", "Type et dimensions avec accessoires."],
            ["Traversée", "Aller seul ou aller-retour, dates et sens."],
            ["Installation", "Cabine ou fauteuil et occupation."],
            ["Conditions", "Modification, annulation, repas et autres services inclus."],
          ],
        },
      },
      {
        id: "route",
        title: "Ajouter ce qui se passe avant et après",
        paragraphs: [
          "Pour un port plus éloigné, estimez les kilomètres, le carburant et les péages supplémentaires. Ajoutez une nuit si elle devient nécessaire, ainsi que les transferts pour un voyage sans voiture. Le résultat permet de comparer des solutions porte à porte.",
          "Notre simulateur travaille avec vos montants. Saisissez les kilomètres totaux du scénario, y compris le retour si vous le comparez ; renseignez également le prix total du billet pour tout le groupe. Cela évite de compter l'aller-retour deux fois.",
        ],
      },
      {
        id: "flexibilite",
        title: "Donner une valeur à la souplesse",
        paragraphs: [
          "Un billet modifiable peut être utile quand vos dates dépendent d'une contrainte familiale ou administrative. Demandez le coût et les limites exactes d'un changement. Ne confondez pas « modification possible » et « modification sans supplément ».",
          "Si vous surveillez plusieurs options, gardez une petite liste datée avec le lien officiel et les prestations. Aucun montant trouvé dans un ancien article ne garantit le prix de votre prochain départ.",
        ],
      },
    ],
    sources: ["boarding"],
    related: ["cabine-ou-fauteuil-ferry", "voyage-algerie-voiture-checklist"],
    faq: [
      {
        q: "BledWay garantit-il le prix d'un billet ?",
        a: "Non. Le prix et les places disponibles se confirment directement auprès de la compagnie au moment de réserver.",
      },
      {
        q: "Comment comparer deux ports ?",
        a: "Comparez le budget complet : billet pour tout le groupe, route, péages, transferts et nuits nécessaires.",
      },
    ],
    tool: "budget-voyage",
  },
  {
    slug: "embarquement-marseille-algerie",
    topic: "voyage",
    title: "Embarquer à Marseille pour l'Algérie : préparer le bon accès au port",
    description:
      "Repérer la bonne entrée portuaire à Marseille, organiser sa présentation et éviter de confondre adresse du port et point d'enregistrement.",
    answer:
      "Utilisez l'entrée indiquée pour votre compagnie et votre départ. Une recherche « port de Marseille » peut conduire au mauvais endroit. Préparez l'accès, la présentation demandée et une marge routière distincte du temps de traversée.",
    sections: [
      {
        id: "entree",
        title: "Enregistrer une entrée, pas seulement un port",
        paragraphs: [
          "À Marseille, commencez par les consignes de votre réservation et la page d'accès de la compagnie. Vérifiez si l'adresse concerne un passager piéton, une voiture ou une agence. Ne remplacez pas ces indications par l'adresse d'un bureau commercial.",
          "Enregistrez l'itinéraire et une capture des consignes pour les consulter hors connexion. Si le navigateur vous conduit devant une entrée fermée, suivez la signalisation du départ et demandez au transporteur, sans tenter de traverser une zone réservée.",
        ],
      },
      {
        id: "horaire",
        title: "Séparer route et présentation au port",
        paragraphs: [
          "L'heure de départ du navire n'est pas votre heure de rendez-vous. Relevez l'heure ou le délai de présentation et l'éventuelle clôture d'enregistrement figurant sur vos documents. Ajoutez ensuite le temps routier et une marge personnelle pour les aléas.",
          "Un rendez-vous de covoiturage près de l'autoroute ne dépose pas automatiquement au terminal. Avant de confirmer, mettez-vous d'accord sur l'entrée portuaire, les bagages et le temps nécessaire pour les contrôles. Pour un conducteur, vérifiez que le transport de tous les passagers correspond aux réservations.",
        ],
      },
      {
        id: "attente",
        title: "Préparer l'attente sans compliquer le contrôle",
        paragraphs: [
          "Gardez les originaux accessibles, le téléphone chargé et les informations du billet disponibles. Répartissez eau, affaires des enfants et médicaments habituels dans le sac qui vous suivra à bord.",
          "Pour un départ d'une autre compagnie, utilisez ses propres consignes. Ce guide propose une méthode d'organisation, pas une porte universelle ni une durée d'enregistrement identique pour tous les ferries.",
        ],
      },
    ],
    sources: ["marseille", "boarding"],
    related: ["voyage-algerie-voiture-checklist", "covoiturage-avant-ferry"],
    faq: [
      {
        q: "Puis-je suivre simplement le GPS vers le port ?",
        a: "Vérifiez la destination précise : la porte et le terminal de votre compagnie doivent correspondre à la convocation.",
      },
      {
        q: "Combien d'heures d'avance faut-il ?",
        a: "Appliquez les consignes du billet et de la compagnie pour votre départ, puis ajoutez une marge routière personnelle.",
      },
    ],
  },
  {
    slug: "embarquement-sete-algerie",
    topic: "voyage",
    title: "Embarquer à Sète pour l'Algérie : route, terminal et rendez-vous",
    description:
      "Préparer l'accès au terminal de Sète, distinguer la gare du port et organiser l'arrivée en voiture ou en covoiturage.",
    answer:
      "Vérifiez le terminal et l'accès publiés pour votre départ de Sète. Planifiez séparément la route vers la ville, l'accès au port et le temps de présentation demandé par la compagnie.",
    sections: [
      {
        id: "terminal",
        title: "Partir du billet et de la page officielle",
        paragraphs: [
          "Une même recherche peut afficher la gare SNCF, un port de plaisance, une agence ou une zone commerciale du port. Le bon point d'arrivée est celui de votre embarquement. Utilisez la consigne du transporteur et vérifiez les indications pour votre type de véhicule.",
          "Si vous arrivez en train ou en covoiturage, organisez le dernier trajet jusqu'au contrôle approprié. Demandez où une dépose est autorisée et ne supposez pas qu'un conducteur pourra entrer dans toute la zone portuaire.",
        ],
      },
      {
        id: "a9",
        title: "Organiser un regroupement depuis l'A9",
        paragraphs: [
          "Un point de covoiturage peut faciliter le rassemblement du groupe, mais ajoute une étape. Comparez le détour, le volume de bagages et les places disponibles avec une arrivée directe au terminal. Gallargues est un repère entre Montpellier et Nîmes ; sa pertinence dépend de votre sens de circulation.",
          "Écrivez une heure limite de départ du point de regroupement. Prévoyez une solution de remplacement si le conducteur a du retard. Le calculateur de partage des frais sert à fixer un accord transparent, sans vendre ni réserver le trajet.",
        ],
      },
      {
        id: "jour",
        title: "Le jour du départ",
        paragraphs: [
          "Relisez les éventuelles communications de la compagnie avant de prendre la route. Gardez un moyen de consultation hors connexion et chargez le téléphone. Votre marge doit tenir compte du trajet jusqu'au port, puis des formalités demandées sur votre réservation.",
          "Sur place, suivez les consignes des agents, même si le navigateur propose une autre voie. Un changement d'accès ne doit pas être interprété comme une annulation : contactez le transporteur pour confirmer l'information.",
        ],
      },
    ],
    sources: ["sete", "boarding", "gallargues"],
    related: ["covoiturage-avant-ferry", "voyage-algerie-voiture-checklist"],
    faq: [
      {
        q: "La gare de Sète est-elle le terminal ferry ?",
        a: "Non. Vérifiez le trajet entre votre point d'arrivée dans la ville et l'accès maritime demandé par le transporteur.",
      },
      {
        q: "Une aire sur l'A9 est-elle forcément pratique ?",
        a: "Non. Vérifiez le détour, le sens d'accès et le dernier trajet jusqu'au terminal.",
      },
    ],
  },
  {
    slug: "arrivee-algerie-port-formalites",
    topic: "voyage",
    title: "Arriver en Algérie en ferry : organiser la sortie du port",
    description:
      "Anticiper les contrôles, les documents du véhicule, le téléphone et la suite du voyage à l'arrivée dans un port algérien.",
    answer:
      "L'arrivée du bateau ne correspond pas à une sortie immédiate du port. Gardez vos documents accessibles et prévoyez un horaire souple pour le trajet suivant, en particulier si vous conduisez après la traversée.",
    sections: [
      {
        id: "bord",
        title: "Préparer le débarquement à bord",
        paragraphs: [
          "Avant l'annonce de débarquement, regroupez les documents, les bagages et les personnes qui voyagent ensemble. Repérez le pont garage et attendez les instructions pour y accéder. Si vous voyagez à pied, demandez le cheminement et les éventuels transferts organisés.",
          "Une personne qui vient vous chercher doit savoir que l'heure du navire n'est qu'un repère. Convenez d'un message au moment où vous pourrez réellement sortir plutôt que d'une prise en charge trop serrée.",
        ],
      },
      {
        id: "controle",
        title: "Conserver un dossier facile à présenter",
        paragraphs: [
          "Séparez les papiers des passagers, les documents de la voiture et les pièces correspondant à votre démarche douanière. Un véhicule destiné aux vacances et une voiture achetée pour être importée ne suivent pas nécessairement la même procédure.",
          "Demandez au service compétent comment conserver et utiliser les documents remis à l'entrée. Si un élément du dossier est incompris, faites-le expliquer avant de poursuivre. Gardez une copie des références et des coordonnées utiles.",
        ],
      },
      {
        id: "suite",
        title: "Prévoir la première étape sur place",
        paragraphs: [
          "Téléchargez l'adresse de destination et les coordonnées de la personne qui vous attend. Prévoyez un moyen de contact utilisable même sans connexion mobile et une solution de repos si le voyage a été fatigant.",
          "Ajoutez au budget les dépenses plausibles après le port : carburant, repas, transfert ou hébergement. Ces postes varient selon votre destination ; notre calculateur les laisse à votre choix plutôt que d'afficher un tarif local non vérifié.",
        ],
      },
    ],
    sources: ["customs", "boarding"],
    related: ["voiture-vacances-admission-temporaire", "voyage-algerie-voiture-checklist"],
    faq: [
      {
        q: "Combien de temps faut-il pour sortir du port ?",
        a: "Le délai dépend du départ, des opérations portuaires et des contrôles. BledWay ne fournit pas de durée garantie.",
      },
      {
        q: "Qui confirme les formalités du véhicule ?",
        a: "Les douanes et les autorités compétentes pour votre régime ; le transporteur confirme les conditions de traversée.",
      },
    ],
    tool: "budget-voyage",
  },
  {
    slug: "covoiturage-avant-ferry",
    topic: "route",
    title: "Covoiturage avant un ferry : choisir le rendez-vous et partager les frais",
    description:
      "Organiser un rendez-vous utile sur la route d'un port, vérifier les bagages et calculer un partage clair du carburant et des péages.",
    answer:
      "Choisissez un point autorisé, accessible dans votre sens de circulation, puis fixez l'heure limite et le terminal final. Mettez par écrit le partage des frais, le nombre de bagages et le plan en cas de retard.",
    sections: [
      {
        id: "point",
        title: "Une aire utile plutôt qu'une aire célèbre",
        paragraphs: [
          "Il n'existe pas dans ce dossier de classement de popularité mesuré. Nous avons retenu des lieux documentés sur des axes pouvant servir à rejoindre les ports : Grans–Salon sur l'A54, Avignon Nord sur l'A7, Gallargues sur l'A9 et une aire référencée à Narbonne.",
          "Leur intérêt dépend du trajet. Avant de choisir, vérifiez l'accès exact et les règles du gestionnaire. Une aire de covoiturage n'est pas automatiquement adaptée à un stationnement de plusieurs semaines pendant un séjour en Algérie.",
        ],
      },
      {
        id: "accord",
        title: "Un accord simple avant le rendez-vous",
        paragraphs: [
          "Confirmez le nombre de personnes, le volume des valises et la destination précise. Le conducteur doit connaître la marge nécessaire pour le ferry ; les passagers doivent savoir si la dépose se fait au terminal ou à un autre point.",
        ],
        bullets: [
          "Partager un point de rendez-vous précis et vérifier sa localisation ensemble.",
          "Fixer une heure de départ maximale, pas seulement une heure de rencontre.",
          "Confirmer les sièges, ceintures, bagages et équipements nécessaires.",
          "Prévoir une solution alternative si le covoiturage ne permet plus d'arriver à temps.",
          "Choisir les frais à partager et préciser si le conducteur est inclus dans le calcul.",
        ],
      },
      {
        id: "frais",
        title: "Calculer et expliquer le montant",
        paragraphs: [
          "Notre outil divise carburant, péages et parking saisis par le nombre d'occupants, conducteur compris. Il ne facture pas de trajet, ne met pas en relation et n'intègre pas le billet de ferry. Si vous utilisez une plateforme, ses conditions et ses frais restent distincts.",
          "Pour un voyage entre proches, ce calcul facilite un accord lisible. Pour toute autre organisation, vérifiez les règles applicables à votre situation. N'affichez pas un tarif comme une offre de transport commercial si vous partagez seulement les dépenses d'un déplacement.",
        ],
      },
    ],
    sources: ["national", "grans", "avignon", "gallargues", "narbonne"],
    related: ["embarquement-marseille-algerie", "embarquement-sete-algerie"],
    faq: [
      {
        q: "Ces aires sont-elles les plus fréquentées ?",
        a: "BledWay ne dispose pas d'un classement de fréquentation. La sélection repose sur des sources publiques et l'utilité possible sur les axes vers les ports.",
      },
      {
        q: "Peut-on y laisser sa voiture pendant les vacances ?",
        a: "Il faut vérifier les règles et la durée autorisée auprès du gestionnaire. La présence d'une aire ne garantit pas le stationnement longue durée.",
      },
    ],
    tool: "partage-frais",
  },
];
