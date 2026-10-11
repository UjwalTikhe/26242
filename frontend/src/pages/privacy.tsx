import { GovHeader } from '../components/layout';
import { APP_NAME } from '../config';

export default function Privacy() {
  return (
    <>
      <GovHeader />
      <main className="page">
        <div className="container" style={{ maxWidth: 840 }}>
          <h1>Privacy Policy</h1>
          <p className="muted">Last updated: October 2026</p>

          <h2>1. Scope</h2>
          <p>This Privacy Policy explains how {APP_NAME} collects, uses and protects personal information for users of the application.</p>

          <h2>2. Information Collected</h2>
          <p>We collect the minimum information needed to operate the assessment workflow, such as your name, phone number, email (for assessors), trade information, and evidence files you upload. Technical data such as device type and network status may be recorded to support offline sync and performance.</p>

          <h2>3. Use of Information</h2>
          <p>Information is used only to facilitate the RPL assessment, enable verifiable certificates, and maintain audit trails. It is not used for advertising or unrelated commercial purposes.</p>

          <h2>4. Storage and Security</h2>
          <p>We implement reasonable security measures to protect your information. Access is restricted to authorised roles. You should not share your authentication credentials with others.</p>

          <h2>5. Your Rights</h2>
          <p>You have the right to access, correct or request deletion of your information in accordance with applicable law. For questions about your data, please contact the project team.</p>

          <h2>6. Third Parties</h2>
          <p>The application does not sell your personal information to third parties. Any data shared is strictly for legitimate purposes required to operate the service.</p>

          <h2>7. Changes to Policy</h2>
          <p>This policy may be updated from time to time. The "Last updated" date will reflect changes.</p>

          <h2>8. Contact</h2>
          <p>For privacy enquiries, please contact the project team.</p>
        </div>
      </main>
    </>
  );
}