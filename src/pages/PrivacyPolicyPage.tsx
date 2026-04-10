export default function PrivacyPolicyPage() {
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "40px 24px 80px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: "#1E130A", lineHeight: 1.7 }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Crybaby Golf</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#2D5016", marginBottom: 4 }}>Privacy Policy</div>
        <div style={{ fontSize: 13, color: "#8B7355" }}>Last updated: March 2025</div>
      </div>

      <Section title="Overview">
        Crybaby Golf ("the App") is a golf scoring and social app. This policy explains what data we collect, how we use it, and your rights.
      </Section>

      <Section title="Information We Collect">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li><strong>Account information:</strong> Email address, name, and profile photo when you sign up or connect with Google.</li>
          <li><strong>Golf data:</strong> Round scores, handicap, home course, and game history you enter in the app.</li>
          <li><strong>Social data:</strong> Friend connections, group memberships, and in-app messages you send.</li>
          <li><strong>Usage data:</strong> How you interact with the app, collected anonymously to improve the experience.</li>
        </ul>
      </Section>

      <Section title="How We Use Your Information">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li>To operate the app and provide golf scoring features</li>
          <li>To connect you with friends and golf groups</li>
          <li>To send in-app notifications about rounds and friend activity</li>
          <li>To improve app features and fix bugs</li>
        </ul>
        We do not sell your personal information to third parties.
      </Section>

      <Section title="Data Sharing">
        <ul style={{ paddingLeft: 20, margin: 0 }}>
          <li><strong>Friends:</strong> Your name, profile photo, and golf stats are visible to users you connect with.</li>
          <li><strong>Round broadcasts:</strong> If you enable broadcasting, your round scores are visible to your friends in real time.</li>
          <li><strong>Supabase:</strong> We use Supabase to store and manage your data securely.</li>
          <li><strong>Google:</strong> If you sign in with Google, Google's privacy policy also applies.</li>
        </ul>
      </Section>

      <Section title="Data Retention">
        Your data is retained as long as your account is active. You may delete your account at any time by contacting us, which will remove your personal information from our systems.
      </Section>

      <Section title="Your Rights">
        You have the right to access, correct, or delete your personal data. Contact us at the email below to make a request.
      </Section>

      <Section title="Children's Privacy">
        Crybaby Golf is not directed at children under 13. We do not knowingly collect data from children under 13.
      </Section>

      <Section title="Changes to This Policy">
        We may update this policy from time to time. We'll notify you of significant changes through the app.
      </Section>

      <Section title="Contact">
        Questions about this policy? Email us at: <a href="mailto:support@crybabygolf.com" style={{ color: "#2D5016" }}>support@crybabygolf.com</a>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: "#1E130A" }}>{title}</div>
      <div style={{ fontSize: 15, color: "#374151" }}>{children}</div>
    </div>
  );
}
