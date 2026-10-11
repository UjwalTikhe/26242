import { GovHeader } from '../components/layout';
import { APP_NAME } from '../config';

export default function Tos() {
  return (
    <>
      <GovHeader />
      <main className="page">
        <div className="container" style={{ maxWidth: 840 }}>
          <h1>Terms of Service</h1>
          <p className="muted">Last updated: October 2026</p>

          <h2>1. About {APP_NAME}</h2>
          <p>{APP_NAME} is a research and demonstration platform for Recognition of Prior Learning (RPL). The system is designed to help workers document skills and for authorised assessors to review evidence. It is provided for demonstration and evaluation purposes only.</p>

          <h2>2. Acceptance of Terms</h2>
          <p>By accessing or using this application, you agree to these Terms of Service. If you do not agree, you must not use the application.</p>

          <h2>3. Data and Privacy</h2>
          <p>We only use the data you provide to support the assessment workflow for the duration of your session. Please refer to the Privacy Policy for details on how information is stored, processed and retained.</p>

          <h2>4. Appropriate Use</h2>
          <p>You agree to use the application lawfully and not to upload harmful, misleading or infringing content. Evidence you submit must be your own work or that you have permission to share for assessment purposes.</p>

          <h2>5. Accuracy and Availability</h2>
          <p>The application is provided "as is". While reasonable care is taken to ensure accuracy, no warranty is given that the application will be error-free or continuously available.</p>

          <h2>6. Changes to Terms</h2>
          <p>These terms may be updated from time to time. Continued use of the application after changes means you accept the updated terms.</p>

          <h2>7. Contact</h2>
          <p>For questions about these terms, please contact the project team.</p>
        </div>
      </main>
    </>
  );
}