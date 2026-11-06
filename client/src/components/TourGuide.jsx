import { Joyride, STATUS } from 'react-joyride';

export default function TourGuide({ run, setRun, storageKey }) {
  const steps = [
    {
      target: '[data-tour="overview"]',
      title: 'Dashboard overview',
      content: 'Get a quick snapshot of your shop, recent orders, and performance.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '[data-tour="products"]',
      title: 'Products',
      content: 'Create a listing, publish new work, and manage your products, series, and subscriptions.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="reels"]',
      title: 'Reels',
      content: 'Share short videos to introduce your work and help buyers discover your products.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="blog"]',
      title: 'Blog',
      content: 'Write and manage posts to share useful ideas and bring more people to your storefront.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="orders"]',
      title: 'Orders',
      content: 'See customer purchases, respond to orders, and keep track of fulfillment.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="subscriptions"]',
      title: 'Subscriptions',
      content: 'See who subscribes to your recurring products and follow subscription activity.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="insights"]',
      title: 'Insights',
      content: 'Review sales, visits, and product performance to understand how your shop is doing.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="wallet"]',
      title: 'Wallet',
      content: 'Review your balances, payout activity, and available funds.',
      placement: 'bottom',
    },
    {
      target: '[data-tour="settings"]',
      title: 'Settings',
      content: 'Update your storefront and account details, or restart this guide whenever you need it.',
      placement: 'bottom',
    }
  ];

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      if (storageKey) localStorage.setItem(storageKey, 'true');
    }
  };

  return (
    <Joyride
      callback={handleJoyrideCallback}
      continuous={true}
      run={run}
      scrollToFirstStep={false}
      showProgress={true}
      showSkipButton={true}
      spotlightClicks={true}
      steps={steps}
      options={{
        // Must stay below the site top bar (.nav is z-index 50). At 10000
        // the tour's overlay and tooltips painted over the top bar and
        // blocked its links. 45 dims the page but leaves the bar usable.
        zIndex: 45,
        scrollOffset: 150,
        primaryColor: 'var(--brand-strong)',
        overlayColor: 'rgba(15,17,17,.48)',
        spotlightPadding: 7,
        spotlightRadius: 9,
        targetWaitTimeout: 5000
      }}
      styles={{
        tooltip: {
          backgroundColor: 'var(--surface)',
          borderRadius: 12,
          color: 'var(--ink)',
          boxShadow: 'var(--shadow-3)',
          padding: 0
        },
        tooltipTitle: { color: 'var(--ink)', fontSize: 16, fontWeight: 800 },
        tooltipContent: { color: 'var(--ink-dim)', lineHeight: 1.55, padding: '8px 18px 12px' },
        tooltipFooter: { padding: '0 18px 16px' },
        buttonPrimary: {
          backgroundColor: 'var(--brand-strong)',
          borderRadius: 8,
          color: '#fff',
          fontWeight: 700,
          padding: '9px 14px'
        },
        buttonSkip: { color: 'var(--muted)', fontWeight: 700 }
      }}
    />
  );
}
