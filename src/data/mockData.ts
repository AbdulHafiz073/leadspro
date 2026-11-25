import { Country, Lead, OutreachTemplate, OutreachLog, DailyFetchLog, ApiSettings } from '../types';

export const initialCountries: Country[] = [
  { id: 1, name: 'India', code: 'IN', flag: '🇮🇳', isActive: true },
  { id: 2, name: 'United States', code: 'US', flag: '🇺🇸', isActive: true },
  { id: 3, name: 'United Kingdom', code: 'GB', flag: '🇬🇧', isActive: true },
  { id: 4, name: 'United Arab Emirates', code: 'AE', flag: '🇦🇪', isActive: true },
  { id: 5, name: 'Canada', code: 'CA', flag: '🇨🇦', isActive: true },
  { id: 6, name: 'Australia', code: 'AU', flag: '🇦🇺', isActive: true },
  { id: 7, name: 'Germany', code: 'DE', flag: '🇩🇪', isActive: true },
  { id: 8, name: 'Singapore', code: 'SG', flag: '🇸🇬', isActive: true },
  { id: 9, name: 'Saudi Arabia', code: 'SA', flag: '🇸🇦', isActive: true },
  { id: 10, name: 'France', code: 'FR', flag: '🇫🇷', isActive: true },
];

// Never ship hardcoded fake or unverified business leads — all leads are fetched live & persisted in SQLite
export const initialLeads: Lead[] = [];

export const initialTemplates: OutreachTemplate[] = [
  {
    id: 1,
    userId: 1,
    name: 'MaxedLogic: New Website Creation Pitch (WhatsApp)',
    channel: 'WhatsApp',
    subject: null,
    body:
      'Hello {ContactPerson}, I noticed {BusinessName} in {City} currently has no official website connected to its public business listing. At MaxedLogic (maxedlogic.com), we build fast mobile-first websites with instant booking integration. Would you like to see a complimentary prototype? — Abdul Hafiz (+91 97597 25212)',
    createdAt: new Date().toISOString(),
  },
  {
    id: 2,
    userId: 1,
    name: 'MaxedLogic: Website Redesign & Modernization (Email)',
    channel: 'Email',
    subject: 'Website Modernization Opportunity for {BusinessName} ({City})',
    body:
      'Hello {ContactPerson},\n\nI reviewed {BusinessName} ({WebsiteUrl}) in {City}. We specialize in modern website redesigns, mobile speed optimization, and custom software/app solutions for businesses in your category.\n\nIf you would like a complimentary technical assessment and proposal, reply "YES". To opt out of future emails, reply "UNSUBSCRIBE".\n\nBest regards,\nAbdul Hafiz | MaxedLogic (https://maxedlogic.com)\nPhone: +91 97597 25212 | Email: aabdulhafiz073@gmail.com',
    createdAt: new Date().toISOString(),
  },
];

export const initialOutreachLogs: OutreachLog[] = [];

export const initialDailyFetchLogs: DailyFetchLog[] = [];

export const initialApiSettings: ApiSettings = {
  googlePlacesApiKey: '',
  serpApiKey: '',
  hunterIoApiKey: '',
  twilioAccountSid: '',
  twilioAuthToken: '',
  twilioWhatsAppFrom: 'whatsapp:+919759725212',
  sendGridApiKey: '',
  sendGridSenderEmail: 'aabdulhafiz073@gmail.com',
  companyName: 'MaxedLogic',
  companyWebsite: 'https://maxedlogic.com',
  senderFullName: 'Abdul Hafiz',
  senderPhone: '+91 97597 25212',
  twitterBearerToken: '',
  instagramAccessToken: '',
  telegramBotToken: '',
  hangfireCronDailyFetch: '0 0 * * *',
  hangfireCronWebsiteCheck: '0 2 * * *',
  hangfireCronEmailEnrichment: '0 3 * * *',
};
