export type ServiceModeId = 'mode_update' | 'mode_new';
export type ProductCategoryId = 'cat_website' | 'cat_app' | 'cat_game' | 'cat_software';
export type FinalDecisionId = 'confirm_yes' | 'confirm_no';

export interface ChatbotStepOption {
  id: string;
  label: string;
  shortTitle: string; // <= 24 chars for Meta WhatsApp List / <= 20 chars for Buttons
  description: string;
}

export const SERVICE_MODES: Array<{
  id: ServiceModeId;
  label: 'Update Existing' | 'New Create';
  shortTitle: string;
  description: string;
}> = [
  {
    id: 'mode_update',
    label: 'Update Existing',
    shortTitle: 'Update Existing',
    description: 'Purani Website, App, Game ya Software ko update / redesign karwana hai',
  },
  {
    id: 'mode_new',
    label: 'New Create',
    shortTitle: 'New Create',
    description: 'Bilkul naya Website, App, Game ya Software banwana hai',
  },
];

export const PRODUCT_CATEGORIES: Array<{
  id: ProductCategoryId;
  label: 'Website' | 'Mobile App' | 'Game' | 'Custom Software';
  shortTitle: string;
  description: string;
}> = [
  {
    id: 'cat_website',
    label: 'Website',
    shortTitle: 'Website',
    description: 'Business, E-Commerce, Portfolio, Landing Page, Redesign',
  },
  {
    id: 'cat_app',
    label: 'Mobile App',
    shortTitle: 'Mobile App',
    description: 'Android, iOS, Hybrid, Delivery, Booking & CRM App',
  },
  {
    id: 'cat_game',
    label: 'Game',
    shortTitle: 'Game',
    description: '2D, 3D, Multiplayer, HTML5 Web & Educational Game',
  },
  {
    id: 'cat_software',
    label: 'Custom Software',
    shortTitle: 'Custom Software',
    description: 'Billing/POS, CRM, School/Hospital ERP, HRM & SaaS',
  },
];

export const CATEGORY_SUBTYPES: Record<ProductCategoryId, ChatbotStepOption[]> = {
  cat_website: [
    {
      id: 'sub_web_business',
      label: 'Business / Corporate Website',
      shortTitle: 'Business Website',
      description: 'Company profile, services & Google lead capture site',
    },
    {
      id: 'sub_web_ecom',
      label: 'E-Commerce Online Store',
      shortTitle: 'E-Commerce Store',
      description: 'Online shopping store with cart, payment & orders',
    },
    {
      id: 'sub_web_booking',
      label: 'Portfolio / Clinic / Booking Site',
      shortTitle: 'Booking / Portfolio',
      description: 'Appointments, gallery, doctor/salon/hotel booking',
    },
    {
      id: 'sub_web_portal',
      label: 'Landing Page / Custom Web Portal',
      shortTitle: 'Web Portal / Landing',
      description: 'High-converting sales page or customer dashboard',
    },
    {
      id: 'sub_web_redesign',
      label: 'SEO / Speed / UI Redesign & Fix',
      shortTitle: 'UI Redesign & SEO',
      description: 'Purani website ko fast, mobile-ready & modern banana',
    },
  ],
  cat_app: [
    {
      id: 'sub_app_android',
      label: 'Android Mobile App',
      shortTitle: 'Android App',
      description: 'Native Play Store Android application',
    },
    {
      id: 'sub_app_ios',
      label: 'iOS (iPhone) Mobile App',
      shortTitle: 'iOS iPhone App',
      description: 'Apple App Store iPhone / iPad application',
    },
    {
      id: 'sub_app_both',
      label: 'Android + iOS Both Apps',
      shortTitle: 'Android + iOS Apps',
      description: 'Cross-platform mobile app for both stores',
    },
    {
      id: 'sub_app_ecom',
      label: 'Delivery / E-Commerce / Booking App',
      shortTitle: 'Delivery / Booking App',
      description: 'Live order tracking, bookings & online payments',
    },
    {
      id: 'sub_app_crm',
      label: 'Business CRM / Chat / Utility App',
      shortTitle: 'Business / CRM App',
      description: 'Staff tracking, customer support & billing app',
    },
  ],
  cat_game: [
    {
      id: 'sub_game_2d',
      label: '2D Casual / Puzzle Game',
      shortTitle: '2D Casual Game',
      description: 'Arcade, runner, puzzle or brain game',
    },
    {
      id: 'sub_game_3d',
      label: '3D Action / Racing Game',
      shortTitle: '3D Action / Racing',
      description: 'Unity / Unreal 3D mobile & PC game',
    },
    {
      id: 'sub_game_multi',
      label: 'Multiplayer / Ludo / Card Game',
      shortTitle: 'Multiplayer Game',
      description: 'Real-time online multiplayer rooms & leaderboard',
    },
    {
      id: 'sub_game_web',
      label: 'HTML5 / Browser Web Game',
      shortTitle: 'HTML5 Web Game',
      description: 'Instant playable browser & promotional brand game',
    },
    {
      id: 'sub_game_kids',
      label: 'Educational / Kids Learning Game',
      shortTitle: 'Kids / Learning Game',
      description: 'Interactive quiz & learning game',
    },
  ],
  cat_software: [
    {
      id: 'sub_soft_billing',
      label: 'Billing / POS / Inventory Software',
      shortTitle: 'Billing / POS Software',
      description: 'GST invoicing, stock, barcode & retail POS',
    },
    {
      id: 'sub_soft_crm',
      label: 'CRM / Lead & Sales Management',
      shortTitle: 'CRM Sales Software',
      description: 'Follow-ups, WhatsApp/Email pipeline & team tracking',
    },
    {
      id: 'sub_soft_erp',
      label: 'School / Hospital / Clinic ERP',
      shortTitle: 'School / Clinic ERP',
      description: 'Fees, patients, records & admin portal',
    },
    {
      id: 'sub_soft_hrm',
      label: 'HRM / Payroll / Attendance Software',
      shortTitle: 'HRM / Payroll System',
      description: 'Employee shifts, salary slips & attendance',
    },
    {
      id: 'sub_soft_saas',
      label: 'Custom SaaS / Automation Dashboard',
      shortTitle: 'Custom SaaS Software',
      description: 'Tailor-made cloud software & workflow automation',
    },
  ],
};

export const FINAL_CONFIRM_OPTIONS: Array<{
  id: FinalDecisionId;
  decision: 'YES' | 'NO';
  label: string;
  shortTitle: string;
}> = [
  {
    id: 'confirm_yes',
    decision: 'YES',
    label: 'YES — Confirm & Send to Team',
    shortTitle: 'YES',
  },
  {
    id: 'confirm_no',
    decision: 'NO',
    label: 'NO — Not Interested Now',
    shortTitle: 'NO',
  },
];

export function matchServiceMode(input: string): (typeof SERVICE_MODES)[number] | null {
  const norm = String(input || '').trim().toLowerCase();
  if (!norm) return null;
  if (norm === 'mode_update' || norm === '1' || /update|redesign|revamp|purana/.test(norm)) {
    return SERVICE_MODES[0];
  }
  if (norm === 'mode_new' || norm === '2' || /new|create|banwana|naya/.test(norm)) {
    return SERVICE_MODES[1];
  }
  return null;
}

export function matchProductCategory(input: string): (typeof PRODUCT_CATEGORIES)[number] | null {
  const norm = String(input || '').trim().toLowerCase();
  if (!norm) return null;
  if (norm === 'cat_website' || /website|web|site/.test(norm)) {
    return PRODUCT_CATEGORIES[0];
  }
  if (norm === 'cat_app' || /\bapp\b|mobile app|android|ios/.test(norm)) {
    return PRODUCT_CATEGORIES[1];
  }
  if (norm === 'cat_game' || /game|gaming|ludo/.test(norm)) {
    return PRODUCT_CATEGORIES[2];
  }
  if (norm === 'cat_software' || /software|erp|crm|pos|saas|billing/.test(norm)) {
    return PRODUCT_CATEGORIES[3];
  }
  return null;
}

export function matchSubType(
  categoryId: ProductCategoryId | null,
  input: string
): ChatbotStepOption | null {
  const norm = String(input || '').trim().toLowerCase();
  if (!norm) return null;
  const pools = categoryId ? [CATEGORY_SUBTYPES[categoryId]] : Object.values(CATEGORY_SUBTYPES);
  for (const list of pools) {
    const exact = list.find(
      (item) =>
        item.id.toLowerCase() === norm ||
        item.label.toLowerCase() === norm ||
        item.shortTitle.toLowerCase() === norm
    );
    if (exact) return exact;
  }
  for (const list of pools) {
    const partial = list.find(
      (item) =>
        norm.includes(item.shortTitle.toLowerCase()) ||
        item.label.toLowerCase().includes(norm)
    );
    if (partial) return partial;
  }
  return null;
}

export function matchFinalDecision(input: string): 'YES' | 'NO' | null {
  const norm = String(input || '').trim().toLowerCase();
  if (!norm) return null;
  if (norm === 'confirm_yes' || norm === 'yes' || norm.startsWith('yes ') || /\byes\b|confirm|haan|ha\b/.test(norm)) {
    return 'YES';
  }
  if (norm === 'confirm_no' || norm === 'no' || norm.startsWith('no ') || /\bno\b|nahi|not now|cancel/.test(norm)) {
    return 'NO';
  }
  return null;
}
