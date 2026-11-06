import {
  FiDatabase, FiShare2, FiLock, FiClock, FiUserCheck, FiMail, FiShield, FiRefreshCw
} from 'react-icons/fi';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card card--pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-tint)', color: 'var(--accent-ink)'
        }}>
          <Icon size={16} />
        </span>
        <h2 style={{ fontSize: '1.02rem' }}>{title}</h2>
      </div>
      <p className="muted" style={{ lineHeight: 1.65 }}>{children}</p>
    </div>
  );
}

// Describes what SCORPIO actually does, not a generic template, every
// data category and every third party named here is a real one this app
// genuinely uses (see storage.js for R2, notify.js for Resend, services/
// payment.js for Dischub). Required by Google's OAuth consent screen
// (Branding page) before the app can be published out of Testing status;
// kept in the same plain-language voice as Terms.jsx rather than legal
// boilerplate, and linked from there and the site footer.
export default function PrivacyPolicy() {
  return (
    <div className="wrap" style={{ padding: '48px 20px 80px', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 6 }}>Privacy policy</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Plain language, describing what this app actually does, not a template. Not a substitute for legal advice.
      </p>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <Section icon={FiDatabase} title="What we collect">
          Account basics (username, email, phone number, and a hashed password, never stored in plain
          text). If you sign up with Google, we receive your name, email, and profile photo from Google
          and nothing else. If you open a storefront: a handle, bio, an optional avatar, your product
          listings, and the EcoCash number your payouts go to. If you buy something: your order history
          and whatever contact details the order needs. We don't ask for anything beyond what's actually
          needed to run the platform.
        </Section>

        <Section icon={FiShare2} title="Who it's shared with">
          Only the services that make the platform work, never sold or handed to advertisers: Dischub
          processes EcoCash payments (we never see or store your EcoCash PIN or card details, that stays
          between you and Dischub); Resend delivers account and order emails; Cloudflare R2 stores uploaded
          files and images; Google, if you choose to sign in that way. Every one of these is a service
          provider running a real part of the app, not a third party we sell data to.
        </Section>

        <Section icon={FiLock} title="Cookies">
          One cookie: a session cookie that keeps you logged in. It's essential to the app working, no
          tracking cookies, no ad pixels, no analytics scripts watching what you do.
        </Section>

        <Section icon={FiClock} title="How long we keep it">
          For as long as your account exists. Order records stick around after that for the buyer and
          seller they belong to (receipts, download access, dispute history) even if one side later
          deletes their account, the same way a receipt doesn't disappear when a shop closes.
        </Section>

        <Section icon={FiUserCheck} title="Your rights">
          You can update most of your account details yourself, in Settings. To request a full account
          deletion or a copy of your data, email us, see Contact below, and we'll handle it directly,
          since there's no self-serve deletion button yet.
        </Section>

        <Section icon={FiShield} title="Security">
          Passwords are hashed, never stored or logged in plain text. All traffic runs over HTTPS. Payment
          details never touch our servers at all, that's handled entirely by Dischub.
        </Section>

        <Section icon={FiRefreshCw} title="Changes">
          This is an early build and this policy will change as the platform does. Material changes will
          be reflected here, same as the Terms.
        </Section>

        <Section icon={FiMail} title="Contact">
          Questions about this policy, or a data request: desmondkwaramba1@gmail.com, or use "Report an
          issue" in the footer of any page.
        </Section>
      </div>
    </div>
  );
}
