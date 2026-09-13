// Pré-sélection des grands ports (Algérie + façade méditerranéenne européenne).
// Coordonnées GPS réelles des zones portuaires : elles ne doivent pas être ajustées
// pour un souci d'affichage.
export interface PortPreset {
  name: string;
  city: string;
  country_code: string;
  latitude: number;
  longitude: number;
}

export const portPresets: PortPreset[] = [
  // Algérie
  { name: "Alger", city: "Alger", country_code: "DZ", latitude: 36.77, longitude: 3.06 },
  { name: "Oran", city: "Oran", country_code: "DZ", latitude: 35.71, longitude: -0.64 },
  { name: "Béjaïa", city: "Béjaïa", country_code: "DZ", latitude: 36.75, longitude: 5.09 },
  { name: "Skikda", city: "Skikda", country_code: "DZ", latitude: 36.88, longitude: 6.91 },
  { name: "Annaba", city: "Annaba", country_code: "DZ", latitude: 36.9, longitude: 7.77 },
  { name: "Ghazaouet", city: "Ghazaouet", country_code: "DZ", latitude: 35.1, longitude: -1.86 },
  { name: "Mostaganem", city: "Mostaganem", country_code: "DZ", latitude: 35.94, longitude: 0.08 },
  { name: "Djen Djen", city: "Jijel", country_code: "DZ", latitude: 36.83, longitude: 5.88 },
  { name: "Ténès", city: "Ténès", country_code: "DZ", latitude: 36.52, longitude: 1.3 },
  { name: "Arzew", city: "Arzew", country_code: "DZ", latitude: 35.85, longitude: -0.31 },
  // France
  { name: "Marseille", city: "Marseille", country_code: "FR", latitude: 43.3, longitude: 5.36 },
  { name: "Sète", city: "Sète", country_code: "FR", latitude: 43.4, longitude: 3.7 },
  { name: "Toulon", city: "Toulon", country_code: "FR", latitude: 43.12, longitude: 5.93 },
  { name: "Port-Vendres", city: "Port-Vendres", country_code: "FR", latitude: 42.52, longitude: 3.11 },
  // Espagne
  { name: "Barcelone", city: "Barcelone", country_code: "ES", latitude: 41.35, longitude: 2.17 },
  { name: "Tarragone", city: "Tarragone", country_code: "ES", latitude: 41.1, longitude: 1.22 },
  { name: "Valence", city: "Valence", country_code: "ES", latitude: 39.45, longitude: -0.32 },
  { name: "Alicante", city: "Alicante", country_code: "ES", latitude: 38.33, longitude: -0.49 },
  { name: "Almería", city: "Almería", country_code: "ES", latitude: 36.83, longitude: -2.47 },
  { name: "Málaga", city: "Málaga", country_code: "ES", latitude: 36.71, longitude: -4.42 },
  // Italie
  { name: "Gênes", city: "Gênes", country_code: "IT", latitude: 44.41, longitude: 8.93 },
  { name: "Livourne", city: "Livourne", country_code: "IT", latitude: 43.55, longitude: 10.3 },
  { name: "Civitavecchia", city: "Civitavecchia", country_code: "IT", latitude: 42.09, longitude: 11.78 },
  { name: "Naples", city: "Naples", country_code: "IT", latitude: 40.84, longitude: 14.26 },
  { name: "Salerne", city: "Salerne", country_code: "IT", latitude: 40.67, longitude: 14.75 },
  { name: "Palerme", city: "Palerme", country_code: "IT", latitude: 38.13, longitude: 13.36 },
  { name: "Trapani", city: "Trapani", country_code: "IT", latitude: 38.02, longitude: 12.51 },
  { name: "Cagliari", city: "Cagliari", country_code: "IT", latitude: 39.21, longitude: 9.11 },
  { name: "Bari", city: "Bari", country_code: "IT", latitude: 41.14, longitude: 16.87 },
  { name: "Venise", city: "Venise", country_code: "IT", latitude: 45.44, longitude: 12.32 },
  // Autres
  { name: "Lisbonne", city: "Lisbonne", country_code: "PT", latitude: 38.7, longitude: -9.14 },
  { name: "La Valette", city: "La Valette", country_code: "MT", latitude: 35.89, longitude: 14.51 },
  { name: "Le Pirée", city: "Athènes", country_code: "GR", latitude: 37.94, longitude: 23.63 },
  { name: "Istanbul", city: "Istanbul", country_code: "TR", latitude: 41.01, longitude: 28.98 },
  { name: "Tunis (La Goulette)", city: "Tunis", country_code: "TN", latitude: 36.82, longitude: 10.3 },
  { name: "Tanger Med", city: "Tanger", country_code: "MA", latitude: 35.89, longitude: -5.5 },
];
