import type { Metadata } from "next";
import Link from "next/link";
import styles from "./privacy.module.css";

export const metadata: Metadata = { title: "Privacy | RAD RACE Teamfinder", description: "How we handle accounts, listings, photos and private messages." };

export default function PrivacyPage() {
  return <main className={styles.page}>
    <nav className={styles.nav} aria-label="Legal navigation"><Link href="/">← TEAM FINDER</Link><a href="https://www.rad-race.com/imprint">IMPRINT</a><a href="mailto:info@rad-race.com?subject=Teamfinder%20support">CONTACT / REPORT</a></nav>
    <h1>YOUR DATA. YOUR CHOICE.</h1>
    <p>Team Finder privacy notice · Updated 22 September 2026</p>
    <p>You can browse without an account. Sign in to chat or publish a listing. Your account email is not shown to other users. Published listings are public; conversations are restricted to their participants within the app.</p>
    <h2>Who is responsible?</h2>
    <p>RAD RACE GmbH, Fischmarkt 9, 22767 Hamburg, Germany, is responsible for this Team Finder. For privacy questions, access requests, deletion or reports, contact <a href="mailto:info@rad-race.com?subject=Teamfinder%20privacy">info@rad-race.com</a>. Company details are in our <a href="https://www.rad-race.com/imprint">imprint</a>.</p>
    <h2>Account and messages</h2>
    <p>We store your email, account identifier, verification and session information to provide access. For chats we store your display name, messages, participants, timestamps, read status and blocking settings. Processing is necessary to provide your requested service (Article 6(1)(b) GDPR). Providing data is voluntary, but a verified email is needed to publish or send messages. You do not need your own listing to chat.</p>
    <p>Messages stay in the app and are not forwarded by email. Your partner sees your display name and message, not your account email unless you include it. Chats are not end-to-end encrypted: authorised operators and providers can technically access stored data where necessary for operation, security or support. Recipients can retain their own copies. Blocking stops further messages in the conversation; it does not delete the history.</p>
    <h2>Public listings</h2>
    <p>Your selected name, region, description, languages, riding preferences, categories, gender or rider requirements, optional age, social links and photo become public when you publish. This includes visibility to visitors without accounts and possible copying by search engines or others. Avoid publishing private contact details or other people’s information without permission.</p>
    <p>Publication relies on your consent (Article 6(1)(a) GDPR), which we record with the listing. Withdraw consent by closing or deleting the listing, removing a photo or contacting us. This does not affect earlier lawful processing. Closing hides your listing but preserves it and its existing chats.</p>
    <h2>Retention and deletion</h2>
    <ul>
      <li>Listings expire ten calendar months after first publication. Editing or reopening does not extend that date. At expiry, listings and chats become inaccessible; daily maintenance removes the listing, stored photos, associated conversations and consent records.</li>
      <li>Delete a listing earlier through My listings to remove it and its conversations for both participants. Closing alone does not delete messages.</li>
      <li>Accounts at least ten months old become eligible for automatic deletion when they have no remaining listings, conversations or associated mail jobs. For earlier account or message deletion, email us from your registered address.</li>
      <li>Interrupted uploads may leave unpublished drafts. Delete these in My listings or contact us; their publication-based expiry has not started.</li>
      <li>Technical logs, support correspondence and any provider backups have separate retention periods based on operational need, provider configuration and legal requirements. The listing timer does not cover these records. Contact us for details about your data.</li>
    </ul>
    <h2>Service emails</h2>
    <p>We send requested sign-in links and reminders for active listings at two, four, six and eight months to support the service (Article 6(1)(b) GDPR). Closing or deleting stops future listing reminders. We also send a grouped email alert for new unread chat messages, without including message content or the sender’s identity. These alerts are enabled by default and can be turned off in Messages. Notification preferences and delivery state are stored with your account; queued alerts are removed after processing or with their associated messages. Registration does not subscribe you to marketing. Replies to teamfinder@rad-race.com are automatically discarded; use info@rad-race.com for support.</p>
    <h2>Providers and international processing</h2>
    <p>Vercel hosts the website and server functions. Supabase provides authentication, database and photo storage; our project database is in Frankfurt, Germany. STRATO delivers service emails, processing recipient addresses and email content. The homepage background loads from Squarespace’s image network. Hosting and image requests disclose technical connection information, including your IP address and browser details, to the respective provider.</p>
    <p>International providers and subprocessors may process data outside the EEA, including the US. A Frankfurt database does not mean every operation stays in Germany. Their published processing terms describe transfer safeguards, including EU Standard Contractual Clauses: <a href="https://vercel.com/legal/dpa">Vercel</a> and <a href="https://supabase.com/legal/customer-resources/data-processing-addendum">Supabase</a>. See also <a href="https://www.strato.de/datenschutz/">STRATO privacy information</a> and <a href="https://www.squarespace.com/privacy">Squarespace privacy information</a>. Ask us for information about the safeguards applicable to your data.</p>
    <h2>Browser storage and security</h2>
    <p>Your sign-in session and a temporary navigation hint for returning to Messages after sign-in are saved in browser local storage. Sign out on shared devices. The application code does not include advertising pixels or analytics trackers. Social links open the linked service when clicked. Technical access data, access controls and message limits support our legitimate interest in secure, reliable operation and preventing abuse (Article 6(1)(f) GDPR). We do not make automated decisions with legal or similarly significant effects.</p>
    <h2>Your rights and help</h2>
    <p>You may request access, correction, deletion, restriction or portability where applicable, object to processing based on legitimate interests, and withdraw consent. Email <a href="mailto:info@rad-race.com?subject=Teamfinder%20privacy">info@rad-race.com</a>; we may need to verify account ownership. You may complain to a supervisory authority, including the <a href="https://datenschutz-hamburg.de/">Hamburg Commissioner for Data Protection and Freedom of Information</a> or the authority where you live or work.</p>
    <p>For harassment or inappropriate listings, <a href="mailto:info@rad-race.com?subject=Teamfinder%20report">report the problem</a> with the listing name, approximate time and a relevant message excerpt. Share only what is needed. You can immediately block a conversation in Messages.</p>
  </main>;
}
