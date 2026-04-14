import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const font = "'DM Sans', system-ui, sans-serif";

export default function PrivacyPolicyPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px", fontFamily: font, color: "#1E130A", lineHeight: 1.7 }}>
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#2D5016", fontFamily: font, fontSize: 14, fontWeight: 600, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={18} /> Back
      </button>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 28, fontWeight: 400, color: "#2D5016", marginBottom: 6 }}>Crybaby Golf</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1E130A", marginBottom: 4 }}>Privacy Policy</div>
        <div style={{ fontSize: 13, color: "#8B7355" }}>Last updated: April 2026</div>
      </div>

      <Section num="1" title="Introduction">
        <P>Crybaby Golf, LLC ("Company," "we," "us," or "our") respects your privacy and is committed to protecting your personal information. This Privacy Policy ("Policy") describes how we collect, use, disclose, and safeguard your information when you use the Crybaby Golf mobile application, the website located at crybaby.golf, and all related services (collectively, the "Service").</P>
        <P>By accessing or using the Service, you acknowledge that you have read, understood, and agree to be bound by this Policy. This Policy is incorporated into and subject to our <a href="/terms" style={{ color: "#2D5016" }}>Terms and Conditions</a>.</P>
      </Section>

      <Section num="2" title="Information We Collect">
        <Sub title="2.1 Information You Provide Directly">
          <Ul items={[
            "Account Information: Name, email address, username, password, profile photograph, date of birth, and golf handicap index.",
            "Golf Data: Scores, statistics, round history, course selections, tee preferences, handicap data, GHIN number (if provided), and game format preferences.",
            "Wager Data: Game format selections, wager amounts, payout calculations, and settlement status between you and other Users.",
            "Social and Communications Data: Friend lists, group memberships, in-app messages, chat content, comments, and content you share with other Users.",
            "Support Correspondence: Information you provide when you contact us for customer support.",
            "Payment Information: Payment processing is handled by third-party processors (Apple App Store, Google Play Store). We do not directly collect, store, or process credit card numbers or bank account information.",
          ]} />
        </Sub>
        <Sub title="2.2 Information Collected Automatically">
          <Ul items={[
            "Device Information: Device type, operating system and version, unique device identifiers, device settings, mobile carrier, and hardware model.",
            "Location Data: With your consent, we collect precise geolocation data from your device's GPS, Wi-Fi, and cellular signals for course lookup, GPS-based scoring, and proximity-based features. We also collect approximate location data from your IP address.",
            "Usage Data: Pages and screens viewed, features used, actions taken, time and date of access, time spent on screens, and interaction patterns.",
            "Log Data: IP address, browser type, access times, error logs, crash reports, and diagnostic data.",
          ]} />
        </Sub>
        <Sub title="2.3 Information from Third Parties">
          <Ul items={[
            "Authentication Providers: If you sign in using Apple, Google, or another SSO provider, we receive your name, email address, and profile photo as authorized by you.",
            "GHIN / USGA: If you link your GHIN account, we may receive your handicap index, score history, and membership status.",
            "Analytics Partners: We may receive aggregated or de-identified analytics data from third-party providers.",
          ]} />
        </Sub>
      </Section>

      <Section num="3" title="How We Use Your Information">
        <Sub title="3.1 Providing and Operating the Service">
          <Ul items={[
            "Create and manage your account and profile;",
            "Track scores, calculate handicaps, and generate statistics;",
            "Facilitate wager tracking, payout calculations, and settlement;",
            "Enable social features including friend connections, group rounds, leaderboards, and live scoring;",
            "Provide GPS-based course navigation and hole-by-hole tracking;",
            "Process transactions and send purchase confirmations.",
          ]} />
        </Sub>
        <Sub title="3.2 Improving and Personalizing the Service">
          <Ul items={[
            "Analyze usage patterns to improve features, user experience, and performance;",
            "Personalize content, recommendations, and in-app experiences;",
            "Conduct research and analytics, including A/B testing;",
            "Develop new products, features, and services.",
          ]} />
        </Sub>
        <Sub title="3.3 Communications">
          <Ul items={[
            "Send transactional communications (account confirmations, round summaries, score notifications);",
            "Send marketing and promotional communications (subject to your opt-out preferences);",
            "Respond to your inquiries and support requests;",
            "Send push notifications related to rounds, wagers, and social activity (configurable in device settings).",
          ]} />
        </Sub>
        <Sub title="3.4 Safety, Security, and Legal Compliance">
          <Ul items={[
            "Detect, investigate, and prevent fraud and illegal activities;",
            "Enforce our Terms and Conditions;",
            "Comply with applicable laws, regulations, and governmental requests;",
            "Protect the rights, property, and safety of the Company, Users, and the public.",
          ]} />
        </Sub>
      </Section>

      <Section num="4" title="How We Share Your Information">
        <P><strong>We do not sell your personal information.</strong></P>
        <Sub title="4.1 With Other Users">
          Certain information is shared with other Users as part of social functionality, including your username, profile photo, scores, handicap, round history, leaderboard rankings, and wager participation. You can control visibility through your account privacy settings.
        </Sub>
        <Sub title="4.2 With Service Providers">
          <P>We share information with third-party vendors who perform services on our behalf, including:</P>
          <Ul items={[
            "Cloud hosting and infrastructure providers;",
            "Analytics and crash reporting services;",
            "Email and push notification delivery services;",
            "Customer support tools;",
            "GPS and mapping data providers.",
          ]} />
          <P>These providers are contractually obligated to use your information only as necessary and maintain its confidentiality.</P>
        </Sub>
        <Sub title="4.3 For Legal Reasons">
          We may disclose your information to comply with law, enforce our agreements, address fraud or security issues, or protect the rights and safety of the Company, Users, or the public.
        </Sub>
        <Sub title="4.4 Business Transfers">
          In the event of a merger, acquisition, or asset sale, your information may be transferred. We will provide notice before your information becomes subject to a different privacy policy.
        </Sub>
        <Sub title="4.5 Aggregated and De-identified Data">
          We may share aggregated or de-identified information that cannot identify you with third parties for research, analytics, or other purposes.
        </Sub>
      </Section>

      <Section num="5" title="Cookies and Tracking Technologies">
        <P>Our website and Service may use cookies, pixel tags, web beacons, local storage, and similar technologies for:</P>
        <Ul items={[
          "Essential Functionality: Session management, authentication, and security.",
          "Analytics: Understanding how Users interact with the Service.",
          "Preferences: Remembering your settings and display preferences.",
        ]} />
        <P>You can control cookies through your browser settings. Disabling certain cookies may impair functionality.</P>
      </Section>

      <Section num="6" title="Data Retention">
        <P>We retain your personal information for as long as your account is active or as needed to provide the Service. We may also retain information to comply with legal obligations, resolve disputes, enforce agreements, and prevent fraud. When no longer required, we delete or de-identify it securely. Aggregated data may be retained indefinitely.</P>
      </Section>

      <Section num="7" title="Data Security">
        <P>We implement administrative, technical, and physical security measures including:</P>
        <Ul items={[
          "Encryption of data in transit (TLS/SSL) and at rest;",
          "Secure authentication with hashed and salted passwords;",
          "Access controls on a need-to-know basis;",
          "Regular security assessments and vulnerability testing;",
          "Incident response procedures for breach detection and notification.",
        ]} />
        <P>No method of transmission or storage is 100% secure. We cannot guarantee absolute security.</P>
      </Section>

      <Section num="8" title="Your Rights and Choices">
        <Sub title="8.1 Account Information">
          Update, correct, or delete your account information through in-app settings or by contacting privacy@crybaby.golf.
        </Sub>
        <Sub title="8.2 Location Data">
          Revoke location access through your device's settings. Disabling may limit GPS-based features.
        </Sub>
        <Sub title="8.3 Push Notifications">
          Opt out through your device or in-app notification settings.
        </Sub>
        <Sub title="8.4 Marketing Communications">
          Opt out via the "unsubscribe" link in any marketing email. Transactional communications will continue.
        </Sub>
        <Sub title="8.5 Do Not Track">
          The Service does not currently respond to DNT browser signals.
        </Sub>
      </Section>

      <Section num="9" title="State-Specific Privacy Rights">
        <Sub title="9.1 California Residents (CCPA/CPRA)">
          <P>California residents have the following rights:</P>
          <Ul items={[
            "Right to Know: Request disclosure of what personal information we've collected and how it's used.",
            "Right to Delete: Request deletion of personal information, subject to exceptions.",
            "Right to Correct: Request correction of inaccurate personal information.",
            "Right to Opt Out of Sale/Sharing: We do not sell your personal information or share it for cross-context behavioral advertising.",
            "Right to Non-Discrimination: We will not discriminate against you for exercising privacy rights.",
          ]} />
          <P>To exercise these rights, contact privacy@crybaby.golf. We will verify your identity and respond within forty-five (45) days.</P>
        </Sub>
        <Sub title="9.2 Other State Residents">
          Residents of Virginia, Colorado, Connecticut, Utah, Texas, and other states with comprehensive privacy laws may have similar rights to access, correct, delete, and port their data. Contact privacy@crybaby.golf to exercise any applicable rights.
        </Sub>
      </Section>

      <Section num="10" title="Children's Privacy">
        <P>The Service is not directed to individuals under eighteen (18). We do not knowingly collect personal information from anyone under eighteen. If we learn we have collected such information, we will promptly delete it. Contact privacy@crybaby.golf if you believe a child has provided us with personal information.</P>
      </Section>

      <Section num="11" title="International Data Transfers">
        <P>The Service is operated from the United States. If you access it from outside the US, your information may be transferred to and processed in the United States and other countries where our service providers operate. By using the Service, you consent to such transfers.</P>
      </Section>

      <Section num="12" title="Third-Party Links and Services">
        <P>The Service may contain links to third-party websites or services not controlled by us. This Policy does not apply to those third parties. We encourage you to review their privacy policies.</P>
      </Section>

      <Section num="13" title="Data Breach Notification">
        <P>In the event of a data breach, we will notify affected Users and applicable regulatory authorities as required by law, via email and/or in-app notification.</P>
      </Section>

      <Section num="14" title="Changes to This Policy">
        <P>We may update this Policy from time to time. Material changes will be communicated by updating the "Last updated" date and, where required, by providing additional notice at least thirty (30) days prior to changes taking effect. Continued use after the effective date constitutes acceptance.</P>
      </Section>

      <Section num="15" title="Contact Us">
        <Contact />
      </Section>
    </div>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: "#1E130A" }}>{num}. {title.toUpperCase()}</div>
      <div style={{ fontSize: 15, color: "#374151" }}>{children}</div>
    </div>
  );
}

function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#1E130A" }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 8 }}>{children}</div>;
}

function Ul({ items }: { items: string[] }) {
  return (
    <ul style={{ paddingLeft: 20, margin: "6px 0" }}>
      {items.map((item, i) => <li key={i} style={{ marginBottom: 3 }}>{item}</li>)}
    </ul>
  );
}

function Contact() {
  return (
    <div style={{ background: "#FAF5EC", borderRadius: 10, padding: "16px 18px", border: "1px solid #DDD0BB" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Crybaby Golf, LLC</div>
      <div>Austin, Texas</div>
      <div>Privacy Inquiries: <a href="mailto:privacy@crybaby.golf" style={{ color: "#2D5016" }}>privacy@crybaby.golf</a></div>
      <div>General Inquiries: <a href="mailto:support@crybaby.golf" style={{ color: "#2D5016" }}>support@crybaby.golf</a></div>
      <div>Web: <a href="https://crybaby.golf" style={{ color: "#2D5016" }}>crybaby.golf</a></div>
      <div style={{ marginTop: 10, fontSize: 13, color: "#8B7355" }}>California residents may designate an authorized agent to submit requests on their behalf with written proof of authorization and identity verification.</div>
    </div>
  );
}
