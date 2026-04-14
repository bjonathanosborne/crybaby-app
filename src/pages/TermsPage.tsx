import { ChevronLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const font = "'DM Sans', system-ui, sans-serif";

export default function TermsPage() {
  const navigate = useNavigate();
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px", fontFamily: font, color: "#1E130A", lineHeight: 1.7 }}>
      <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, color: "#2D5016", fontFamily: font, fontSize: 14, fontWeight: 600, marginBottom: 24, padding: 0 }}>
        <ChevronLeft size={18} /> Back
      </button>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontFamily: "'Pacifico', cursive", fontSize: 28, fontWeight: 400, color: "#2D5016", marginBottom: 6 }}>Crybaby Golf</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#1E130A", marginBottom: 4 }}>Terms &amp; Conditions</div>
        <div style={{ fontSize: 13, color: "#8B7355" }}>Last updated: April 2026</div>
      </div>

      <Notice>
        IMPORTANT — PLEASE READ CAREFULLY: These Terms and Conditions ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and Crybaby Golf, LLC, a Texas limited liability company ("Company," "we," "us," or "our"), governing your access to and use of the Crybaby Golf mobile application, the website located at crybaby.golf, and all related services, features, content, and functionality (collectively, the "Service").
      </Notice>

      <Notice>
        By downloading, installing, accessing, or using the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms and our Privacy Policy, which is incorporated herein by reference. If you do not agree to these Terms, you must not access or use the Service.
      </Notice>

      <Notice>
        ARBITRATION NOTICE: These Terms contain a binding arbitration provision and a class action waiver in Section 16. By agreeing to these Terms, you agree that disputes will be resolved through individual arbitration and you waive your right to participate in a class action lawsuit or class-wide arbitration.
      </Notice>

      <Section num="1" title="Definitions">
        <Def term="App">The Crybaby Golf mobile application available for download on iOS and Android platforms.</Def>
        <Def term="Content">All text, graphics, images, music, software, audio, video, data, information, and other materials available through the Service.</Def>
        <Def term="Course Data">Golf course information, including but not limited to hole layouts, par values, slope ratings, GPS coordinates, and yardage data.</Def>
        <Def term="Round">A scored session of golf tracked through the Service.</Def>
        <Def term="Social Features">Any functionality enabling interaction between Users, including but not limited to friend connections, group rounds, leaderboards, live scoring feeds, chat, and shared scorecards.</Def>
        <Def term="User Content">Any content, data, or information that you submit, post, transmit, or otherwise make available through the Service, including scores, handicap information, profile data, photographs, and communications.</Def>
        <Def term="Wager / Bet">Any financial arrangement, side game, or monetary competition facilitated, tracked, or calculated through the Service, including but not limited to Nassau, Skins, Match Play, Wolf, and other supported game formats.</Def>
      </Section>

      <Section num="2" title="Eligibility and Account Registration">
        <Sub title="2.1 Age Requirements">
          You must be at least eighteen (18) years of age, or the age of majority in your jurisdiction, whichever is greater, to create an account and use the Service. By using the Service, you represent and warrant that you meet these age requirements.
        </Sub>
        <Sub title="2.2 Wagering Eligibility">
          To access any Wager-related features, you must (a) be at least twenty-one (21) years of age or the minimum legal wagering age in your jurisdiction, whichever is greater; (b) be physically located in a jurisdiction where such wagering activity is lawful; and (c) comply with all applicable federal, state, and local laws, regulations, and ordinances governing wagering, gambling, and contests. You are solely responsible for determining the legality of your use of Wager features in your jurisdiction.
        </Sub>
        <Sub title="2.3 Account Registration">
          <P>To access certain features of the Service, you must register for an account. You agree to:</P>
          <Ul items={[
            "Provide accurate, current, and complete information during registration;",
            "Maintain and promptly update your account information;",
            "Maintain the security and confidentiality of your login credentials;",
            "Accept all responsibility for any activity under your account; and",
            "Notify us immediately if you suspect unauthorized use of your account.",
          ]} />
        </Sub>
        <Sub title="2.4 Account Termination by User">
          You may delete your account at any time through the in-app settings or by contacting us at support@crybaby.golf. Upon deletion, we will remove or de-identify your personal data in accordance with our Privacy Policy, subject to any legal retention obligations.
        </Sub>
      </Section>

      <Section num="3" title="License Grant and Restrictions">
        <Sub title="3.1 Limited License">
          Subject to your compliance with these Terms, we grant you a limited, non-exclusive, non-transferable, non-sublicensable, revocable license to download, install, and use the App on a mobile device that you own or control, and to access and use the Service, solely for your personal, non-commercial purposes.
        </Sub>
        <Sub title="3.2 Restrictions">
          <P>You agree that you will not, and will not permit any third party to:</P>
          <Ul items={[
            "Copy, modify, adapt, translate, reverse engineer, decompile, disassemble, or create derivative works of the Service;",
            "Remove, alter, or obscure any proprietary notices or marks;",
            "Use the Service for any commercial purpose without our prior written consent;",
            "Use any automated means to access, collect, or record the Service;",
            "Transmit any viruses, malware, or items of a destructive nature;",
            "Interfere with or disrupt the integrity or performance of the Service;",
            "Attempt to gain unauthorized access to the Service or connected systems;",
            "Use the Service in any manner that could damage or impair Company servers; or",
            "Use the Service in violation of any applicable law or regulation.",
          ]} />
        </Sub>
      </Section>

      <Section num="4" title="Wagering and Financial Features">
        <Sub title="4.1 Nature of Wagering Services">
          The Service provides tools for tracking, calculating, and settling friendly wagers between Users in connection with golf rounds. The Company acts solely as a technology platform and scorekeeper. The Company is not a gambling operator, casino, sportsbook, or financial institution, and does not take any position in, guarantee, fund, escrow, or intermediate any Wager.
        </Sub>
        <Sub title="4.2 Peer-to-Peer Arrangement">
          All Wagers are private, peer-to-peer arrangements between Users. The Company does not hold, transfer, or process any wagered funds. Settlement of Wagers is the sole responsibility of the participating Users.
        </Sub>
        <Sub title="4.3 No Guarantee of Accuracy">
          While the Service endeavors to provide accurate scoring, payout calculations, and game logic, the Company does not guarantee the accuracy, completeness, or reliability of any calculation or result. Users are encouraged to verify all calculations independently.
        </Sub>
        <Sub title="4.4 Compliance with Laws">
          You are solely responsible for ensuring that your use of any Wager-related feature complies with all applicable laws. The Company makes no representation or warranty that Wager features are legal in your jurisdiction.
        </Sub>
        <Sub title="4.5 Responsible Gaming">
          The Company encourages responsible gaming practices. If you believe you have a gambling problem, we encourage you to seek assistance from the National Council on Problem Gambling (1-800-522-4700) or a similar resource in your jurisdiction.
        </Sub>
      </Section>

      <Section num="5" title="User Content and Conduct">
        <Sub title="5.1 Ownership of User Content">
          You retain all ownership rights in your User Content. By submitting User Content, you grant the Company a worldwide, non-exclusive, royalty-free, sublicensable, and transferable license to use, reproduce, distribute, prepare derivative works of, display, and perform your User Content in connection with operating, improving, and promoting the Service.
        </Sub>
        <Sub title="5.2 Representations Regarding User Content">
          You represent and warrant that: (a) you own or have the necessary rights to submit your User Content and grant the foregoing license; (b) your User Content does not infringe any third party's rights; and (c) your User Content does not contain any unlawful, defamatory, obscene, or otherwise objectionable material.
        </Sub>
        <Sub title="5.3 Score Integrity">
          You agree to submit accurate and honest scores and game data. Deliberately submitting false scores, manipulating handicap data, or engaging in any form of score tampering constitutes a material breach of these Terms and may result in immediate account suspension or termination.
        </Sub>
        <Sub title="5.4 Prohibited Conduct">
          <P>You agree not to use the Service to:</P>
          <Ul items={[
            "Harass, abuse, threaten, stalk, or intimidate other Users;",
            "Impersonate any person or entity;",
            "Post unsolicited advertising or spam;",
            "Engage in cheating, collusion, or fraud in connection with Wagers or Rounds;",
            "Collect or share personal information of other Users without consent; or",
            "Engage in any harmful, fraudulent, deceptive, or abusive activity.",
          ]} />
        </Sub>
      </Section>

      <Section num="6" title="Intellectual Property Rights">
        <Sub title="6.1 Company IP">
          The Service and its entire contents, features, and functionality are owned by the Company, its licensors, or other providers, and are protected by United States and international intellectual property laws.
        </Sub>
        <Sub title="6.2 Trademarks">
          The Company name, the Crybaby Golf name and logo, and all related names, logos, product and service names, designs, and slogans are trademarks of the Company or its affiliates. You may not use such marks without prior written permission.
        </Sub>
        <Sub title="6.3 Course Data">
          Course Data available through the Service may be sourced from third-party providers and public sources. Such data is provided "as-is" and may not be extracted, scraped, copied, or redistributed without express written consent.
        </Sub>
      </Section>

      <Section num="7" title="Third-Party Services and Links">
        <P>The Service may contain links to or integrations with third-party websites, applications, or services. These third-party services are not under the Company's control, and the Company is not responsible for their content, privacy policies, or practices. Your use of any third-party service is at your own risk.</P>
      </Section>

      <Section num="8" title="Subscription, Fees, and Payment">
        <Sub title="8.1 Free and Premium Features">
          The Service may offer both free and premium features. Pricing, features, and availability are subject to change at any time.
        </Sub>
        <Sub title="8.2 Subscription Terms">
          If you purchase a subscription, it will automatically renew unless you cancel before the renewal date. Manage or cancel through your device's app store settings.
        </Sub>
        <Sub title="8.3 Refund Policy">
          Refunds for in-app purchases and subscriptions are subject to the refund policies of the applicable app store platform (Apple or Google).
        </Sub>
      </Section>

      <Section num="9" title="Privacy and Data">
        <Sub title="9.1 Privacy Policy">
          Our collection, use, and disclosure of your personal information is governed by our <a href="/privacy" style={{ color: "#2D5016" }}>Privacy Policy</a>.
        </Sub>
        <Sub title="9.2 Location Data">
          Certain features require access to your device's location services. You may disable location services at any time through your device settings, but doing so may impair certain functionality.
        </Sub>
        <Sub title="9.3 Analytics and Performance Data">
          The Service may collect anonymized and aggregated usage data for purposes of improving the Service. Such data does not personally identify you and may be used without restriction.
        </Sub>
      </Section>

      <Section num="10" title="Disclaimers of Warranties">
        <Caps>
          THE SERVICE IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS, WITHOUT ANY WARRANTIES OF ANY KIND. TO THE FULLEST EXTENT PERMITTED BY LAW, THE COMPANY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. THE COMPANY DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE, THAT RESULTS WILL BE ACCURATE OR RELIABLE, OR THAT ERRORS WILL BE CORRECTED. THE COMPANY DOES NOT ENDORSE, GUARANTEE, OR ASSUME RESPONSIBILITY FOR ANY WAGER OUTCOME, SCORE CALCULATION, HANDICAP COMPUTATION, OR PAYOUT DETERMINATION GENERATED BY THE SERVICE.
        </Caps>
      </Section>

      <Section num="11" title="Limitation of Liability">
        <Caps>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE COMPANY SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE, INCLUDING DAMAGES RELATED TO WAGER OUTCOMES, SCORING INACCURACIES, LOCATION SERVICES, OR THIRD-PARTY CONDUCT. THE COMPANY'S TOTAL AGGREGATE LIABILITY SHALL NOT EXCEED THE GREATER OF: (A) AMOUNTS PAID BY YOU IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM; OR (B) ONE HUNDRED DOLLARS ($100.00).
        </Caps>
      </Section>

      <Section num="12" title="Indemnification">
        <P>You agree to defend, indemnify, and hold harmless the Company from and against any claims, damages, losses, liabilities, costs, and expenses arising from your use of the Service, violation of these Terms, violation of any third-party right, or participation in any Wager.</P>
      </Section>

      <Section num="13" title="Termination">
        <Sub title="13.1 Termination by Company">
          We may suspend or terminate your access at any time, with or without cause or notice, if we reasonably believe you have violated these Terms or engaged in harmful conduct.
        </Sub>
        <Sub title="13.2 Effect of Termination">
          Upon termination: (a) your license ceases immediately; (b) you must delete all copies of the App; (c) outstanding Wagers are void as between you and the Company; and (d) Sections 1, 4.2, 5.1, 6, 10, 11, 12, 14, 15, 16, 17, and 18 survive.
        </Sub>
      </Section>

      <Section num="14" title="Governing Law">
        <P>These Terms shall be governed by the laws of the State of Texas, without regard to conflict of law provisions. You consent to the exclusive jurisdiction of the courts in Travis County, Texas.</P>
      </Section>

      <Section num="15" title="Force Majeure">
        <P>The Company shall not be liable for any failure or delay caused by circumstances beyond its reasonable control, including acts of God, natural disasters, pandemic, war, terrorism, strikes, or infrastructure failures.</P>
      </Section>

      <Section num="16" title="Dispute Resolution and Arbitration">
        <Sub title="16.1 Informal Resolution">
          Before initiating formal proceedings, you agree to contact us at legal@crybaby.golf and attempt to resolve any dispute informally for at least thirty (30) days.
        </Sub>
        <Sub title="16.2 Binding Arbitration">
          Disputes shall be determined by binding arbitration administered by the American Arbitration Association ("AAA") in accordance with its Consumer Arbitration Rules, conducted by a single arbitrator in Austin, Texas.
        </Sub>
        <Sub title="16.3 Class Action Waiver">
          <Caps>YOU AND THE COMPANY AGREE THAT EACH MAY BRING CLAIMS ONLY IN YOUR OR ITS INDIVIDUAL CAPACITY, AND NOT AS A PLAINTIFF OR CLASS MEMBER IN ANY CLASS, CONSOLIDATED, OR REPRESENTATIVE PROCEEDING.</Caps>
        </Sub>
        <Sub title="16.4 Small Claims Court">
          Either party may bring an individual action in small claims court for disputes within that court's jurisdiction.
        </Sub>
        <Sub title="16.5 Limitation on Time to File Claims">
          <Caps>ANY CAUSE OF ACTION MUST BE COMMENCED WITHIN ONE (1) YEAR AFTER THE CAUSE OF ACTION ACCRUES; OTHERWISE IT IS PERMANENTLY BARRED.</Caps>
        </Sub>
      </Section>

      <Section num="17" title="General Provisions">
        <Sub title="17.1 Entire Agreement">These Terms, together with the Privacy Policy, constitute the entire agreement between you and the Company regarding the Service.</Sub>
        <Sub title="17.2 Severability">If any provision is held invalid, it shall be modified to the minimum extent necessary, and remaining provisions continue in full force.</Sub>
        <Sub title="17.3 Waiver">No waiver of any term shall be deemed a further or continuing waiver of such term or any other term.</Sub>
        <Sub title="17.4 Assignment">You may not assign these Terms without the Company's written consent. The Company may freely assign these Terms.</Sub>
        <Sub title="17.5 Notices">We may provide notices via email, in-app notification, or by posting on the Service. For notices to the Company, contact legal@crybaby.golf.</Sub>
        <Sub title="17.6 No Third-Party Beneficiaries">These Terms do not confer rights upon any person other than the parties.</Sub>
      </Section>

      <Section num="18" title="Contact Information">
        <Contact />
      </Section>

      <Section num="19" title="Modifications to Terms">
        <P>The Company reserves the right to modify these Terms at any time. If a revision is material, we will provide at least thirty (30) days' notice. By continuing to use the Service after revisions take effect, you agree to the revised Terms.</P>
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

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#FAF5EC", border: "1px solid #DDD0BB", borderRadius: 10, padding: "14px 16px", marginBottom: 16, fontSize: 14, color: "#1E130A", lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Def({ term, children }: { term: string; children: React.ReactNode }) {
  return <div style={{ marginBottom: 8 }}><strong>"{term}"</strong> means {children}</div>;
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

function Caps({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, lineHeight: 1.6 }}>{children}</div>;
}

function Contact() {
  return (
    <div style={{ background: "#FAF5EC", borderRadius: 10, padding: "16px 18px", border: "1px solid #DDD0BB" }}>
      <div style={{ fontWeight: 700, marginBottom: 6 }}>Crybaby Golf, LLC</div>
      <div>Austin, Texas</div>
      <div>Email: <a href="mailto:legal@crybaby.golf" style={{ color: "#2D5016" }}>legal@crybaby.golf</a></div>
      <div>Web: <a href="https://crybaby.golf" style={{ color: "#2D5016" }}>crybaby.golf</a></div>
    </div>
  );
}
