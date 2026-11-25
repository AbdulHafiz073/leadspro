export type UserRole = 'Admin' | 'User';

export interface User {
  id: number;
  email: string;
  fullName: string;
  role: UserRole;
  createdAt: string;
  isActive: boolean;
}

export interface Country {
  id: number;
  name: string;
  code: string;
  flag: string;
  isActive: boolean;
  leadCount?: number;
}

export type WebsiteStatus = 'NoWebsite' | 'Outdated' | 'HasWebsite' | 'NeedsUpdate';

export type DetectedNeed =
  | 'NEEDS_NEW_WEBSITE'
  | 'NEEDS_WEBSITE_REDESIGN'
  | 'NEEDS_LOCAL_SEO'
  | 'NEEDS_WHATSAPP_AUTOMATION'
  | 'NEEDS_ECOMMERCE';

export type QualityTier = '100% Verified' | 'High Quality' | 'Medium Quality' | 'Low Quality';
export type OpportunityLevel = 'High' | 'Medium' | 'Low';
export type EmailVerificationStatus = 'Publicly Listed + MX Verified' | 'Publicly Listed' | 'Unverified';
export type PrimaryCategoryGroup = 'Website' | 'App' | 'Game' | 'Software';
export type BuyingIntentLevel = 'HIGH INTENT' | 'MEDIUM INTENT' | 'LOW INTENT';
export type BudgetConfidence = 'Confirmed Budget' | 'Estimated Budget' | 'Unknown Budget';
export type ProjectType = 'New Development' | 'Redesign' | 'Upgrade' | 'Maintenance';
export type LeadVerificationBadge = 'VERIFIED' | 'PARTIALLY VERIFIED' | 'UNVERIFIED';
export type LeadPriorityTier = 'Priority A' | 'Priority B' | 'Priority C' | 'Excluded';

export interface BuyerScoreBreakdown {
  actualRequirement: number; // max 30
  activeIntent: number; // max 25
  budgetEvidence: number; // max 20
  businessAuthenticity: number; // max 10
  contactVerification: number; // max 10
  requirementFreshness: number; // max 5
  evidenceNotes: string;
}

export interface BusinessNeedAudit {
  primaryNeed: DetectedNeed;
  needBadgeText: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  reasons: string[];
  recommendedOffer: string;
  estimatedDealValue: string;
  tailoredColdPitch: {
    whatsapp: string;
    email: {
      subject: string;
      body: string;
    };
  };
  keyWeaknesses?: string[];
  suggestedFeatures?: string[];
}

export type LeadSource =
  | 'Google Places'
  | 'Google Maps'
  | 'Google Search'
  | 'Upwork'
  | 'LinkedIn'
  | 'Facebook'
  | 'Freelancer'
  | 'OpenStreetMap'
  | 'Reddit Hiring'
  | 'Hacker News'
  | 'SerpAPI'
  | 'Manual'
  | 'Google AI Scanner'
  | 'Google Search Grounding'
  | string;

export type LeadOutreachStatus =
  | 'Pending'
  | 'WhatsAppSent'
  | 'EmailSent'
  | 'BothSent'
  | 'Replied'
  | 'PhoneError'
  | 'EmailError'
  | 'Unsubscribed';

export interface WebsiteSignals {
  httpStatus?: number | null;
  loadTimeMs?: number | null;
  hasSsl?: boolean;
  hasViewportMeta?: boolean;
  copyrightYear?: number | null;
  hasAppStoreLinks?: boolean;
  hasPlayStoreLinks?: boolean;
  brokenLinkCount?: number;
  pageTitle?: string | null;
  reachable?: boolean;
}

export interface Lead {
  id: number;
  businessName: string;
  contactPerson: string;
  email: string | null;
  phoneNumber: string | null;
  whatsAppNumber: string | null;
  ownerPhone?: string | null;
  locationPhone?: string | null;
  websiteUrl: string | null;
  hasWebsite: boolean;
  address: string;
  city: string;
  state: string;
  region?: string;
  countryId: number;
  countryName?: string;
  countryCode?: string;
  postalCode: string;
  latitude?: number;
  longitude?: number;
  category: string;
  primaryGroup?: PrimaryCategoryGroup;
  subCategories?: string[];
  serviceRequired?: string;
  source: LeadSource;
  sourceUrls?: string[];
  emailSourceUrl?: string | null;
  emailVerificationStatus?: EmailVerificationStatus;
  mxHost?: string | null;
  verificationStatus?: string;
  qualityTier?: QualityTier;
  opportunityLevel?: OpportunityLevel;
  websiteSignals?: WebsiteSignals;
  evidenceSummary?: string;
  googlePlaceId?: string;
  googleMapsUrl?: string;
  rating: number;
  reviewCount: number;
  leadScore: number;
  websiteStatus: WebsiteStatus;
  detectedNeed?: DetectedNeed;
  needAudit?: BusinessNeedAudit;
  outreachStatus?: LeadOutreachStatus;
  pitchChannel?: OutreachChannel | 'Both';
  lastPitchedAt?: string;
  pitchSubject?: string | null;
  pitchMessage?: string | null;
  pitchApp?: 'Gmail' | 'WhatsApp' | 'Both' | string | null;
  pitchRecipient?: string | null;
  errorMessage?: string | null;
  errorType?: 'InvalidPhone' | 'NoWhatsApp' | 'InvalidEmail' | 'EmailBounced' | 'ApiFailed';
  replyReceived?: boolean;
  replyType?: 'Interested' | 'DealWon' | 'DemoScheduled' | 'NotInterested' | 'General';
  replyIntent?: 'ApprovedWebsiteCreate' | 'RequestedWebsiteUpdate' | 'SentContactNumber' | 'Interested' | 'NotInterested' | 'General';
  approvedWebsiteCreate?: boolean;
  requestedWebsiteUpdate?: boolean;
  replyExtractedPhone?: string | null;
  repliedAt?: string | null;
  replyNotes?: string | null;
  chatbotSummary?: {
    serviceMode?: string;
    selectedCategory?: string;
    selectedSubType?: string;
    finalDecision?: 'YES' | 'NO';
    channelSource?: string;
    updatedAt?: string;
  };
  isScanned?: boolean;
  scannedAt?: string;
  lastCheckedAt?: string;
  discoveredAt?: string;
  createdAt: string;
  updatedAt: string;
  isSelected?: boolean;
  hasProfileDp?: boolean;
  profileDpUrl?: string | null;
  dpVerificationStatus?: 'VERIFIED_DP' | 'NO_DP' | 'PENDING';
  // High-Intent Buyer & 26-Field Dossier Properties
  designation?: string | null;
  linkedInCompanyUrl?: string | null;
  contactLinkedInUrl?: string | null;
  exactProjectRequirement?: string | null;
  projectType?: ProjectType | null;
  buyerNeedType?: 'Buy' | 'Update' | 'New Create' | null;
  projectBudget?: string | null;
  budgetConfidence?: BudgetConfidence | null;
  budgetCurrency?: string | null;
  projectTimeline?: string | null;
  buyingIntentLevel?: BuyingIntentLevel | null;
  buyingSignalReason?: string | null;
  sourcePlatform?: string | null;
  directSourceUrl?: string | null;
  requirementPostingUrl?: string | null;
  postingDate?: string | null;
  lastVerificationDate?: string | null;
  leadVerificationBadge?: LeadVerificationBadge | null;
  priorityTier?: LeadPriorityTier | null;
  scoreBreakdown?: BuyerScoreBreakdown | null;
  requirementActiveStatus?: 'Active' | 'Unknown' | 'Closed' | null;
}

export type OutreachChannel = 'WhatsApp' | 'Email' | 'Twitter' | 'Instagram' | 'Telegram';

export interface OutreachTemplate {
  id: number;
  userId: number;
  name: string;
  channel: OutreachChannel;
  subject?: string | null;
  body: string;
  createdAt: string;
}

export type OutreachStatus = 'Pending' | 'Sent' | 'Failed' | 'Delivered' | 'Replied';

export interface OutreachLog {
  id: number;
  leadId: number;
  userId: number;
  channel: OutreachChannel;
  messageBody: string;
  status: OutreachStatus;
  sentAt: string;
  errorMessage?: string | null;
  leadName?: string;
  recipientContact?: string;
  category?: string;
  city?: string;
  repliedAt?: string | null;
  replyNotes?: string | null;
}

export interface DailyFetchLog {
  id: number;
  fetchDate: string;
  countryId: number;
  countryName?: string;
  leadsAdded: number;
  status: 'Success' | 'Failed';
  startedAt: string;
  completedAt: string;
  errorMessage?: string | null;
  source?: string;
  category?: string;
}

export interface DiscoveryRunRecord {
  id: number;
  jobId: string;
  requestedCount: number;
  foundCount: number;
  verifiedCount: number;
  excludedCount: number;
  duplicatesPrevented: number;
  categories: string[];
  country: string;
  state: string;
  city: string;
  region?: string;
  postalCode?: string;
  serviceRequired?: string;
  status: 'Running' | 'Completed' | 'Failed';
  errorMessage?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export type EmailCampaignStatus =
  | 'PendingApproval'
  | 'Approved'
  | 'Rejected'
  | 'Sent'
  | 'Failed'
  | 'Unsubscribed';

export interface EmailCampaignItem {
  id: string;
  leadId: number;
  businessName: string;
  recipientEmail: string;
  category: string;
  address?: string;
  city: string;
  countryName: string;
  serviceRequired: string;
  websiteUrl: string | null;
  emailVerificationStatus: string;
  subject: string;
  body: string;
  status: EmailCampaignStatus;
  autoSendAuthorized: boolean;
  gmailMessageId?: string | null;
  gmailThreadId?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt?: string | null;
}

export interface DashboardMetricsSummary {
  totalLeadsFound: number;
  newUniqueLeads: number;
  verifiedEmails: number;
  verifiedPhoneNumbers: number;
  availableWebsites: number;
  potentialOpportunities: number;
  emailsSent: number;
  pendingEmails: number;
  duplicateLeadsPrevented: number;
  unsubscribedCount: number;
}

export interface DashboardStats {
  totalLeads: number;
  leadsWithoutWebsite: number;
  highScoreLeads: number;
  outreachSentToday: number;
  totalOutreach: number;
  successRate: number;
  topCategories: { name: string; count: number }[];
  countryBreakdown: { country: string; count: number; code: string }[];
  channelBreakdown: { channel: string; count: number }[];
  dailyTrends: { date: string; leadsAdded: number; outreachSent: number }[];
}

export interface ApiSettings {
  googlePlacesApiKey: string;
  serpApiKey: string;
  hunterIoApiKey: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioWhatsAppFrom: string;
  sendGridApiKey: string;
  sendGridSenderEmail: string;
  companyName?: string;
  companyWebsite?: string;
  senderFullName?: string;
  senderPhone?: string;
  twitterBearerToken: string;
  instagramAccessToken: string;
  telegramBotToken: string;
  hangfireCronDailyFetch: string;
  hangfireCronWebsiteCheck: string;
  hangfireCronEmailEnrichment: string;
}

export type GmailReplyIntentCategory =
  | 'ApprovedWebsiteCreate'
  | 'RequestedWebsiteUpdate'
  | 'SentContactNumber'
  | 'Interested'
  | 'NotInterested'
  | 'General';

export interface GmailReplyRecord {
  id: string;
  leadId?: number;
  businessName: string;
  clientEmail: string;
  clientPhone?: string;
  extractedPhone?: string | null;
  location?: string;
  address?: string;
  city?: string;
  countryName?: string;
  googleMapsUrl?: string;
  subject: string;
  replySnippet: string;
  fullMessage: string;
  replyType:
    | 'YES (Interested)'
    | 'Website Create Approved'
    | 'Website Update Requested'
    | 'Contact Number Shared'
    | 'Demo Scheduled'
    | 'Deal Won'
    | 'NO (Not Interested)'
    | 'Question';
  intentCategory?: GmailReplyIntentCategory;
  wantsWebsiteCreate?: boolean;
  wantsWebsiteUpdate?: boolean;
  serviceMode?: string;
  selectedCategory?: string;
  selectedSubType?: string;
  finalDecision?: 'YES' | 'NO';
  channelSource?: string;
  receivedAt: string;
  threadUrl?: string;
  notes?: string;
}
