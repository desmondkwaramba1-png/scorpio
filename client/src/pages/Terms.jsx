import {
  FiInfo, FiCreditCard, FiPercent, FiCalendar, FiShieldOff, FiUser, FiUserCheck, FiDatabase, FiRefreshCw, FiShoppingBag
} from 'react-icons/fi';

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card card--pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--gold-tint)', color: 'var(--gold-ink)'
        }}>
          <Icon size={16} />
        </span>
        <h2 style={{ fontSize: '1.02rem' }}>{title}</h2>
      </div>
      <p className="muted" style={{ lineHeight: 1.65 }}>{children}</p>
    </div>
  );
}

// Every visitor accepts these terms once, buyer or creator, before their
// role is even decided (see ProtectedRoute.jsx, it gates on
// terms_accepted_at alone, not on having a creator profile, since a plain
// buyer signup never creates one). The fee/payout stat row used to sit at
// the very top regardless of that, so a buyer's first real read of the
// platform led with numbers that only apply to sellers. Selling-specific
// content now lives in its own clearly-labeled section near the bottom
// instead, easy to skip for anyone who isn't opening a storefront.
export default function Terms() {
  return (
    <div className="wrap" style={{ padding: '48px 20px 80px', maxWidth: 720 }}>
      <h1 style={{ fontSize: '1.7rem', marginBottom: 6 }}>Platform terms</h1>
      <p className="muted" style={{ marginBottom: 28 }}>
        Plain language, updated as the platform changes. Not a substitute for legal advice.
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        <Section icon={FiInfo} title="What SCORPIO is">
          A storefront platform for Zimbabwean creators to sell digital products. Creators list products
          and set prices; buyers pay and receive delivery. SCORPIO is the platform connecting the two,
          not the seller of record for any individual product.
        </Section>

        <Section icon={FiCreditCard} title="Payments, honestly">
          Payment runs through a real EcoCash integration, not a stand-in. It is currently running in
          test mode while the platform gets ready to launch, so no real money moves yet. This notice
          will be removed the day that changes. EcoCash is the only payment method right now.
        </Section>

        <Section icon={FiShieldOff} title="Buyer protection">
          Every purchase, digital or service, carries a 5-day window from delivery to report a problem
          for a refund, reviewed by the SCORPIO team. Money isn't released to the seller until that
          window passes without a report, or the buyer actively confirms they're satisfied. This holds
          for downloads and license keys too, not only services, getting the file doesn't start the
          seller's clock any earlier.
        </Section>

        <Section icon={FiUser} title="Your account">
          You're responsible for keeping your password private. Email verification and password reset
          exist so you can recover access, both delivered by real email.
        </Section>

        <Section icon={FiDatabase} title="Data">
          We store what's needed to run the platform: account details, product listings, and order
          records. Passwords are hashed, never stored in plain text. If you signed up with Google or
          Facebook, we receive your name, email, and profile photo from that provider and nothing else.
        </Section>

        <Section icon={FiRefreshCw} title="Changes">
          This is an early build. These terms will change as real payments, real payouts, and real
          verification come online. Material changes will be reflected here.
        </Section>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '36px 0 16px' }}>
        <FiShoppingBag size={16} color="var(--green-glow)" />
        <h2 style={{ fontSize: '1.05rem' }}>Selling on SCORPIO</h2>
      </div>
      <p className="muted" style={{ fontSize: '.88rem', marginBottom: 16 }}>
        Only relevant once you open a storefront, skip this if you're just here to buy.
      </p>

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiPercent size={13} /> Platform fee</span>
          <span className="mono stat-tile__value">8%</span>
        </div>
        <div className="card stat-tile">
          <span className="stat-tile__label"><FiCalendar size={13} /> Payouts</span>
          <span className="stat-tile__value" style={{ fontSize: '.92rem' }}>Every Friday</span>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 14 }}>
        <Section icon={FiPercent} title="Platform fee">
          SCORPIO takes 8% of the order amount, deducted from what a creator sees as their available
          balance. This is a stated policy computed on real order amounts, shown on every order in your
          Wallet.
        </Section>

        <Section icon={FiCalendar} title="When creators get paid">
          Once an order clears its 5-day buyer-protection window (above), it's added to your available
          balance and paid out to your EcoCash number on file every Friday.
        </Section>

        <Section icon={FiUserCheck} title="What creators are responsible for">
          You confirm you have the right to sell what you list, that your product descriptions are
          accurate, and that you'll deliver what you promise. The Seal badge is granted automatically once
          an account has a verified email, a payout number on file, a published product, and at least one
          paid order. It is not a human review, and not a guarantee of product quality.
        </Section>
      </div>
    </div>
  );
}
