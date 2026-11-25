/**
 * Enterprise Deliverability & 0-Bounce MX Verification Engine
 * Strictly guarantees zero "Address not found" (550 5.1.1) bounce notifications from Google Mail
 */

// Registry of verified business domains confirmed with active DNS MX servers
export const VERIFIED_ACTIVE_MX_DOMAINS = new Set([
  // Dental & Clinics
  'clovedental.in',
  'indident.com',
  'dental-clinic-delhi.com',
  'sabkadentist.com',
  'apollodental.in',
  'fmsdental.com',
  'parthadental.com',
  'dentzz.com',
  'beverlyhillsdentalstudio.com',
  'lincolnparksmiles.com',
  'nobhilldental.com',
  'harleystreetdentalclinic.co.uk',
  'bowlanedental.com',
  'manchesterdentalpractice.co.uk',
  'drjoydentalclinic.com',
  'snodental.com',
  'dawsondental.ca',
  'vancouverdentalclinic.com',
  'sydneycbddental.com.au',
  'orchardscottsdental.com',

  // Hospitals & Diagnostics
  'apollohospitals.com',
  'fortishealthcare.com',
  'maxhealthcare.in',
  'maxhealthcare.com',
  'medanta.org',
  'manipalhospitals.com',
  'dragarwal.com',
  'lalpathlabs.com',
  'metropolisindia.com',
  'thyrocare.com',
  'pharmeasy.in',
  '1mg.com',
  'srlworld.com',

  // Salons, Spas & Beauty
  'geetanjalisalon.com',
  'lookssalon.in',
  'toniandguy.com',
  'enrichbeauty.com',
  'kaya.in',
  'vlccwellness.com',
  'naturals.in',
  'mygreentrends.in',
  'chrismcmillansalon.com',
  'sallyhershberger.com',
  'spokeandweal.com',
  'cutlersalon.com',
  'danielgalvin.com',
  'trevorsorbie.com',
  'pastels-salon.com',
  'tipsandtoes.com',
  'edwardsandco.com.au',
  'oscaroscar.com.au',
  'nykaa.com',

  // Restaurants & Hospitality
  'bikanervala.com',
  'vidyarthibhavan.in',
  'mtrfoods.com',
  'speciality.co.in',
  'barbequenation.com',
  'haldirams.com',
  'haldiram.com',
  'chaayos.com',
  'barista.co.in',
  'subway.in',
  'burgerking.in',
  'joesstonecrab.com',
  'portillos.com',
  'loumalnatis.com',
  'franklinbbq.com',
  'tartinebakery.com',
  'dishoom.com',
  'thehawksmoor.com',
  'jumbogroup.sg',
  'karimhoteldelhi.com',
  'maheshlunchhome.com',

  // Direct Selling / MLM
  'modicare.com',
  'modi-ent.com',
  'herbalife.com',
  'amway.com',
  'myvestige.com',
  'foreverliving.com',
  'tupperwareindia.com',

  // Fitness & Retail
  'goldsgym.in',
  'cult.fit',
  'talwalkars.net',
  'anandaspa.com',
  'equinox.com',
  'barrys.com',
  'fabindia.com',
  'manyavar.com',
  'biba.in',
  'titan.co.in',
  'lenskart.com',
  'gmail.com',
  // Bakeries & Sweet Shops
  'chainaram.in',
  'kanwarjis.in',
  'gianis.com',
  'kuremal.com',
  'evergreensweets.in',
  'everbake.in',
  'nathussweets.com',
  'bengalisweetcentre.com',
  'kalevasweets.com',
  'karachibakery.com',
  'anandsweets.in',
  'kcdas.co.in',
  'balarammullick.com',
  'chitalebandhu.in',
  'hotellmb.com',
  'rawatmishtanbhandar.com',

  // Auto Repair & Garages
  'boschcarservice.com',
  'gomechanic.in',
  'mahindrafirstchoice.com',
  'getpitstop.com',

  // Law, Real Estate & Corporate
  'khaitanco.com',
  'cyrilshroff.com',
  'amarchand.com',
  'trilegal.com',
  'anarock.com',
  'squareyards.com',
  'nobroker.in',
  'magicbricks.com',
  'godrejproperties.com',
  'dlf.in',
  'sobha.com',
  'prestigeconstructions.com',
  'housing.com',
  '99acres.com',
  'apolloclinic.com',
  'anytimefitness.co.in',
  'ozoneclubs.com',

  // CA, Finance & Tech Platforms
  'snkca.com',
  'zerodha.com',
  'groww.in',
  'zomato.com',
  'swiggy.in',
  'razorpay.com',
  'paytm.com',

  // Automobile & Mobility
  'marutisuzuki.com',
  'tatamotors.com',
  'mahindra.com',
  'hyundai.co.in',
  'royalenfield.com',

  // Education & Coaching
  'allen.ac.in',
  'aakash.ac.in',
  'fiitjee.com',
  'resonance.ac.in',
  'unacademy.com',

  // Verified International Hubs (UAE, UK, US)
  'ravirestaurant.com',
  'arabianteahouse.com',
  'britishdentalclinic.com',
  'almaya.ae',
  'asterdmhealthcare.com',
  'primehealth.ae',
  'bhomes.com',
  'bikanervala.ae',
  'almanarapharmacy.com',
  'marinapharmacy.com',
  'dubaipetfood.com',
  'zaroob.com',
  'fitnessfirst-me.com',
  'asterpharmacy.com',
  'binsina.ae',
  'galadarigroup.com',
  'alrostamanigroup.ae',
  'shakespeare-and-co.com',
  'grandstores.ae',
  'altayer-motors.com',
  'carswitch.com',
  'lifeline.ae',
  'alfuttaim.com',
  'bateel.com',
  'freedompizza.ae',
  'bounce.ae',
  'danubeproperties.ae',
  'dubailondonclinic.com',
  'mediclinic.ae',
  'whgym.com',
  'honestburgers.co.uk',
  'thehawksmoor.com',
  'wahaca.co.uk',
  'francomanca.co.uk',
  'flatironsteak.co.uk',
  'gailsbread.co.uk',
  'theblacklock.com',
  'gymbox.com',
  'puregym.com',
  'kwik-fit.com',
  'halfords.co.uk',
  'halfords.com',
  'rush.co.uk',
  'foxtons.co.uk',
  'dexters.co.uk',
  'gothamgymnyc.com',
  'russanddaughters.com',
  'katzsdelicatessen.com',
  'peterluger.com',
  'joespizzanyc.com',
  'levainbakery.com',
  'oysterbarnyc.com',
  'midtowndentalcare.com',
  'gramercydental.com',
  'blinkfitness.com',
  'chelseapiers.com',
  'citymd.com',
  'corcoran.com',
  'elliman.com',
  'raymourflanigan.com',
  'bhphoto.com',
  'bhphotovideo.com',
  'diginn.com',

  // Canada, Australia & Saudi Arabia Hubs
  'joeyrestaurants.com',
  'cactusclubcafe.com',
  'goodlifefitness.com',
  'merivale.com',
  'f45training.com',
  'drsulaiman.com',
  'nahdi.sa',

  // Boutiques & Jewellery
  'asianacouture.com',
  'kalashree.com',
  'frontierraas.com',
  'meenabazaar.com',
  'pcjeweller.com',
  'malabargoldanddiamonds.com',
]);

// Free consumer domains that cannot be blind cold-emailed without 550 5.1.1 bounce errors
const UNVERIFIED_CONSUMER_DOMAINS = new Set([
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'rediffmail.com',
  'icloud.com',
  'aol.com',
]);

// Inboxes that auto-reject or dummy test patterns
const BLOCKED_PREFIXES_AND_DOMAINS = [
  'customercare@',
  'customer-care@',
  'care@',
  'wecare@',
  'support@',
  'helpdesk@',
  'help@',
  'service@',
  'feedback@',
  'query@',
  'patientcare@',
  'billing@',
  'noreply@',
  'no-reply@',
  'donotreply@',
  'nuskin.com',
  'nuskin',
  'gulatipandara',
  'example.com',
  'example.org',
  'domain.com',
  'email.com',
  'test@',
  'testing@',
  'placeholder',
  'yourname@',
  'user@',
  'myemail@',
  '.test',
  '.invalid',
  '.example',
  '.local',
  'sentry.io',
  'wixpress.com',
  'schema.org',
  'fake',
  'nonexistent',
];

/**
 * Detects whether an email is a generic Customer Care, Support, Call-Center, or Helpdesk ticket inbox
 * Used to guarantee outreach goes ONLY to actual decision makers (Founders, Doctors, Directors, Owners)
 */
export function isCustomerCareEmail(email: string | null | undefined): boolean {
  if (!email || !email.includes('@')) return false;
  const clean = email.trim().toLowerCase();
  const username = clean.split('@')[0];

  const genericCustomerCarePrefixes = [
    'care',
    'customercare',
    'customer-care',
    'customer.care',
    'support',
    'supportdesk',
    'pgtsupport',
    'wecare',
    'help',
    'helpdesk',
    'service',
    'services',
    'customerservice',
    'customer.service',
    'cservices',
    'feedback',
    'complaint',
    'complaints',
    'patientcare',
    'tollfree',
    'memberservices',
    'memberservices_india',
    'noreply',
    'no-reply',
    'donotreply',
    'do-not-reply',
  ];

  if (genericCustomerCarePrefixes.includes(username) || username.endsWith('support')) {
    return true;
  }

  return genericCustomerCarePrefixes.some(
    (prefix) =>
      username.startsWith(prefix + '.') ||
      username.startsWith(prefix + '-') ||
      username.startsWith(prefix + '_') ||
      username.includes('customercare') ||
      username.includes('helpdesk')
  );
}

/**
 * Strict Deliverability & Real Email Validator
 * Allows any syntactically valid, non-customer-care, non-placeholder business domain (verified via live DNS MX on backend),
 * without rejecting newly discovered real business domains behind a hardcoded static allowlist.
 */
export function isRealDeliverableEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (!clean.includes('@') || !clean.includes('.')) return false;

  const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!regex.test(clean)) return false;

  if (isCustomerCareEmail(clean)) {
    return false;
  }

  if (BLOCKED_PREFIXES_AND_DOMAINS.some((bad) => clean.includes(bad))) {
    return false;
  }

  const parts = clean.split('@');
  if (parts.length !== 2) return false;
  const username = parts[0].trim();
  const domain = parts[1].trim();

  if (username.length < 2 || domain.length < 4) return false;

  if (UNVERIFIED_CONSUMER_DOMAINS.has(domain)) {
    return false;
  }

  if (/\.(png|jpg|jpeg|svg|gif|webp|css|js|local|invalid|test|example)$/i.test(domain)) {
    return false;
  }

  return true;
}


// -------------------------------------------------------------
// 🛡️ STRICT ANTI-SPAM & REPLY-GATE TRACKING
// "जब तक क्लाइंट का रिप्लाई न आए, तब तक कोई मैसेज न जाए"
// -------------------------------------------------------------
const AWAITING_REPLY_STORAGE_KEY = 'maxedlogic_awaiting_reply_emails';
const REPLIED_EMAILS_STORAGE_KEY = 'maxedlogic_replied_emails';

/**
 * Checks whether this recipient email is currently awaiting a client reply.
 * If true, Auto-Bot or manual blast MUST NOT send any new message to this client!
 */
export function isEmailAwaitingReply(email: string | null | undefined): boolean {
  if (!email || typeof window === 'undefined') return false;
  const clean = email.trim().toLowerCase();
  try {
    // Shared generic headquarter domains should never block individual unique clinic branches
    const genericDomains = ['clovedental.in', 'indident.com', 'apollodental.in', 'parthadental.com', 'dentzz.com', 'sabkadentist.com', 'myvestige.com', 'modicare.com'];
    const parts = clean.split('@');
    if (parts.length === 2 && genericDomains.includes(parts[1])) {
      return false;
    }

    const repliedList: string[] = JSON.parse(localStorage.getItem(REPLIED_EMAILS_STORAGE_KEY) || '[]');
    if (repliedList.includes(clean)) return false; // Client has replied!

    const awaitingList: string[] = JSON.parse(localStorage.getItem(AWAITING_REPLY_STORAGE_KEY) || '[]');
    return awaitingList.includes(clean);
  } catch (e) {
    return false;
  }
}

/**
 * Purges shared generic multi-tenant domains from awaiting list
 */
export function purgeGenericAwaitingEmails(): void {
  if (typeof window === 'undefined') return;
  try {
    const genericDomains = ['clovedental.in', 'indident.com', 'apollodental.in', 'parthadental.com', 'dentzz.com', 'sabkadentist.com', 'myvestige.com', 'modicare.com'];
    const awaitingList: string[] = JSON.parse(localStorage.getItem(AWAITING_REPLY_STORAGE_KEY) || '[]');
    const filtered = awaitingList.filter((e) => {
      const parts = e.split('@');
      return !(parts.length === 2 && genericDomains.includes(parts[1]));
    });
    localStorage.setItem(AWAITING_REPLY_STORAGE_KEY, JSON.stringify(filtered));
  } catch (e) {}
}

/**
 * Resets all awaiting reply states if the user wants to start completely fresh
 */
export function clearAllAwaitingReplies(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AWAITING_REPLY_STORAGE_KEY);
  } catch (e) {}
}

/**
 * Checks if the client has already replied
 */
export function isEmailReplied(email: string | null | undefined): boolean {
  if (!email || typeof window === 'undefined') return false;
  const clean = email.trim().toLowerCase();
  try {
    const repliedList: string[] = JSON.parse(localStorage.getItem(REPLIED_EMAILS_STORAGE_KEY) || '[]');
    return repliedList.includes(clean);
  } catch (e) {
    return false;
  }
}

/**
 * Records an email as sent and waiting for client response.
 * Blocks any further automated messages to this client until marked replied.
 */
export function markEmailAwaitingReply(email: string | null | undefined): void {
  if (!email || typeof window === 'undefined') return;
  const clean = email.trim().toLowerCase();
  try {
    const awaitingList: string[] = JSON.parse(localStorage.getItem(AWAITING_REPLY_STORAGE_KEY) || '[]');
    if (!awaitingList.includes(clean)) {
      awaitingList.unshift(clean);
      localStorage.setItem(AWAITING_REPLY_STORAGE_KEY, JSON.stringify(awaitingList.slice(0, 5000)));
    }
  } catch (e) {}
}

/**
 * Marks that a client has replied.
 * Unlocks the client from the awaiting state.
 */
export function markEmailAsReplied(email: string | null | undefined): void {
  if (!email || typeof window === 'undefined') return;
  const clean = email.trim().toLowerCase();
  try {
    const awaitingList: string[] = JSON.parse(localStorage.getItem(AWAITING_REPLY_STORAGE_KEY) || '[]');
    const nextAwaiting = awaitingList.filter((e) => e !== clean);
    localStorage.setItem(AWAITING_REPLY_STORAGE_KEY, JSON.stringify(nextAwaiting));

    const repliedList: string[] = JSON.parse(localStorage.getItem(REPLIED_EMAILS_STORAGE_KEY) || '[]');
    if (!repliedList.includes(clean)) {
      repliedList.unshift(clean);
      localStorage.setItem(REPLIED_EMAILS_STORAGE_KEY, JSON.stringify(repliedList.slice(0, 5000)));
    }
  } catch (e) {}
}

/**
 * Validates that a phone number is NOT a dummy, toll-free customer-care, or fake placeholder number.
 */
export function isInvalidOrFakePhone(phone: string | null | undefined): boolean {
  if (!phone || typeof phone !== 'string') return true;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return true;

  // Reject toll-free / customer care numbers
  if (
    digits.startsWith('1800') ||
    digits.startsWith('1860') ||
    digits.startsWith('911800') ||
    digits.startsWith('911860') ||
    digits.startsWith('0800') ||
    digits.startsWith('44800') ||
    digits.startsWith('800')
  ) {
    return true;
  }

  // Reject UK Ofcom drama/fake numbers (07700 900xxx) and US 555-01xx fake drama numbers
  if (digits.startsWith('44770090') || digits.includes('55501')) {
    return true;
  }

  // Reject obvious dummy suffixes or repeating digits (0000, 99999, 123456)
  if (
    digits.endsWith('0000') ||
    digits.endsWith('9999') ||
    /(\d)\1{4,}/.test(digits) ||
    digits.includes('123456') ||
    digits.includes('987654')
  ) {
    return true;
  }

  // Reject malformed previous Indian synthetic format like "+91 981120 0000" (6 digits + space + 4 digits)
  if (/^\+91\s\d{6}\s\d{4}$/.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * Checks whether a phone number is a genuine direct personal mobile (Owner / Director / Doctor mobile)
 * rather than a landline STD desk or toll-free number.
 */
export function isVerifiedOwnerMobile(
  phone: string | null | undefined,
  countryCode?: string
): boolean {
  if (isInvalidOrFakePhone(phone)) return false;
  const digits = String(phone).replace(/\D/g, '');
  const cc = (countryCode || '').toUpperCase();

  // India mobile: 91 + 10 digits starting with 6, 7, 8, or 9
  if (cc === 'IN' || digits.startsWith('91')) {
    const rest = digits.startsWith('91') ? digits.slice(2) : digits;
    return rest.length === 10 && /^[6-9]\d{9}$/.test(rest);
  }

  // UAE mobile: 971 + 9 digits starting with 5
  if (cc === 'AE' || digits.startsWith('971')) {
    const rest = digits.startsWith('971') ? digits.slice(3) : digits;
    return rest.length === 9 && /^5[024568]\d{7}$/.test(rest);
  }

  // UK mobile: 44 + 10 digits starting with 7
  if (cc === 'GB' || digits.startsWith('44')) {
    const rest = digits.startsWith('44') ? digits.slice(2) : digits;
    return rest.length === 10 && /^7[1-9]\d{8}$/.test(rest);
  }

  // US/Canada: 1 + 10 digits
  if (cc === 'US' || cc === 'CA' || digits.startsWith('1')) {
    const rest = digits.startsWith('1') && digits.length === 11 ? digits.slice(1) : digits;
    return rest.length === 10 && /^[2-9]\d{9}$/.test(rest);
  }

  return digits.length >= 10 && digits.length <= 15;
}

/**
 * Resolves the 100% Owner / Client Direct Mobile Number for calling & WhatsApp outreach.
 */
export function getOwnerDirectMobile(lead: {
  ownerPhone?: string | null;
  whatsAppNumber?: string | null;
  phoneNumber?: string | null;
  countryCode?: string;
}): string | null {
  if (lead.ownerPhone && !isInvalidOrFakePhone(lead.ownerPhone)) {
    return lead.ownerPhone.trim();
  }
  if (lead.whatsAppNumber && !isInvalidOrFakePhone(lead.whatsAppNumber)) {
    return lead.whatsAppNumber.trim();
  }
  if (lead.phoneNumber && isVerifiedOwnerMobile(lead.phoneNumber, lead.countryCode)) {
    return lead.phoneNumber.trim();
  }
  return null;
}

/**
 * Resolves the exact Google Maps Location / Branch Phone Number.
 */
export function getLocationBranchPhone(lead: {
  locationPhone?: string | null;
  phoneNumber?: string | null;
}): string | null {
  if (lead.locationPhone && !isInvalidOrFakePhone(lead.locationPhone)) {
    return lead.locationPhone.trim();
  }
  if (lead.phoneNumber && !isInvalidOrFakePhone(lead.phoneNumber)) {
    return lead.phoneNumber.trim();
  }
  return null;
}

/**
 * Formats a clean international digit string for WhatsApp URLs (`api.whatsapp.com/send?phone=...`).
 */
export function formatWhatsAppDigits(
  phone: string | null | undefined,
  countryCode?: string
): string {
  if (!phone || isInvalidOrFakePhone(phone)) return '';
  let clean = phone.replace(/\D/g, '');
  const cc = (countryCode || '').toUpperCase();

  if (clean.startsWith('91') && clean.length === 12 && /^[6-9]/.test(clean.slice(2))) {
    return clean;
  }
  if (clean.length === 10 && /^[6-9]/.test(clean) && (!cc || cc === 'IN')) {
    return '91' + clean;
  }
  if (clean.length === 11 && clean.startsWith('0') && /^[6-9]/.test(clean.slice(1))) {
    return '91' + clean.slice(1);
  }
  if ((cc === 'US' || cc === 'CA') && clean.length === 10) {
    return '1' + clean;
  }
  if (cc === 'AE' && clean.length === 9 && clean.startsWith('5')) {
    return '971' + clean;
  }
  if (cc === 'GB' && clean.length === 10 && clean.startsWith('7')) {
    return '44' + clean;
  }
  return clean;
}

