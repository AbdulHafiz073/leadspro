import React, { useState, useEffect } from 'react';
import {
  Key,
  Shield,
  Clock,
  Save,
  CheckCircle,
  Eye,
  EyeOff,
  Database,
  Lock,
  Zap,
  Globe2,
  RefreshCw,
  Sliders,
  Mail,
  MessageSquare,
  Sparkles,
  RotateCcw,
  UserCheck,
  Send,
  HelpCircle,
  Check
} from 'lucide-react';
import { useFetch } from '../context/FetchContext';
import {
  CustomPitchConfig,
  getCustomPitchConfig,
  saveCustomPitchConfig,
  resetCustomPitchConfig,
  interpolatePitchTemplate,
  MAXEDLOGIC_SENDER,
  getConfiguredSenderEmail,
  setConfiguredSenderEmail,
  getConfiguredSenderPhone,
  setConfiguredSenderPhone,
} from '../utils/maxedLogicPitches';
import {
  fetchCustomPitchTemplates,
  saveCustomPitchTemplatesToDb,
  resetCustomPitchTemplatesInDb,
} from '../services/googleLeadsApi';

interface SettingsPageProps {
  onShowToast: (title: string, message: string, type: 'success' | 'error' | 'info') => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onShowToast }) => {
  const { settings, updateSettings } = useFetch();
  const [activeSettingsTab, setActiveSettingsTab] = useState<'pitchEditor' | 'apiKeys'>('pitchEditor');
  const [formData, setFormData] = useState({ ...settings });
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Pitch Template Customization State
  const [activePitchType, setActivePitchType] = useState<'update' | 'new' | 'followup'>('update');
  const [senderEmailInput, setSenderEmailInput] = useState<string>(() => getConfiguredSenderEmail());
  const [senderPhoneInput, setSenderPhoneInput] = useState<string>(() => getConfiguredSenderPhone());

  // Default templates for fallbacks
  const defaultTemplates: CustomPitchConfig = {
    updateSubject: 'Quick Free Demo Idea for {businessName} (Fixing Lost Inquiries on {websiteUrl})',
    updateEmailBody: `Hello {contactPerson},

I noticed something important while reviewing {businessName} ({city}) and your current website ({websiteUrl}):

Even with a strong {rating} reputation, visitors who hit slow mobile speeds or don't see an instant WhatsApp/booking button leave within 8 seconds—handing ready-to-buy customers directly to faster competitors.

🎁 OUR ZERO-RISK INVITATION FOR {businessName}:
Before you spend a single rupee or dollar, my engineering team at MaxedLogic (https://maxedlogic.com) will build a **100% FREE Interactive Redesign Preview & Speed/Conversion Roadmap** specifically for {businessName} within 24 hours.

What you get if you partner with us:
1. Ultra-Fast (<1.5s) Mobile-First Redesign or Brand-New Web Platform / E-Commerce Store
2. Optional Custom Android/iOS Mobile App, CRM/ERP Software, or Interactive Web/Game Experience
3. Direct 1-Click WhatsApp & Instant Lead Capture Integration (Zero missed inquiries)
4. Transparent Fixed Pricing + 3–7 Day Rapid Launch + 30 Days Complimentary Support

👉 SIMPLY REPLY "YES" (or "DEMO") TO THIS EMAIL — and tell us what you want to update or create (Website / App / Software / Game). We will send your custom complimentary prototype within 24 hours.

Prefer a 2-minute WhatsApp chat or direct call right now?
📞 Direct Call / WhatsApp: {senderPhone}
🌐 Agency Website: https://maxedlogic.com
✉️ Reply Directly: {senderEmail}

(If this isn't a priority right now, reply "NO" and I won't follow up again.)

Best regards,
{senderName} | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 {senderPhone}`,

    updateWhatsAppText: `नमस्ते {contactPerson} 👋,
मैं *{senderName}* — Founder, *MaxedLogic (maxedlogic.com)*।

⚠️ *{businessName} ({city}) के लिए एक ज़रूरी नोटिस:*
हमने आपकी वेबसाइट *({websiteUrl})* का लाइव चेक किया। आपकी {rating} रेपुटेशन शानदार है — लेकिन मोबाइल स्पीड व इंस्टेंट व्हाट्सएप/इंक्वायरी बटन की कमी से कई ग्राहक बिना कॉल किए competitors के पास चले जाते हैं।

🎁 *हमारा रिस्क-फ्री ऑफर (सिर्फ 3 बिज़नेस इस हफ्ते):*
पैसे देने से *पहले* ही हम *{businessName}* के लिए **24 घंटे में 100% FREE Live Redesign Preview + Direct WhatsApp Inquiry Setup** तैयार करके दिखाएंगे।
✅ पसंद आए तभी आगे बढ़ें — वरना ₹0 खर्च!
⚡ 3–5 दिन में Ultra-Fast, Mobile-First & Google-Ready अपग्रेड।

👇 *सिर्फ 10 सेकंड में बताएं — आप क्या कराना चाहते हैं?*
👉 *1* — *Website / App / Software UPDATE कराना है*
👉 *2* — *बिलकुल NEW Website / App / Game बनवाना है*
👉 *YES* — *मुझे 24 घंटे में FREE Live Demo भेजें*

📞 Direct Call / WhatsApp: *{senderPhone}*
✉️ Email: {senderEmail}
— *{senderName} | MaxedLogic*`,

    newSubject: 'Built a Free Homepage Concept Idea for {businessName} ({city}) — Quick Look?',
    newEmailBody: `Hello {contactPerson},

While researching top businesses in {city}, I came across {businessName} ({rating}) — and noticed competitors in your market are capturing Google search & mobile bookings simply because {businessName} doesn't yet have a modern dedicated web/app platform live.

🎁 SO HERE IS MY ZERO-RISK OFFER FOR {businessName}:
We would love to design a **100% FREE, Custom Live Prototype Demo** for {businessName} within 24 hours — zero cost, zero obligation.

If you like the preview, MaxedLogic (https://maxedlogic.com) can launch your full solution in just 3–7 days:
• High-Converting Business Website / E-Commerce Store (with Online Payments & SEO)
• Custom Android & iOS Mobile Apps (Delivery, Booking, CRM, Customer Loyalty)
• Custom Business Software / ERP / CRM / Billing Automation
• 2D / 3D / Multiplayer Games & Interactive Brand Experiences
• Direct 1-Click WhatsApp Lead Capture so every visitor lands straight on your phone

👉 JUST REPLY "YES" (or "DEMO") TO THIS EMAIL — let us know whether you want a Website, Mobile App, Software, or Game, and we'll send your custom concept + fixed transparent pricing tomorrow.

Need an urgent quote or want to see live samples right now?
📞 Direct Call / WhatsApp: {senderPhone}
🌐 Agency Website: https://maxedlogic.com
✉️ Reply Directly: {senderEmail}

(Not looking right now? Simply reply "NO" and we won't disturb you again.)

Warm regards,
{senderName} | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 {senderPhone}`,

    newWhatsAppText: `नमस्ते {contactPerson} 👋,
मैं *{senderName}* — Founder, *MaxedLogic (maxedlogic.com)*।

⚠️ *{businessName} ({city}) के लिए महत्वपूर्ण अवसर:*
आज 80%+ ग्राहक कॉल करने से पहले Google पर Website और सर्विसेज चेक करते हैं — ऑफिशियल वेबसाइट/ऐप न होने से रोज़ाना कई हाई-वैल्यू ग्राहक सीधे competitors के पास जा रहे हैं।

🎁 *हमारा 100% रिस्क-फ्री ऑफर:*
बिना एक रुपया खर्च किए, हम *{businessName}* के लिए सिर्फ **24 घंटे में एक FREE Live Homepage Prototype / App Demo** बनाकर भेजेंगे!
✅ पहले खुद लाइव डेमो देखें — पसंद आए तभी काम शुरू करें (₹0 advance risk)।
⚡ 3–5 दिन में Ultra-Fast Website, E-Commerce Store, Mobile App, Game या Custom Software + 1-Click WhatsApp Lead Capture तैयार!

👇 *बस 1 रिप्लाई करें और अपना फ्री डेमो पाएं:*
👉 *1* — *मौजूदा सिस्टम UPDATE कराना है*
👉 *2* — *बिलकुल NEW Website / App / Game / Software बनवाना है*
👉 *YES* — *हाँ, मुझे 24 घंटे में FREE Live Demo भेजें*

📞 Direct Call / WhatsApp: *{senderPhone}*
✉️ Email: {senderEmail}
— *{senderName} | MaxedLogic*`,

    followUpSubject: 'Holding 1 Free Custom Demo Slot for {businessName} — Should I send it over?',
    followUpEmailBody: `Hello {contactPerson},

Quick follow-up from my previous note regarding {businessName} ({city}) — I know you're busy running daily operations!

We currently have **2 complimentary custom prototype slots open this week**, and I held one for {businessName} in case you'd like to see how a faster website, mobile app, or custom automation portal could double your incoming client inquiries.

Zero cost, zero pressure — you only pay if you love what we build and decide to launch.

👉 Simply reply **"YES"** (and I'll send a custom 2-minute prototype + fixed quote in 24h), or call/WhatsApp me directly at **{senderPhone}** anytime today.

(If now isn't the right time, reply "NO" and I'll close your file immediately.)

Best regards,
{senderName} | Founder & Principal Architect
MaxedLogic (https://maxedlogic.com)
📞 WhatsApp / Call: {senderPhone}
✉️ Email: {senderEmail}`,

    followUpWhatsAppText: `नमस्ते {contactPerson} 👋,
मैं *{senderName}* — *MaxedLogic (maxedlogic.com)* से।

मैंने *{businessName} ({city})* के लिए आपका **FREE Custom Demo Mockup Slot** होल्ड कर रखा है, लेकिन इस हफ्ते हमारे पास सिर्फ **2 Priority Demo Slots** बचे हैं।

आप बिना ₹1 दिए पहले अपने बिज़नेस का लाइव प्रोटोटाइप देख सकते हैं — चाहे आपको:
✅ पुरानी वेबसाइट/ऐप को **Fast & Modern Update** कराना हो, या
✅ नई **Website / Mobile App / Software / Game** बनवानी हो।

👇 *बस एक शब्द रिप्लाई करें:*
👉 *YES* — हाँ, मुझे फ्री डेमो और बेस्ट रेट भेजें
👉 *CALL* — मुझे 5 मिनट की कॉल पर डिटेल बताएं
👉 *NO* — अभी ज़रूरत नहीं है

📞 Direct Call / WhatsApp: *{senderPhone}*
— *{senderName} | MaxedLogic*`,
  };

  const [pitchTemplates, setPitchTemplates] = useState<CustomPitchConfig>(() => {
    const saved = getCustomPitchConfig();
    return saved ? { ...defaultTemplates, ...saved } : defaultTemplates;
  });

  const [hasCustomEdits, setHasCustomEdits] = useState<boolean>(() => Boolean(getCustomPitchConfig()));

  useEffect(() => {
    void fetchCustomPitchTemplates()
      .then((res) => {
        if (res.success && res.templates) {
          const merged = { ...defaultTemplates, ...res.templates } as CustomPitchConfig;
          setPitchTemplates(merged);
          saveCustomPitchConfig(merged);
          setHasCustomEdits(true);
        }
        if (res.success && res.senderEmail) {
          setSenderEmailInput(res.senderEmail);
          setConfiguredSenderEmail(res.senderEmail);
        }
        if (res.success && res.senderPhone) {
          setSenderPhoneInput(res.senderPhone);
          setConfiguredSenderPhone(res.senderPhone);
        }
      })
      .catch(() => {});
  }, []);

  const toggleShowKey = (field: string) => {
    setShowKeys((prev) => ({ ...prev, [field]: !prev[field] }));
  };

  const handleSaveApiKeys = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      updateSettings(formData);
      setIsSaving(false);
      onShowToast('Settings Saved', 'Discovery schedule and outreach configuration saved.', 'success');
    }, 400);
  };

  const handleSavePitchTemplates = async () => {
    saveCustomPitchConfig(pitchTemplates);
    setConfiguredSenderEmail(senderEmailInput.trim());
    setConfiguredSenderPhone(senderPhoneInput.trim());
    setHasCustomEdits(true);
    try {
      await saveCustomPitchTemplatesToDb({
        templates: { ...pitchTemplates },
        senderEmail: senderEmailInput.trim(),
        senderPhone: senderPhoneInput.trim(),
      });
    } catch {
      // localStorage already updated
    }
    onShowToast(
      'प्रपोजल मैसेज सुरक्षित हो गया! 🎉',
      'अब ऑटो-जीमेल बॉट, कैंपेन प्रीव्यू और व्हाट्सएप आउटरीच आपके इन कस्टमाइज़्ड मैसेज और सब्जेक्ट के साथ ही संदेश भेजेंगे।',
      'success'
    );
  };

  const handleResetPitchTemplates = async () => {
    resetCustomPitchConfig();
    setPitchTemplates(defaultTemplates);
    setHasCustomEdits(false);
    try {
      await resetCustomPitchTemplatesInDb();
    } catch {
      // non-blocking
    }
    onShowToast('डिफ़ॉल्ट रीसेट', 'MaxedLogic का मूल आधिकारिक प्रपोजल मैसेज रीस्टोर कर दिया गया है।', 'info');
  };

  // Variable buttons to insert into active pitch
  const availableVariables = [
    { label: '{businessName}', desc: 'क्लाइंट की दुकान/कंपनी का नाम' },
    { label: '{contactPerson}', desc: 'मालिक/मैनेजर का नाम' },
    { label: '{city}', desc: 'शहर (उदा. New Delhi, Dubai)' },
    { label: '{category}', desc: 'केटेगरी (उदा. Dentist, Salon)' },
    { label: '{rating}', desc: 'गूगल रेटिंग (उदा. 4.9★)' },
    { label: '{websiteUrl}', desc: 'वेबसाइट लिंक' },
    { label: '{sourcePlatform}', desc: 'लीड कहाँ से मिली (Google Maps, Upwork, LinkedIn...)' },
    { label: '{buyerNeedType}', desc: 'जरूरत (Buy / Update / New Create)' },
    { label: '{directSourceUrl}', desc: 'ओरिजिन पोस्ट या प्रोफाइल लिंक' },
    { label: '{whatsAppDirectLink}', desc: '1-Click WhatsApp Chat लिंक' },
    { label: '{senderName}', desc: 'आपका नाम (Abdul Hafiz)' },
    { label: '{senderPhone}', desc: 'आपका फ़ोन (+91 97597 25212)' },
    { label: '{senderEmail}', desc: 'आपका जीमेल (aabdulhafiz073@gmail.com)' },
  ];

  // Sample data for Live Preview
  const sampleBusiness = {
    businessName: 'Clove Dental Connaught Place',
    contactPerson: 'डॉ. शर्मा जी',
    city: 'New Delhi',
    category: 'Dentist',
    rating: '4.9★',
    websiteUrl: 'https://clovedental.in',
    sourcePlatform: 'Google Maps',
    buyerNeedType: activePitchType === 'update' ? 'Update' : 'New Create',
    directSourceUrl: 'https://www.google.com/maps/search/?api=1&query=Clove+Dental+New+Delhi',
    whatsAppDirectLink: 'https://wa.me/919759725212',
    senderName: 'Abdul Hafiz',
    senderEmail: senderEmailInput.trim() || 'aabdulhafiz073@gmail.com',
    senderPhone: senderPhoneInput.trim() || '+91 97597 25212',
    companyName: 'MaxedLogic',
    companyWebsite: 'https://maxedlogic.com',
  };

  const currentSubject =
    activePitchType === 'update'
      ? pitchTemplates.updateSubject
      : activePitchType === 'new'
      ? pitchTemplates.newSubject
      : pitchTemplates.followUpSubject;

  const currentEmailBody =
    activePitchType === 'update'
      ? pitchTemplates.updateEmailBody
      : activePitchType === 'new'
      ? pitchTemplates.newEmailBody
      : pitchTemplates.followUpEmailBody;

  const currentWhatsAppText =
    activePitchType === 'update'
      ? pitchTemplates.updateWhatsAppText
      : activePitchType === 'new'
      ? pitchTemplates.newWhatsAppText
      : pitchTemplates.followUpWhatsAppText;

  const previewSubject = interpolatePitchTemplate(currentSubject, sampleBusiness);
  const previewEmailBody = interpolatePitchTemplate(currentEmailBody, sampleBusiness);
  const previewWhatsAppText = interpolatePitchTemplate(currentWhatsAppText, sampleBusiness);

  return (
    <div className="page-content">
      {/* Header */}
      <div className="page-header" style={{ marginBottom: '1rem' }}>
        <div>
          <h2 className="page-title">⚙️ Control Center & Pitch Customizer</h2>
          <p className="page-subtitle">
            कस्टम प्रपोजल मैसेज, जीमेल आउटरीच स्पीड, और API बैकग्राउंड सेटिंग्स प्रबंधित करें।
          </p>
        </div>

        {activeSettingsTab === 'pitchEditor' ? (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {hasCustomEdits && (
              <button className="btn btn-outline" onClick={handleResetPitchTemplates} title="Reset to standard high-converting pitch">
                <RotateCcw size={15} />
                <span>Reset to Default</span>
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSavePitchTemplates} style={{ background: '#2563eb' }}>
              <Save size={15} />
              <span>Save Pitch Template</span>
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={handleSaveApiKeys} disabled={isSaving}>
            <Save size={16} />
            <span>{isSaving ? 'Encrypting & Saving...' : 'Save All Settings'}</span>
          </button>
        )}
      </div>

      {/* Top Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: '0.75rem',
          borderBottom: '1px solid var(--border-color)',
          paddingBottom: '0.75rem',
          marginBottom: '1.25rem',
        }}
      >
        <button
          className={`btn ${activeSettingsTab === 'pitchEditor' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveSettingsTab('pitchEditor')}
          style={{
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            background: activeSettingsTab === 'pitchEditor' ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : undefined,
          }}
        >
          <Mail size={16} />
          <span>1. प्रपोजल मैसेज एडिटर (Pitch Template Editor)</span>
          {hasCustomEdits && <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Customized</span>}
        </button>

        <button
          className={`btn ${activeSettingsTab === 'apiKeys' ? 'btn-primary' : 'btn-outline'}`}
          onClick={() => setActiveSettingsTab('apiKeys')}
          style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Sliders size={16} />
          <span>2. API Architecture & Discovery Config</span>
        </button>
      </div>

      {activeSettingsTab === 'pitchEditor' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Sender Profile Lock Card */}
          <div
            className="card"
            style={{
              borderLeft: '4px solid #2563eb',
              background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.04) 0%, rgba(14, 165, 233, 0.04) 100%)',
            }}
          >
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#2563eb',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: '1.1rem',
                  }}
                >
                  AH
                </div>
                <div>
                  <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                    Abdul Hafiz | MaxedLogic Lead Outbound Station
                  </h4>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '1rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                    <span>
                      🌐 <strong>maxedlogic.com</strong>
                    </span>
                    <span>
                      📞 <strong>{senderPhoneInput}</strong>
                    </span>
                    <span>
                      ✉️ <strong>{senderEmailInput}</strong>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>Sender Gmail</label>
                  <input
                    type="email"
                    className="input-field"
                    value={senderEmailInput}
                    onChange={(e) => setSenderEmailInput(e.target.value)}
                    style={{ fontSize: '0.85rem', width: '220px' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>WhatsApp Number</label>
                  <input
                    type="text"
                    className="input-field"
                    value={senderPhoneInput}
                    onChange={(e) => setSenderPhoneInput(e.target.value)}
                    style={{ fontSize: '0.85rem', width: '150px' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Outreach Type Selector */}
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Sparkles size={18} color="#2563eb" />
                <h3 className="card-title" style={{ margin: 0 }}>
                  संदेश का प्रकार चुनें (Select Message Type to Edit)
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <button
                  className={`btn btn-sm ${activePitchType === 'update' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActivePitchType('update')}
                  style={{ fontWeight: 700 }}
                >
                  🔄 1. पुरानी वेबसाइट अपडेट (Website Update)
                </button>
                <button
                  className={`btn btn-sm ${activePitchType === 'new' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActivePitchType('new')}
                  style={{ fontWeight: 700 }}
                >
                  ✨ 2. नई वेबसाइट निर्माण (New Website)
                </button>
                <button
                  className={`btn btn-sm ${activePitchType === 'followup' ? 'btn-primary' : 'btn-outline'}`}
                  onClick={() => setActivePitchType('followup')}
                  style={{ fontWeight: 700 }}
                >
                  ⏳ 3. जेंटल फ़ॉलो-अप (Follow-up Message)
                </button>
              </div>
            </div>

            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Dynamic Variables Pill Toolbar */}
              <div
                style={{
                  background: 'var(--bg-muted)',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-color)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-main)' }}>
                  💡 क्लिक करके प्रपोजल में ऑटो-वेरिएबल जोड़ें (Auto Variables):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {availableVariables.map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(v.label);
                        onShowToast('कॉपी किया गया', `${v.label} क्लिपबोर्ड पर कॉपी हो गया! इसे जहाँ चाहें पेस्ट करें।`, 'info');
                      }}
                      style={{
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        borderRadius: '999px',
                        background: 'var(--card-bg)',
                        border: '1px solid var(--border-color)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        color: '#2563eb',
                        fontWeight: 600,
                      }}
                      title={`${v.desc} — क्लिक करके कॉपी करें`}
                    >
                      <span>{v.label}</span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({v.desc})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 1. Email Subject */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>
                  ✉️ ईमेल का विषय (Email Subject Line)
                </label>
                <input
                  type="text"
                  className="input-field"
                  style={{ fontWeight: 600 }}
                  value={currentSubject}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPitchTemplates((prev) => ({
                      ...prev,
                      [activePitchType === 'update'
                        ? 'updateSubject'
                        : activePitchType === 'new'
                        ? 'newSubject'
                        : 'followUpSubject']: val,
                    }));
                  }}
                />
                <span className="form-hint">
                  सुझाव: विषय में <code>{'{businessName}'}</code> रखने से ओपन रेट 75% तक बढ़ जाता है।
                </span>
              </div>

              {/* 2. Email Body */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>
                  📝 जीमेल प्रपोजल मैसेज (Email Pitch Body Text)
                </label>
                <textarea
                  className="input-field"
                  rows={14}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', lineHeight: 1.6 }}
                  value={currentEmailBody}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPitchTemplates((prev) => ({
                      ...prev,
                      [activePitchType === 'update'
                        ? 'updateEmailBody'
                        : activePitchType === 'new'
                        ? 'newEmailBody'
                        : 'followUpEmailBody']: val,
                    }));
                  }}
                />
              </div>

              {/* 3. WhatsApp Message */}
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 700 }}>
                  💬 व्हाट्सएप मैसेज (WhatsApp Direct Chat Text)
                </label>
                <textarea
                  className="input-field"
                  rows={8}
                  style={{ fontFamily: 'inherit', fontSize: '0.875rem', lineHeight: 1.5 }}
                  value={currentWhatsAppText}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPitchTemplates((prev) => ({
                      ...prev,
                      [activePitchType === 'update'
                        ? 'updateWhatsAppText'
                        : activePitchType === 'new'
                        ? 'newWhatsAppText'
                        : 'followUpWhatsAppText']: val,
                    }));
                  }}
                />
                <span className="form-hint">
                  यह टेक्स्ट WhatsApp Web और मोबाइल ऐप दोनों पर 1-क्लिक में ऑटो-फिल होगा।
                </span>
              </div>
            </div>
          </div>

          {/* Live Preview Card */}
          <div className="card" style={{ border: '2px solid #10b981' }}>
            <div className="card-header" style={{ background: 'rgba(16, 185, 129, 0.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={18} color="#10b981" />
                <h3 className="card-title" style={{ margin: 0, color: '#065f46' }}>
                  🔴 लाइव प्रिव्यू (Live Client Preview: Clove Dental Connaught Place)
                </h3>
              </div>
              <span className="badge badge-success">ऑटो-वेरिएबल्स के साथ रियल लुक</span>
            </div>

            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              {/* Email Preview */}
              <div
                style={{
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  background: 'var(--card-bg)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#2563eb', marginBottom: '0.5rem' }}>
                  ✉️ जीमेल इनबॉक्स प्रिव्यू
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-color)' }}>
                  विषय: {previewSubject}
                </div>
                <div
                  style={{
                    fontSize: '0.8rem',
                    lineHeight: 1.6,
                    marginTop: '0.75rem',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '340px',
                    overflowY: 'auto',
                    color: 'var(--text-main)',
                  }}
                >
                  {previewEmailBody}
                </div>
              </div>

              {/* WhatsApp Preview */}
              <div
                style={{
                  border: '1px solid #22c55e',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  background: 'rgba(34, 197, 94, 0.05)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#16a34a', marginBottom: '0.5rem' }}>
                  💬 व्हाट्सएप चैट बबल प्रिव्यू
                </div>
                <div
                  style={{
                    background: '#dcf8c6',
                    color: '#111827',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    fontSize: '0.825rem',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                    maxHeight: '340px',
                    overflowY: 'auto',
                  }}
                >
                  {previewWhatsAppText}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div className="card" style={{ borderLeft: '4px solid var(--secondary)' }}>
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Shield size={18} color="var(--secondary)" />
                <h3 className="card-title">Server-Side Security & Integration Architecture</h3>
              </div>
              <span className="badge badge-secondary">Protected</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', fontSize: '0.86rem' }}>
              <p style={{ margin: 0 }}>
                All external discovery credentials (Google Search Grounding, Places API, DNS MX resolvers) are strictly protected on the Express backend via server environment configuration and are never exposed to or entered in the browser UI.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem' }}>
                <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700 }}>Database Persistence</div>
                  <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>SQLite Permanent Store (data/leadhunter.db)</div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700 }}>Discovery & Grounding</div>
                  <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>Server-Side Google Search + Live HTTP Audit</div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700 }}>Email Delivery</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--primary)', fontWeight: 600 }}>Client-Side Google OAuth 2.0 Gmail API</div>
                </div>
                <div style={{ padding: '0.85rem', background: 'var(--bg-muted)', borderRadius: '8px' }}>
                  <div style={{ fontWeight: 700 }}>DNS MX Verification</div>
                  <div style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 600 }}>Live Server Node.js dns.resolveMx()</div>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveApiKeys} className="card">
            <div className="card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <Clock size={18} color="var(--primary)" />
                <h3 className="card-title">Recurring Pipeline Schedules</h3>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={isSaving}>
                <Save size={14} /> {isSaving ? 'Saving...' : 'Save Schedules'}
              </button>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Discovery Sync Schedule Cron</label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={formData.hangfireCronDailyFetch}
                    onChange={(e) => setFormData({ ...formData, hangfireCronDailyFetch: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Website Health Check Cron</label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={formData.hangfireCronWebsiteCheck}
                    onChange={(e) => setFormData({ ...formData, hangfireCronWebsiteCheck: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">MX Re-Verification Cron</label>
                  <input
                    type="text"
                    className="input-field"
                    style={{ fontFamily: 'var(--font-mono)' }}
                    value={formData.hangfireCronEmailEnrichment}
                    onChange={(e) => setFormData({ ...formData, hangfireCronEmailEnrichment: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
