/**
 * Une supposition, jamais une décision : d'après le prénom, « homme » ou « femme » est présélectionné
 * dans la question qui suit, et reste modifiable. Prénoms courants du Maghreb et de France ; pour
 * les autres, une règle de terminaison prudente, sinon rien.
 */
const MALE = new Set(
  `youssef yousef youcef yusuf mohamed mohammed mohamad muhammad ahmed ahmad hamid karim kamel kamal
  rachid rachide farid said saïd samir sofiane sofian yacine yassine ilyes ilyas elias amine mehdi
  nabil nassim nacer nasser omar ali hassan hocine hussein ismail ismaël bilal walid adel abdel
  abdelkader abdallah abdellah abderrahmane abdelaziz djamel jamel jamal mourad mounir malik redouane
  ridouane riad riyad salim sami slimane tarek tarik toufik tewfik yanis younes younès zakaria zinedine
  aziz brahim ibrahim khaled lounes lyes mustapha moustapha noureddine othmane rayan reda soufiane
  amar ayoub badr boualem fares fethi hakim idir kader lakhdar larbi mokhtar nadir rabah salah sofiane
  jean pierre paul louis lucas hugo thomas nicolas julien antoine alexandre maxime david michel philippe
  françois francois eric éric olivier laurent stéphane stephane sébastien sebastien christophe patrick
  marc luc théo theo nathan enzo léo leo gabriel raphaël raphael arthur jules adam noah mathis tom
  baptiste benjamin romain vincent guillaume florian kevin kévin anthony jérôme jerome frédéric frederic
  andré andre bernard alain daniel thierry pascal yves`.split(/\s+/),
);
const FEMALE = new Set(
  `anne fatima fatma malika sarah sara samira nadia leila leïla amina amira yasmine yasmina meriem
  myriam mériem nour nora noura karima rachida farida soraya souad sonia salima linda lina lila lilia
  hanane hana houria djamila jamila khadija kheira zohra zahra aïcha aicha asma imane iman ines inès
  kenza lamia latifa nawal naima naïma ouarda rania rym safia sabrina sihem siham wafa wassila zineb
  zina chahinez dounia hayat hind ikram lynda maya mélissa melissa nesrine selma sofia thiziri tinhinane
  marie sophie julie camille léa lea emma chloé chloe manon inès ines claire isabelle nathalie sandrine
  céline celine aurélie aurelie caroline catherine christine sylvie valérie valerie stéphanie stephanie
  laura pauline lucie juliette alice zoé zoe jade louise rose anna clara mathilde margaux charlotte
  élodie elodie émilie emilie hélène helene martine monique françoise francoise agnès agnes`.split(/\s+/),
);

export function genderFromName(name: string): "m" | "f" | null {
  const first = name
    .trim()
    .toLowerCase()
    .split(/[\s-]+/)[0];
  if (!first || first.length < 2) return null;
  if (MALE.has(first)) return "m";
  if (FEMALE.has(first)) return "f";
  // Terminaisons très féminines (Yasmina, Ophélie, Mélanie) ; le reste n'est pas deviné.
  if (/(ina|ia|ette|elle|ine|ie)$/.test(first)) return "f";
  return null;
}
