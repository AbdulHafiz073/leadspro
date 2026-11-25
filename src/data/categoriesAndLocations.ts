export type CategoryGroup = 'Website' | 'App' | 'Game' | 'Software';

export const WEBSITE_CATEGORIES = [
  'E-commerce Websites',
  'Business Websites',
  'Corporate Websites',
  'Portfolio Websites',
  'Real Estate Websites',
  'Healthcare Websites',
  'Educational Websites',
  'Restaurant Websites',
  'Travel and Tourism Websites',
  'Fintech Websites',
  'News and Media Websites',
  'Agency Websites',
  'Outdated Websites',
  'Broken or Non-Functional Websites',
  'Businesses Without Websites',
] as const;

export const APP_CATEGORIES = [
  'Android App Development',
  'iOS App Development',
  'Cross-Platform Mobile App Development',
  'E-commerce Apps',
  'Healthcare Apps',
  'Education Apps',
  'Finance Apps',
  'Food Delivery Apps',
  'Business Apps',
  'Fitness Apps',
  'Travel Apps',
  'Social Networking Apps',
] as const;

export const GAME_CATEGORIES = [
  'Mobile Game Development',
  'Android Games',
  'iOS Games',
  'PC Games',
  'Console Games',
  'Browser Games',
  'Multiplayer Games',
  'Unity Game Development',
  'Unreal Engine Game Development',
  'Gaming Studios',
  'Game Development Companies',
] as const;

export const SOFTWARE_CATEGORIES = [
  'MLM Software Development (Binary, Unilevel, Matrix, Hybrid)',
  'Custom Software Development',
  'CRM and ERP Development',
  'SaaS Platform Development',
  'AI-Based Software and Automation',
  'Web Portal and Dashboard Development',
  'API Development and Integration',
  'Existing Software Maintenance and Upgrades',
  'UI/UX Redesign and Development',
] as const;

export const IT_BUYER_SERVICES = [
  'Website Development',
  'Website Redesign and Modernization',
  'E-commerce Website Development',
  'Android Application Development',
  'iOS Application Development',
  'Cross-Platform Mobile App Development',
  'Game Development (2D, 3D, Unity, Unreal Engine)',
  'MLM Software Development (Binary, Unilevel, Matrix, Hybrid)',
  'Custom Software Development',
  'CRM and ERP Development',
  'SaaS Platform Development',
  'AI-Based Software and Automation',
  'Web Portal and Dashboard Development',
  'API Development and Integration',
  'Existing Software Maintenance and Upgrades',
  'UI/UX Redesign and Development',
] as const;

export const SERVICE_REQUIREMENTS = [
  ...IT_BUYER_SERVICES,
  'New Website Development',
  'Website Redesign',
  'Mobile App Development',
  'Website Maintenance',
  'UI/UX Design',
  'MLM Website Development',
] as const;

export const ALL_CATEGORIES: string[] = [
  ...WEBSITE_CATEGORIES,
  ...APP_CATEGORIES,
  ...GAME_CATEGORIES,
  ...SOFTWARE_CATEGORIES,
];

export function getCategoryGroup(category: string): CategoryGroup {
  const lower = (category || '').toLowerCase();
  if (GAME_CATEGORIES.some((c) => c.toLowerCase() === lower) || lower.includes('game') || lower.includes('gaming studio')) {
    return 'Game';
  }
  if (
    SOFTWARE_CATEGORIES.some((c) => c.toLowerCase() === lower) ||
    lower.includes('mlm') ||
    lower.includes('crm') ||
    lower.includes('erp') ||
    lower.includes('saas') ||
    lower.includes('custom software') ||
    lower.includes('ai-based') ||
    lower.includes('portal') ||
    lower.includes('api') ||
    lower.includes('maintenance') ||
    lower.includes('ui/ux')
  ) {
    return 'Software';
  }
  if (APP_CATEGORIES.some((c) => c.toLowerCase() === lower) || lower.includes('app')) {
    return 'App';
  }
  return 'Website';
}

export interface CityLocationEntry {
  name: string;
  region?: string;
  samplePostalCode?: string;
}

export interface StateLocationEntry {
  name: string;
  cities: CityLocationEntry[];
}

export interface CountryLocationEntry {
  id: number;
  name: string;
  code: string;
  flag: string;
  states: StateLocationEntry[];
}

export const LOCATION_HIERARCHY: CountryLocationEntry[] = [
  {
    id: 2,
    name: 'United States',
    code: 'US',
    flag: '🇺🇸',
    states: [
      {
        name: 'New York',
        cities: [
          { name: 'New York', region: 'Northeast', samplePostalCode: '10001' },
          { name: 'Brooklyn', region: 'Northeast', samplePostalCode: '11201' },
          { name: 'Buffalo', region: 'Northeast', samplePostalCode: '14202' },
        ],
      },
      {
        name: 'California',
        cities: [
          { name: 'Los Angeles', region: 'West Coast', samplePostalCode: '90001' },
          { name: 'San Francisco', region: 'West Coast', samplePostalCode: '94102' },
          { name: 'San Diego', region: 'West Coast', samplePostalCode: '92101' },
        ],
      },
      {
        name: 'Texas',
        cities: [
          { name: 'Austin', region: 'South Central', samplePostalCode: '78701' },
          { name: 'Houston', region: 'South Central', samplePostalCode: '77001' },
          { name: 'Dallas', region: 'South Central', samplePostalCode: '75201' },
        ],
      },
      {
        name: 'Illinois',
        cities: [{ name: 'Chicago', region: 'Midwest', samplePostalCode: '60601' }],
      },
      {
        name: 'Florida',
        cities: [{ name: 'Miami', region: 'Southeast', samplePostalCode: '33101' }],
      },
    ],
  },
  {
    id: 3,
    name: 'United Kingdom',
    code: 'GB',
    flag: '🇬🇧',
    states: [
      {
        name: 'England',
        cities: [
          { name: 'London', region: 'Greater London', samplePostalCode: 'EC1A 1BB' },
          { name: 'Manchester', region: 'North West', samplePostalCode: 'M1 1AE' },
          { name: 'Birmingham', region: 'West Midlands', samplePostalCode: 'B1 1AA' },
          { name: 'Bristol', region: 'South West', samplePostalCode: 'BS1 4DJ' },
        ],
      },
      {
        name: 'Scotland',
        cities: [
          { name: 'Edinburgh', region: 'Scotland', samplePostalCode: 'EH1 1YZ' },
          { name: 'Glasgow', region: 'Scotland', samplePostalCode: 'G1 1XQ' },
        ],
      },
    ],
  },
  {
    id: 1,
    name: 'India',
    code: 'IN',
    flag: '🇮🇳',
    states: [
      {
        name: 'Maharashtra',
        cities: [
          { name: 'Mumbai', region: 'West India', samplePostalCode: '400001' },
          { name: 'Pune', region: 'West India', samplePostalCode: '411001' },
        ],
      },
      {
        name: 'Karnataka',
        cities: [{ name: 'Bengaluru', region: 'South India', samplePostalCode: '560001' }],
      },
      {
        name: 'Delhi NCR',
        cities: [
          { name: 'New Delhi', region: 'North India', samplePostalCode: '110001' },
          { name: 'Gurugram', region: 'North India', samplePostalCode: '122001' },
          { name: 'Noida', region: 'North India', samplePostalCode: '201301' },
        ],
      },
      {
        name: 'Telangana',
        cities: [{ name: 'Hyderabad', region: 'South India', samplePostalCode: '500001' }],
      },
      {
        name: 'Tamil Nadu',
        cities: [{ name: 'Chennai', region: 'South India', samplePostalCode: '600001' }],
      },
      {
        name: 'Gujarat',
        cities: [{ name: 'Ahmedabad', region: 'West India', samplePostalCode: '380001' }],
      },
    ],
  },
  {
    id: 5,
    name: 'Canada',
    code: 'CA',
    flag: '🇨🇦',
    states: [
      {
        name: 'Ontario',
        cities: [
          { name: 'Toronto', region: 'Central Canada', samplePostalCode: 'M5H 2N2' },
          { name: 'Ottawa', region: 'Central Canada', samplePostalCode: 'K1P 1J1' },
        ],
      },
      {
        name: 'British Columbia',
        cities: [{ name: 'Vancouver', region: 'West Coast', samplePostalCode: 'V6B 1A1' }],
      },
      {
        name: 'Quebec',
        cities: [{ name: 'Montreal', region: 'East Canada', samplePostalCode: 'H2Y 1C6' }],
      },
    ],
  },
  {
    id: 6,
    name: 'Australia',
    code: 'AU',
    flag: '🇦🇺',
    states: [
      {
        name: 'New South Wales',
        cities: [{ name: 'Sydney', region: 'East Coast', samplePostalCode: '2000' }],
      },
      {
        name: 'Victoria',
        cities: [{ name: 'Melbourne', region: 'Southeast', samplePostalCode: '3000' }],
      },
      {
        name: 'Queensland',
        cities: [{ name: 'Brisbane', region: 'Northeast', samplePostalCode: '4000' }],
      },
    ],
  },
  {
    id: 4,
    name: 'United Arab Emirates',
    code: 'AE',
    flag: '🇦🇪',
    states: [
      {
        name: 'Dubai',
        cities: [{ name: 'Dubai', region: 'Middle East', samplePostalCode: '00000' }],
      },
      {
        name: 'Abu Dhabi',
        cities: [{ name: 'Abu Dhabi', region: 'Middle East', samplePostalCode: '00000' }],
      },
    ],
  },
  {
    id: 7,
    name: 'Germany',
    code: 'DE',
    flag: '🇩🇪',
    states: [
      {
        name: 'Berlin',
        cities: [{ name: 'Berlin', region: 'Central Europe', samplePostalCode: '10115' }],
      },
      {
        name: 'Bavaria',
        cities: [{ name: 'Munich', region: 'South Germany', samplePostalCode: '80331' }],
      },
    ],
  },
  {
    id: 8,
    name: 'Singapore',
    code: 'SG',
    flag: '🇸🇬',
    states: [
      {
        name: 'Central Region',
        cities: [{ name: 'Singapore', region: 'Southeast Asia', samplePostalCode: '018956' }],
      },
    ],
  },
  {
    id: 9,
    name: 'Saudi Arabia',
    code: 'SA',
    flag: '🇸🇦',
    states: [
      {
        name: 'Riyadh',
        cities: [{ name: 'Riyadh', region: 'Middle East', samplePostalCode: '11564' }],
      },
      {
        name: 'Makkah',
        cities: [{ name: 'Jeddah', region: 'Middle East', samplePostalCode: '21442' }],
      },
    ],
  },
  {
    id: 10,
    name: 'France',
    code: 'FR',
    flag: '🇫🇷',
    states: [
      {
        name: 'Île-de-France',
        cities: [{ name: 'Paris', region: 'Western Europe', samplePostalCode: '75001' }],
      },
      {
        name: 'Auvergne-Rhône-Alpes',
        cities: [{ name: 'Lyon', region: 'Eastern France', samplePostalCode: '69001' }],
      },
    ],
  },
];
