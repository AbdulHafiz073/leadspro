import { Lead } from '../types';
import { SERVICE_MODES } from './chatbotFlowOptions';
import { normalizeClientPhoneDigits } from '../services/whatsappConnectService';

export const MAXEDLOGIC_SENDER = {
  companyName: 'MaxedLogic',
  companyWebsite: 'https://maxedlogic.com',
  companyDomain: 'maxedlogic.com',
  senderName: 'Abdul Hafiz',
  senderPhoneRaw: '9759725212',
  senderPhoneFormatted: '+91 97597 25212',
  senderEmail: 'aabdulhafiz073@gmail.com',
};

export function getConfiguredSenderEmail(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('maxedlogic_sender_email');
    if (saved && saved.trim() && saved.includes('@')) return saved.trim();
  }
  return MAXEDLOGIC_SENDER.senderEmail;
}

export function setConfiguredSenderEmail(email: string): void {
  if (typeof window !== 'undefined' && email && email.trim()) {
    localStorage.setItem('maxedlogic_sender_email', email.trim());
  }
}

export function getConfiguredSenderPhone(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('maxedlogic_sender_phone');
    if (saved && saved.trim()) return saved.trim();
  }
  return MAXEDLOGIC_SENDER.senderPhoneRaw;
}

export function setConfiguredSenderPhone(phone: string): void {
  if (typeof window !== 'undefined' && phone && phone.trim()) {
    localStorage.setItem('maxedlogic_sender_phone', phone.trim());
  }
}

export interface CustomPitchConfig {
  updateSubject: string;
  updateEmailBody: string;
  updateWhatsAppText: string;
  newSubject: string;
  newEmailBody: string;
  newWhatsAppText: string;
  followUpSubject: string;
  followUpEmailBody: string;
  followUpWhatsAppText: string;
}

const CUSTOM_PITCH_STORAGE_KEY = 'maxedlogic_custom_pitch_templates';

export function getCustomPitchConfig(): CustomPitchConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CUSTOM_PITCH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

export function saveCustomPitchConfig(config: CustomPitchConfig): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CUSTOM_PITCH_STORAGE_KEY, JSON.stringify(config));
  }
}

export function resetCustomPitchConfig(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(CUSTOM_PITCH_STORAGE_KEY);
  }
}

export function interpolatePitchTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{${key}\\}`, 'g');
    result = result.replace(regex, value);
  }
  return result;
}

export interface MaxedLogicPitchResult {
  pitchType: 'UPDATE_WEBSITE' | 'NEW_WEBSITE' | 'FOLLOW_UP';
  pitchTypeLabel: string;
  whatsAppText: string;
  emailSubject: string;
  emailBody: string;
  emailHtml?: string;
  whatsAppUrl: string;
  whatsAppWebUrl: string;
  gmailWebUrl: string;
  mailtoUrl: string;
  targetPhone: string;
  targetEmail: string;
  senderEmailUsed: string;
  whatsAppInteractivePayload: {
    messaging_product: 'whatsapp';
    recipient_type: 'individual';
    to: string;
    type: 'interactive';
    interactive: {
      type: 'button';
      header?: { type: 'text'; text: string };
      body: { text: string };
      footer?: { text: string };
      action: {
        buttons: Array<{
          type: 'reply';
          reply: { id: string; title: string };
        }>;
      };
    };
  };
}

export function buildInteractiveEmailHtml(
  subject: string,
  textBody: string,
  leadId?: number | string | null,
  businessName?: string
): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : typeof process !== 'undefined' && process.env?.APP_BASE_URL
      ? process.env.APP_BASE_URL
      : 'http://localhost:3000';

  const biz = businessName || 'Your Business';
  const encBiz = encodeURIComponent(biz);
  const cleanLeadId = leadId ? String(leadId) : '';
  const senderEmail = MAXEDLOGIC_SENDER.senderEmail;

  // 1. Direct Web Action (Works on localhost / web browser)
  const interestedWebUrl = `${origin}/api/client-action?leadId=${cleanLeadId}&action=INTERESTED&biz=${encBiz}`;
  const notInterestedWebUrl = `${origin}/api/client-action?leadId=${cleanLeadId}&action=NOT_INTERESTED&biz=${encBiz}`;
  const chatbotUrl = `${origin}/?clientChat=1&leadId=${cleanLeadId}&biz=${encBiz}&action=INTERESTED`;

  // 2. Direct 1-Click Email Reply (Works 100% on ALL phones & devices anywhere in the world!)
  const interestedMailtoUrl = `mailto:${senderEmail}?subject=${encodeURIComponent(
    `Re: YES I Am Interested in Free Demo for ${biz}`
  )}&body=${encodeURIComponent(
    `Hi Abdul Hafiz,\n\nYES, I am interested in getting a FREE 24-hour interactive demo & quote for ${biz}.\n\nMy WhatsApp/Phone Number: \nRequirement: [Website Redesign / Brand-New Website / Mobile App]\n\nPlease send the demo!\n\nThanks,\n${biz}`
  )}`;

  const notInterestedMailtoUrl = `mailto:${senderEmail}?subject=${encodeURIComponent(
    `Re: Not Interested (${biz})`
  )}&body=${encodeURIComponent(
    `Hello Abdul Hafiz,\n\nPlease remove ${biz} and do not contact again.\n\nThanks.`
  )}`;

  // 3. Direct WhatsApp Link (Works 100% on all mobile devices & WhatsApp Web)
  const waUrl = `https://wa.me/91${MAXEDLOGIC_SENDER.senderPhoneRaw}?text=${encodeURIComponent(
    `Hi Abdul Hafiz, I read your email regarding ${biz}. Please share our FREE 24h demo & quote.`
  )}`;

  const paragraphs = textBody
    .split(/\n\s*\n/)
    .map((p) => {
      const escaped = p
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br/>');
      return `<p style="margin: 0 0 14px 0; color: #334155; font-size: 15px; line-height: 1.65;">${escaped}</p>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <tr>
            <td style="background-color: #0f172a; padding: 24px 20px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">MaxedLogic</h1>
              <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 13px;">Software, Web & Mobile App Engineering • maxedlogic.com</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 28px 24px 16px 24px;">
              ${paragraphs}

              <!-- INTERACTIVE ONE-CLICK OPTIONS CARD (HYBRID: MAILTO + BROWSER + WHATSAPP) -->
              <div style="margin: 24px 0 16px 0; padding: 20px; background-color: #f8fafc; border: 2px solid #cbd5e1; border-radius: 10px; text-align: center;">
                <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 800; color: #0f172a;">
                  👉 Choose One Option Below (Takes 5 Seconds):
                </p>

                <!-- OPTION 1: I AM INTERESTED (1-Click Email Reply or Browser Action) -->
                <div style="margin-bottom: 12px;">
                  <a href="${interestedMailtoUrl}" style="display: block; background-color: #10b981; color: #ffffff; font-size: 15px; font-weight: 700; padding: 13px 18px; text-decoration: none; border-radius: 8px; box-shadow: 0 3px 10px rgba(16,185,129,0.3);">
                    ✅ I Am Interested (1-Click Reply & Free Demo)
                  </a>
                  <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
                    (Tapping this opens a ready-to-send reply in your Gmail, or <a href="${interestedWebUrl}" style="color: #0284c7; text-decoration: underline;">click here to open in browser</a>)
                  </div>
                </div>

                <!-- OPTION 2: NOT INTERESTED -->
                <div style="margin-bottom: 12px;">
                  <a href="${notInterestedMailtoUrl}" style="display: block; background-color: #64748b; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 18px; text-decoration: none; border-radius: 8px;">
                    ❌ I Am Not Interested (Opt Out)
                  </a>
                  <div style="margin-top: 4px; font-size: 11px; color: #64748b;">
                    (Or <a href="${notInterestedWebUrl}" style="color: #64748b; text-decoration: underline;">click here for 1-click browser unsubscribe</a>)
                  </div>
                </div>

                <!-- OPTION 3: INTERACTIVE PROJECT CHATBOT -->
                <div style="margin-bottom: 12px;">
                  <a href="${chatbotUrl}" target="_blank" style="display: block; background-color: #0284c7; color: #ffffff; font-size: 13px; font-weight: 600; padding: 10px 18px; text-decoration: none; border-radius: 8px;">
                    🤖 Open Interactive Project Chatbot (Select Specs)
                  </a>
                </div>

                <!-- OPTION 4: DIRECT WHATSAPP -->
                <div>
                  <a href="${waUrl}" target="_blank" style="display: block; background-color: #25d366; color: #ffffff; font-size: 13px; font-weight: 700; padding: 11px 18px; text-decoration: none; border-radius: 8px;">
                    💬 Chat Directly on WhatsApp (+91 97597 25212)
                  </a>
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 24px 24px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;"><strong>Abdul Hafiz | Founder & Principal Architect</strong></p>
              <p style="margin: 0 0 4px 0;">MaxedLogic • <a href="https://maxedlogic.com" style="color: #0284c7; text-decoration: none;">https://maxedlogic.com</a> • Call/WhatsApp: +91 97597 25212</p>
              <p style="margin: 6px 0 0 0; color: #94a3b8;">If you do not wish to receive updates, click 'I Am Not Interested' above to opt out permanently.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function clientChatLinkOrEmpty(_url: string): string {
  return '';
}

/**
 * Generates dynamic, highly tailored cold pitches from MaxedLogic (maxedlogic.com)
 * Automatically distinguishes between:
 * 1. Businesses needing an Outdated Website Update / Redesign
 * 2. Businesses needing a Brand New Website Creation from scratch
 */
export function getMaxedLogicPitch(lead: Lead, customSenderEmail?: string): MaxedLogicPitchResult {
  const activeSenderEmail = customSenderEmail?.trim() || getConfiguredSenderEmail();
  const contactName = lead.contactPerson && lead.contactPerson.trim() ? lead.contactPerson : 'जी';
  const bizName = lead.businessName || 'आपका बिज़नेस';
  const city = lead.city || 'आपके शहर';
  const category = lead.category || 'बिज़नेस';
  const ratingText = lead.rating ? `${lead.rating}★` : '4+★';
  const websiteUrl = lead.websiteUrl || 'मौजूदा साइट';
  const customConfig = getCustomPitchConfig();
  const appOrigin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : typeof process !== 'undefined' && process.env?.APP_BASE_URL
      ? process.env.APP_BASE_URL
      : 'http://localhost:3000';
  const cleanLeadId = lead.id ? String(lead.id) : '';
  const encBiz = encodeURIComponent(bizName);
  const interestedActionUrl = `${appOrigin}/api/client-action?leadId=${cleanLeadId}&action=INTERESTED&biz=${encBiz}`;
  const notInterestedActionUrl = `${appOrigin}/api/client-action?leadId=${cleanLeadId}&action=NOT_INTERESTED&biz=${encBiz}`;
  const chatbotDirectUrl = `${appOrigin}/?clientChat=1&leadId=${cleanLeadId}&biz=${encBiz}`;
  const clientChatUrl = chatbotDirectUrl;

  const originPlatform =
    lead.sourcePlatform && lead.sourcePlatform !== 'Not publicly available'
      ? lead.sourcePlatform
      : lead.source || 'Google Search';
  const proofSourceUrl =
    lead.requirementPostingUrl ||
    lead.directSourceUrl ||
    lead.googleMapsUrl ||
    lead.websiteUrl ||
    (lead.sourceUrls && lead.sourceUrls[0]) ||
    '';
  const resolvedBuyerNeed: 'Buy' | 'Update' | 'New Create' =
    lead.buyerNeedType === 'Buy' || lead.buyerNeedType === 'Update' || lead.buyerNeedType === 'New Create'
      ? lead.buyerNeedType
      : !lead.hasWebsite || lead.websiteStatus === 'NoWebsite'
      ? 'New Create'
      : lead.buyingIntentLevel === 'HIGH INTENT' && Boolean(lead.requirementPostingUrl)
      ? 'Buy'
      : 'Update';
  const whatsAppDirectLink = `https://wa.me/91${MAXEDLOGIC_SENDER.senderPhoneRaw}?text=${encodeURIComponent(
    `Hi Abdul Hafiz, I read your email regarding ${bizName} (${resolvedBuyerNeed}). Please share our FREE 24h demo & quote.`
  )}`;

  const templateVars: Record<string, string> = {
    businessName: bizName,
    contactPerson: contactName,
    city,
    category,
    rating: ratingText,
    websiteUrl,
    sourcePlatform: originPlatform,
    buyerNeedType: resolvedBuyerNeed,
    directSourceUrl: proofSourceUrl || websiteUrl,
    whatsAppDirectLink,
    senderEmail: activeSenderEmail,
    senderPhone: MAXEDLOGIC_SENDER.senderPhoneFormatted,
    senderName: MAXEDLOGIC_SENDER.senderName,
    companyName: MAXEDLOGIC_SENDER.companyName,
    companyWebsite: MAXEDLOGIC_SENDER.companyWebsite,
  };

  // Clean target contact numbers & format international prefix matching lead country
  const rawTargetPhone = lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '';
  const cleanTargetPhone = normalizeClientPhoneDigits(rawTargetPhone, lead.countryName || lead.countryCode);

  const targetEmail = lead.email || '';

  // Determine if this business needs an Update / Redesign vs Buy / New Creation
  const needsUpdate =
    resolvedBuyerNeed === 'Update' ||
    (resolvedBuyerNeed !== 'New Create' &&
      resolvedBuyerNeed !== 'Buy' &&
      (lead.hasWebsite ||
        lead.websiteStatus === 'NeedsUpdate' ||
        lead.websiteStatus === 'Outdated' ||
        lead.websiteStatus === 'HasWebsite' ||
        lead.detectedNeed === 'NEEDS_WEBSITE_REDESIGN'));

  const cleanContact = contactName === 'Not publicly available' ? 'जी' : contactName;
  const cleanCity = city === 'Not publicly available' ? 'आपके मार्केट' : city;
  const observedNote =
    lead.exactProjectRequirement && lead.exactProjectRequirement !== 'Not publicly available'
      ? lead.exactProjectRequirement
      : lead.evidenceSummary && lead.evidenceSummary !== 'Not publicly available'
      ? lead.evidenceSummary
      : 'mobile speed, modern UI/UX, aur instant WhatsApp/lead capture me bade gaps hain';

  if (needsUpdate) {
    // ----------------------------------------------------
    // CASE 1: Jisko Website Update / Redesign krani hai
    // ----------------------------------------------------
    const defaultWhatsAppText = `नमस्ते ${cleanContact} 👋,
मैं *Abdul Hafiz* — Founder, *MaxedLogic (maxedlogic.com)*।

⚠️ *${bizName} (${cleanCity}) के लिए एक ज़रूरी नोटिस:*
हमने ${originPlatform} पर आपकी प्रोफ़ाइल और वेबसाइट *(${websiteUrl})* का लाइव टेक्निकल चेक किया। आपकी ${ratingText} रेपुटेशन शानदार है — *लेकिन* अभी आपकी साइट पर:
🔍 _${observedNote}_

इसका सीधा नुकसान यह हो रहा है कि जो ग्राहक Google से आपकी साइट पर आते हैं, उनमें से कई बिना कॉल/इंक्वायरी किए आपके competitors के पास चले जाते हैं।

🎁 *हमारा रिस्क-फ्री ऑफर (सिर्फ 3 बिज़नेस इस हफ्ते):*
पैसे देने से *पहले* ही हम *${bizName}* के लिए एक **100% FREE Live Redesign Preview + Direct WhatsApp Inquiry Setup** तैयार करके दिखाएंगे।
✅ पसंद आए तभी आगे बढ़ें — वरना ₹0 खर्च!
⚡ 3–5 दिन में Ultra-Fast, Mobile-First & Google-Ready अपग्रेड।

👇 *सिर्फ 10 सेकंड में बताएं — आप क्या बनवाना/अपडेट कराना चाहते हैं?*
👉 *1* लिखकर भेजें — *Website / App / Software UPDATE कराना है*
👉 *2* लिखकर भेजें — *बिलकुल NEW Website / App / Game बनवाना है*
👉 *YES* लिखें — *मुझे 24 घंटे में FREE Live Demo भेजें*

📞 Direct Call / WhatsApp: *${MAXEDLOGIC_SENDER.senderPhoneFormatted}*
✉️ Email: ${activeSenderEmail}
— *Abdul Hafiz | MaxedLogic*`;

    const defaultEmailSubject = `Free Live Redesign Idea for ${bizName} (${cleanCity}) — Found via ${originPlatform}`;

    const defaultEmailBody = `Hello ${cleanContact === 'जी' ? `${bizName} Team` : cleanContact},

📍 Where We Found Your Business:
We discovered ${bizName} (${cleanCity}) via ${originPlatform}${proofSourceUrl ? ` (${proofSourceUrl})` : ''} and reviewed your current website (${websiteUrl}).

🔍 What We Observed Live:
${observedNote}

Even with a strong ${ratingText} reputation, visitors who hit friction on mobile or don't see an instant booking/WhatsApp inquiry button leave within 8 seconds—handing ready-to-buy customers directly to faster competitors.

🎁 OUR ZERO-RISK OFFER FOR ${bizName.toUpperCase()}:
Before you spend a single rupee or dollar, my engineering team at MaxedLogic (https://maxedlogic.com) will build a **100% FREE Interactive Redesign Preview & Speed/Conversion Roadmap** specifically for ${bizName} within 24 hours.

What you get if you partner with us (or keep the ideas for free either way):
1. Ultra-Fast (<1.5s) Mobile-First Redesign or Brand-New Web Platform / E-Commerce Store
2. Optional Custom Android/iOS Mobile App, CRM/ERP Software, or Interactive Web/Game Experience
3. Direct 1-Click WhatsApp & Instant Lead Capture Integration (Zero missed inquiries)
4. Transparent Fixed Pricing + 3–7 Day Rapid Launch + 30 Days Complimentary Support

👉 PLEASE CHOOSE ONE OPTION BELOW (Takes 5 Seconds):

[1] ✅ I AM INTERESTED (Get Free 24h Interactive Demo & Quote):
👉 Click: ${interestedActionUrl}
(Or simply reply "YES" to this email)

[2] ❌ I AM NOT INTERESTED:
👉 Click: ${notInterestedActionUrl}
(Or reply "NO" and we won't follow up again)

[3] 🤖 OPEN INTERACTIVE PROJECT CHATBOT:
👉 Click: ${chatbotDirectUrl}

[4] 💬 DIRECT WHATSAPP CHAT WITH FOUNDER:
👉 ${whatsAppDirectLink}

📞 Direct Call / WhatsApp: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}
🌐 Agency Portfolio: https://maxedlogic.com
✉️ Reply Directly: ${activeSenderEmail}

Best regards,
Abdul Hafiz | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 ${MAXEDLOGIC_SENDER.senderPhoneFormatted}`;

    const whatsAppText = customConfig?.updateWhatsAppText
      ? interpolatePitchTemplate(customConfig.updateWhatsAppText, templateVars)
      : defaultWhatsAppText;
    const emailSubject = customConfig?.updateSubject
      ? interpolatePitchTemplate(customConfig.updateSubject, templateVars)
      : defaultEmailSubject;
    const emailBody = customConfig?.updateEmailBody
      ? interpolatePitchTemplate(customConfig.updateEmailBody, templateVars)
      : defaultEmailBody;

    const whatsAppUrl = cleanTargetPhone
      ? `https://wa.me/${cleanTargetPhone}?text=${encodeURIComponent(whatsAppText)}`
      : '';

    const whatsAppWebUrl = cleanTargetPhone
      ? `https://web.whatsapp.com/send?phone=${cleanTargetPhone}&text=${encodeURIComponent(whatsAppText)}`
      : '';

    const gmailWebUrl = targetEmail
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
      : '';

    const mailtoUrl = targetEmail
      ? `mailto:${targetEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
      : '';

    const whatsAppInteractivePayload = {
      messaging_product: 'whatsapp' as const,
      recipient_type: 'individual' as const,
      to: cleanTargetPhone,
      type: 'interactive' as const,
      interactive: {
        type: 'button' as const,
        header: {
          type: 'text' as const,
          text: `MaxedLogic • +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}`,
        },
        body: {
          text: `Namaste ${cleanContact}! Main *Abdul Hafiz* (MaxedLogic • +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}).\n🎁 *${bizName}* ke liye hum 24h me *100% FREE Live Redesign Demo* bana kar bhej rahe hain (₹0 advance).\n\nNeeche ek option choose karein:`,
        },
        footer: {
          text: 'Step 1 of 4 • Update or New Create',
        },
        action: {
          buttons: SERVICE_MODES.map((m) => ({
            type: 'reply' as const,
            reply: {
              id: m.id,
              title: m.shortTitle,
            },
          })),
        },
      },
    };

    return {
      pitchType: 'UPDATE_WEBSITE',
      pitchTypeLabel: 'वेबसाइट अपडेट / रीडिजाइन (Website Update)',
      whatsAppText,
      emailSubject,
      emailBody,
      emailHtml: buildInteractiveEmailHtml(emailSubject, emailBody, lead.id, bizName),
      whatsAppUrl,
      whatsAppWebUrl,
      gmailWebUrl,
      mailtoUrl,
      targetPhone: rawTargetPhone,
      targetEmail,
      senderEmailUsed: activeSenderEmail,
      whatsAppInteractivePayload,
    };
  } else {
    // ----------------------------------------------------
    // CASE 2: Buy (Active RFP/Hiring/Software) OR New Create (Brand-New Website/App/Game/Software)
    // ----------------------------------------------------
    const isBuyIntent = resolvedBuyerNeed === 'Buy';
    const serviceNeeded =
      lead.serviceRequired && lead.serviceRequired !== 'Not publicly available'
        ? lead.serviceRequired
        : 'Custom Website, Mobile App, Game, or Business Software';

    const defaultWhatsAppText = isBuyIntent
      ? `नमस्ते ${cleanContact} 👋,
मैं *Abdul Hafiz* — Founder, *MaxedLogic (maxedlogic.com)*।

📍 *हमें आपकी ${originPlatform} पोस्ट से आपकी जरूरत का पता चला:*
आप *${bizName} (${cleanCity})* के लिए *${serviceNeeded}* खरीदने / बनवाने (Buy / Build) के लिए सही टेक्निकल पार्टनर देख रहे हैं:
🔍 _${observedNote}_

🎁 *हमारा 100% रिस्क-फ्री ऑफर:*
एडवांस पेमेंट या कमिटमेंट से *पहले* ही हम आपके प्रोजेक्ट का **Architecture Roadmap, Live Interactive Prototype & Fixed Budget Estimate** सिर्फ 24 घंटे में बनाकर भेज देंगे!
✅ पसंद आए तभी आगे बढ़ें — वरना ₹0 खर्च!
⚡ Full-Stack Websites, Mobile Apps (Android/iOS), Custom CRM/ERP/MLM Software, Games & AI Automation — 3–7 दिन में Rapid Kickoff।

👇 *तुरंत 1 रिप्लाई करें:*
👉 *YES* — *मुझे 24h में FREE Live Prototype & Quote भेजें*
👉 *1* — *मौजूदा सिस्टम UPDATE कराना है*
👉 *2* — *बिलकुल NEW ${serviceNeeded} बनवाना है*

📞 Direct Call / WhatsApp: *${MAXEDLOGIC_SENDER.senderPhoneFormatted}*
✉️ Email: ${activeSenderEmail}
— *Abdul Hafiz | MaxedLogic*`
      : `नमस्ते ${cleanContact} 👋,
मैं *Abdul Hafiz* — Founder, *MaxedLogic (maxedlogic.com)*।

📍 *${originPlatform} पर हमें ${bizName} (${cleanCity}) मिला:*
आज जब ग्राहक Google पर सर्च करते हैं, तो 80%+ लोग कॉल करने से पहले ऑफिशियल Website, सर्विसेज और रेटिंग चेक करते हैं — और अभी आपके बिज़नेस की ऑफिशियल वेबसाइट/ऐप ऑनलाइन उपलब्ध नहीं होने से रोज़ाना कई हाई-वैल्यू ग्राहक सीधे competitors के पास जा रहे हैं।

🎁 *हमारा 100% रिस्क-फ्री ऑफर:*
बिना एक रुपया खर्च किए, हम *${bizName}* के लिए सिर्फ **24 घंटे में एक FREE Live Homepage Prototype / App Demo** बनाकर भेजेंगे!
✅ पहले खुद लाइव डेमो देखें — पसंद आए तभी काम शुरू करें (₹0 advance risk)।
⚡ 3–5 दिन में Ultra-Fast Website, E-Commerce Store, Mobile App, Game या Custom Software + 1-Click WhatsApp Lead Capture तैयार!

👇 *बस 1 रिप्लाई करें और अपना फ्री डेमो पाएं:*
👉 *1* — *मौजूदा सिस्टम UPDATE कराना है*
👉 *2* — *बिलकुल NEW Website / App / Game / Software बनवाना है*
👉 *YES* — *हाँ, मुझे 24 घंटे में FREE Live Demo भेजें*

📞 Direct Call / WhatsApp: *${MAXEDLOGIC_SENDER.senderPhoneFormatted}*
✉️ Email: ${activeSenderEmail}
— *Abdul Hafiz | MaxedLogic*`;

    const defaultEmailSubject = isBuyIntent
      ? `Re: ${bizName} ${serviceNeeded} Requirement (via ${originPlatform}) — Free 24h Prototype & Fixed Quote`
      : `Built a Free Website / App Concept for ${bizName} (${cleanCity}) — Found via ${originPlatform}`;

    const defaultEmailBody = isBuyIntent
      ? `Hello ${cleanContact === 'जी' ? `${bizName} Team` : cleanContact},

📍 Where We Found Your Requirement:
We came across ${bizName} (${cleanCity}) on ${originPlatform}${proofSourceUrl ? ` (${proofSourceUrl})` : ''} regarding your active need for ${serviceNeeded}.

🔍 Requirement & Scope We Noted:
${observedNote}

Rather than sending you a generic agency brochure, my senior engineering team at MaxedLogic (https://maxedlogic.com) would like to prove our quality upfront.

🎁 OUR ZERO-RISK OFFER FOR ${bizName.toUpperCase()}:
Within 24 hours—at **₹0 / $0 upfront cost**—we will prepare a **FREE Working UI/Prototype Concept + System Architecture & Fixed-Cost Delivery Plan** tailored to ${bizName}.

What MaxedLogic builds & delivers end-to-end:
• High-Converting Business Websites, Portals & E-Commerce Platforms
• Custom Android & iOS Mobile Applications (Booking, Delivery, Marketplace, Fintech)
• Custom Business Software, CRM / ERP, MLM Software & AI Workflow Automation
• 2D / 3D / Multiplayer Web & Mobile Games
• Full Source Code Ownership + Rapid Launch + 30 Days Complimentary Support

👉 PLEASE CHOOSE ONE OPTION BELOW (Takes 5 Seconds):

[1] ✅ I AM INTERESTED (Get Free 24h Interactive Demo & Quote):
👉 Click: ${interestedActionUrl}
(Or simply reply "YES" to this email)

[2] ❌ I AM NOT INTERESTED:
👉 Click: ${notInterestedActionUrl}
(Or reply "NO" and we won't follow up again)

[3] 🤖 OPEN INTERACTIVE PROJECT CHATBOT:
👉 Click: ${chatbotDirectUrl}

[4] 💬 DIRECT WHATSAPP CHAT WITH FOUNDER:
👉 ${whatsAppDirectLink}

📞 Direct Call / WhatsApp: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}
🌐 Agency Portfolio: https://maxedlogic.com
✉️ Reply Directly: ${activeSenderEmail}

Best regards,
Abdul Hafiz | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 ${MAXEDLOGIC_SENDER.senderPhoneFormatted}`
      : `Hello ${cleanContact === 'जी' ? `${bizName} Team` : cleanContact},

📍 Where We Found Your Business:
We discovered ${bizName} (${cleanCity}) via ${originPlatform}${proofSourceUrl ? ` (${proofSourceUrl})` : ''} — and noticed competitors in your market are capturing Google search & mobile bookings simply because ${bizName} doesn't yet have a modern dedicated web/app platform live.

🔍 What We Observed:
${observedNote}

🎁 OUR ZERO-RISK OFFER FOR ${bizName.toUpperCase()}:
We would love to design a **100% FREE, Custom Live Prototype Demo** for ${bizName} within 24 hours — zero cost, zero obligation.

If you like the preview, MaxedLogic (https://maxedlogic.com) can launch your full solution in just 3–7 days:
• High-Converting Business Website / E-Commerce Store (with Online Payments & SEO)
• Custom Android & iOS Mobile Apps (Delivery, Booking, CRM, Customer Loyalty)
• Custom Business Software / ERP / CRM / Billing Automation
• 2D / 3D / Multiplayer Games & Interactive Brand Experiences
• Direct 1-Click WhatsApp Lead Capture so every visitor lands straight on your phone

👉 PLEASE CHOOSE ONE OPTION BELOW (Takes 5 Seconds):

[1] ✅ I AM INTERESTED (Get Free 24h Interactive Demo & Quote):
👉 Click: ${interestedActionUrl}
(Or simply reply "YES" to this email)

[2] ❌ I AM NOT INTERESTED:
👉 Click: ${notInterestedActionUrl}
(Or reply "NO" and we won't disturb you again)

[3] 🤖 OPEN INTERACTIVE PROJECT CHATBOT:
👉 Click: ${chatbotDirectUrl}

[4] 💬 DIRECT WHATSAPP CHAT WITH FOUNDER:
👉 ${whatsAppDirectLink}

📞 Direct Call / WhatsApp: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}
🌐 Agency Website: https://maxedlogic.com
✉️ Reply Directly: ${activeSenderEmail}

Warm regards,
Abdul Hafiz | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 ${MAXEDLOGIC_SENDER.senderPhoneFormatted}`;

    const whatsAppText = customConfig?.newWhatsAppText
      ? interpolatePitchTemplate(customConfig.newWhatsAppText, templateVars)
      : defaultWhatsAppText;
    const emailSubject = customConfig?.newSubject
      ? interpolatePitchTemplate(customConfig.newSubject, templateVars)
      : defaultEmailSubject;
    const emailBody = customConfig?.newEmailBody
      ? interpolatePitchTemplate(customConfig.newEmailBody, templateVars)
      : defaultEmailBody;

    const whatsAppUrl = cleanTargetPhone
      ? `https://wa.me/${cleanTargetPhone}?text=${encodeURIComponent(whatsAppText)}`
      : '';

    const whatsAppWebUrl = cleanTargetPhone
      ? `https://web.whatsapp.com/send?phone=${cleanTargetPhone}&text=${encodeURIComponent(whatsAppText)}`
      : '';

    const gmailWebUrl = targetEmail
      ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
      : '';

    const mailtoUrl = targetEmail
      ? `mailto:${targetEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
      : '';

    const whatsAppInteractivePayload = {
      messaging_product: 'whatsapp' as const,
      recipient_type: 'individual' as const,
      to: cleanTargetPhone,
      type: 'interactive' as const,
      interactive: {
        type: 'button' as const,
        header: {
          type: 'text' as const,
          text: `MaxedLogic • +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}`,
        },
        body: {
          text: `Namaste ${cleanContact}! Main *Abdul Hafiz* (MaxedLogic • +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}).\n🎁 *${bizName}* ke liye hum 24h me *100% FREE Website / App / Game Prototype Demo* bana kar bhej rahe hain (₹0 advance).\n\nNeeche ek option choose karein:`,
        },
        footer: {
          text: 'Step 1 of 4 • Update or New Create',
        },
        action: {
          buttons: SERVICE_MODES.map((m) => ({
            type: 'reply' as const,
            reply: {
              id: m.id,
              title: m.shortTitle,
            },
          })),
        },
      },
    };

    return {
      pitchType: 'NEW_WEBSITE',
      pitchTypeLabel: isBuyIntent
        ? 'सॉफ्टवेयर / प्रोजेक्ट खरीदना है (Buy / Build Project)'
        : 'नई वेबसाइट / ऐप बनवानी है (New Create)',
      whatsAppText,
      emailSubject,
      emailBody,
      emailHtml: buildInteractiveEmailHtml(emailSubject, emailBody, lead.id, bizName),
      whatsAppUrl,
      whatsAppWebUrl,
      gmailWebUrl,
      mailtoUrl,
      targetPhone: rawTargetPhone,
      targetEmail,
      senderEmailUsed: activeSenderEmail,
      whatsAppInteractivePayload,
    };
  }
}

/**
 * ⏳ Follow-Up Pitch Generator for leads previously contacted but not yet replied
 */
export function getMaxedLogicFollowUpPitch(lead: Lead, customSenderEmail?: string): MaxedLogicPitchResult {
  const activeSenderEmail = customSenderEmail?.trim() || getConfiguredSenderEmail();
  const contactName = lead.contactPerson && lead.contactPerson.trim() ? lead.contactPerson : 'जी';
  const bizName = lead.businessName || 'आपका बिज़नेस';
  const city = lead.city || 'आपके शहर';
  const category = lead.category || 'बिज़नेस';
  const ratingText = lead.rating ? `${lead.rating}★` : '4+★';
  const websiteUrl = lead.websiteUrl || 'मौजूदा साइट';
  const customConfig = getCustomPitchConfig();

  const templateVars: Record<string, string> = {
    businessName: bizName,
    contactPerson: contactName,
    city,
    category,
    rating: ratingText,
    websiteUrl,
    senderEmail: activeSenderEmail,
    senderPhone: MAXEDLOGIC_SENDER.senderPhoneFormatted,
    senderName: MAXEDLOGIC_SENDER.senderName,
    companyName: MAXEDLOGIC_SENDER.companyName,
    companyWebsite: MAXEDLOGIC_SENDER.companyWebsite,
  };

  const rawTargetPhone = lead.whatsAppNumber || lead.ownerPhone || lead.locationPhone || lead.phoneNumber || '';
  const cleanTargetPhone = normalizeClientPhoneDigits(rawTargetPhone, lead.countryName || lead.countryCode);

  const targetEmail = lead.email || '';

  const cleanContact = contactName === 'Not publicly available' ? 'जी' : contactName;
  const cleanCity = city === 'Not publicly available' ? 'आपके शहर' : city;

  const defaultWhatsAppText = `नमस्ते ${cleanContact} 👋,
मैं *Abdul Hafiz* — *MaxedLogic (maxedlogic.com)* से।

मैंने *${bizName} (${cleanCity})* के लिए आपका **FREE Custom Demo Mockup Slot** होल्ड कर रखा है, लेकिन इस हफ्ते हमारे पास सिर्फ **2 Priority Demo Slots** बचे हैं।

आप बिना ₹1 दिए पहले अपने बिज़नेस का लाइव प्रोटोटाइप देख सकते हैं — चाहे आपको:
✅ पुरानी वेबसाइट/ऐप को **Fast & Modern Update** कराना हो, या
✅ नई **Website / Mobile App / Software / Game** बनवानी हो।

👇 *बस एक शब्द रिप्लाई करें:*
👉 *YES* — हाँ, मुझे फ्री डेमो और बेस्ट रेट भेजें
👉 *CALL* — मुझे 5 मिनट की कॉल पर डिटेल बताएं
👉 *NO* — अभी ज़रूरत नहीं है

📞 Direct Call / WhatsApp: *${MAXEDLOGIC_SENDER.senderPhoneFormatted}*
— *Abdul Hafiz | MaxedLogic*`;

  const defaultEmailSubject = `Holding 1 Free Custom Demo Slot for ${bizName} — Should I send it over?`;

  const defaultEmailBody = `Hello ${cleanContact === 'जी' ? `${bizName} Team` : cleanContact},

Quick follow-up from my previous note regarding ${bizName} (${cleanCity}) — I know you're busy running daily operations!

We currently have **2 complimentary custom prototype slots open this week**, and I held one for ${bizName} in case you'd like to see how a faster website, mobile app, or custom automation portal could double your incoming client inquiries.

Zero cost, zero pressure — you only pay if you love what we build and decide to launch.

👉 Simply reply **"YES"** (and I'll send a custom 2-minute prototype + fixed quote in 24h), or call/WhatsApp me directly at **${MAXEDLOGIC_SENDER.senderPhoneFormatted}** anytime today.

(If now isn't the right time, reply "NO" and I'll close your file immediately.)

Best regards,
Abdul Hafiz | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 WhatsApp / Call: ${MAXEDLOGIC_SENDER.senderPhoneFormatted}
✉️ Email: ${activeSenderEmail}`;

  const whatsAppText = customConfig?.followUpWhatsAppText
    ? interpolatePitchTemplate(customConfig.followUpWhatsAppText, templateVars)
    : defaultWhatsAppText;
  const emailSubject = customConfig?.followUpSubject
    ? interpolatePitchTemplate(customConfig.followUpSubject, templateVars)
    : defaultEmailSubject;
  const emailBody = customConfig?.followUpEmailBody
    ? interpolatePitchTemplate(customConfig.followUpEmailBody, templateVars)
    : defaultEmailBody;

  const whatsAppUrl = cleanTargetPhone
    ? `https://wa.me/${cleanTargetPhone}?text=${encodeURIComponent(whatsAppText)}`
    : '';

  const whatsAppWebUrl = cleanTargetPhone
    ? `https://web.whatsapp.com/send?phone=${cleanTargetPhone}&text=${encodeURIComponent(whatsAppText)}`
    : '';

  const gmailWebUrl = targetEmail
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(targetEmail)}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : '';

  const mailtoUrl = targetEmail
    ? `mailto:${targetEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`
    : '';

  const whatsAppInteractivePayload = {
    messaging_product: 'whatsapp' as const,
    recipient_type: 'individual' as const,
    to: cleanTargetPhone,
    type: 'interactive' as const,
    interactive: {
      type: 'button' as const,
      header: {
        type: 'text' as const,
        text: `MaxedLogic • Follow-up for ${bizName}`,
      },
      body: {
        text: `नमस्ते ${contactName}! MaxedLogic (maxedlogic.com) से। क्या आप ${bizName} के लिए 100% फ्री लाइव प्रोटोटाइप देखना चाहेंगे?`,
      },
      footer: {
        text: `Abdul Hafiz | +91 ${MAXEDLOGIC_SENDER.senderPhoneRaw}`,
      },
      action: {
        buttons: [
          {
            type: 'reply' as const,
            reply: {
              id: 'btn_yes_demo',
              title: '✅ YES (Show Demo)',
            },
          },
          {
            type: 'reply' as const,
            reply: {
              id: 'btn_no_thanks',
              title: '❌ NO (Not Now)',
            },
          },
        ],
      },
    },
  };

  return {
    pitchType: 'FOLLOW_UP',
    pitchTypeLabel: 'फ़ॉलो-अप संदेश (Follow-Up Outreach)',
    whatsAppText,
    emailSubject,
    emailBody,
    whatsAppUrl,
    whatsAppWebUrl,
    gmailWebUrl,
    mailtoUrl,
    targetPhone: rawTargetPhone,
    targetEmail,
    senderEmailUsed: activeSenderEmail,
    whatsAppInteractivePayload,
  };
}
