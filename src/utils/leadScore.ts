import { Lead } from '../types';

export function calculateLeadScore(lead: Partial<Lead>): number {
  let score = 0;

  // +30 agar website nahi hai (or websiteStatus is NoWebsite)
  if (!lead.hasWebsite || lead.websiteStatus === 'NoWebsite' || !lead.websiteUrl) {
    score += 30;
  }

  // +20 agar phone number hai
  if (lead.phoneNumber && lead.phoneNumber.trim().length > 0) {
    score += 20;
  }

  // +15 agar email hai
  if (lead.email && lead.email.trim().length > 0) {
    score += 15;
  }

  // +10 agar rating 4.0+ hai
  if (lead.rating !== undefined && lead.rating >= 4.0) {
    score += 10;
  }

  // +10 agar review count 10+ hai
  if (lead.reviewCount !== undefined && lead.reviewCount >= 10) {
    score += 10;
  }

  // +10 agar recently added hai (<= 7 din)
  if (lead.createdAt) {
    const createdDate = new Date(lead.createdAt).getTime();
    const now = new Date().getTime();
    const diffDays = (now - createdDate) / (1000 * 3600 * 24);
    if (diffDays <= 7) {
      score += 10;
    }
  } else {
    // newly added
    score += 10;
  }

  // +5 agar address complete hai
  if (lead.address && lead.city && (lead.postalCode || lead.state)) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

export function interpolateTemplate(
  templateBody: string,
  lead: Lead
): string {
  const needText = lead.needAudit?.needBadgeText || (lead.hasWebsite ? 'पुरानी वेबसाइट अपडेट / मॉडर्न रीडिजाइन' : 'नई वेबसाइट बनवानी है');
  const offerText = lead.needAudit?.recommendedOffer || (lead.hasWebsite ? 'Modern Responsive Website Redesign' : '5-Page Fast Business Website + WhatsApp Booking');
  const dealValue = lead.needAudit?.estimatedDealValue || (lead.hasWebsite ? '₹35,000 / $800' : '₹25,000 / $600');

  return templateBody
    .replace(/{BusinessName}/g, lead.businessName || 'Business Owner')
    .replace(/{City}/g, lead.city || 'your city')
    .replace(/{Category}/g, lead.category || 'business')
    .replace(/{ContactPerson}/g, lead.contactPerson || 'Business Lead')
    .replace(/{WebsiteStatus}/g, lead.websiteStatus || 'Online Presence')
    .replace(/{Rating}/g, lead.rating ? lead.rating.toString() : '4.5')
    .replace(/{DetectedNeed}/g, needText)
    .replace(/{RecommendedOffer}/g, offerText)
    .replace(/{EstimatedValue}/g, dealValue);
}
