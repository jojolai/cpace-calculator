import { EligibilityCategory, PaceEligibility } from '@/types';

// CPACE eligibility criteria based on standard measures
export const PACE_ELIGIBILITY: Record<EligibilityCategory, PaceEligibility> = {
  hvac: {
    category: 'hvac',
    percentage: 1.0,
    description: 'HVAC systems including heating, ventilation, air conditioning, chillers, boilers',
  },
  solar_renewable: {
    category: 'solar_renewable',
    percentage: 1.0,
    description: 'Solar panels, wind turbines, geothermal systems, renewable energy installations',
  },
  lighting: {
    category: 'lighting',
    percentage: 1.0,
    description: 'LED lighting, lighting controls, energy-efficient lighting retrofits',
  },
  building_envelope: {
    category: 'building_envelope',
    percentage: 1.0,
    description: 'Insulation, windows, roofing, doors, air sealing, building shell improvements',
  },
  water_efficiency: {
    category: 'water_efficiency',
    percentage: 1.0,
    description: 'Low-flow fixtures, water recycling systems, efficient irrigation, water heaters',
  },
  ev_charging: {
    category: 'ev_charging',
    percentage: 1.0,
    description: 'Electric vehicle charging stations and infrastructure',
  },
  energy_storage: {
    category: 'energy_storage',
    percentage: 1.0,
    description: 'Battery storage systems, thermal storage',
  },
  electrical: {
    category: 'electrical',
    percentage: 0.5,
    description: 'General electrical work (partially eligible if supporting energy efficiency)',
  },
  plumbing: {
    category: 'plumbing',
    percentage: 0.75,
    description: 'Plumbing work (eligible if water-efficient fixtures or systems)',
  },
  not_eligible: {
    category: 'not_eligible',
    percentage: 0,
    description: 'Not eligible for PACE financing',
  },
};

// Keywords for classification - order matters for priority
export const CATEGORY_KEYWORDS: Record<EligibilityCategory, string[]> = {
  hvac: [
    'hvac', 'heating', 'ventilation', 'air conditioning', 'ac unit', 'a/c',
    'furnace', 'boiler', 'chiller', 'heat pump', 'ductwork', 'thermostat',
    'vrf', 'rtu', 'ahu', 'air handler', 'condenser', 'compressor', 'cooling tower',
    'mini-split', 'minisplit', 'package unit', 'split system', 'mechanical',
  ],
  solar_renewable: [
    'solar', 'photovoltaic', 'pv system', 'pv array', 'inverter', 'renewable',
    'wind turbine', 'geothermal', 'ground source',
  ],
  lighting: [
    'lighting', 'led', 'light fixture', 'lamp', 'luminaire',
    'occupancy sensor', 'daylight sensor', 'dimmer', 'ballast',
  ],
  building_envelope: [
    'insulation', 'window', 'glazing', 'roofing', 'roof membrane', 'door',
    'weatherization', 'air seal', 'envelope', 'cladding', 'facade',
    'skylight', 'curtain wall', 'thermal barrier', 'r-value', 'waterproofing',
  ],
  water_efficiency: [
    'low-flow', 'water recycl', 'water reclaim', 'greywater', 'rainwater',
    'efficient irrigation', 'drip irrigation',
  ],
  ev_charging: [
    'ev charging', 'electric vehicle charging', 'charging station', 'evse',
    'level 2 charger', 'dc fast charg',
  ],
  energy_storage: [
    'battery storage', 'energy storage', 'powerwall', 'backup battery',
    'thermal storage', 'ice storage',
  ],
  electrical: [
    'electrical', 'wiring', 'electrical panel', 'circuit breaker', 'transformer',
    'switchgear', 'electrical distribution',
  ],
  plumbing: [
    'plumbing', 'domestic water', 'sanitary', 'sewer', 'water pipe',
  ],
  not_eligible: [
    'furniture', 'carpet', 'paint', 'cosmetic', 'landscaping', 'signage',
    'appliance', 'kitchen', 'elevator', 'escalator', 'security', 'fire alarm',
    'fire sprinkler', 'maintenance', 'repair', 'cleaning', 'demolition',
    'general conditions', 'general requirements', 'fee', 'overhead', 'profit',
    'permit', 'insurance', 'bond', 'contingency', 'concrete', 'masonry',
    'structural steel', 'framing', 'drywall', 'flooring', 'tile', 'countertop',
    'cabinet', 'millwork', 'specialties', 'equipment', 'conveying',
  ],
};

// Exclusion rules - if these are found, don't match certain categories
const EXCLUSION_RULES: Record<string, EligibilityCategory[]> = {
  'elevator': ['ev_charging'], // "elevator" should not match EV charging
  'conveying': ['ev_charging'],
  'fireproof': ['building_envelope'], // fireproofing is code requirement, not energy efficiency
  'fire': ['building_envelope'],
  'fixture': ['building_envelope'], // "fixtures" alone is too generic
};

export function classifyLineItem(description: string): {
  category: EligibilityCategory;
  confidence: number;
} {
  const lowerDesc = description.toLowerCase();

  // First, check for explicit not_eligible items
  for (const keyword of CATEGORY_KEYWORDS.not_eligible) {
    if (lowerDesc.includes(keyword.toLowerCase())) {
      // Strong match for not_eligible
      if (keyword.length >= 6) {
        return { category: 'not_eligible', confidence: 0.9 };
      }
    }
  }

  // Build exclusion list based on description
  const excludedCategories = new Set<EligibilityCategory>();
  for (const [trigger, categories] of Object.entries(EXCLUSION_RULES)) {
    if (lowerDesc.includes(trigger)) {
      categories.forEach(cat => excludedCategories.add(cat));
    }
  }

  let bestCategory: EligibilityCategory = 'not_eligible';
  let bestScore = 0;

  // Check categories in priority order (more specific first)
  const categoryOrder: EligibilityCategory[] = [
    'ev_charging', 'solar_renewable', 'energy_storage', // Most specific
    'hvac', 'lighting', 'water_efficiency', // Specific systems
    'building_envelope', // Building components
    'electrical', 'plumbing', // Partial eligibility
  ];

  for (const category of categoryOrder) {
    if (excludedCategories.has(category)) continue;

    const keywords = CATEGORY_KEYWORDS[category];
    let score = 0;

    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword.toLowerCase())) {
        // Longer keyword matches are more specific and get higher scores
        score += keyword.length * 2;

        // Bonus for exact word boundary matches
        const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(description)) {
          score += keyword.length;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  // Calculate confidence based on match strength
  const confidence = bestScore > 0 ? Math.min(bestScore / 30, 1) : 0;

  return {
    category: bestCategory,
    confidence,
  };
}

export function getEligibilityInfo(category: EligibilityCategory): PaceEligibility {
  return PACE_ELIGIBILITY[category];
}

export function calculateEligibleAmount(amount: number, category: EligibilityCategory): number {
  const eligibility = PACE_ELIGIBILITY[category];
  return amount * eligibility.percentage;
}
